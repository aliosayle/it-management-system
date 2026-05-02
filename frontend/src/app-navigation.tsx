/** Sidebar navigation — single flat list (paths must start with `/`). Icon names: DevExtreme Fluent set. */

export type NavItem = {
  text: string;
  path: string;
  icon?: string;
};

export const navigation: NavItem[] = [
  { text: "Home", path: "/home", icon: "home" },
  { text: "Companies", path: "/companies", icon: "doc" },
  { text: "Sites", path: "/sites", icon: "pinmap" },
  { text: "Departments", path: "/departments", icon: "contains" },
  { text: "Personnel", path: "/personnel", icon: "group" },
  { text: "Products", path: "/products", icon: "product" },
  { text: "Suppliers", path: "/suppliers", icon: "globe" },
  { text: "Stock", path: "/stock", icon: "orderedlist" },
  { text: "Purchases", path: "/purchases", icon: "cart" },
  { text: "Users", path: "/users", icon: "user" },
];
