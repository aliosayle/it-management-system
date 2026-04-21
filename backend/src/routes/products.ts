import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { movementJson } from "../lib/movement-format.js";

const router = Router();

router.use(requireAuth);

const createSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  quantityOnHand: z.number().nonnegative().optional(),
});

const updateSchema = z.object({
  sku: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  quantityOnHand: z.number().nonnegative().optional(),
});

function productJson(p: {
  id: string;
  sku: string;
  name: string;
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

router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { sku, name, description, quantityOnHand } = parsed.data;
  try {
    const p = await prisma.product.create({
      data: {
        sku,
        name,
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
  const { sku, name, description, quantityOnHand } = parsed.data;
  const data: Prisma.ProductUpdateInput = {};
  if (sku !== undefined) data.sku = sku;
  if (name !== undefined) data.name = name;
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
    const code = (e as { code?: string })?.code;
    if (code === "P2025") {
      res.status(404).json({ error: "Not found" });
      return;
    }
    throw e;
  }
});

export default router;
