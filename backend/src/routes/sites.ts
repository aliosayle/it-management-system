import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { applyBinQuantityChange } from "../lib/personnel-bin-stock.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

function siteBinMovementNote(
  site: { name: string; company: { name: string } },
  userNote?: string | null,
) {
  const label = `${site.company.name} / ${site.name}`.trim();
  const parts = [`Site bin · ${label}`, userNote?.trim()].filter((p) => p && p.length > 0);
  return parts.length ? parts.join(" · ") : null;
}

const binItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().positive(),
  note: z.string().optional().nullable(),
});

const binPatchSchema = z.object({
  quantity: z.number().positive().optional(),
  note: z.string().optional().nullable(),
});

function siteBinItemJson(i: {
  id: string;
  siteId: string;
  productId: string;
  quantity: Prisma.Decimal;
  note: string | null;
  kind: "PERSONNEL" | "SITE";
  createdAt: Date;
  updatedAt: Date;
  product: { sku: string; name: string };
}) {
  return {
    id: i.id,
    siteId: i.siteId,
    productId: i.productId,
    productSku: i.product.sku,
    productName: i.product.name,
    quantity: Number(i.quantity),
    note: i.note,
    kind: i.kind,
    typeLabel: "Site",
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
  };
}

const createSchema = z.object({
  companyId: z.string().min(1),
  name: z.string().min(1),
});

const updateSchema = z.object({
  companyId: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
});

router.get("/", async (req, res) => {
  const companyId = typeof req.query.companyId === "string" ? req.query.companyId : undefined;
  const list = await prisma.site.findMany({
    where: companyId ? { companyId } : undefined,
    include: { company: { select: { id: true, name: true } } },
    orderBy: [{ company: { name: "asc" } }, { name: "asc" }],
  });
  res.json(
    list.map((s) => ({
      ...s,
      companyName: s.company.name,
      label: `${s.company.name} / ${s.name}`,
    })),
  );
});

router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const row = await prisma.site.create({
      data: parsed.data,
      include: { company: { select: { name: true } } },
    });
    res.status(201).json({
      ...row,
      companyName: row.company.name,
      label: `${row.company.name} / ${row.name}`,
    });
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code === "P2003") {
      res.status(400).json({ error: "Invalid company" });
      return;
    }
    throw e;
  }
});

/** Site bin items — must be registered before `GET /:id` */
router.get("/:id/bin/items", async (req, res) => {
  const site = await prisma.site.findUnique({ where: { id: req.params.id } });
  if (!site) {
    res.status(404).json({ error: "Site not found" });
    return;
  }
  const items = await prisma.siteBinItem.findMany({
    where: { siteId: req.params.id },
    include: { product: { select: { sku: true, name: true } } },
    orderBy: { updatedAt: "desc" },
  });
  res.json(items.map(siteBinItemJson));
});

router.post("/:id/bin/items", async (req, res) => {
  const parsed = binItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const siteId = req.params.id;
  const actorUserId = req.user!.sub;
  const { productId, quantity, note } = parsed.data;
  const newQty = new Prisma.Decimal(quantity);

  try {
    const row = await prisma.$transaction(async (tx) => {
      const site = await tx.site.findUnique({
        where: { id: siteId },
        select: { id: true, name: true, company: { select: { name: true } } },
      });
      if (!site) {
        throw Object.assign(new Error("Site not found"), { code: "SITE_NOT_FOUND" });
      }

      const existing = await tx.siteBinItem.findUnique({
        where: {
          siteId_productId: { siteId, productId },
        },
      });
      const oldQty = existing
        ? new Prisma.Decimal(existing.quantity.toString())
        : new Prisma.Decimal(0);

      await applyBinQuantityChange(tx, {
        productId,
        oldBinQuantity: oldQty,
        newBinQuantity: newQty,
        userId: actorUserId,
        movementNote: siteBinMovementNote(site, note),
      });

      return tx.siteBinItem.upsert({
        where: {
          siteId_productId: { siteId, productId },
        },
        create: {
          siteId,
          productId,
          quantity: newQty,
          note: note ?? undefined,
        },
        update: {
          quantity: newQty,
          note: note ?? undefined,
        },
        include: { product: { select: { sku: true, name: true } } },
      });
    });
    res.status(201).json(siteBinItemJson(row));
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err.code === "SITE_NOT_FOUND") {
      res.status(404).json({ error: "Site not found" });
      return;
    }
    if (err.code === "NOT_FOUND") {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    if (err.code === "INSUFFICIENT") {
      res.status(400).json({ error: "Insufficient stock for this assignment" });
      return;
    }
    const code = (e as { code?: string })?.code;
    if (code === "P2003") {
      res.status(400).json({ error: "Invalid product" });
      return;
    }
    throw e;
  }
});

