import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { MovementType, Prisma } from "@prisma/client";

function resolveBonAbsolute(storedPath: string): string {
  return path.isAbsolute(storedPath) ? storedPath : path.join(process.cwd(), storedPath);
}

/** Matches Prisma `PurchaseDestination` — use string literals so runtime does not depend on a stale generated enum export (run `npx prisma generate` after schema changes). */
const PURCHASE_DESTINATIONS = ["STOCK", "PERSONNEL_BIN"] as const;
type PurchaseDestination = (typeof PURCHASE_DESTINATIONS)[number];
import { prisma } from "../lib/prisma.js";
import { applyStockMovementInTransaction } from "../lib/warehouse-inbound.js";
import {
  addToPersonnelBinWithoutStock,
  subtractFromPersonnelBinWithoutStock,
} from "../lib/personnel-bin-direct.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

const MAX_BON_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function uploadRoot(): string {
  const fromEnv = process.env.PURCHASE_UPLOAD_DIR;
  return fromEnv ? path.resolve(fromEnv) : path.join(process.cwd(), "uploads", "purchases");
}

const uploadDir = uploadRoot();
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || "";
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_BON_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(new Error("Invalid file type for bon (use PDF or image)"));
      return;
    }
    cb(null, true);
  },
});

const lineSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().positive(),
});

const createBodySchema = z.object({
  authorizedByPersonnelId: z.string().min(1),
  destination: z.enum(PURCHASE_DESTINATIONS),
  targetPersonnelId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  lines: z.array(lineSchema).min(1),
});

const patchBodySchema = z.object({
  authorizedByPersonnelId: z.string().min(1).optional(),
  notes: z.union([z.string(), z.null()]).optional(),
  targetPersonnelId: z.union([z.string(), z.null()]).optional(),
  lines: z.array(lineSchema).min(1).optional(),
});

function purchaseListItem(p: {
  id: string;
  destination: PurchaseDestination;
  bonOriginalName: string;
  notes: string | null;
  createdAt: Date;
  authorizedBy: { firstName: string; lastName: string };
  targetPersonnel: { firstName: string; lastName: string } | null;
  createdBy: { displayName: string; email: string };
  _count: { lines: number };
}) {
  return {
    id: p.id,
    destination: p.destination,
    bonOriginalName: p.bonOriginalName,
    notes: p.notes,
    createdAt: p.createdAt,
    authorizedByName: `${p.authorizedBy.firstName} ${p.authorizedBy.lastName}`.trim(),
    targetPersonnelName: p.targetPersonnel
      ? `${p.targetPersonnel.firstName} ${p.targetPersonnel.lastName}`.trim()
      : null,
    createdByName: p.createdBy.displayName,
    lineCount: p._count.lines,
  };
}

router.get("/", async (_req, res) => {
  const rows = await prisma.purchase.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      authorizedBy: { select: { firstName: true, lastName: true } },
      targetPersonnel: { select: { firstName: true, lastName: true } },
      createdBy: { select: { displayName: true, email: true } },
      _count: { select: { lines: true } },
    },
  });
  res.json(rows.map(purchaseListItem));
});

router.get("/:id", async (req, res) => {
  const row = await prisma.purchase.findUnique({
    where: { id: req.params.id },
    include: {
      authorizedBy: { select: { firstName: true, lastName: true, id: true } },
      targetPersonnel: { select: { firstName: true, lastName: true, id: true } },
      createdBy: { select: { displayName: true, email: true, id: true } },
      lines: {
        orderBy: { lineIndex: "asc" },
        include: { product: { select: { id: true, sku: true, name: true } } },
      },
    },
  });
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({
    id: row.id,
    destination: row.destination,
    bonOriginalName: row.bonOriginalName,
    notes: row.notes,
    createdAt: row.createdAt,
    authorizedBy: row.authorizedBy,
    targetPersonnel: row.targetPersonnel,
    createdBy: row.createdBy,
    lines: row.lines.map((l) => ({
      id: l.id,
      productId: l.productId,
      sku: l.product.sku,
      productName: l.product.name,
      quantity: Number(l.quantity),
      lineIndex: l.lineIndex,
    })),
  });
});

