-- CreateTable
CREATE TABLE "PortfolioAssessment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "totalScore" INTEGER NOT NULL,
    "signals" TEXT NOT NULL,
    "avgBuyPrice" DOUBLE PRECISION NOT NULL,
    "currentPrice" DOUBLE PRECISION NOT NULL,
    "changePct" DOUBLE PRECISION,
    "weightPct" DOUBLE PRECISION,
    "recoveryNeededPct" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortfolioAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PortfolioAssessment_userId_date_idx" ON "PortfolioAssessment"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioAssessment_userId_code_date_key" ON "PortfolioAssessment"("userId", "code", "date");

-- AddForeignKey
ALTER TABLE "PortfolioAssessment" ADD CONSTRAINT "PortfolioAssessment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
