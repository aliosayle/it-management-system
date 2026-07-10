import {
  DeliveryDestination,
  DeliveryPriceSource,
  MovementType,
  Prisma,
} from "@prisma/client";
import { subtractFromPersonnelBinWithoutStock } from "./personnel-bin-direct.js";
import { subtractFromSiteBinWithoutStock } from "./site-bin-direct.js";
import { applyBinQuantityChange } from "./personnel-bin-stock.js";
import { applyStockMovementInTransaction } from "./warehouse-inbound.js";

type Tx = Prisma.TransactionClient;

export type DeliveryLineInput = {
  productId: string;
  quantity: number;
  unitPrice: number;
  priceSource: DeliveryPriceSource;
  lineIndex?: number;
};

export type CreateDeliveryInput = {
  destination: DeliveryDestination;
  targetPersonnelId?: string | null;
  targetSiteId?: string | null;
  departmentId?: string | null;
  notes?: string | null;
  lines: DeliveryLineInput[];
};

export type DeliverySnapshot = {
  id: string;
  destination: DeliveryDestination;
  targetPersonnelId: string | null;
  targetSiteId: string | null;
  departmentId: string | null;
  notes: string | null;
  lines: Array<{ productId: string; quantity: Prisma.Decimal }>;
};

function personnelBinNote(
  personnel: { firstName: string; lastName: string },
  docNotes?: string | null,
) {
  const label = `${personnel.firstName} ${personnel.lastName}`.trim();
  const parts = [`Personnel bin · ${label}`, docNotes?.trim()].filter((p) => p && p.length > 0);
  return parts.length ? parts.join(" · ") : null;
}

function siteBinNote(
  site: { name: string; company: { name: string } },
  docNotes?: string | null,
) {
  const label = `${site.company.name} / ${site.name}`.trim();
  const parts = [`Site bin · ${label}`, docNotes?.trim()].filter((p) => p && p.length > 0);
  return parts.length ? parts.join(" · ") : null;
}

function departmentNote(
  dept: { name: string; site: { name: string; company: { name: string } } },
  docNotes?: string | null,
) {
  const label = `${dept.site.company.name} / ${dept.site.name} — ${dept.name}`;
  const parts = [`Department · ${label}`, docNotes?.trim()].filter((p) => p && p.length > 0);
  return parts.length ? parts.join(" · ") : null;
}

function generalIssueNote(docNotes?: string | null) {
  const parts = ["General issue", docNotes?.trim()].filter((p) => p && p.length > 0);
  return parts.length ? parts.join(" · ") : "General issue";
}

function validateDestination(input: CreateDeliveryInput) {
  const { destination, targetPersonnelId, targetSiteId, departmentId, lines } = input;

  if (!lines.length) {
    throw Object.assign(new Error("At least one line is required"), { code: "NO_LINES" });
  }

  if (destination === DeliveryDestination.PERSONNEL_BIN) {
    if (!targetPersonnelId?.trim()) {
      throw Object.assign(new Error("targetPersonnelId is required"), { code: "BAD_DEST" });
    }
  } else if (destination === DeliveryDestination.SITE_BIN) {
    if (!targetSiteId?.trim()) {
      throw Object.assign(new Error("targetSiteId is required"), { code: "BAD_DEST" });
    }
  } else if (destination === DeliveryDestination.DEPARTMENT) {
    if (!departmentId?.trim()) {
      throw Object.assign(new Error("departmentId is required"), { code: "BAD_DEST" });
    }
  }
}

async function resolveDestinationEntities(tx: Tx, input: CreateDeliveryInput) {
  const { destination, targetPersonnelId, targetSiteId, departmentId } = input;

  let personnel: { id: string; firstName: string; lastName: string } | null = null;
  let site: { id: string; name: string; company: { name: string } } | null = null;
  let department: {
    id: string;
    name: string;
    site: { name: string; company: { name: string } };
  } | null = null;

  if (destination === DeliveryDestination.PERSONNEL_BIN) {
    personnel = await tx.personnel.findUnique({
      where: { id: targetPersonnelId! },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!personnel) {
      throw Object.assign(new Error("Personnel not found"), { code: "NOT_FOUND" });
    }
  } else if (destination === DeliveryDestination.SITE_BIN) {
    site = await tx.site.findUnique({
      where: { id: targetSiteId! },
      select: { id: true, name: true, company: { select: { name: true } } },
    });
    if (!site) {
      throw Object.assign(new Error("Site not found"), { code: "NOT_FOUND" });
    }
  } else if (destination === DeliveryDestination.DEPARTMENT) {
    department = await tx.department.findUnique({
      where: { id: departmentId! },
      select: {
        id: true,
        name: true,
        site: { select: { name: true, company: { select: { name: true } } } },
      },
    });
    if (!department) {
      throw Object.assign(new Error("Department not found"), { code: "NOT_FOUND" });
    }
  }

  return { personnel, site, department };
}

async function validateStockForLines(tx: Tx, lines: DeliveryLineInput[]) {
  const productIds = [...new Set(lines.map((l) => l.productId))];
  const products = await tx.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, quantityOnHand: true },
  });
  if (products.length !== productIds.length) {
    throw Object.assign(new Error("Product not found"), { code: "NOT_FOUND" });
  }
  const stockByProduct = new Map(
    products.map((p) => [p.id, new Prisma.Decimal(p.quantityOnHand.toString())]),
  );

  for (const line of lines) {
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
      throw Object.assign(new Error("Invalid quantity"), { code: "BAD_QTY" });
    }
    if (!Number.isFinite(line.unitPrice) || line.unitPrice < 0) {
      throw Object.assign(new Error("Invalid unit price"), { code: "BAD_PRICE" });
    }
    const qty = new Prisma.Decimal(line.quantity);
    const onHand = stockByProduct.get(line.productId)!;
    if (onHand.comparedTo(qty) < 0) {
      throw Object.assign(new Error("Insufficient stock"), { code: "INSUFFICIENT" });
    }
    stockByProduct.set(line.productId, onHand.minus(qty));
  }
}

