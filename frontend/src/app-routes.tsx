import {
  HomePage,
  UsersPage,
  CompaniesPage,
  SitesPage,
  DepartmentsPage,
  PersonnelPage,
  ProductsPage,
  StockPage,
  PurchasesPage,
  SuppliersPage,
} from "./pages";
import { withNavigationWatcher } from "./contexts/navigation-hooks";
import { RequirePageAccess } from "./components/require-page-access";
import type { PermissionResource } from "./lib/permissions";
import type { ComponentType } from "react";

const routeData: {
  path: string;
  element: ComponentType;
  resource?: PermissionResource;
}[] = [
  { path: "/home", element: HomePage },
  { path: "/companies", element: CompaniesPage, resource: "companies" },
  { path: "/sites", element: SitesPage, resource: "sites" },
  { path: "/departments", element: DepartmentsPage, resource: "departments" },
  { path: "/personnel", element: PersonnelPage, resource: "personnel" },
  { path: "/products", element: ProductsPage, resource: "products" },
  { path: "/stock", element: StockPage, resource: "stock" },
  { path: "/purchases", element: PurchasesPage, resource: "purchases" },
  { path: "/suppliers", element: SuppliersPage, resource: "suppliers" },
  { path: "/users", element: UsersPage, resource: "users" },
];

function withPageAccess(Page: ComponentType, resource?: PermissionResource) {
  if (!resource) {
    return Page;
  }
  return function GatedPage() {
    return (
      <RequirePageAccess resource={resource}>
        <Page />
      </RequirePageAccess>
    );
  };
}

export const routes = routeData.map((route) => {
  const GatedPage = withPageAccess(route.element, route.resource);
  return {
    path: route.path,
    element: withNavigationWatcher(GatedPage, route.path),
  };
});
