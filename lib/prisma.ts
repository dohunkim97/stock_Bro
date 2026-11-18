import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { runtimeDbUrl } from "@/lib/db-url";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  // Preview 배포는 Preview 전용 DB만(lib/db-url.ts). 운영·로컬은 POSTGRES_PRISMA_URL ?? DATABASE_URL 그대로.
  const connectionString = runtimeDbUrl();
  const adapter = new PrismaPg(connectionString);
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
