import { PrismaClient } from "@prisma/client";

const client = new PrismaClient();

/** Stale generated client or hot-reload cache — regenerate after schema changes. */
if (
  typeof (client as { company?: unknown }).company === "undefined" ||
  typeof (client as { site?: unknown }).site === "undefined"
) {
  throw new Error(
    "Prisma Client is missing Company/Site models. Stop this process (and any Node using backend/node_modules), " +
      "run `npx prisma generate` in the backend folder, then start the server again.",
  );
}

export const prisma = client;
