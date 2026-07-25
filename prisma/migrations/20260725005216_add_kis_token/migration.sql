-- AlterTable
ALTER TABLE "StockMaster" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "KisToken" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "accessToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KisToken_pkey" PRIMARY KEY ("id")
);
