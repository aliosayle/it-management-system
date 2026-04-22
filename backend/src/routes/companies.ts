import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  name: z.string().trim().min(1),
});

const updateSchema = z.object({
  name: z.string().trim().min(1).optional(),
});

router.get("/", async (_req, res) => {
  const list = await prisma.company.findMany({ orderBy: { name: "asc" } });
  res.json(list);
});

router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const row = await prisma.company.create({ data: parsed.data });
    res.status(201).json(row);
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      res.status(409).json({ error: "A company with this name already exists" });
      return;
    }
    throw e;
  }
});

router.get("/:id", async (req, res) => {
  const row = await prisma.company.findUnique({ where: { id: req.params.id } });
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(row);
});

router.patch("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const row = await prisma.company.update({
      where: { id: req.params.id },
      data: parsed.data,
    });
    res.json(row);
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2025") {
        res.status(404).json({ error: "Not found" });
        return;
      }
      if (e.code === "P2002") {
        res.status(409).json({ error: "A company with this name already exists" });
        return;
      }
    }
    throw e;
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await prisma.company.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code === "P2025") {
      res.status(404).json({ error: "Not found" });
      return;
    }
    throw e;
  }
});

export default router;
