import { Navigate } from "react-router-dom";
import { usePermissions } from "../hooks/use-permissions";

export default function HomePage() {
  const { firstAllowedPath } = usePermissions();
  return <Navigate to={firstAllowedPath} replace />;
}
