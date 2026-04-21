import { PrismaClient } from "@prisma/client";

const client = new PrismaClient();

/** Stale generated client or hot-reload cache — regenerate after schema changes. */
const c = client as {
  company?: unknown;
  site?: unknown;
  purchase?: unknown;
};
if (
  typeof c.company === "undefined" ||
  typeof c.site === "undefined" ||
  typeof c.purchase === "undefined"
) {
  throw new Error(
    "Prisma Client is out of date (missing Company/Site/Purchase delegates). " +
      "Stop this process (and any Node using backend/node_modules), run `npx prisma generate` in the backend folder, " +
      "then start the server again. After pulling code, also run `npm run db:deploy` if migrations are new.",
  );
}

export const prisma = client;