router.get("/:id/bon", async (req, res) => {
  const row = await prisma.purchase.findUnique({
    where: { id: req.params.id },
    select: { bonStoredPath: true, bonOriginalName: true },
  });
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const abs = resolveBonAbsolute(row.bonStoredPath);
  if (!fs.existsSync(abs)) {
    res.status(404).json({ error: "Bon file missing on server" });
    return;
  }
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${encodeURIComponent(row.bonOriginalName)}"`,
  );
  res.sendFile(abs);
});

router.post("/", (req, res, next) => {
  upload.single("bon")(req, res, (err: unknown) => {
    if (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      res.status(400).json({ error: msg });
      return;
    }
    next();
  });
}, async (req, res) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "Bon file is required" });
    return;
  }

  let linesRaw: unknown;
  try {
    linesRaw = JSON.parse(String(req.body.lines ?? "[]"));
  } catch {
    res.status(400).json({ error: "Invalid lines JSON" });
    return;
  }

  const parsed = createBodySchema.safeParse({
    authorizedByPersonnelId: req.body.authorizedByPersonnelId,
    destination: req.body.destination,
    targetPersonnelId: req.body.targetPersonnelId || null,
    notes: req.body.notes || null,
    lines: linesRaw,
  });

  if (!parsed.success) {
    fs.unlink(file.path, () => {});
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const data = parsed.data;
  if (data.destination === "PERSONNEL_BIN" && !data.targetPersonnelId) {
    fs.unlink(file.path, () => {});
    res.status(400).json({ error: "targetPersonnelId is required for personal bin destination" });
    return;
  }
  if (data.destination === "STOCK" && data.targetPersonnelId) {
    fs.unlink(file.path, () => {});
    res.status(400).json({ error: "targetPersonnelId must be empty when destination is stock" });
    return;
  }

  const authorizer = await prisma.personnel.findUnique({
    where: { id: data.authorizedByPersonnelId },
  });
  if (!authorizer) {
    fs.unlink(file.path, () => {});
    res.status(400).json({ error: "Authorizing personnel not found" });
    return;
  }

  if (data.targetPersonnelId) {
    const target = await prisma.personnel.findUnique({ where: { id: data.targetPersonnelId } });
    if (!target) {
      fs.unlink(file.path, () => {});
      res.status(400).json({ error: "Target personnel not found" });
      return;
    }
  }

  const productIds = [...new Set(data.lines.map((l) => l.productId))];
  const products = await prisma.product.findMany({ where: { id: { in: productIds } } });
  if (products.length !== productIds.length) {
    fs.unlink(file.path, () => {});
    res.status(400).json({ error: "One or more products not found" });
    return;
  }

  const userId = req.user!.sub;
  const relPath = path.relative(process.cwd(), file.path);
  const storedPath = relPath && !relPath.startsWith("..") ? relPath : file.path;

  const purchaseNote = data.notes?.trim() || null;

  try {
    const purchase = await prisma.$transaction(async (tx) => {
      const p = await tx.purchase.create({
        data: {
          destination: data.destination,
          authorizedByPersonnelId: data.authorizedByPersonnelId,
          targetPersonnelId: data.targetPersonnelId ?? null,
          bonStoredPath: storedPath,
          bonOriginalName: file.originalname.slice(0, 500),
          notes: purchaseNote,
          createdByUserId: userId,
          lines: {
            create: data.lines.map((l, i) => ({
              productId: l.productId,
              quantity: new Prisma.Decimal(l.quantity),
              lineIndex: i,
            })),
          },
        },
        include: { lines: true },
      });

      const refNote = `Purchase ${p.id}`;

      if (data.destination === "STOCK") {
        for (const line of p.lines) {
          const qty = new Prisma.Decimal(line.quantity.toString());
          await applyStockMovementInTransaction(tx, {
            productId: line.productId,
            userId,
            type: MovementType.IN,
            quantity: qty,
            note: [refNote, purchaseNote].filter(Boolean).join(" · ") || refNote,
            purchaseId: p.id,
          });
        }
      } else {
        const targetId = data.targetPersonnelId as string;
        for (const line of p.lines) {
          const qty = new Prisma.Decimal(line.quantity.toString());
          await addToPersonnelBinWithoutStock(tx, {
            personnelId: targetId,
            productId: line.productId,
            addQty: qty,
            noteLine: [refNote, purchaseNote].filter(Boolean).join(" · ") || refNote,
          });
        }
      }

      return p;
    });

    res.status(201).json({ id: purchase.id });
  } catch (e: unknown) {
    fs.unlink(file.path, () => {});
    throw e;
  }
});

