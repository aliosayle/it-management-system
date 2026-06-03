import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/auth-hooks";
import { usePermissions } from "../hooks/use-permissions";
import type { PermissionResource } from "../lib/permissions";

type RequirePageAccessProps = {
  resource: PermissionResource;
  children: React.ReactNode;
};

export function RequirePageAccess({ resource, children }: RequirePageAccessProps) {
  const { user, loading } = useAuth();
  const { canViewResource, firstAllowedPath } = usePermissions();

  if (loading) {
    return null;
  }

  if (!user) {
    return null;
  }

  if (user.role === "ADMIN" || canViewResource(resource)) {
    return <>{children}</>;
  }

  return <Navigate to={firstAllowedPath} replace />;
}

export function PageReadGuard({
  resource,
  children,
}: RequirePageAccessProps) {
  const { user } = useAuth();
  const { canDo } = usePermissions();

  if (user?.role === "ADMIN" || canDo(resource, "read")) {
    return <>{children}</>;
  }

  return (
    <div className="content-block">
      <p>You do not have permission to view this data.</p>
    </div>
  );
}
