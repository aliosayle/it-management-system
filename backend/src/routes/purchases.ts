import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { MovementType, Prisma, PurchaseDestination, PurchaseStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { applyStockMovementInTransaction } from "../lib/warehouse-inbound.js";
import {
  addToPersonnelBinWithoutStock,
  subtractFromPersonnelBinWithoutStock,
} from "../lib/personnel-bin-direct.js";
import { requireAuth } from "../middleware/auth.js";

function resolveBonAbsolute(storedPath: string): string {
  return path.isAbsolute(storedPath) ? storedPath : path.join(process.cwd(), storedPath);
}

/** Line-level destinations (never MIXED on a line). */
const LINE_DESTINATIONS = ["STOCK", "PERSONNEL_BIN"] as const;
type LineDestination = (typeof LINE_DESTINATIONS)[number];

const PURCHASE_STATUSES = ["PENDING", "COMPLETE", "CANCELLED"] as const;
type PurchaseStatusLiteral = (typeof PURCHASE_STATUSES)[number];

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

const lineSchema = z
  .object({
    productId: z.string().min(1),
    quantity: z.number().positive(),
    unitPrice: z.number().nonnegative(),
    destination: z.enum(LINE_DESTINATIONS),
    targetPersonnelId: z.string().nullable().optional(),
  })
  .superRefine((line, ctx) => {
    if (line.destination === "PERSONNEL_BIN") {
      if (!line.targetPersonnelId || line.targetPersonnelId.trim() === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "targetPersonnelId is required for PERSONNEL_BIN lines",
          path: ["targetPersonnelId"],
        });
      }
    } else if (line.targetPersonnelId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "targetPersonnelId must be empty for STOCK lines",
        path: ["targetPersonnelId"],
      });
    }
  });

const createBodySchema = z.object({
  authorizedByPersonnelId: z.string().min(1),
  buyerPersonnelId: z.string().min(1),
  supplierId: z.string().min(1),
  notes: z.string().optional().nullable(),
  status: z.enum(PURCHASE_STATUSES).optional(),
  lines: z.array(lineSchema).min(1),
});

const patchBodySchema = z.object({
  authorizedByPersonnelId: z.string().min(1).optional(),
  buyerPersonnelId: z.string().min(1).optional(),
  supplierId: z.string().min(1).optional(),
  notes: z.union([z.string(), z.null()]).optional(),
  lines: z.array(lineSchema).min(1).optional(),
  status: z.enum(PURCHASE_STATUSES).optional(),
});

type Tx = Prisma.TransactionClient;

type LineInput = {
  productId: string;
  quantity: number;
  unitPrice: number;
  destination: LineDestination;
  targetPersonnelId: string | null;
};

function normalizedLineInput(raw: z.infer<typeof lineSchema>): LineInput {
  return {
    productId: raw.productId,
    quantity: raw.quantity,
    unitPrice: raw.unitPrice,
    destination: raw.destination,
    targetPersonnelId: raw.destination === "STOCK" ? null : raw.targetPersonnelId ?? null,
  };
}

/** Purchase header summary derived from line destinations. */
function computePurchaseSummaryFromLines(
  lines: { destination: LineDestination; targetPersonnelId: string | null }[],
): { destination: PurchaseDestination; targetPersonnelId: string | null } {
  const binLines = lines.filter((l) => l.destination === "PERSONNEL_BIN");
  const stockCount = lines.length - binLines.length;
  if (binLines.length === lines.length) {
    const ids = [
      ...new Set(binLines.map((l) => l.targetPersonnelId).filter((x): x is string => Boolean(x))),
    ];
    if (ids.length === 1) {
      return { destination: PurchaseDestination.PERSONNEL_BIN, targetPersonnelId: ids[0]! };
    }
    return { destination: PurchaseDestination.MIXED, targetPersonnelId: null };
  }
  if (stockCount === lines.length) {
    return { destination: PurchaseDestination.STOCK, targetPersonnelId: null };
  }
  return { destination: PurchaseDestination.MIXED, targetPersonnelId: null };
}