type Tx = Prisma.TransactionClient;

async function replacePurchaseLinesStock(
  tx: Tx,
  purchaseId: string,
  userId: string,
  newLines: { productId: string; quantity: number }[],
  movementNote: string | null,
) {
  const movements = await tx.stockMovement.findMany({ where: { purchaseId } });
  for (const m of movements) {
    if (m.type !== MovementType.IN) continue;
    await applyStockMovementInTransaction(tx, {
      productId: m.productId,
      userId,
      type: MovementType.OUT,
      quantity: new Prisma.Decimal(m.quantity.toString()),
      note: `Adjustment: purchase ${purchaseId}`,
      purchaseId: null,
    });
  }
  await tx.stockMovement.deleteMany({ where: { purchaseId } });
  await tx.purchaseLine.deleteMany({ where: { purchaseId } });
  const refNote = `Purchase ${purchaseId}`;
  for (let i = 0; i < newLines.length; i++) {
    const l = newLines[i];
    await tx.purchaseLine.create({
      data: {
        purchaseId,
        productId: l.productId,
        quantity: new Prisma.Decimal(l.quantity),
        lineIndex: i,
      },
    });
  }
  const lines = await tx.purchaseLine.findMany({
    where: { purchaseId },
    orderBy: { lineIndex: "asc" },
  });
  for (const line of lines) {
    const qty = new Prisma.Decimal(line.quantity.toString());
    await applyStockMovementInTransaction(tx, {
      productId: line.productId,
      userId,
      type: MovementType.IN,
      quantity: qty,
      note: [refNote, movementNote].filter(Boolean).join(" · ") || refNote,
      purchaseId,
    });
  }
}

async function replacePurchaseLinesBin(
  tx: Tx,
  purchaseId: string,
  existingLines: { productId: string; quantity: unknown }[],
  oldBinPersonnelId: string,
  newBinPersonnelId: string,
  newLines: { productId: string; quantity: number }[],
  movementNote: string | null,
) {
  for (const line of existingLines) {
    await subtractFromPersonnelBinWithoutStock(tx, {
      personnelId: oldBinPersonnelId,
      productId: line.productId,
      subQty: new Prisma.Decimal(String(line.quantity)),
    });
  }
  await tx.purchaseLine.deleteMany({ where: { purchaseId } });
  const refNote = `Purchase ${purchaseId}`;
  for (let i = 0; i < newLines.length; i++) {
    const l = newLines[i];
    await tx.purchaseLine.create({
      data: {
        purchaseId,
        productId: l.productId,
        quantity: new Prisma.Decimal(l.quantity),
        lineIndex: i,
      },
    });
  }
  const lines = await tx.purchaseLine.findMany({
    where: { purchaseId },
    orderBy: { lineIndex: "asc" },
  });
  for (const line of lines) {
    await addToPersonnelBinWithoutStock(tx, {
      personnelId: newBinPersonnelId,
      productId: line.productId,
      addQty: new Prisma.Decimal(line.quantity.toString()),
      noteLine: [refNote, movementNote].filter(Boolean).join(" · ") || refNote,
    });
  }
}

async function transferBinPurchaseTarget(
  tx: Tx,
  purchaseId: string,
  lines: { productId: string; quantity: unknown }[],
  oldPid: string,
  newPid: string,
  movementNote: string | null,
) {
  const refNote = `Purchase ${purchaseId}`;
  for (const line of lines) {
    const q = new Prisma.Decimal(String(line.quantity));
    await subtractFromPersonnelBinWithoutStock(tx, {
      personnelId: oldPid,
      productId: line.productId,
      subQty: q,
    });
    await addToPersonnelBinWithoutStock(tx, {
      personnelId: newPid,
      productId: line.productId,
      addQty: q,
      noteLine: [refNote, movementNote].filter(Boolean).join(" · ") || refNote,
    });
  }
}

