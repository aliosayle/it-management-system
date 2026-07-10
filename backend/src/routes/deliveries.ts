import { Router } from "express";
import { z } from "zod";
import {
  DeliveryDestination,
  DeliveryPriceSource,
  PurchaseStatus,
  Prisma,
} from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { applyDeliveryInTransaction } from "../lib/apply-delivery.js";
import { requirePermission } from "../lib/permissions.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

const DESTINATIONS = [
  "PERSONNEL_BIN",
  "SITE_BIN",
  "DEPARTMENT",
  "GENERAL",
] as const;

const PRICE_SOURCES = [
  "LAST_PURCHASE",
  "AVERAGE_PURCHASE",
  "MANUAL",
  "ZERO",
] as const;

const lineSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  priceSource: z.enum(PRICE_SOURCES),
  lineIndex: z.number().int().nonnegative().optional(),
});

const createSchema = z
  .object({
    destination: z.enum(DESTINATIONS),
    targetPersonnelId: z.string().nullable().optional(),
    targetSiteId: z.string().nullable().optional(),
    departmentId: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    lines: z.array(lineSchema).min(1),
  })
  .superRefine((body, ctx) => {
    if (body.destination === "PERSONNEL_BIN" && !body.targetPersonnelId?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "targetPersonnelId is required for PERSONNEL_BIN",
        path: ["targetPersonnelId"],
      });
    }
    if (body.destination === "SITE_BIN" && !body.targetSiteId?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "targetSiteId is required for SITE_BIN",
        path: ["targetSiteId"],
      });
    }
    if (body.destination === "DEPARTMENT" && !body.departmentId?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "departmentId is required for DEPARTMENT",
        path: ["departmentId"],
      });
    }
  });

function destinationSummary(d: {
  destination: DeliveryDestination;
  targetPersonnel: { firstName: string; lastName: string } | null;
  targetSite: { name: string; company: { name: string } } | null;
  department: {
    name: string;
    site: { name: string; company: { name: string } };
  } | null;
}): string {
  switch (d.destination) {
    case DeliveryDestination.PERSONNEL_BIN: {
      const p = d.targetPersonnel;
      return p ? `Personal bin — ${p.firstName} ${p.lastName}`.trim() : "Personal bin";
    }
    case DeliveryDestination.SITE_BIN: {
      const s = d.targetSite;
      return s ? `Site bin — ${s.company.name} / ${s.name}` : "Site bin";
    }
    case DeliveryDestination.DEPARTMENT: {
      const dept = d.department;
      return dept
        ? `Department — ${dept.site.company.name} / ${dept.site.name} — ${dept.name}`
        : "Department";
    }
    case DeliveryDestination.GENERAL:
      return "General issue";
    default:
      return String(d.destination);
  }
}

function deliveryListInclude() {
  return {
    targetPersonnel: { select: { firstName: true, lastName: true } },
    targetSite: { include: { company: { select: { name: true } } } },
    department: {
      select: {
        name: true,
        site: { select: { name: true, company: { select: { name: true } } } },
      },
    },
    createdBy: { select: { displayName: true, email: true } },
    lines: {
      orderBy: { lineIndex: "asc" as const },
      select: {
        quantity: true,
        unitPrice: true,
        lineTotal: true,
        lineIndex: true,
        priceSource: true,
        product: { select: { sku: true, name: true } },
      },
    },
    _count: { select: { lines: true } },
  };
}

type DeliveryListRow = Prisma.DeliveryGetPayload<{ include: ReturnType<typeof deliveryListInclude> }>;

type DeliveryDetailRow = Prisma.DeliveryGetPayload<{
  include: {
    targetPersonnel: { select: { firstName: true; lastName: true } };
    targetSite: { include: { company: { select: { name: true } } } };
    department: {
      select: {
        name: true;
        site: { select: { name: true; company: { select: { name: true } } } };
      };
    };
    createdBy: { select: { id: true; displayName: true; email: true } };
    lines: {
      orderBy: { lineIndex: "asc" };
      include: { product: { select: { sku: true; name: true } } };
    };
  };
}>;

function deliveryListJson(row: DeliveryListRow) {
  const grandTotal = row.lines.reduce((sum, l) => sum + Number(l.lineTotal), 0);
  return {
    id: row.id,
    destination: row.destination,
    destinationSummary: destinationSummary(row),
    targetPersonnelId: row.targetPersonnelId,
    targetSiteId: row.targetSiteId,
    departmentId: row.departmentId,
    notes: row.notes,
    createdAt: row.createdAt,
    createdByName: row.createdBy.displayName?.trim() || row.createdBy.email,
    lineCount: row._count.lines,
    grandTotal,
    lineItems: row.lines.map((l) => ({
      sku: l.product.sku,
      productName: l.product.name,
      quantity: Number(l.quantity),
      unitPrice: Number(l.unitPrice),
      lineTotal: Number(l.lineTotal),
      priceSource: l.priceSource,
    })),
  };
}

