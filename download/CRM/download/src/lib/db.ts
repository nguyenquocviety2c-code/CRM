import { PrismaClient } from "@/generated/prisma";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Lazy-init Prisma client — only creates the client when first accessed.
 * This prevents crashes on serverless platforms (Vercel) where DATABASE_URL
 * may point to a local SQLite file that doesn't exist. The app primarily
 * uses Supabase; Prisma is only for a few legacy routes.
 */
function createPrismaClient(): PrismaClient {
  const adapter = new PrismaLibSql({
    url: process.env.DATABASE_URL || "file:./dev.db",
  });
  return new PrismaClient({ adapter });
}

// Use a Proxy to lazy-init: the client is only created when a property is
// accessed, not at module load time.
export const db = globalForPrisma.prisma ?? new Proxy({} as PrismaClient, {
  get(_, prop) {
    if (!globalForPrisma.prisma) {
      globalForPrisma.prisma = createPrismaClient();
    }
    const value = (globalForPrisma.prisma as Record<string | symbol, unknown>)[prop];
    return typeof value === "function" ? value.bind(globalForPrisma.prisma) : value;
  },
});

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db as PrismaClient;
