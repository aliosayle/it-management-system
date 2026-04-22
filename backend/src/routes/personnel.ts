import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { applyBinQuantityChange } from "../lib/personnel-bin-stock.js";
import { requireAuth } from "../middleware/auth.js";

function binMovementNote(
  personnel: { firstName: string; lastName: string },
  userNote?: string | null,
) {
  const label = `${personnel.firstName} ${personnel.lastName}`.trim();
  const parts = [`Personnel bin · ${label}`, userNote?.trim()].filter((p) => p && p.length > 0);
  return parts.length ? parts.join(" · ") : null;
}

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  siteId: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z
    .preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().email().nullable().optional()),
  phone: z
    .preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().nullable().optional()),
  userId: z
    .preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().nullable().optional()),
  canAuthorizePurchases: z.boolean().optional(),
});

const updateSchema = createSchema.partial();

const binItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().positive(),
  note: z.string().optional().nullable(),
});

const binPatchSchema = z.object({
  quantity: z.number().positive().optional(),
  note: z.string().optional().nullable(),
});

function serializePersonnel(p: {
  id: string;
  siteId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  userId: string | null;
  canAuthorizePurchases: boolean;
  createdAt: Date;
  updatedAt: Date;
  site: { name: string; company: { name: string } };
  user: { id: string; email: string; displayName: string } | null;
}) {
  return {
    id: p.id,
    siteId: p.siteId,
    firstName: p.firstName,
    lastName: p.lastName,
    fullName: `${p.firstName} ${p.lastName}`.trim(),
    email: p.email,
    phone: p.phone,
    userId: p.userId,
    userEmail: p.user?.email ?? null,
    siteLabel: `${p.site.company.name} / ${p.site.name}`,
    canAuthorizePurchases: p.canAuthorizePurchases,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

function binItemJson(i: {
  id: string;
  personnelId: string;
  productId: string;
  quantity: Prisma.Decimal;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  product: { sku: string; name: string };
}) {
  return {
    id: i.id,
    personnelId: i.personnelId,
    productId: i.productId,
    productSku: i.product.sku,
    productName: i.product.name,
    quantity: Number(i.quantity),
    note: i.note,
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
  };
}

/** Site + user options for personnel forms (avoid `/form-meta` matching `/:id`). */
router.get("/form-meta", async (req, res) => {
  const personnelId =
    typeof req.query.personnelId === "string" ? req.query.personnelId : undefined;
  const sites = await prisma.site.findMany({
    include: { company: { select: { name: true } } },
    orderBy: [{ company: { name: "asc" } }, { name: "asc" }],
  });
  const siteOptions = sites.map((s) => ({
    id: s.id,
    label: `${s.company.name} / ${s.name}`,
  }));
  const userWhere: Prisma.UserWhereInput = personnelId
    ? {
        OR: [{ personnel: null }, { personnel: { id: personnelId } }],
      }
    : { personnel: null };
  const users = await prisma.user.findMany({
    where: userWhere,
    select: { id: true, email: true, displayName: true },
    orderBy: { email: "asc" },
  });
  res.json({ sites: siteOptions, users });
});

router.get("/", async (_req, res) => {
  const list = await prisma.personnel.findMany({
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    include: {
      site: { include: { company: { select: { name: true } } } },
      user: { select: { id: true, email: true, displayName: true } },
    },
  });
  res.json(list.map(serializePersonnel));
});

router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { siteId, userId, canAuthorizePurchases, firstName, lastName, email, phone } = parsed.data;
  try {
    const row = await prisma.personnel.create({
      data: {
        firstName,
        lastName,
        email: email ?? null,
        phone: phone ?? null,
        canAuthorizePurchases: canAuthorizePurchases ?? false,
        site: { connect: { id: siteId } },
        ...(userId ? { user: { connect: { id: userId } } } : {}),
      },
      include: {
        site: { include: { company: { select: { name: true } } } },
        user: { select: { id: true, email: true, displayName: true } },
      },
    });
    res.status(201).json(serializePersonnel(row));
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code === "P2002") {
      res.status(409).json({ error: "User already linked to another personnel record" });
      return;
    }
    if (code === "P2003") {
      res.status(400).json({ error: "Invalid site or user" });
      return;
    }
    throw e;
  }
});

/** Bin items — must be registered before `GET /:id` */
router.get("/:id/bin/items", async (req, res) => {
  const personnel = await prisma.personnel.findUnique({ where: { id: req.params.id } });
  if (!personnel) {
    res.status(404).json({ error: "Personnel not found" });
    return;
  }
  const items = await prisma.personnelBinItem.findMany({
    where: { personnelId: req.params.id },
    include: { product: { select: { sku: true, name: true } } },
    orderBy: { updatedAt: "desc" },
  });
  res.json(items.map(binItemJson));
});

