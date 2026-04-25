import {
  HomePage,
  UsersPage,
  CompaniesPage,
  SitesPage,
  PersonnelPage,
  ProductsPage,
  StockPage,
  PurchasesPage,
  SuppliersPage,
} from "./pages";
import { withNavigationWatcher } from "./contexts/navigation-hooks";

const routeData = [
  { path: "/home", element: HomePage },
  { path: "/companies", element: CompaniesPage },
  { path: "/sites", element: SitesPage },
  { path: "/personnel", element: PersonnelPage },
  { path: "/products", element: ProductsPage },
  { path: "/stock", element: StockPage },
  { path: "/purchases", element: PurchasesPage },
  { path: "/suppliers", element: SuppliersPage },
  { path: "/users", element: UsersPage },
];

export const routes = routeData.map((route) => {
  return {
    ...route,
    element: withNavigationWatcher(route.element, route.path),
  };
});
