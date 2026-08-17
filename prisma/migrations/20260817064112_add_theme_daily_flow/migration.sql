-- AlterTable
ALTER TABLE "StockTheme" ADD COLUMN     "code" TEXT;

-- CreateTable
CREATE TABLE "ThemeDailyFlow" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "theme" TEXT NOT NULL,
    "tradingValue" TEXT NOT NULL,
    "changePct" DOUBLE PRECISION NOT NULL,
    "marketCap" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThemeDailyFlow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ThemeDailyFlow_date_code_key" ON "ThemeDailyFlow"("date", "code");
