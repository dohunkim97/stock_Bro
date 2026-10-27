-- CreateTable
CREATE TABLE "HoldingAlertRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stockCode" TEXT NOT NULL,
    "stockName" TEXT NOT NULL,
    "alertType" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "marketDataAsOf" TEXT,
    "portfolioDataAsOf" TEXT NOT NULL,
    "previousSeverity" TEXT,
    "currentSeverity" TEXT NOT NULL,
    "previousRiskScore" INTEGER,
    "currentRiskScore" INTEGER NOT NULL,
    "currentPrice" DOUBLE PRECISION NOT NULL,
    "previousClose" DOUBLE PRECISION,
    "dailyChangePct" DOUBLE PRECISION,
    "avgBuyPrice" DOUBLE PRECISION NOT NULL,
    "holdingQuantity" DOUBLE PRECISION NOT NULL,
    "unrealizedReturnPct" DOUBLE PRECISION,
    "portfolioWeight" DOUBLE PRECISION,
    "technicalSnapshot" TEXT NOT NULL,
    "volumeSnapshot" TEXT NOT NULL,
    "flowSnapshot" TEXT NOT NULL,
    "financialSnapshot" TEXT NOT NULL,
    "sectorSnapshot" TEXT NOT NULL,
    "newsEvidence" TEXT NOT NULL,
    "triggerReasons" TEXT NOT NULL,
    "actionScenarios" TEXT NOT NULL,
    "portfolioSnapshot" TEXT NOT NULL,
    "dataQuality" TEXT NOT NULL,
    "analysisVersion" TEXT NOT NULL,
    "deliveryStatus" TEXT NOT NULL DEFAULT 'pending',

    CONSTRAINT "HoldingAlertRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HoldingAlertRecord_userId_generatedAt_idx" ON "HoldingAlertRecord"("userId", "generatedAt");

-- AddForeignKey
ALTER TABLE "HoldingAlertRecord" ADD CONSTRAINT "HoldingAlertRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

