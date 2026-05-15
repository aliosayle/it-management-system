import { Router } from "express";
import { z } from "zod";
import { Prisma, PurchaseStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  name: z.string().trim().min(1).max(512),
  email: z
    .preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().email().nullable().optional()),
  phone: z
    .preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().max(64).nullable().optional()),
  notes: z
    .preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().nullable().optional()),
});

const updateSchema = createSchema.partial();

type SupplierLineAgg = {
  completedTotal: number;
  pendingTotal: number;
  purchaseIds: Set<string>;
  completePurchaseIds: Set<string>;
  pendingPurchaseIds: Set<string>;
  lastActivityAt: number | null;
  productIds: Set<string>;
  lineCount: number;
};

function emptyAgg(): SupplierLineAgg {
  return {
    completedTotal: 0,
    pendingTotal: 0,
    purchaseIds: new Set(),
    completePurchaseIds: new Set(),
    pendingPurchaseIds: new Set(),
    lastActivityAt: null,
    productIds: new Set(),
    lineCount: 0,
  };
}

router.get("/", async (_req, res) => {
  const list = await prisma.supplier.findMany({ orderBy: { name: "asc" } });
  if (list.length === 0) {
    res.json([]);
    return;
  }

  const ids = list.map((s) => s.id);
  const lines = await prisma.purchaseLine.findMany({
    where: { supplierId: { in: ids } },
    select: {
      supplierId: true,
      productId: true,
      quantity: true,
      unitPrice: true,
      purchase: { select: { id: true, status: true, createdAt: true } },
    },
  });

  const map = new Map<string, SupplierLineAgg>();
  for (const l of lines) {
    let m = map.get(l.supplierId);
    if (!m) {
      m = emptyAgg();
      map.set(l.supplierId, m);
    }
    const amt = Number(l.quantity) * Number(l.unitPrice);
    const st = l.purchase.status;
    const t = l.purchase.createdAt.getTime();
    m.purchaseIds.add(l.purchase.id);
    m.productIds.add(l.productId);
    m.lineCount += 1;
    if (st === PurchaseStatus.COMPLETE) {
      m.completedTotal += amt;
      m.completePurchaseIds.add(l.purchase.id);
    } else if (st === PurchaseStatus.PENDING) {
      m.pendingTotal += amt;
      m.pendingPurchaseIds.add(l.purchase.id);
    }
    if (st !== PurchaseStatus.CANCELLED) {
      if (m.lastActivityAt === null || t > m.lastActivityAt) {
        m.lastActivityAt = t;
      }
    }
  }

  res.json(
    list.map((s) => {
      const m = map.get(s.id) ?? emptyAgg();
      return {
        ...s,
        completedPurchasesTotal: m.completedTotal,
        pendingPurchasesTotal: m.pendingTotal,
        completedPurchaseCount: m.completePurchaseIds.size,
        pendingPurchaseCount: m.pendingPurchaseIds.size,
        totalPurchaseCount: m.purchaseIds.size,
        totalLineItems: m.lineCount,
        distinctProductCount: m.productIds.size,
        lastPurchaseAt: m.lastActivityAt != null ? new Date(m.lastActivityAt).toISOString() : null,
      };
    }),
  );
});

router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const row = await prisma.supplier.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email ?? null,
        phone: parsed.data.phone ?? null,
        notes: parsed.data.notes ?? null,
      },
    });
    res.status(201).json(row);
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      res.status(409).json({ error: "A supplier with this name already exists" });
      return;
    }
    throw e;
  }
});

/** Purchase history for this supplier (all statuses, for traceability). Must be before `GET /:id`. */
router.get("/:id/purchases", async (req, res) => {
  const supplier = await prisma.supplier.findUnique({ where: { id: req.params.id } });
  if (!supplier) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const purchases = await prisma.purchase.findMany({
    where: {
      lines: { some: { supplierId: req.params.id } },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
    include: {
      authorizedBy: { select: { firstName: true, lastName: true } },
      buyerPersonnel: { select: { firstName: true, lastName: true } },
      createdBy: { select: { displayName: true } },
      lines: {
        orderBy: { lineIndex: "asc" },
        include: {
          product: { select: { sku: true, name: true } },
          targetPersonnel: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });
  res.json(
    purchases.map((p) => ({
      id: p.id,
      status: p.status,
      destination: p.destination,
      createdAt: p.createdAt,
      bonOriginalName: p.bonOriginalName,
      notes: p.notes,
      authorizedByName: `${p.authorizedBy.firstName} ${p.authorizedBy.lastName}`.trim(),
      buyerName: `${p.buyerPersonnel.firstName} ${p.buyerPersonnel.lastName}`.trim(),
      recordedByName: p.createdBy.displayName,
      lines: p.lines.map((l) => ({
        productId: l.productId,
        sku: l.product.sku,
        productName: l.product.name,
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice),
        lineTotal: Number(l.quantity) * Number(l.unitPrice),
        lineDestination: l.destination,
        lineBinRecipientName: l.targetPersonnel
          ? `${l.targetPersonnel.firstName} ${l.targetPersonnel.lastName}`.trim()
          : null,
      })),
      totalAmount: p.lines.reduce(
        (sum, l) => sum + Number(l.quantity) * Number(l.unitPrice),
        0,
      ),
    })),
  );
});

router.get("/:id", async (req, res) => {
  const row = await prisma.supplier.findUnique({ where: { id: req.params.id } });
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(row);
});

router.patch("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const data: Prisma.SupplierUpdateInput = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.email !== undefined) data.email = parsed.data.email;
  if (parsed.data.phone !== undefined) data.phone = parsed.data.phone;
  if (parsed.data.notes !== undefined) data.notes = parsed.data.notes;
  if (Object.keys(data).length === 0) {
    res.status(400).json({ error: "No changes" });
    return;
  }
  try {
    const row = await prisma.supplier.update({
      where: { id: req.params.id },
      data,
    });
    res.json(row);
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2025") {
        res.status(404).json({ error: "Not found" });
        return;
      }
      if (e.code === "P2002") {
        res.status(409).json({ error: "A supplier with this name already exists" });
        return;
      }
    }
    throw e;
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await prisma.supplier.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2025") {
        res.status(404).json({ error: "Not found" });
        return;
      }
      if (e.code === "P2003") {
        res.status(409).json({
          error: "Cannot delete this supplier while purchases reference it. Reassign or remove those purchases first.",
        });
        return;
      }
    }
    throw e;
  }
});

export default router;
