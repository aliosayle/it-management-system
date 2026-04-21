import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  companyId: z.string().min(1),
  name: z.string().min(1),
});

const updateSchema = z.object({
  companyId: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
});

router.get("/", async (req, res) => {
  const companyId = typeof req.query.companyId === "string" ? req.query.companyId : undefined;
  const list = await prisma.site.findMany({
    where: companyId ? { companyId } : undefined,
    include: { company: { select: { id: true, name: true } } },
    orderBy: [{ company: { name: "asc" } }, { name: "asc" }],
  });
  res.json(
    list.map((s) => ({
      ...s,
      companyName: s.company.name,
      label: `${s.company.name} / ${s.name}`,
    })),
  );
});

router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const row = await prisma.site.create({
      data: parsed.data,
      include: { company: { select: { name: true } } },
    });
    res.status(201).json({
      ...row,
      companyName: row.company.name,
      label: `${row.company.name} / ${row.name}`,
    });
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code === "P2003") {
      res.status(400).json({ error: "Invalid company" });
      return;
    }
    throw e;
  }
});

router.get("/:id", async (req, res) => {
  const row = await prisma.site.findUnique({
    where: { id: req.params.id },
    include: { company: { select: { id: true, name: true } } },
  });
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({
    ...row,
    companyName: row.company.name,
    label: `${row.company.name} / ${row.name}`,
  });
});

router.patch("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const row = await prisma.site.update({
      where: { id: req.params.id },
      data: parsed.data,
      include: { company: { select: { name: true } } },
    });
    res.json({
      ...row,
      companyName: row.company.name,
      label: `${row.company.name} / ${row.name}`,
    });
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code === "P2025") {
      res.status(404).json({ error: "Not found" });
      return;
    }
    throw e;
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await prisma.site.delete({ where: { id: req.params.id } });
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
