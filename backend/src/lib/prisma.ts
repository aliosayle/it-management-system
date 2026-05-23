import { PrismaClient } from "@prisma/client";

const client = new PrismaClient();

/** Stale generated client or hot-reload cache — regenerate after schema changes. */
const c = client as {
  company?: unknown;
  site?: unknown;
  purchase?: unknown;
  productCategory?: unknown;
};
if (
  typeof c.company === "undefined" ||
  typeof c.site === "undefined" ||
  typeof c.purchase === "undefined" ||
  typeof c.productCategory === "undefined"
) {
  throw new Error(
    "Prisma Client is out of date (missing expected model delegates such as ProductCategory). " +
      "Stop this process (and any Node using backend/node_modules), run `npx prisma generate` in the backend folder, " +
      "then start the server again. After pulling code, run `npx prisma migrate deploy` then `npx prisma generate`.",
  );
}

export const prisma = client;
