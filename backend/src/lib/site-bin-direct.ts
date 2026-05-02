import { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

/**
 * Increase site bin quantity without changing warehouse stock (e.g. purchase delivered
 * straight to a site — not issued from warehouse).
 */
export async function addToSiteBinWithoutStock(
  tx: Tx,
  params: {
    siteId: string;
    productId: string;
    addQty: Prisma.Decimal;
    noteLine: string | null;
  },
): Promise<void> {
  const { siteId, productId, addQty, noteLine } = params;
  if (addQty.lessThanOrEqualTo(0)) {
    return;
  }

  const existing = await tx.siteBinItem.findUnique({
    where: {
      siteId_productId: { siteId, productId },
    },
  });

  if (existing) {
    const next = new Prisma.Decimal(existing.quantity.toString()).plus(addQty);
    await tx.siteBinItem.update({
      where: { id: existing.id },
      data: {
        quantity: next,
        note: noteLine ?? existing.note,
      },
    });
  } else {
    await tx.siteBinItem.create({
      data: {
        siteId,
        productId,
        quantity: addQty,
        note: noteLine ?? undefined,
      },
    });
  }
}

/** Decrease site bin quantity without touching warehouse stock (e.g. reversing a direct-to-bin purchase). */
export async function subtractFromSiteBinWithoutStock(
  tx: Tx,
  params: {
    siteId: string;
    productId: string;
    subQty: Prisma.Decimal;
  },
): Promise<void> {
  const { siteId, productId, subQty } = params;
  if (subQty.lessThanOrEqualTo(0)) {
    return;
  }

  const existing = await tx.siteBinItem.findUnique({
    where: {
      siteId_productId: { siteId, productId },
    },
  });
  if (!existing) {
    throw Object.assign(new Error("Insufficient quantity in site bin"), {
      code: "INSUFFICIENT_BIN",
    });
  }

  const cur = new Prisma.Decimal(existing.quantity.toString());
  if (cur.comparedTo(subQty) < 0) {
    throw Object.assign(new Error("Insufficient quantity in site bin"), {
      code: "INSUFFICIENT_BIN",
    });
  }

  const next = cur.minus(subQty);
  if (next.lessThanOrEqualTo(0)) {
    await tx.siteBinItem.delete({ where: { id: existing.id } });
  } else {
    await tx.siteBinItem.update({
      where: { id: existing.id },
      data: { quantity: next },
    });
  }
}