router.post("/:id/bin/items", async (req, res) => {
  const parsed = binItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const personnelId = req.params.id;
  const actorUserId = req.user!.sub;
  const { productId, quantity, note } = parsed.data;
  const newQty = new Prisma.Decimal(quantity);

  try {
    const row = await prisma.$transaction(async (tx) => {
      const personnel = await tx.personnel.findUnique({
        where: { id: personnelId },
        select: { id: true, firstName: true, lastName: true },
      });
      if (!personnel) {
        throw Object.assign(new Error("Personnel not found"), { code: "PERSONNEL_NOT_FOUND" });
      }

      const existing = await tx.personnelBinItem.findUnique({
        where: {
          personnelId_productId: { personnelId, productId },
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
        movementNote: binMovementNote(personnel, note),
      });

      return tx.personnelBinItem.upsert({
        where: {
          personnelId_productId: { personnelId, productId },
        },
        create: {
          personnelId,
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
    res.status(201).json(binItemJson(row));
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err.code === "PERSONNEL_NOT_FOUND") {
      res.status(404).json({ error: "Personnel not found" });
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
  const { id: personnelId, itemId } = req.params;
  const actorUserId = req.user!.sub;

  const existing = await prisma.personnelBinItem.findFirst({
    where: { id: itemId, personnelId },
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

  const data: Prisma.PersonnelBinItemUpdateInput = {};
  if (parsed.data.quantity !== undefined) {
    data.quantity = newQty;
  }
  if (parsed.data.note !== undefined) {
    data.note = parsed.data.note;
  }

  try {
    const row = await prisma.$transaction(async (tx) => {
      const personnel = await tx.personnel.findUnique({
        where: { id: personnelId },
        select: { firstName: true, lastName: true },
      });
      if (!personnel) {
        throw Object.assign(new Error("Personnel not found"), { code: "PERSONNEL_NOT_FOUND" });
      }

      const noteForMovement =
        parsed.data.note !== undefined ? parsed.data.note : existing.note;
      await applyBinQuantityChange(tx, {
        productId: existing.productId,
        oldBinQuantity: oldQty,
        newBinQuantity: newQty,
        userId: actorUserId,
        movementNote: binMovementNote(personnel, noteForMovement),
      });

      return tx.personnelBinItem.update({
        where: { id: itemId },
        data,
        include: { product: { select: { sku: true, name: true } } },
      });
    });
    res.json(binItemJson(row));
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === "PERSONNEL_NOT_FOUND") {
      res.status(404).json({ error: "Personnel not found" });
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
  const { id: personnelId, itemId } = req.params;
  const actorUserId = req.user!.sub;

  const existing = await prisma.personnelBinItem.findFirst({
    where: { id: itemId, personnelId },
  });
  if (!existing) {
    res.status(404).json({ error: "Bin item not found" });
    return;
  }

  const oldQty = new Prisma.Decimal(existing.quantity.toString());

  try {
    await prisma.$transaction(async (tx) => {
      const personnel = await tx.personnel.findUnique({
        where: { id: personnelId },
        select: { firstName: true, lastName: true },
      });
      if (!personnel) {
        throw Object.assign(new Error("Personnel not found"), { code: "PERSONNEL_NOT_FOUND" });
      }

      const label = `${personnel.firstName} ${personnel.lastName}`.trim();
      await applyBinQuantityChange(tx, {
        productId: existing.productId,
        oldBinQuantity: oldQty,
        newBinQuantity: new Prisma.Decimal(0),
        userId: actorUserId,
        movementNote: `Returned from personnel bin · ${label}`,
      });

      await tx.personnelBinItem.delete({ where: { id: itemId } });
    });
    res.status(204).send();
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === "PERSONNEL_NOT_FOUND") {
      res.status(404).json({ error: "Personnel not found" });
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
  const row = await prisma.personnel.findUnique({
    where: { id: req.params.id },
    include: {
      site: { include: { company: { select: { name: true } } } },
      user: { select: { id: true, email: true, displayName: true } },
    },
  });
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(serializePersonnel(row));
});

router.patch("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const raw = parsed.data;
  /** Relation `connect` / `disconnect` — avoids clients where scalar `userId` is rejected on update. */
  const data: Prisma.PersonnelUpdateInput = {};
  if (raw.siteId !== undefined) {
    data.site = { connect: { id: raw.siteId } };
  }
  if (raw.firstName !== undefined) data.firstName = raw.firstName;
  if (raw.lastName !== undefined) data.lastName = raw.lastName;
  if (raw.email !== undefined) data.email = raw.email;
  if (raw.phone !== undefined) data.phone = raw.phone;
  if (raw.userId !== undefined) {
    data.user = raw.userId ? { connect: { id: raw.userId } } : { disconnect: true };
  }
  if (raw.canAuthorizePurchases !== undefined) {
    data.canAuthorizePurchases = raw.canAuthorizePurchases;
  }
  if (Object.keys(data).length === 0) {
    res.status(400).json({ error: "No changes" });
    return;
  }
  try {
    const row = await prisma.personnel.update({
      where: { id: req.params.id },
      data,
      include: {
        site: { include: { company: { select: { name: true } } } },
        user: { select: { id: true, email: true, displayName: true } },
      },
    });
    res.json(serializePersonnel(row));
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code === "P2025") {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (code === "P2002") {
      res.status(409).json({ error: "User already linked to another personnel record" });
      return;
    }
    throw e;
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await prisma.personnel.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2025") {
        res.status(404).json({ error: "Not found" });
        return;
      }
      if (e.code === "P2003") {
        res.status(409).json({
          error:
            "Cannot delete this personnel record while it is referenced (e.g. as purchase authorizer). Reassign or remove those records first.",
        });
        return;
      }
    }
    throw e;
  }
});

export default router;
