import { MovementType, Prisma } from "@prisma/client";
import { isAdjustMovement, isInboundMovement, isOutboundMovement } from "./movement-kinds.js";

type Tx = Prisma.TransactionClient;

/** Apply a stock movement inside a transaction (same rules as POST /api/stock/movements). */
export async function applyStockMovementInTransaction(
  tx: Tx,
  params: {
    productId: string;
    userId: string;
    type: MovementType;
    quantity: Prisma.Decimal;
    note: string | null | undefined;
    purchaseId?: string | null;
  },
) {
  const { productId, userId, type, quantity: q, note, purchaseId } = params;

  const product = await tx.product.findUnique({ where: { id: productId } });
  if (!product) {
    throw Object.assign(new Error("Product not found"), { code: "NOT_FOUND" });
  }

  const current = new Prisma.Decimal(product.quantityOnHand.toString());
  let newBalance: Prisma.Decimal;
  let storedQty: Prisma.Decimal;

  if (isInboundMovement(type)) {
    newBalance = current.plus(q);
    storedQty = q;
  } else if (isOutboundMovement(type)) {
    if (current.comparedTo(q) < 0) {
      throw Object.assign(new Error("Insufficient stock"), { code: "INSUFFICIENT" });
    }
    newBalance = current.minus(q);
    storedQty = q;
  } else if (isAdjustMovement(type)) {
    newBalance = q;
    storedQty = q;
  } else {
    throw Object.assign(new Error("Unsupported movement type"), { code: "BAD_TYPE" });
  }

  await tx.product.update({
    where: { id: productId },
    data: { quantityOnHand: newBalance },
  });

  return tx.stockMovement.create({
    data: {
      productId,
      userId,
      type,
      quantity: storedQty,
      balanceAfter: newBalance,
      note: note ?? undefined,
      purchaseId: purchaseId ?? undefined,
    },
    include: {
      user: { select: { id: true, email: true, displayName: true } },
    },
  });
}
