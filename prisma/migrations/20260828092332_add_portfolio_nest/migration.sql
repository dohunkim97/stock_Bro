-- CreateTable
CREATE TABLE "PortfolioSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "totalSeed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cashAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bondAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "altAssetAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "targetStockPct" DOUBLE PRECISION NOT NULL DEFAULT 60,
    "targetBondPct" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "targetAltPct" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "targetCashPct" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioHolding" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "buyPrice" DOUBLE PRECISION NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortfolioHolding_pkey" PRIMARY KEY ("id")
);
