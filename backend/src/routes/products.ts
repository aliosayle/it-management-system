import { Router } from "express";
import { z } from "zod";
import { Prisma, PurchaseDestination, PurchaseStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { rememberProductCategory } from "../lib/product-category.js";
import { requirePermission } from "../lib/permissions.js";
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

function lineReceivedWhereLabel(r: {
  destination: PurchaseDestination;
  targetPersonnel: { firstName: string; lastName: string } | null;
  targetSite: { name: string; company: { name: string } } | null;
  department: {
    name: string;
    site: { name: string; company: { name: string } };
  } | null;
}): string {
  switch (r.destination) {
    case PurchaseDestination.STOCK:
      return "Warehouse (depot)";
    case PurchaseDestination.PERSONNEL_BIN: {
      const p = r.targetPersonnel;
      const name = p ? `${p.firstName} ${p.lastName}`.trim() : "";
      return name ? `Personal bin · ${name}` : "Personal bin";
    }
    case PurchaseDestination.SITE_BIN: {
      const s = r.targetSite;
      return s ? `Site bin · ${s.company.name} / ${s.name}` : "Site bin";
    }
    case PurchaseDestination.DEPARTMENT: {
      const d = r.department;
      if (!d) return "Department";
      return `Department · ${d.site.company.name} / ${d.site.name} — ${d.name}`;
    }
    default:
      return String(r.destination);
  }
}

router.get("/", requirePermission("products", "read"), async (_req, res) => {
  const list = await prisma.product.findMany({ orderBy: { sku: "asc" } });
  const ids = list.map((p) => p.id);
  if (ids.length === 0) {
    res.json([]);
    return;
  }

  const lines = await prisma.purchaseLine.findMany({
    where: {
      productId: { in: ids },
      purchase: { status: PurchaseStatus.COMPLETE },
    },
    orderBy: [{ purchase: { createdAt: "desc" } }, { lineIndex: "desc" }],
    select: {
      productId: true,
      quantity: true,
      unitPrice: true,
      purchase: { select: { createdAt: true } },
    },
  });

  const lastUnitByProduct = new Map<string, number>();
  const aggByProduct = new Map<string, { sumQty: number; sumQtyPx: number }>();
  for (const l of lines) {
    if (!lastUnitByProduct.has(l.productId)) {
      lastUnitByProduct.set(l.productId, Number(l.unitPrice));
    }
    const qty = Number(l.quantity);
    const px = Number(l.unitPrice);
    const cur = aggByProduct.get(l.productId) ?? { sumQty: 0, sumQtyPx: 0 };
    cur.sumQty += qty;
    cur.sumQtyPx += qty * px;
    aggByProduct.set(l.productId, cur);
  }

  res.json(
    list.map((p) => {
      const base = productJson(p);
      const agg = aggByProduct.get(p.id);
      const lastPx = lastUnitByProduct.get(p.id);
      return {
        ...base,
        lastPurchaseUnitPrice: lastPx !== undefined ? lastPx : null,
        averagePurchaseUnitPrice:
          agg && agg.sumQty > 0 ? agg.sumQtyPx / agg.sumQty : null,
      };
    }),
  );
});

/** Product stock statement (movement history). */
router.get("/:id/movements", requirePermission("products", "read"), async (req, res) => {
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
router.get("/:id/purchase-history", requirePermission("products", "read"), async (req, res) => {
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
        },
      },
      supplier: { select: { id: true, name: true } },
      targetPersonnel: { select: { firstName: true, lastName: true } },
      targetSite: { include: { company: { select: { name: true } } } },
      department: {
        include: {
          site: { include: { company: { select: { name: true } } } },
        },
      },
    },
  });

  res.json({
    items: rows.map((r) => ({
      purchaseId: r.purchaseId,
      createdAt: r.purchase.createdAt,
      destination: r.purchase.destination,
      lineDestination: r.destination,
      receivedWhere: lineReceivedWhereLabel({
        destination: r.destination,
        targetPersonnel: r.targetPersonnel,
        targetSite: r.targetSite,
        department: r.department,
      }),
      status: r.purchase.status,
      supplierId: r.supplier.id,
      supplierName: r.supplier.name,
      bonOriginalName: r.purchase.bonOriginalName,
      quantity: Number(r.quantity),
      unitPrice: Number(r.unitPrice),
      lineTotal: Number(r.quantity) * Number(r.unitPrice),
    })),
  });
});

router.post("/", requirePermission("products", "add"), async (req, res) => {
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
    await rememberProductCategory(p.category);
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

router.get("/:id", requirePermission("products", "read"), async (req, res) => {
  const p = await prisma.product.findUnique({ where: { id: req.params.id } });
  if (!p) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(productJson(p));
});

router.patch("/:id", requirePermission("products", "edit"), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { sku, name, category, description } = parsed.data;
  const data: Prisma.ProductUpdateInput = {};
  if (sku !== undefined) data.sku = sku;
  if (name !== undefined) data.name = name;
  if (category !== undefined) data.category = category.trim();
  if (description !== undefined) data.description = description;

  try {
    const p = await prisma.product.update({
      where: { id: req.params.id },
      data,
    });
    if (category !== undefined) {
      await rememberProductCategory(category.trim());
    }
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

router.delete("/:id", requirePermission("products", "delete"), async (req, res) => {
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
