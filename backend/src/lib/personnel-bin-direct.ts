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