type LineInventoryRow = {
  productId: string;
  quantity: Prisma.Decimal;
  destination: LineDestination;
  targetPersonnelId: string | null;
};

function purchaseListItem(p: {
  id: string;
  destination: PurchaseDestination;
  status: PurchaseStatus;
  bonOriginalName: string;
  notes: string | null;
  createdAt: Date;
  supplier: { name: string };
  authorizedBy: { firstName: string; lastName: string };
  buyerPersonnel: { firstName: string; lastName: string };
  targetPersonnel: { firstName: string; lastName: string } | null;
  createdBy: { displayName: string; email: string };
  _count: { lines: number };
  lines: { quantity: Prisma.Decimal; unitPrice: Prisma.Decimal }[];
}) {
  const totalAmount = p.lines.reduce(
    (sum, l) => sum + Number(l.quantity) * Number(l.unitPrice),
    0,
  );
  return {
    id: p.id,
    destination: p.destination,
    status: p.status,
    supplierName: p.supplier.name,
    bonOriginalName: p.bonOriginalName,
    notes: p.notes,
    createdAt: p.createdAt,
    authorizedByName: `${p.authorizedBy.firstName} ${p.authorizedBy.lastName}`.trim(),
    buyerName: `${p.buyerPersonnel.firstName} ${p.buyerPersonnel.lastName}`.trim(),
    targetPersonnelName:
      p.destination === "MIXED"
        ? "Various"
        : p.targetPersonnel
          ? `${p.targetPersonnel.firstName} ${p.targetPersonnel.lastName}`.trim()
          : null,
    createdByName: p.createdBy.displayName,
    lineCount: p._count.lines,
    totalAmount,
  };
}

router.get("/", async (_req, res) => {
  const rows = await prisma.purchase.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      supplier: { select: { name: true } },
      authorizedBy: { select: { firstName: true, lastName: true } },
      buyerPersonnel: { select: { firstName: true, lastName: true } },
      targetPersonnel: { select: { firstName: true, lastName: true } },
      createdBy: { select: { displayName: true, email: true } },
      _count: { select: { lines: true } },
      lines: { select: { quantity: true, unitPrice: true } },
    },
  });
  res.json(rows.map(purchaseListItem));
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

