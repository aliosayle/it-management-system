import type { Request, Response, NextFunction } from "express";
import { Role } from "@prisma/client";
import { prisma } from "./prisma.js";

export const PERMISSION_RESOURCES = [
  { key: "companies", label: "Companies", path: "/companies" },
  { key: "sites", label: "Sites", path: "/sites" },
  { key: "departments", label: "Departments", path: "/departments" },
  { key: "personnel", label: "Personnel", path: "/personnel" },
  { key: "products", label: "Products", path: "/products" },
  { key: "suppliers", label: "Suppliers", path: "/suppliers" },
  { key: "stock", label: "Stock", path: "/stock" },
  { key: "purchases", label: "Purchases", path: "/purchases" },
  { key: "users", label: "Users", path: "/users" },
] as const;

export type PermissionResource = (typeof PERMISSION_RESOURCES)[number]["key"];
export type PermissionAction = "view" | "read" | "add" | "edit" | "delete";

export type ResourcePermissions = {
  canView: boolean;
  canRead: boolean;
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

export type PermissionsByResource = Record<PermissionResource, ResourcePermissions>;

const RESOURCE_KEYS = PERMISSION_RESOURCES.map((r) => r.key) as PermissionResource[];

export function isPermissionResource(value: string): value is PermissionResource {
  return (RESOURCE_KEYS as string[]).includes(value);
}

function fullAccess(): ResourcePermissions {
  return {
    canView: true,
    canRead: true,
    canAdd: true,
    canEdit: true,
    canDelete: true,
  };
}

function noAccess(): ResourcePermissions {
  return {
    canView: false,
    canRead: false,
    canAdd: false,
    canEdit: false,
    canDelete: false,
  };
}

export function adminPermissions(): PermissionsByResource {
  return Object.fromEntries(
    RESOURCE_KEYS.map((key) => [key, fullAccess()]),
  ) as PermissionsByResource;
}

export function emptyPermissions(): PermissionsByResource {
  return Object.fromEntries(
    RESOURCE_KEYS.map((key) => [key, noAccess()]),
  ) as PermissionsByResource;
}

export function normalizePermissionRow(row: {
  canView: boolean;
  canRead: boolean;
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
}): ResourcePermissions {
  let { canView, canRead, canAdd, canEdit, canDelete } = row;
  if (canRead) canView = true;
  if (canAdd || canEdit || canDelete) {
    canView = true;
    canRead = true;
  }
  return { canView, canRead, canAdd, canEdit, canDelete };
}

export function canDo(
  permissions: PermissionsByResource,
  resource: PermissionResource,
  action: PermissionAction,
): boolean {
  const p = permissions[resource];
  if (!p) return false;
  switch (action) {
    case "view":
      return p.canView;
    case "read":
      return p.canRead;
    case "add":
      return p.canAdd;
    case "edit":
      return p.canEdit;
    case "delete":
      return p.canDelete;
    default:
      return false;
  }
}

export async function loadPermissionsForUser(
  userId: string,
  role: Role,
): Promise<PermissionsByResource> {
  if (role === Role.ADMIN) {
    return adminPermissions();
  }

  const rows = await prisma.userPagePermission.findMany({
    where: { userId },
  });

  const map = emptyPermissions();
  for (const row of rows) {
    if (!isPermissionResource(row.resource)) continue;
    map[row.resource] = normalizePermissionRow({
      canView: row.canView,
      canRead: row.canRead,
      canAdd: row.canAdd,
      canEdit: row.canEdit,
      canDelete: row.canDelete,
    });
  }
  return map;
}

export async function assertPermission(
  userId: string,
  role: Role,
  resource: PermissionResource,
  action: PermissionAction,
): Promise<void> {
  if (role === Role.ADMIN) return;
  const permissions = await loadPermissionsForUser(userId, role);
  if (!canDo(permissions, resource, action)) {
    const err = new Error("Forbidden") as Error & { statusCode?: number };
    err.statusCode = 403;
    throw err;
  }
}

export function requirePermission(resource: PermissionResource, action: PermissionAction) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.user;
      if (!auth) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const user = await prisma.user.findUnique({
        where: { id: auth.sub },
        select: { id: true, role: true },
      });
      if (!user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      await assertPermission(user.id, user.role, resource, action);
      next();
    } catch (e: unknown) {
      const err = e as { statusCode?: number; message?: string };
      if (err.statusCode === 403 || err.message === "Forbidden") {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      next(e);
    }
  };
}

export type PermissionRowInput = {
  resource: string;
  canView: boolean;
  canRead: boolean;
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

export function buildPermissionRowsFromInput(
  input: PermissionRowInput[],
): { resource: PermissionResource; data: ResourcePermissions }[] {
  const byResource = new Map<PermissionResource, ResourcePermissions>();
  for (const key of RESOURCE_KEYS) {
    byResource.set(key, noAccess());
  }
  for (const row of input) {
    if (!isPermissionResource(row.resource)) continue;
    byResource.set(
      row.resource,
      normalizePermissionRow({
        canView: Boolean(row.canView),
        canRead: Boolean(row.canRead),
        canAdd: Boolean(row.canAdd),
        canEdit: Boolean(row.canEdit),
        canDelete: Boolean(row.canDelete),
      }),
    );
  }
  return RESOURCE_KEYS.map((resource) => ({
    resource,
    data: byResource.get(resource)!,
  }));
}

export async function seedDefaultPermissionsForUser(userId: string): Promise<void> {
  const rows = RESOURCE_KEYS.filter((r) => r !== "users").map((resource) => ({
    resource,
    data: fullAccess(),
  }));
  await saveUserPermissions(userId, rows);
}

export async function saveUserPermissions(
  userId: string,
  rows: { resource: PermissionResource; data: ResourcePermissions }[],
): Promise<void> {
  await prisma.$transaction(
    rows.map(({ resource, data }) =>
      prisma.userPagePermission.upsert({
        where: {
          userId_resource: { userId, resource },
        },
        create: {
          userId,
          resource,
          canView: data.canView,
          canRead: data.canRead,
          canAdd: data.canAdd,
          canEdit: data.canEdit,
          canDelete: data.canDelete,
        },
        update: {
          canView: data.canView,
          canRead: data.canRead,
          canAdd: data.canAdd,
          canEdit: data.canEdit,
          canDelete: data.canDelete,
        },
      }),
    ),
  );
}

export function permissionsToApiList(permissions: PermissionsByResource) {
  return RESOURCE_KEYS.map((resource) => ({
    resource,
    label: PERMISSION_RESOURCES.find((r) => r.key === resource)!.label,
    ...permissions[resource],
  }));
}