async function fulfillDeliveryLines(
  tx: Tx,
  userId: string,
  delivery: {
    id: string;
    destination: DeliveryDestination;
    targetPersonnelId: string | null;
    targetSiteId: string | null;
    notes: string | null;
  },
  input: CreateDeliveryInput,
  entities: Awaited<ReturnType<typeof resolveDestinationEntities>>,
) {
  const { destination, targetPersonnelId, targetSiteId, notes, lines } = input;
  const { personnel, site, department } = entities;

  const movementNote =
    destination === DeliveryDestination.PERSONNEL_BIN
      ? personnelBinNote(personnel!, notes)
      : destination === DeliveryDestination.SITE_BIN
        ? siteBinNote(site!, notes)
        : destination === DeliveryDestination.DEPARTMENT
          ? departmentNote(department!, notes)
          : generalIssueNote(notes);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const qty = new Prisma.Decimal(line.quantity);
    const unitPrice = new Prisma.Decimal(line.unitPrice);
    const lineTotal = qty.times(unitPrice);

    await tx.deliveryLine.create({
      data: {
        deliveryId: delivery.id,
        productId: line.productId,
        lineIndex: line.lineIndex ?? i,
        quantity: qty,
        unitPrice,
        priceSource: line.priceSource,
        lineTotal,
      },
    });

    if (destination === DeliveryDestination.PERSONNEL_BIN) {
      const existing = await tx.personnelBinItem.findUnique({
        where: {
          personnelId_productId: {
            personnelId: targetPersonnelId!,
            productId: line.productId,
          },
        },
      });
      const oldQty = existing
        ? new Prisma.Decimal(existing.quantity.toString())
        : new Prisma.Decimal(0);
      const newQty = oldQty.plus(qty);

      await applyBinQuantityChange(tx, {
        productId: line.productId,
        oldBinQuantity: oldQty,
        newBinQuantity: newQty,
        userId,
        movementNote,
        deliveryId: delivery.id,
      });

      await tx.personnelBinItem.upsert({
        where: {
          personnelId_productId: {
            personnelId: targetPersonnelId!,
            productId: line.productId,
          },
        },
        create: {
          personnelId: targetPersonnelId!,
          productId: line.productId,
          quantity: newQty,
        },
        update: { quantity: newQty },
      });
    } else if (destination === DeliveryDestination.SITE_BIN) {
      const existing = await tx.siteBinItem.findUnique({
        where: {
          siteId_productId: { siteId: targetSiteId!, productId: line.productId },
        },
      });
      const oldQty = existing
        ? new Prisma.Decimal(existing.quantity.toString())
        : new Prisma.Decimal(0);
      const newQty = oldQty.plus(qty);

      await applyBinQuantityChange(tx, {
        productId: line.productId,
        oldBinQuantity: oldQty,
        newBinQuantity: newQty,
        userId,
        movementNote,
        deliveryId: delivery.id,
      });

      await tx.siteBinItem.upsert({
        where: {
          siteId_productId: { siteId: targetSiteId!, productId: line.productId },
        },
        create: {
          siteId: targetSiteId!,
          productId: line.productId,
          quantity: newQty,
        },
        update: { quantity: newQty },
      });
    } else {
      await applyStockMovementInTransaction(tx, {
        productId: line.productId,
        userId,
        type: MovementType.OUT,
        quantity: qty,
        note: movementNote,
        deliveryId: delivery.id,
      });
    }
  }
}

