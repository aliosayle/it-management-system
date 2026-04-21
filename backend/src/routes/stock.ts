import { Router } from "express";
import { z } from "zod";
import { MovementType, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { movementJson } from "../lib/movement-format.js";
import {
  isAdjustMovement,
  isInboundMovement,
  isOutboundMovement,
} from "../lib/movement-kinds.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

const movementSchema = z.object({
  productId: z.string().min(1),
  type: z.nativeEnum(MovementType),
  quantity: z.number().positive(),
  note: z.string().optional().nullable(),
});

router.post("/movements", async (req, res) => {
  const parsed = movementSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { productId, type, quantity, note } = parsed.data;
  const userId = req.user!.sub;
  const q = new Prisma.Decimal(quantity);

  try {
    const row = await prisma.$transaction(async (tx) => {
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
          throw Object.assign(new Error("Insufficient stock"), {
            code: "INSUFFICIENT",
          });
        }
        newBalance = current.minus(q);
        storedQty = q;
      } else if (isAdjustMovement(type)) {
        newBalance = q;
        storedQty = q;
      } else {
        throw Object.assign(new Error("Unsupported movement type"), {
          code: "BAD_TYPE",
        });
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
        },
        include: {
          user: { select: { id: true, email: true, displayName: true } },
        },
      });
    });

    res.status(201).json({
      ...movementJson(row),
      user: row.user,
    });
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err.code === "NOT_FOUND") {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    if (err.code === "INSUFFICIENT") {
      res.status(400).json({ error: "Insufficient stock for this outbound quantity" });
      return;
    }
    if (err.code === "BAD_TYPE") {
      res.status(400).json({ error: "Unsupported movement type" });
      return;
    }
    throw e;
  }
});

export default router;
