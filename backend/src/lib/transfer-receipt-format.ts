import { MovementType, Prisma } from "@prisma/client";

export type TransferReceiptPayload = {
  movementId: string;
  movementType: MovementType;
  quantity: number;
  balanceAfter: number;
  issuedAt: Date;
  note: string | null;
  productSku: string;
  productName: string;
  issuedBy: string;
  source: string;
  destination: string;
};

export function transferReceiptJson(opts: {
  movement: {
    id: string;
    type: MovementType;
    quantity: Prisma.Decimal;
    balanceAfter: Prisma.Decimal;
    createdAt: Date;
    note: string | null;
  };
  product: { sku: string; name: string };
  issuedBy: { displayName: string; email: string };
  destination: string;
  source?: string;
}): TransferReceiptPayload {
  return {
    movementId: opts.movement.id,
    movementType: opts.movement.type,
    quantity: Number(opts.movement.quantity),
    balanceAfter: Number(opts.movement.balanceAfter),
    issuedAt: opts.movement.createdAt,
    note: opts.movement.note,
    productSku: opts.product.sku,
    productName: opts.product.name,
    issuedBy: opts.issuedBy.displayName?.trim() || opts.issuedBy.email,
    source: opts.source ?? "Dépôt",
    destination: opts.destination,
  };
}

export function attachOutboundTransferReceipt<T extends Record<string, unknown>>(
  payload: T,
  movement: {
    id: string;
    type: MovementType;
    quantity: Prisma.Decimal;
    balanceAfter: Prisma.Decimal;
    createdAt: Date;
    note: string | null;
  } | null,
  product: { sku: string; name: string },
  issuedBy: { displayName: string; email: string },
  destination: string,
): T & { transferReceipt?: TransferReceiptPayload } {
  if (!movement || movement.type !== MovementType.OUT) {
    return payload;
  }
  return {
    ...payload,
    transferReceipt: transferReceiptJson({
      movement,
      product,
      issuedBy,
      destination,
    }),
  };
}
