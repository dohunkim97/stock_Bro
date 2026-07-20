/*
  Warnings:

  - Added the required column `updatedAt` to the `StockMaster` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "StockMaster" ADD COLUMN     "debtRatio" TEXT,
ADD COLUMN     "industry" TEXT,
ADD COLUMN     "marketCap" TEXT,
ADD COLUMN     "pbr" TEXT,
ADD COLUMN     "per" TEXT,
ADD COLUMN     "quoteDate" TEXT,
ADD COLUMN     "revenue" TEXT,
ADD COLUMN     "roe" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