router.patch("/:id/bin/items/:itemId", async (req, res) => {
  const parsed = binPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { id: siteId, itemId } = req.params;
  const actorUserId = req.user!.sub;

  const existing = await prisma.siteBinItem.findFirst({
    where: { id: itemId, siteId },
  });
  if (!existing) {
    res.status(404).json({ error: "Bin item not found" });
    return;
  }

  const oldQty = new Prisma.Decimal(existing.quantity.toString());
  const newQty =
    parsed.data.quantity !== undefined
      ? new Prisma.Decimal(parsed.data.quantity)
      : oldQty;

  const data: Prisma.SiteBinItemUpdateInput = {};
  if (parsed.data.quantity !== undefined) {
    data.quantity = newQty;
  }
  if (parsed.data.note !== undefined) {
    data.note = parsed.data.note;
  }

  try {
    const row = await prisma.$transaction(async (tx) => {
      const site = await tx.site.findUnique({
        where: { id: siteId },
        select: { name: true, company: { select: { name: true } } },
      });
      if (!site) {
        throw Object.assign(new Error("Site not found"), { code: "SITE_NOT_FOUND" });
      }

      const noteForMovement =
        parsed.data.note !== undefined ? parsed.data.note : existing.note;
      await applyBinQuantityChange(tx, {
        productId: existing.productId,
        oldBinQuantity: oldQty,
        newBinQuantity: newQty,
        userId: actorUserId,
        movementNote: siteBinMovementNote(site, noteForMovement),
      });

      return tx.siteBinItem.update({
        where: { id: itemId },
        data,
        include: { product: { select: { sku: true, name: true } } },
      });
    });
    res.json(siteBinItemJson(row));
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === "SITE_NOT_FOUND") {
      res.status(404).json({ error: "Site not found" });
      return;
    }
    if (err.code === "NOT_FOUND") {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    if (err.code === "INSUFFICIENT") {
      res.status(400).json({ error: "Insufficient stock for this assignment" });
      return;
    }
    throw e;
  }
});

router.delete("/:id/bin/items/:itemId", async (req, res) => {
  const { id: siteId, itemId } = req.params;
  const actorUserId = req.user!.sub;

  const existing = await prisma.siteBinItem.findFirst({
    where: { id: itemId, siteId },
  });
  if (!existing) {
    res.status(404).json({ error: "Bin item not found" });
    return;
  }

  const oldQty = new Prisma.Decimal(existing.quantity.toString());

  try {
    await prisma.$transaction(async (tx) => {
      const site = await tx.site.findUnique({
        where: { id: siteId },
        select: { name: true, company: { select: { name: true } } },
      });
      if (!site) {
        throw Object.assign(new Error("Site not found"), { code: "SITE_NOT_FOUND" });
      }

      const label = `${site.company.name} / ${site.name}`.trim();
      await applyBinQuantityChange(tx, {
        productId: existing.productId,
        oldBinQuantity: oldQty,
        newBinQuantity: new Prisma.Decimal(0),
        userId: actorUserId,
        movementNote: `Returned from site bin · ${label}`,
      });

      await tx.siteBinItem.delete({ where: { id: itemId } });
    });
    res.status(204).send();
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === "SITE_NOT_FOUND") {
      res.status(404).json({ error: "Site not found" });
      return;
    }
    if (err.code === "NOT_FOUND") {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    if (err.code === "INSUFFICIENT") {
      res.status(400).json({ error: "Insufficient stock for this assignment" });
      return;
    }
    throw e;
  }
});

router.get("/:id", async (req, res) => {
  const row = await prisma.site.findUnique({
    where: { id: req.params.id },
    include: { company: { select: { id: true, name: true } } },
  });
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({
    ...row,
    companyName: row.company.name,
    label: `${row.company.name} / ${row.name}`,
  });
});

router.patch("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const row = await prisma.site.update({
      where: { id: req.params.id },
      data: parsed.data,
      include: { company: { select: { name: true } } },
    });
    res.json({
      ...row,
      companyName: row.company.name,
      label: `${row.company.name} / ${row.name}`,
    });
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code === "P2025") {
      res.status(404).json({ error: "Not found" });
      return;
    }
    throw e;
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await prisma.site.delete({ where: { id: req.params.id } });
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
