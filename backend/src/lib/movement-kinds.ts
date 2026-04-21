import { MovementType } from "@prisma/client";

/** Increases on-hand (same math as IN). */
export const MOVEMENT_TYPES_INBOUND: MovementType[] = [
  MovementType.IN,
  MovementType.RETURN,
  MovementType.FOUND,
];

/** Decreases on-hand (same math as OUT). */
export const MOVEMENT_TYPES_OUTBOUND: MovementType[] = [
  MovementType.OUT,
  MovementType.SCRAP,
  MovementType.LOSS,
];

export function isInboundMovement(type: MovementType): boolean {
  return MOVEMENT_TYPES_INBOUND.includes(type);
}

export function isOutboundMovement(type: MovementType): boolean {
  return MOVEMENT_TYPES_OUTBOUND.includes(type);
}

export function isAdjustMovement(type: MovementType): boolean {
  return type === MovementType.ADJUST;
}
