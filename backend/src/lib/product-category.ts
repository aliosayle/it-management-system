import { prisma } from "./prisma.js";

const MAX_LABEL = 128;

/** Persist a non-empty product category label so it appears in future pickers. */
export async function rememberProductCategory(label: string | undefined | null): Promise<void> {
  const normalized = typeof label === "string" ? label.trim() : "";
  if (!normalized || normalized.length > MAX_LABEL) {
    return;
  }
  try {
    await prisma.productCategory.upsert({
      where: { label: normalized },
      create: { label: normalized },
      update: {},
    });
  } catch {
    /* ignore races / DB issues — product save still succeeded */
  }
}

/** Labels saved in ProductCategory plus every distinct non-empty Product.category. */
export async function listAllSavedCategoryLabels(): Promise<string[]> {
  const [registered, grouped] = await Promise.all([
    prisma.productCategory.findMany({
      select: { label: true },
      orderBy: { label: "asc" },
    }),
    prisma.product.groupBy({
      by: ["category"],
    }),
  ]);
  const set = new Set<string>();
  for (const r of registered) {
    const t = r.label.trim();
    if (t) set.add(t);
  }
  for (const g of grouped) {
    const t = g.category.trim();
    if (t) set.add(t);
  }
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}
