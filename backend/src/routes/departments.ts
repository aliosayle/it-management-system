import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  siteId: z.string().min(1),
  name: z.string().min(1).max(256),
});

const updateSchema = z.object({
  siteId: z.string().min(1).optional(),
  name: z.string().min(1).max(256).optional(),
});

function serializeDepartment(d: {
  id: string;
  siteId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  site: { name: string; company: { id: string; name: string } };
}) {
  const siteLabel = `${d.site.company.name} / ${d.site.name}`;
  return {
    id: d.id,
    siteId: d.siteId,
    name: d.name,
    siteLabel,
    label: `${siteLabel} — ${d.name}`,
    companyName: d.site.company.name,
    siteName: d.site.name,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

router.get("/", async (req, res) => {
  const siteId = typeof req.query.siteId === "string" ? req.query.siteId : undefined;
  const list = await prisma.department.findMany({
    where: siteId ? { siteId } : undefined,
    include: {
      site: { include: { company: { select: { id: true, name: true } } } },
    },
    orderBy: [{ site: { company: { name: "asc" } } }, { site: { name: "asc" } }, { name: "asc" }],
  });
  res.json(list.map(serializeDepartment));
});

router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const row = await prisma.department.create({
      data: parsed.data,
      include: {
        site: { include: { company: { select: { id: true, name: true } } } },
      },
    });
    res.status(201).json(serializeDepartment(row));
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code === "P2002") {
      res.status(409).json({ error: "A department with this name already exists for this site" });
      return;
    }
    if (code === "P2003") {
      res.status(400).json({ error: "Invalid site" });
      return;
    }
    throw e;
  }
});

router.get("/:id", async (req, res) => {
  const row = await prisma.department.findUnique({
    where: { id: req.params.id },
    include: {
      site: { include: { company: { select: { id: true, name: true } } } },
    },
  });
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(serializeDepartment(row));
});

router.patch("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  if (Object.keys(parsed.data).length === 0) {
    res.status(400).json({ error: "No changes" });
    return;
  }
  try {
    const row = await prisma.department.update({
      where: { id: req.params.id },
      data: parsed.data,
      include: {
        site: { include: { company: { select: { id: true, name: true } } } },
      },
    });
    res.json(serializeDepartment(row));
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code === "P2025") {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (code === "P2002") {
      res.status(409).json({ error: "A department with this name already exists for this site" });
      return;
    }
    if (code === "P2003") {
      res.status(400).json({ error: "Invalid site" });
      return;
    }
    throw e;
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await prisma.department.delete({ where: { id: req.params.id } });
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
