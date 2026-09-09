-- CreateTable
CREATE TABLE "PeriodAnalysis" (
    "id" TEXT NOT NULL,
    "periodType" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "candidateHitRate" DOUBLE PRECISION,
    "results" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PeriodAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PeriodAnalysis_periodType_periodKey_key" ON "PeriodAnalysis"("periodType", "periodKey");
