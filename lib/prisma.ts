import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { runtimeDbUrl } from "@/lib/db-url";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  // Preview 배포는 Preview 전용 DB만(lib/db-url.ts). 운영·로컬은 POSTGRES_PRISMA_URL ?? DATABASE_URL 그대로.
  // process.env.GOLGOO_BUILD_VERCEL_ENV는 빌드 때 next.config.ts의 env로 값이 박힌다(이 글자 그대로 써야 치환됨).
  const connectionString = runtimeDbUrl({ ...process.env, GOLGOO_BUILD_VERCEL_ENV: process.env.GOLGOO_BUILD_VERCEL_ENV });
  const adapter = new PrismaPg(connectionString);
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
