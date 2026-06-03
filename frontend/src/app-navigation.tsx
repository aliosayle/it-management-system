/** Sidebar navigation — single flat list (paths must start with `/`). Icon names: DevExtreme Fluent set. */

import type { PermissionResource } from "./lib/permissions";

export type NavItem = {
  text: string;
  path: string;
  icon?: string;
  resource?: PermissionResource;
};

export const navigation: NavItem[] = [
  { text: "Home", path: "/home", icon: "home" },
  { text: "Companies", path: "/companies", icon: "doc", resource: "companies" },
  { text: "Sites", path: "/sites", icon: "pinmap", resource: "sites" },
  { text: "Departments", path: "/departments", icon: "contains", resource: "departments" },
  { text: "Personnel", path: "/personnel", icon: "group", resource: "personnel" },
  { text: "Products", path: "/products", icon: "product", resource: "products" },
  { text: "Suppliers", path: "/suppliers", icon: "globe", resource: "suppliers" },
  { text: "Stock", path: "/stock", icon: "orderedlist", resource: "stock" },
  { text: "Purchases", path: "/purchases", icon: "cart", resource: "purchases" },
  { text: "Users", path: "/users", icon: "user", resource: "users" },
];
