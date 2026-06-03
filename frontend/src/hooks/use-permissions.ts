import { useMemo } from "react";
import { useAuth } from "../contexts/auth-hooks";
import {
  adminPermissions,
  can,
  emptyPermissions,
  firstAllowedPath,
  type PermissionAction,
  type PermissionResource,
  type PermissionsByResource,
} from "../lib/permissions";

export function usePermissions() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const permissions = user?.permissions ?? emptyPermissions();

  return useMemo(
    () => ({
      permissions,
      isAdmin,
      canViewResource: (resource: PermissionResource) =>
        isAdmin || can(permissions, resource, "view"),
      canDo: (resource: PermissionResource, action: PermissionAction) =>
        isAdmin || can(permissions, resource, action),
      firstAllowedPath: firstAllowedPath(permissions, Boolean(isAdmin)),
    }),
    [permissions, isAdmin],
  );
}

export function usePagePermissions(resource?: PermissionResource) {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const permissions: PermissionsByResource =
    user?.permissions ?? (isAdmin ? adminPermissions() : emptyPermissions());
  const row = resource ? permissions[resource] : fullAccessRow();

  return useMemo(
    () => ({
      isAdmin: Boolean(isAdmin),
      canView: !resource || isAdmin || row.canView,
      canRead: !resource || isAdmin || row.canRead,
      canAdd: !resource || isAdmin || row.canAdd,
      canEdit: !resource || isAdmin || row.canEdit,
      canDelete: !resource || isAdmin || row.canDelete,
    }),
    [isAdmin, row, resource],
  );
}

function fullAccessRow() {
  return {
    canView: true,
    canRead: true,
    canAdd: true,
    canEdit: true,
    canDelete: true,
  };
}
