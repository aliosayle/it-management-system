import { Router } from "express";
import { z } from "zod";
import { Prisma, PurchaseStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { movementJson } from "../lib/movement-format.js";

const router = Router();

router.use(requireAuth);

const createSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  category: z.string().max(128).optional(),
  description: z.string().optional().nullable(),
  quantityOnHand: z.number().nonnegative().optional(),
});

const updateSchema = z.object({
  sku: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  category: z.string().max(128).optional(),
  description: z.string().optional().nullable(),
  quantityOnHand: z.number().nonnegative().optional(),
});

function productJson(p: {
  id: string;
  sku: string;
  name: string;
  category: string;
  description: string | null;
  quantityOnHand: Prisma.Decimal;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...p,
    quantityOnHand: Number(p.quantityOnHand),
  };
}

router.get("/", async (_req, res) => {
  const list = await prisma.product.findMany({ orderBy: { sku: "asc" } });
  res.json(list.map(productJson));
});

/** Product stock statement (movement history). */
router.get("/:id/movements", async (req, res) => {
  const skip = Math.max(0, Number(req.query.skip) || 0);
  const take = Math.min(5000, Math.max(1, Number(req.query.take) || 50));

  const product = await prisma.product.findUnique({
    where: { id: req.params.id },
  });
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  const [items, total] = await Promise.all([
    prisma.stockMovement.findMany({
      where: { productId: req.params.id },
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: {
        user: { select: { id: true, email: true, displayName: true } },
      },
    }),
    prisma.stockMovement.count({
      where: { productId: req.params.id },
    }),
  ]);

  res.json({
    items: items.map((row) => ({
      ...movementJson(row),
      user: row.user,
    })),
    total,
    skip,
    take,
  });
});

/** Completed purchase lines for this product (unit price history / supplier trace). */
router.get("/:id/purchase-history", async (req, res) => {
  const product = await prisma.product.findUnique({
    where: { id: req.params.id },
  });
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  const rows = await prisma.purchaseLine.findMany({
    where: {
      productId: req.params.id,
      purchase: { status: PurchaseStatus.COMPLETE },
    },
    orderBy: { purchase: { createdAt: "desc" } },
    take: 2000,
    include: {
      purchase: {
        select: {
          id: true,
          createdAt: true,
          destination: true,
          status: true,
          bonOriginalName: true,
          supplier: { select: { id: true, name: true } },
        },
      },
    },
  });

  res.json({
    items: rows.map((r) => ({
      purchaseId: r.purchaseId,
      createdAt: r.purchase.createdAt,
      destination: r.purchase.destination,
      status: r.purchase.status,
      supplierId: r.purchase.supplier.id,
      supplierName: r.purchase.supplier.name,
      bonOriginalName: r.purchase.bonOriginalName,
      quantity: Number(r.quantity),
      unitPrice: Number(r.unitPrice),
      lineTotal: Number(r.quantity) * Number(r.unitPrice),
    })),
  });
});

router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { sku, name, category, description, quantityOnHand } = parsed.data;
  try {
    const p = await prisma.product.create({
      data: {
        sku,
        name,
        category: category?.trim() ?? "",
        description: description ?? undefined,
        quantityOnHand:
          quantityOnHand !== undefined
            ? new Prisma.Decimal(quantityOnHand)
            : new Prisma.Decimal(0),
      },
    });
    res.status(201).json(productJson(p));
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code === "P2002") {
      res.status(409).json({ error: "SKU already exists" });
      return;
    }
    throw e;
  }
});

router.get("/:id", async (req, res) => {
  const p = await prisma.product.findUnique({ where: { id: req.params.id } });
  if (!p) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(productJson(p));
});

router.patch("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { sku, name, category, description, quantityOnHand } = parsed.data;
  const data: Prisma.ProductUpdateInput = {};
  if (sku !== undefined) data.sku = sku;
  if (name !== undefined) data.name = name;
  if (category !== undefined) data.category = category.trim();
  if (description !== undefined) data.description = description;
  if (quantityOnHand !== undefined)
    data.quantityOnHand = new Prisma.Decimal(quantityOnHand);

  try {
    const p = await prisma.product.update({
      where: { id: req.params.id },
      data,
    });
    res.json(productJson(p));
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code === "P2025") {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (code === "P2002") {
      res.status(409).json({ error: "SKU already exists" });
      return;
    }
    throw e;
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await prisma.product.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2025") {
        res.status(404).json({ error: "Not found" });
        return;
      }
      /** FK still points at this product (e.g. purchase lines). */
      if (e.code === "P2003") {
        res.status(409).json({
          error:
            "This product cannot be deleted while it appears on purchase lines. Edit or remove those purchases first.",
        });
        return;
      }
    }
    throw e;
  }
});

export default router;
