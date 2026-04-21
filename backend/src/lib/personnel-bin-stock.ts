import { MovementType, Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

/**
 * When personnel bin quantity increases, warehouse stock decreases (OUT).
 * When it decreases (or line is removed), stock returns (IN).
 */
export async function applyBinQuantityChange(
  tx: Tx,
  opts: {
    productId: string;
    oldBinQuantity: Prisma.Decimal;
    newBinQuantity: Prisma.Decimal;
    userId: string;
    movementNote: string | null;
  },
): Promise<void> {
  const delta = opts.newBinQuantity.minus(opts.oldBinQuantity);
  if (delta.equals(new Prisma.Decimal(0))) {
    return;
  }

  const product = await tx.product.findUnique({ where: { id: opts.productId } });
  if (!product) {
    throw Object.assign(new Error("Product not found"), { code: "NOT_FOUND" });
  }

  const current = new Prisma.Decimal(product.quantityOnHand.toString());
  let type: MovementType;
  let moveQty: Prisma.Decimal;
  let newBalance: Prisma.Decimal;

  if (delta.greaterThan(0)) {
    type = MovementType.OUT;
    moveQty = delta;
    if (current.comparedTo(moveQty) < 0) {
      throw Object.assign(new Error("Insufficient stock"), { code: "INSUFFICIENT" });
    }
    newBalance = current.minus(moveQty);
  } else {
    type = MovementType.IN;
    moveQty = delta.negated();
    newBalance = current.plus(moveQty);
  }

  await tx.product.update({
    where: { id: opts.productId },
    data: { quantityOnHand: newBalance },
  });

  await tx.stockMovement.create({
    data: {
      productId: opts.productId,
      userId: opts.userId,
      type,
      quantity: moveQty,
      balanceAfter: newBalance,
      note: opts.movementNote ?? undefined,
    },
  });
}
