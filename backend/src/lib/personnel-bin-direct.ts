import { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

/**
 * Increase personnel bin quantity without changing warehouse stock (e.g. purchase delivered
 * straight to assignee — not issued from warehouse).
 */
export async function addToPersonnelBinWithoutStock(
  tx: Tx,
  params: {
    personnelId: string;
    productId: string;
    addQty: Prisma.Decimal;
    noteLine: string | null;
  },
): Promise<void> {
  const { personnelId, productId, addQty, noteLine } = params;
  if (addQty.lessThanOrEqualTo(0)) {
    return;
  }

  const existing = await tx.personnelBinItem.findUnique({
    where: {
      personnelId_productId: { personnelId, productId },
    },
  });

  if (existing) {
    const next = new Prisma.Decimal(existing.quantity.toString()).plus(addQty);
    await tx.personnelBinItem.update({
      where: { id: existing.id },
      data: {
        quantity: next,
        note: noteLine ?? existing.note,
      },
    });
  } else {
    await tx.personnelBinItem.create({
      data: {
        personnelId,
        productId,
        quantity: addQty,
        note: noteLine ?? undefined,
      },
    });
  }
}

/** Decrease bin quantity without touching warehouse stock (e.g. reversing a direct-to-bin purchase). */
export async function subtractFromPersonnelBinWithoutStock(
  tx: Tx,
  params: {
    personnelId: string;
    productId: string;
    subQty: Prisma.Decimal;
  },
): Promise<void> {
  const { personnelId, productId, subQty } = params;
  if (subQty.lessThanOrEqualTo(0)) {
    return;
  }

  const existing = await tx.personnelBinItem.findUnique({
    where: {
      personnelId_productId: { personnelId, productId },
    },
  });
  if (!existing) {
    throw Object.assign(new Error("Insufficient quantity in personal bin"), {
      code: "INSUFFICIENT_BIN",
    });
  }

  const cur = new Prisma.Decimal(existing.quantity.toString());
  if (cur.comparedTo(subQty) < 0) {
    throw Object.assign(new Error("Insufficient quantity in personal bin"), {
      code: "INSUFFICIENT_BIN",
    });
  }

  const next = cur.minus(subQty);
  if (next.lessThanOrEqualTo(0)) {
    await tx.personnelBinItem.delete({ where: { id: existing.id } });
  } else {
    await tx.personnelBinItem.update({
      where: { id: existing.id },
      data: { quantity: next },
    });
  }
}