function parsePatchBody(req: { body: unknown }): Record<string, unknown> {
  const b = { ...(req.body as Record<string, unknown>) };
  if (typeof b.lines === "string") {
    b.lines = JSON.parse(b.lines as string);
  }
  if (b.notes === "") {
    b.notes = null;
  }
  return b;
}

router.delete("/:id", async (req, res) => {
  const id = req.params.id;
  const userId = req.user!.sub;
  const existing = await prisma.purchase.findUnique({
    where: { id },
    include: { lines: true },
  });
  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  try {
    await prisma.$transaction(async (tx) => {
      if (existing.destination === "STOCK") {
        const movements = await tx.stockMovement.findMany({ where: { purchaseId: id } });
        for (const m of movements) {
          if (m.type !== MovementType.IN) continue;
          await applyStockMovementInTransaction(tx, {
            productId: m.productId,
            userId,
            type: MovementType.OUT,
            quantity: new Prisma.Decimal(m.quantity.toString()),
            note: `Reversal: purchase ${id} deleted`,
            purchaseId: null,
          });
        }
        await tx.stockMovement.deleteMany({ where: { purchaseId: id } });
      } else {
        const targetId = existing.targetPersonnelId;
        if (!targetId) {
          throw new Error("Purchase missing bin target");
        }
        for (const line of existing.lines) {
          await subtractFromPersonnelBinWithoutStock(tx, {
            personnelId: targetId,
            productId: line.productId,
            subQty: new Prisma.Decimal(line.quantity.toString()),
          });
        }
      }
      await tx.purchase.delete({ where: { id } });
    });
    const abs = resolveBonAbsolute(existing.bonStoredPath);
    fs.unlink(abs, () => {});
    res.status(204).send();
  } catch (e: unknown) {
    const code =
      e && typeof e === "object" && "code" in e ? (e as { code?: string }).code : undefined;
    if (code === "INSUFFICIENT_BIN") {
      res.status(409).json({
        error: e instanceof Error ? e.message : "Insufficient quantity in personal bin",
      });
      return;
    }
    if (code === "INSUFFICIENT") {
      res.status(409).json({
        error:
          e instanceof Error
            ? e.message
            : "Cannot delete: insufficient warehouse stock to reverse this purchase",
      });
      return;
    }
    throw e;
  }
});

