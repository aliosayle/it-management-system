/** Sidebar navigation. Use only icon names from DevExtreme Fluent (e.g. folder, map, group — not "building"). */

export type NavItem = {
  text: string;
  /** Route path for leaves (must start with `/`). Group headers use internal keys like `__nav_group_*`. */
  path?: string;
  icon?: string;
  items?: NavItem[];
};

export const navigation: NavItem[] = [
  {
    text: "Organization",
    path: "__nav_group_org",
    icon: "folder",
    items: [
      { text: "Companies", path: "/companies", icon: "doc" },
      { text: "Sites", path: "/sites", icon: "pinmap" },
      { text: "Departments", path: "/departments", icon: "contains" },
      { text: "Personnel", path: "/personnel", icon: "group" },
    ],
  },
  {
    text: "Inventory",
    path: "__nav_group_inv",
    icon: "box",
    items: [
      { text: "Products", path: "/products", icon: "product" },
      { text: "Suppliers", path: "/suppliers", icon: "globe" },
      { text: "Stock", path: "/stock", icon: "orderedlist" },
      { text: "Purchases", path: "/purchases", icon: "cart" },
    ],
  },
  {
    text: "Administration",
    path: "__nav_group_adm",
    icon: "preferences",
    items: [{ text: "Users", path: "/users", icon: "user" }],
  },
];
