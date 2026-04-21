import type { MovementType, Prisma } from "@prisma/client";

export function movementJson(m: {
  id: string;
  productId: string;
  userId: string;
  type: MovementType;
  quantity: Prisma.Decimal;
  balanceAfter: Prisma.Decimal;
  note: string | null;
  createdAt: Date;
}) {
  return {
    ...m,
    quantity: Number(m.quantity),
    balanceAfter: Number(m.balanceAfter),
  };
}
