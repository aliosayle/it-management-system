export const PERMISSION_RESOURCES = [
  { key: "companies", label: "Companies", path: "/companies" },
  { key: "sites", label: "Sites", path: "/sites" },
  { key: "departments", label: "Departments", path: "/departments" },
  { key: "personnel", label: "Personnel", path: "/personnel" },
  { key: "products", label: "Products", path: "/products" },
  { key: "suppliers", label: "Suppliers", path: "/suppliers" },
  { key: "purchases", label: "Purchases", path: "/purchases" },
  { key: "deliveries", label: "Deliveries", path: "/deliveries" },
  { key: "tasks", label: "Tasks", path: "/tasks" },
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

function noAccess(): ResourcePermissions {
  return {
    canView: false,
    canRead: false,
    canAdd: false,
    canEdit: false,
    canDelete: false,
  };
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

export function pathToResource(path: string): PermissionResource | undefined {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const match = PERMISSION_RESOURCES.find(
    (r) => normalized === r.path || normalized.startsWith(`${r.path}/`),
  );
  return match?.key;
}

export function can(
  permissions: PermissionsByResource | undefined,
  resource: PermissionResource,
  action: PermissionAction,
): boolean {
  if (!permissions) return false;
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

export function firstAllowedPath(
  permissions: PermissionsByResource | undefined,
  isAdmin: boolean,
): string {
  if (isAdmin) return "/products";
  if (!permissions) return "/home";
  for (const { path, key } of PERMISSION_RESOURCES) {
    if (permissions[key]?.canView) return path;
  }
  return "/home";
}
