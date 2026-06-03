import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Role } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import {
  buildPermissionRowsFromInput,
  loadPermissionsForUser,
  permissionsToApiList,
  requirePermission,
  saveUserPermissions,
} from "../lib/permissions.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";

const router = Router();

router.use(requireAuth);

const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  displayName: z.string().min(1),
  role: z.nativeEnum(Role).optional(),
});

const updateSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  displayName: z.string().min(1).optional(),
  role: z.nativeEnum(Role).optional(),
});

const permissionsBodySchema = z.object({
  permissions: z.array(
    z.object({
      resource: z.string(),
      canView: z.boolean(),
      canRead: z.boolean(),
      canAdd: z.boolean(),
      canEdit: z.boolean(),
      canDelete: z.boolean(),
    }),
  ),
});

router.get("/", requirePermission("users", "read"), async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { email: "asc" },
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  res.json(users);
});

router.post("/", requirePermission("users", "add"), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const caller = await prisma.user.findUnique({
    where: { id: req.user!.sub },
    select: { role: true },
  });
  const { email, password, displayName, role } = parsed.data;
  const effectiveRole = role ?? Role.USER;
  if (effectiveRole === Role.ADMIN && caller?.role !== Role.ADMIN) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const passwordHash = await bcrypt.hash(password, 12);
  try {
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        displayName,
        role: effectiveRole,
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    res.status(201).json(user);
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code === "P2002") {
      res.status(409).json({ error: "Email already exists" });
      return;
    }
    throw e;
  }
});

router.get("/:id/permissions", requireAdmin, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: { id: true, role: true },
  });
  if (!user) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const permissions = await loadPermissionsForUser(user.id, user.role);
  res.json({ permissions: permissionsToApiList(permissions) });
});

router.put("/:id/permissions", requireAdmin, async (req, res) => {
  const parsed = permissionsBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const target = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: { id: true, role: true },
  });
  if (!target) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (target.role === Role.ADMIN) {
    res.status(400).json({ error: "Cannot modify permissions for an administrator" });
    return;
  }
  const rows = buildPermissionRowsFromInput(parsed.data.permissions);
  await saveUserPermissions(target.id, rows);
  const permissions = await loadPermissionsForUser(target.id, target.role);
  res.json({ permissions: permissionsToApiList(permissions) });
});

router.get("/:id", requirePermission("users", "read"), async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!user) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(user);
});

router.patch("/:id", requirePermission("users", "edit"), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const caller = await prisma.user.findUnique({
    where: { id: req.user!.sub },
    select: { role: true },
  });
  const target = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: { role: true },
  });
  if (!target) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (target.role === Role.ADMIN && caller?.role !== Role.ADMIN) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const { email, password, displayName, role } = parsed.data;
  if (role !== undefined && role !== Role.USER && caller?.role !== Role.ADMIN) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const data: Prisma.UserUpdateInput = {};
  if (email !== undefined) data.email = email;
  if (displayName !== undefined) data.displayName = displayName;
  if (role !== undefined) data.role = role;
  if (password !== undefined) data.passwordHash = await bcrypt.hash(password, 12);

  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data,
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    res.json(user);
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code === "P2025") {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (code === "P2002") {
      res.status(409).json({ error: "Email already exists" });
      return;
    }
    throw e;
  }
});

router.delete("/:id", requirePermission("users", "delete"), async (req, res) => {
  if (req.params.id === req.user!.sub) {
    res.status(400).json({ error: "Cannot delete your own account" });
    return;
  }
  const caller = await prisma.user.findUnique({
    where: { id: req.user!.sub },
    select: { role: true },
  });
  const target = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: { role: true },
  });
  if (!target) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (target.role === Role.ADMIN && caller?.role !== Role.ADMIN) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  try {
    await prisma.user.delete({ where: { id: req.params.id } });
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
