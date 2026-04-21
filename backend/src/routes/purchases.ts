import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { MovementType, Prisma, PurchaseDestination } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { applyStockMovementInTransaction } from "../lib/warehouse-inbound.js";
import { addToPersonnelBinWithoutStock } from "../lib/personnel-bin-direct.js";
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
  destination: z.nativeEnum(PurchaseDestination),
  targetPersonnelId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  lines: z.array(lineSchema).min(1),
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
  const abs = path.isAbsolute(row.bonStoredPath)
    ? row.bonStoredPath
    : path.join(process.cwd(), row.bonStoredPath);
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
  if (data.destination === PurchaseDestination.PERSONNEL_BIN && !data.targetPersonnelId) {
    fs.unlink(file.path, () => {});
    res.status(400).json({ error: "targetPersonnelId is required for personal bin destination" });
    return;
  }
  if (data.destination === PurchaseDestination.STOCK && data.targetPersonnelId) {
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

      if (data.destination === PurchaseDestination.STOCK) {
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

export default router;
