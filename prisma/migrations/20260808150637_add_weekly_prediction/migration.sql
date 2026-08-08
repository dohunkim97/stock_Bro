-- CreateTable
CREATE TABLE "WeeklyPrediction" (
    "id" TEXT NOT NULL,
    "forWeekKey" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "sectors" TEXT NOT NULL,
    "candidates" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyPrediction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyPrediction_forWeekKey_key" ON "WeeklyPrediction"("forWeekKey");
