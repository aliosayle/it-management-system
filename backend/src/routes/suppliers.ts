import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
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

router.get("/", async (_req, res) => {
  const list = await prisma.supplier.findMany({ orderBy: { name: "asc" } });
  res.json(list);
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
    where: { supplierId: req.params.id },
    orderBy: { createdAt: "desc" },
    take: 500,
    include: {
      authorizedBy: { select: { firstName: true, lastName: true } },
      buyerPersonnel: { select: { firstName: true, lastName: true } },
      createdBy: { select: { displayName: true } },
      lines: {
        orderBy: { lineIndex: "asc" },
        include: { product: { select: { sku: true, name: true } } },
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