router.patch("/:id", (req, res, next) => {
  const ct = req.get("content-type") || "";
  if (ct.includes("multipart/form-data")) {
    upload.single("bon")(req, res, (err: unknown) => {
      if (err) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        res.status(400).json({ error: msg });
        return;
      }
      next();
    });
  } else {
    next();
  }
}, async (req, res) => {
  const id = req.params.id;
  const userId = req.user!.sub;

  let raw: Record<string, unknown>;
  try {
    raw = parsePatchBody(req);
  } catch {
    res.status(400).json({ error: "Invalid lines JSON" });
    return;
  }

  const parsed = patchBodySchema.safeParse(raw);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const p = parsed.data;
  const hasFile = Boolean(req.file);
  if (!hasFile && Object.keys(p).length === 0) {
    res.status(400).json({ error: "No changes" });
    return;
  }

  const existing = await prisma.purchase.findUnique({
    where: { id },
    include: { lines: { orderBy: { lineIndex: "asc" } } },
  });
  if (!existing) {
    if (hasFile && req.file) fs.unlink(req.file.path, () => {});
    res.status(404).json({ error: "Not found" });
    return;
  }

  if (p.authorizedByPersonnelId) {
    const a = await prisma.personnel.findUnique({ where: { id: p.authorizedByPersonnelId } });
    if (!a) {
      if (hasFile && req.file) fs.unlink(req.file.path, () => {});
      res.status(400).json({ error: "Authorizing personnel not found" });
      return;
    }
  }

  const dest = existing.destination as PurchaseDestination;
  if (dest === "PERSONNEL_BIN" && p.targetPersonnelId === null) {
    if (hasFile && req.file) fs.unlink(req.file.path, () => {});
    res.status(400).json({ error: "targetPersonnelId cannot be cleared for bin purchases" });
    return;
  }
  if (dest === "PERSONNEL_BIN" && p.targetPersonnelId) {
    const t = await prisma.personnel.findUnique({ where: { id: p.targetPersonnelId } });
    if (!t) {
      if (hasFile && req.file) fs.unlink(req.file.path, () => {});
      res.status(400).json({ error: "Target personnel not found" });
      return;
    }
  }

  if (p.lines) {
    const productIds = [...new Set(p.lines.map((l) => l.productId))];
    const products = await prisma.product.findMany({ where: { id: { in: productIds } } });
    if (products.length !== productIds.length) {
      if (hasFile && req.file) fs.unlink(req.file.path, () => {});
      res.status(400).json({ error: "One or more products not found" });
      return;
    }
  }

  const nextNotes =
    p.notes !== undefined ? (p.notes === null ? null : p.notes.trim() || null) : undefined;

  try {
    await prisma.$transaction(async (tx) => {
      const movementNote =
        nextNotes !== undefined ? nextNotes : existing.notes;

      if (p.lines !== undefined) {
        if (dest === "STOCK") {
          await replacePurchaseLinesStock(tx, id, userId, p.lines, movementNote ?? null);
        } else {
          const oldT = existing.targetPersonnelId;
          if (!oldT) {
            throw new Error("Purchase missing bin target");
          }
          const newT =
            p.targetPersonnelId !== undefined && p.targetPersonnelId !== null
              ? p.targetPersonnelId
              : oldT;
          await replacePurchaseLinesBin(
            tx,
            id,
            existing.lines,
            oldT,
            newT,
            p.lines,
            movementNote ?? null,
          );
          await tx.purchase.update({
            where: { id },
            data: { targetPersonnelId: newT },
          });
        }
      } else if (
        dest === "PERSONNEL_BIN" &&
        p.targetPersonnelId !== undefined &&
        p.targetPersonnelId !== existing.targetPersonnelId
      ) {
        const oldT = existing.targetPersonnelId;
        const newT = p.targetPersonnelId;
        if (oldT && newT && oldT !== newT) {
          await transferBinPurchaseTarget(
            tx,
            id,
            existing.lines,
            oldT,
            newT,
            nextNotes !== undefined ? nextNotes : existing.notes,
          );
        }
      }

      const updateData: {
        authorizedByPersonnelId?: string;
        notes?: string | null;
        targetPersonnelId?: string | null;
        bonStoredPath?: string;
        bonOriginalName?: string;
      } = {};

      if (p.authorizedByPersonnelId !== undefined) {
        updateData.authorizedByPersonnelId = p.authorizedByPersonnelId;
      }
      if (p.notes !== undefined) {
        updateData.notes = nextNotes ?? null;
      }
      if (
        dest === "PERSONNEL_BIN" &&
        p.targetPersonnelId !== undefined &&
        p.lines === undefined
      ) {
        updateData.targetPersonnelId = p.targetPersonnelId;
      }

      if (Object.keys(updateData).length > 0) {
        await tx.purchase.update({ where: { id }, data: updateData });
      }

      if (req.file) {
        const relPath = path.relative(process.cwd(), req.file.path);
        const storedPath = relPath && !relPath.startsWith("..") ? relPath : req.file.path;
        const prevAbs = resolveBonAbsolute(existing.bonStoredPath);
        await tx.purchase.update({
          where: { id },
          data: {
            bonStoredPath: storedPath,
            bonOriginalName: req.file.originalname.slice(0, 500),
          },
        });
        fs.unlink(prevAbs, () => {});
      }
    });

    res.json({ ok: true });
  } catch (e: unknown) {
    if (req.file) fs.unlink(req.file.path, () => {});
    const code =
      e && typeof e === "object" && "code" in e ? (e as { code?: string }).code : undefined;
    if (code === "INSUFFICIENT_BIN") {
      res.status(409).json({
        error: e instanceof Error ? e.message : "Insufficient quantity in personal bin",
      });
      return;
    }
    throw e;
  }
});

export default router;