function deliveryDetailJson(row: DeliveryDetailRow) {
  const grandTotal = row.lines.reduce((sum, l) => sum + Number(l.lineTotal), 0);
  return {
    id: row.id,
    destination: row.destination,
    destinationSummary: destinationSummary(row),
    targetPersonnelId: row.targetPersonnelId,
    targetSiteId: row.targetSiteId,
    departmentId: row.departmentId,
    notes: row.notes,
    createdAt: row.createdAt,
    createdBy: {
      id: row.createdBy.id,
      displayName: row.createdBy.displayName,
      email: row.createdBy.email,
    },
    grandTotal,
    lines: row.lines.map((l) => ({
      id: l.id,
      productId: l.productId,
      sku: l.product.sku,
      productName: l.product.name,
      quantity: Number(l.quantity),
      unitPrice: Number(l.unitPrice),
      lineTotal: Number(l.lineTotal),
      priceSource: l.priceSource,
      lineIndex: l.lineIndex,
    })),
  };
}

router.get("/meta/products", requirePermission("deliveries", "read"), async (_req, res) => {
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
      const agg = aggByProduct.get(p.id);
      const lastPx = lastUnitByProduct.get(p.id);
      return {
        id: p.id,
        sku: p.sku,
        name: p.name,
        quantityOnHand: Number(p.quantityOnHand),
        lastPurchaseUnitPrice: lastPx !== undefined ? lastPx : null,
        averagePurchaseUnitPrice:
          agg && agg.sumQty > 0 ? agg.sumQtyPx / agg.sumQty : null,
      };
    }),
  );
});

router.get("/", requirePermission("deliveries", "read"), async (_req, res) => {
  const rows = await prisma.delivery.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: deliveryListInclude(),
  });
  res.json(rows.map(deliveryListJson));
});

router.get("/:id", requirePermission("deliveries", "read"), async (req, res) => {
  const id = String(req.params.id);
  const row = await prisma.delivery.findUnique({
    where: { id },
    include: {
      targetPersonnel: { select: { firstName: true, lastName: true } },
      targetSite: { include: { company: { select: { name: true } } } },
      department: {
        select: {
          name: true,
          site: { select: { name: true, company: { select: { name: true } } } },
        },
      },
      createdBy: { select: { id: true, displayName: true, email: true } },
      lines: {
        orderBy: { lineIndex: "asc" },
        include: { product: { select: { sku: true, name: true } } },
      },
    },
  });
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(deliveryDetailJson(row));
});

router.post("/", requirePermission("deliveries", "add"), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const userId = req.user!.sub;
  const body = parsed.data;

  try {
    const delivery = await prisma.$transaction(async (tx) =>
      applyDeliveryInTransaction(tx, userId, {
        destination: body.destination as DeliveryDestination,
        targetPersonnelId: body.targetPersonnelId ?? null,
        targetSiteId: body.targetSiteId ?? null,
        departmentId: body.departmentId ?? null,
        notes: body.notes ?? null,
        lines: body.lines.map((l, i) => ({
          productId: l.productId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          priceSource: l.priceSource as DeliveryPriceSource,
          lineIndex: l.lineIndex ?? i,
        })),
      }),
    );

    const detail = await prisma.delivery.findUnique({
      where: { id: delivery.id },
      include: {
        targetPersonnel: { select: { firstName: true, lastName: true } },
        targetSite: { include: { company: { select: { name: true } } } },
        department: {
          select: {
            name: true,
            site: { select: { name: true, company: { select: { name: true } } } },
          },
        },
        createdBy: { select: { id: true, displayName: true, email: true } },
        lines: {
          orderBy: { lineIndex: "asc" },
          include: { product: { select: { sku: true, name: true } } },
        },
      },
    });

    res.status(201).json(deliveryDetailJson(detail!));
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err.code === "NOT_FOUND") {
      res.status(404).json({ error: err.message ?? "Not found" });
      return;
    }
    if (err.code === "INSUFFICIENT") {
      res.status(400).json({ error: "Insufficient stock for one or more lines" });
      return;
    }
    if (err.code === "BAD_DEST" || err.code === "BAD_QTY" || err.code === "BAD_PRICE" || err.code === "NO_LINES") {
      res.status(400).json({ error: err.message ?? "Invalid request" });
      return;
    }
    throw e;
  }
});

export default router;
