import { PrismaClient } from "@prisma/client";

/**
 * Prisma client singleton.
 *
 * A single instance is reused across hot reloads (Next dev) and within the
 * worker process to avoid exhausting database connections. This module is
 * shared by both the Next server runtime and the standalone worker, so it
 * avoids `server-only`.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