router.get("/:id", async (req, res) => {
  const row = await prisma.purchase.findUnique({
    where: { id: req.params.id },
    include: {
      supplier: { select: { id: true, name: true } },
      authorizedBy: { select: { firstName: true, lastName: true, id: true } },
      buyerPersonnel: { select: { firstName: true, lastName: true, id: true } },
      targetPersonnel: { select: { firstName: true, lastName: true, id: true } },
      createdBy: { select: { displayName: true, email: true, id: true } },
      lines: {
        orderBy: { lineIndex: "asc" },
        include: {
          product: { select: { id: true, sku: true, name: true } },
          targetPersonnel: { select: { id: true, firstName: true, lastName: true } },
        },
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
    status: row.status,
    supplier: row.supplier,
    bonOriginalName: row.bonOriginalName,
    notes: row.notes,
    createdAt: row.createdAt,
    authorizedBy: row.authorizedBy,
    buyerPersonnel: row.buyerPersonnel,
    targetPersonnel: row.targetPersonnel,
    createdBy: row.createdBy,
    lines: row.lines.map((l) => ({
      id: l.id,
      productId: l.productId,
      sku: l.product.sku,
      productName: l.product.name,
      quantity: Number(l.quantity),
      unitPrice: Number(l.unitPrice),
      lineIndex: l.lineIndex,
      lineTotal: Number(l.quantity) * Number(l.unitPrice),
      destination: l.destination,
      targetPersonnel: l.targetPersonnel,
    })),
  });
});

async function applyCompletedPurchaseInventory(
  tx: Tx,
  params: {
    purchaseId: string;
    lines: LineInventoryRow[];
    userId: string;
    purchaseNote: string | null;
  },
) {
  const { purchaseId, lines, userId, purchaseNote } = params;
  const refNote = `Purchase ${purchaseId}`;
  const noteBase = [refNote, purchaseNote].filter(Boolean).join(" · ") || refNote;
  for (const line of lines) {
    if (line.destination === "STOCK") {
      await applyStockMovementInTransaction(tx, {
        productId: line.productId,
        userId,
        type: MovementType.IN,
        quantity: line.quantity,
        note: noteBase,
        purchaseId,
      });
    } else {
      const targetId = line.targetPersonnelId;
      if (!targetId) {
        throw Object.assign(new Error("Bin line missing target personnel"), {
          code: "BIN_LINE_NO_TARGET",
        });
      }
      await addToPersonnelBinWithoutStock(tx, {
        personnelId: targetId,
        productId: line.productId,
        addQty: line.quantity,
        noteLine: noteBase,
      });
    }
  }
}

async function reverseCompletedPurchaseInventory(
  tx: Tx,
  params: {
    purchaseId: string;
    lines: LineInventoryRow[];
    userId: string;
  },
) {
  const { purchaseId, lines, userId } = params;
  const movements = await tx.stockMovement.findMany({ where: { purchaseId } });
  for (const m of movements) {
    if (m.type !== MovementType.IN) continue;
    await applyStockMovementInTransaction(tx, {
      productId: m.productId,
      userId,
      type: MovementType.OUT,
      quantity: new Prisma.Decimal(m.quantity.toString()),
      note: `Reversal: purchase ${purchaseId}`,
      purchaseId: null,
    });
  }
  await tx.stockMovement.deleteMany({ where: { purchaseId } });

  for (const line of lines) {
    if (line.destination === "PERSONNEL_BIN") {
      const targetId = line.targetPersonnelId;
      if (!targetId) {
        throw new Error("Purchase bin line missing target personnel for reversal");
      }
      await subtractFromPersonnelBinWithoutStock(tx, {
        personnelId: targetId,
        productId: line.productId,
        subQty: new Prisma.Decimal(line.quantity.toString()),
      });
    }
  }
}

function dbLinesToInventoryRows(
  lines: Array<{
    productId: string;
    quantity: Prisma.Decimal;
    destination: PurchaseDestination;
    targetPersonnelId: string | null;
  }>,
): LineInventoryRow[] {
  return lines.map((l) => ({
    productId: l.productId,
    quantity: new Prisma.Decimal(l.quantity.toString()),
    destination: (l.destination === "PERSONNEL_BIN" ? "PERSONNEL_BIN" : "STOCK") as LineDestination,
    targetPersonnelId: l.targetPersonnelId,
  }));
}

async function replacePurchaseLinesOnly(tx: Tx, purchaseId: string, newLines: LineInput[]) {
  await tx.purchaseLine.deleteMany({ where: { purchaseId } });
  for (let i = 0; i < newLines.length; i++) {
    const l = newLines[i];
    await tx.purchaseLine.create({
      data: {
        purchaseId,
        productId: l.productId,
        quantity: new Prisma.Decimal(l.quantity),
        unitPrice: new Prisma.Decimal(l.unitPrice),
        lineIndex: i,
        destination: l.destination,
        targetPersonnelId: l.destination === "STOCK" ? null : l.targetPersonnelId,
      },
    });
  }
}

/** Reverse completed inventory from snapshot, replace lines, re-apply inventory for new lines. */
async function replaceCompletedPurchaseLines(
  tx: Tx,
  purchaseId: string,
  userId: string,
  snapshotLines: LineInventoryRow[],
  newLines: LineInput[],
  purchaseNote: string | null,
) {
  await reverseCompletedPurchaseInventory(tx, {
    purchaseId,
    lines: snapshotLines,
    userId,
  });

  await tx.purchaseLine.deleteMany({ where: { purchaseId } });
  for (let i = 0; i < newLines.length; i++) {
    const l = newLines[i];
    await tx.purchaseLine.create({
      data: {
        purchaseId,
        productId: l.productId,
        quantity: new Prisma.Decimal(l.quantity),
        unitPrice: new Prisma.Decimal(l.unitPrice),
        lineIndex: i,
        destination: l.destination,
        targetPersonnelId: l.destination === "STOCK" ? null : l.targetPersonnelId,
      },
    });
  }

  const linesRows = await tx.purchaseLine.findMany({
    where: { purchaseId },
    orderBy: { lineIndex: "asc" },
  });
  await applyCompletedPurchaseInventory(tx, {
    purchaseId,
    lines: dbLinesToInventoryRows(linesRows),
    userId,
    purchaseNote,
  });
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

  const statusRaw =
    typeof req.body.status === "string" && req.body.status.trim() !== ""
      ? req.body.status.trim()
      : undefined;

  const parsed = createBodySchema.safeParse({
    authorizedByPersonnelId: req.body.authorizedByPersonnelId,
    buyerPersonnelId: req.body.buyerPersonnelId,
    supplierId: req.body.supplierId,
    notes: req.body.notes || null,
    status: statusRaw as PurchaseStatusLiteral | undefined,
    lines: linesRaw,
  });

  if (!parsed.success) {
    fs.unlink(file.path, () => {});
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const data = parsed.data;
  const status = data.status ?? PurchaseStatus.PENDING;
  const lineInputs = data.lines.map(normalizedLineInput);
  const summary = computePurchaseSummaryFromLines(lineInputs);

  const authorizer = await prisma.personnel.findUnique({
    where: { id: data.authorizedByPersonnelId },
    select: { id: true, canAuthorizePurchases: true },
  });
  if (!authorizer) {
    fs.unlink(file.path, () => {});
    res.status(400).json({ error: "Authorizing personnel not found" });
    return;
  }
  if (!authorizer.canAuthorizePurchases) {
    fs.unlink(file.path, () => {});
    res.status(400).json({
      error: "Selected personnel is not allowed to authorize purchases",
    });
    return;
  }

  const buyer = await prisma.personnel.findUnique({
    where: { id: data.buyerPersonnelId },
    select: { id: true, isBuyer: true },
  });
  if (!buyer) {
    fs.unlink(file.path, () => {});
    res.status(400).json({ error: "Buyer personnel not found" });
    return;
  }
  if (!buyer.isBuyer) {
    fs.unlink(file.path, () => {});
    res.status(400).json({ error: "Selected personnel is not flagged as Buyer for purchases" });
    return;
  }

  const supplier = await prisma.supplier.findUnique({ where: { id: data.supplierId } });
  if (!supplier) {
    fs.unlink(file.path, () => {});
    res.status(400).json({ error: "Supplier not found" });
    return;
  }

  const binTargetIds = [
    ...new Set(
      lineInputs.filter((l) => l.destination === "PERSONNEL_BIN").map((l) => l.targetPersonnelId!),
    ),
  ];
  for (const tid of binTargetIds) {
    const target = await prisma.personnel.findUnique({ where: { id: tid } });
    if (!target) {
      fs.unlink(file.path, () => {});
      res.status(400).json({ error: `Target personnel not found: ${tid}` });
      return;
    }
  }

  const productIds = [...new Set(lineInputs.map((l) => l.productId))];
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
          destination: summary.destination,
          status,
          supplierId: data.supplierId,
          buyerPersonnelId: data.buyerPersonnelId,
          authorizedByPersonnelId: data.authorizedByPersonnelId,
          targetPersonnelId: summary.targetPersonnelId,
          bonStoredPath: storedPath,
          bonOriginalName: file.originalname.slice(0, 500),
          notes: purchaseNote,
          createdByUserId: userId,
          lines: {
            create: lineInputs.map((l, i) => ({
              productId: l.productId,
              quantity: new Prisma.Decimal(l.quantity),
              unitPrice: new Prisma.Decimal(l.unitPrice),
              lineIndex: i,
              destination: l.destination,
              targetPersonnelId: l.destination === "STOCK" ? null : l.targetPersonnelId,
            })),
          },
        },
        include: { lines: true },
      });

      if (status === PurchaseStatus.COMPLETE) {
        const linesForInv = dbLinesToInventoryRows(p.lines);
        await applyCompletedPurchaseInventory(tx, {
          purchaseId: p.id,
          lines: linesForInv,
          userId,
          purchaseNote,
        });
      }

      return p;
    });

    res.status(201).json({ id: purchase.id });
  } catch (e: unknown) {
    fs.unlink(file.path, () => {});
    throw e;
  }
});

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
      if (existing.status === PurchaseStatus.COMPLETE) {
        await reverseCompletedPurchaseInventory(tx, {
          purchaseId: id,
          lines: dbLinesToInventoryRows(existing.lines),
          userId,
        });
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
  const hasPatchFields = Object.keys(p).length > 0;
  if (!hasFile && !hasPatchFields) {
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

  if (existing.status === PurchaseStatus.CANCELLED) {
    if (hasFile && req.file) fs.unlink(req.file.path, () => {});
    res.status(400).json({ error: "Cannot modify a cancelled purchase" });
    return;
  }

  if (
    p.status === PurchaseStatus.CANCELLED &&
    p.lines !== undefined &&
    existing.status === PurchaseStatus.COMPLETE
  ) {
    if (hasFile && req.file) fs.unlink(req.file.path, () => {});
    res.status(400).json({
      error: "Cannot change lines when cancelling a completed purchase",
    });
    return;
  }

  if (p.authorizedByPersonnelId) {
    const a = await prisma.personnel.findUnique({
      where: { id: p.authorizedByPersonnelId },
      select: { id: true, canAuthorizePurchases: true },
    });
    if (!a) {
      if (hasFile && req.file) fs.unlink(req.file.path, () => {});
      res.status(400).json({ error: "Authorizing personnel not found" });
      return;
    }
    const changingAuthorizer = p.authorizedByPersonnelId !== existing.authorizedByPersonnelId;
    if (changingAuthorizer && !a.canAuthorizePurchases) {
      if (hasFile && req.file) fs.unlink(req.file.path, () => {});
      res.status(400).json({
        error: "Selected personnel is not allowed to authorize purchases",
      });
      return;
    }
  }

  if (p.buyerPersonnelId) {
    const b = await prisma.personnel.findUnique({
      where: { id: p.buyerPersonnelId },
      select: { id: true, isBuyer: true },
    });
    if (!b) {
      if (hasFile && req.file) fs.unlink(req.file.path, () => {});
      res.status(400).json({ error: "Buyer personnel not found" });
      return;
    }
    if (!b.isBuyer) {
      if (hasFile && req.file) fs.unlink(req.file.path, () => {});
      res.status(400).json({ error: "Selected personnel is not flagged as Buyer for purchases" });
      return;
    }
  }

  if (p.supplierId) {
    const s = await prisma.supplier.findUnique({ where: { id: p.supplierId } });
    if (!s) {
      if (hasFile && req.file) fs.unlink(req.file.path, () => {});
      res.status(400).json({ error: "Supplier not found" });
      return;
    }
  }

  let normalizedPatchLines: LineInput[] | undefined;
  if (p.lines) {
    normalizedPatchLines = p.lines.map(normalizedLineInput);
    const productIds = [...new Set(normalizedPatchLines.map((l) => l.productId))];
    const products = await prisma.product.findMany({ where: { id: { in: productIds } } });
    if (products.length !== productIds.length) {
      if (hasFile && req.file) fs.unlink(req.file.path, () => {});
      res.status(400).json({ error: "One or more products not found" });
      return;
    }
    const binTargetIds = [
      ...new Set(
        normalizedPatchLines
          .filter((l) => l.destination === "PERSONNEL_BIN")
          .map((l) => l.targetPersonnelId!),
      ),
    ];
    for (const tid of binTargetIds) {
      const t = await prisma.personnel.findUnique({ where: { id: tid } });
      if (!t) {
        if (hasFile && req.file) fs.unlink(req.file.path, () => {});
        res.status(400).json({ error: "Target personnel not found for a bin line" });
        return;
      }
    }
  }

  const nextNotes =
    p.notes !== undefined ? (p.notes === null ? null : p.notes.trim() || null) : undefined;

  const nextStatus =
    p.status !== undefined ? p.status : (existing.status as PurchaseStatusLiteral);

  if (existing.status === PurchaseStatus.COMPLETE && nextStatus === PurchaseStatus.PENDING) {
    if (hasFile && req.file) fs.unlink(req.file.path, () => {});
    res.status(400).json({ error: "Cannot set a completed purchase back to pending" });
    return;
  }

  const snapshotLines = existing.lines;

  try {
    await prisma.$transaction(async (tx) => {
      const movementNote =
        nextNotes !== undefined ? nextNotes : existing.notes;

      if (existing.status === PurchaseStatus.COMPLETE && nextStatus === PurchaseStatus.CANCELLED) {
        await reverseCompletedPurchaseInventory(tx, {
          purchaseId: id,
          lines: dbLinesToInventoryRows(snapshotLines),
          userId,
        });
      }

      if (normalizedPatchLines !== undefined) {
        if (
          existing.status === PurchaseStatus.COMPLETE &&
          nextStatus !== PurchaseStatus.CANCELLED
        ) {
          await replaceCompletedPurchaseLines(
            tx,
            id,
            userId,
            dbLinesToInventoryRows(snapshotLines),
            normalizedPatchLines,
            movementNote ?? null,
          );
          const summary = computePurchaseSummaryFromLines(normalizedPatchLines);
          await tx.purchase.update({
            where: { id },
            data: {
              destination: summary.destination,
              targetPersonnelId: summary.targetPersonnelId,
            },
          });
        } else if (existing.status === PurchaseStatus.PENDING) {
          await replacePurchaseLinesOnly(tx, id, normalizedPatchLines);
          const summary = computePurchaseSummaryFromLines(normalizedPatchLines);
          await tx.purchase.update({
            where: { id },
            data: {
              destination: summary.destination,
              targetPersonnelId: summary.targetPersonnelId,
            },
          });
        }
      }

      if (existing.status === PurchaseStatus.PENDING && nextStatus === PurchaseStatus.COMPLETE) {
        const linesRows = await tx.purchaseLine.findMany({
          where: { purchaseId: id },
          orderBy: { lineIndex: "asc" },
        });
        await applyCompletedPurchaseInventory(tx, {
          purchaseId: id,
          lines: dbLinesToInventoryRows(linesRows),
          userId,
          purchaseNote: movementNote ?? null,
        });
      }

      const updateData: {
        authorizedByPersonnelId?: string;
        buyerPersonnelId?: string;
        supplierId?: string;
        notes?: string | null;
        status?: PurchaseStatus;
        bonStoredPath?: string;
        bonOriginalName?: string;
      } = {};

      if (p.authorizedByPersonnelId !== undefined) {
        updateData.authorizedByPersonnelId = p.authorizedByPersonnelId;
      }
      if (p.buyerPersonnelId !== undefined) {
        updateData.buyerPersonnelId = p.buyerPersonnelId;
      }
      if (p.supplierId !== undefined) {
        updateData.supplierId = p.supplierId;
      }
      if (p.notes !== undefined) {
        updateData.notes = nextNotes ?? null;
      }
      if (p.status !== undefined) {
        updateData.status = p.status;
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
    if (code === "INSUFFICIENT") {
      res.status(409).json({
        error:
          e instanceof Error
            ? e.message
            : "Insufficient warehouse stock to complete this operation",
      });
      return;
    }
    throw e;
  }
});

export default router;