/** Undo warehouse/bin effects of a delivery and remove its stock movements. */
export async function reverseDeliveryInTransaction(
  tx: Tx,
  userId: string,
  delivery: DeliverySnapshot,
): Promise<void> {
  const movements = await tx.stockMovement.findMany({
    where: { deliveryId: delivery.id },
  });

  for (const m of movements) {
    const qty = new Prisma.Decimal(m.quantity.toString());
    if (m.type === MovementType.OUT) {
      await applyStockMovementInTransaction(tx, {
        productId: m.productId,
        userId,
        type: MovementType.IN,
        quantity: qty,
        note: `Reversal: delivery ${delivery.id}`,
        deliveryId: null,
      });
    } else if (m.type === MovementType.IN) {
      await applyStockMovementInTransaction(tx, {
        productId: m.productId,
        userId,
        type: MovementType.OUT,
        quantity: qty,
        note: `Reversal: delivery ${delivery.id}`,
        deliveryId: null,
      });
    }
  }

  await tx.stockMovement.deleteMany({ where: { deliveryId: delivery.id } });

  if (
    delivery.destination === DeliveryDestination.PERSONNEL_BIN &&
    delivery.targetPersonnelId
  ) {
    for (const line of delivery.lines) {
      await subtractFromPersonnelBinWithoutStock(tx, {
        personnelId: delivery.targetPersonnelId,
        productId: line.productId,
        subQty: new Prisma.Decimal(line.quantity.toString()),
      });
    }
  } else if (delivery.destination === DeliveryDestination.SITE_BIN && delivery.targetSiteId) {
    for (const line of delivery.lines) {
      await subtractFromSiteBinWithoutStock(tx, {
        siteId: delivery.targetSiteId,
        productId: line.productId,
        subQty: new Prisma.Decimal(line.quantity.toString()),
      });
    }
  }
}

export async function applyDeliveryInTransaction(
  tx: Tx,
  userId: string,
  input: CreateDeliveryInput,
) {
  validateDestination(input);
  const entities = await resolveDestinationEntities(tx, input);
  await validateStockForLines(tx, input.lines);

  const delivery = await tx.delivery.create({
    data: {
      destination: input.destination,
      targetPersonnelId: input.targetPersonnelId ?? undefined,
      targetSiteId: input.targetSiteId ?? undefined,
      departmentId: input.departmentId ?? undefined,
      notes: input.notes?.trim() || undefined,
      createdByUserId: userId,
    },
  });

  await fulfillDeliveryLines(
    tx,
    userId,
    {
      id: delivery.id,
      destination: input.destination,
      targetPersonnelId: input.targetPersonnelId ?? null,
      targetSiteId: input.targetSiteId ?? null,
      notes: input.notes ?? null,
    },
    input,
    entities,
  );

  return delivery;
}

export async function updateDeliveryInTransaction(
  tx: Tx,
  userId: string,
  deliveryId: string,
  input: CreateDeliveryInput,
) {
  const existing = await tx.delivery.findUnique({
    where: { id: deliveryId },
    include: { lines: true },
  });
  if (!existing) {
    throw Object.assign(new Error("Delivery not found"), { code: "NOT_FOUND" });
  }

  validateDestination(input);
  const entities = await resolveDestinationEntities(tx, input);

  await reverseDeliveryInTransaction(tx, userId, {
    id: existing.id,
    destination: existing.destination,
    targetPersonnelId: existing.targetPersonnelId,
    targetSiteId: existing.targetSiteId,
    departmentId: existing.departmentId,
    notes: existing.notes,
    lines: existing.lines.map((l) => ({
      productId: l.productId,
      quantity: l.quantity,
    })),
  });

  await validateStockForLines(tx, input.lines);

  await tx.deliveryLine.deleteMany({ where: { deliveryId } });
  await tx.delivery.update({
    where: { id: deliveryId },
    data: {
      destination: input.destination,
      targetPersonnelId: input.targetPersonnelId ?? null,
      targetSiteId: input.targetSiteId ?? null,
      departmentId: input.departmentId ?? null,
      notes: input.notes?.trim() || null,
    },
  });

  await fulfillDeliveryLines(
    tx,
    userId,
    {
      id: deliveryId,
      destination: input.destination,
      targetPersonnelId: input.targetPersonnelId ?? null,
      targetSiteId: input.targetSiteId ?? null,
      notes: input.notes ?? null,
    },
    input,
    entities,
  );

  return existing;
}

export async function deleteDeliveryInTransaction(
  tx: Tx,
  userId: string,
  deliveryId: string,
): Promise<void> {
  const existing = await tx.delivery.findUnique({
    where: { id: deliveryId },
    include: { lines: true },
  });
  if (!existing) {
    throw Object.assign(new Error("Delivery not found"), { code: "NOT_FOUND" });
  }

  await reverseDeliveryInTransaction(tx, userId, {
    id: existing.id,
    destination: existing.destination,
    targetPersonnelId: existing.targetPersonnelId,
    targetSiteId: existing.targetSiteId,
    departmentId: existing.departmentId,
    notes: existing.notes,
    lines: existing.lines.map((l) => ({
      productId: l.productId,
      quantity: l.quantity,
    })),
  });

  await tx.delivery.delete({ where: { id: deliveryId } });
}
