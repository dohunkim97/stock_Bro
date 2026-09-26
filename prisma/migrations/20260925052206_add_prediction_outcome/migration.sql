-- AlterTable
ALTER TABLE "WeeklyPrediction" ADD COLUMN     "filtered" TEXT;

-- CreateTable
CREATE TABLE "PredictionOutcome" (
    "id" TEXT NOT NULL,
    "forDate" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "entryPrice" DOUBLE PRECISION NOT NULL,
    "targetPrice" DOUBLE PRECISION,
    "stopPrice" DOUBLE PRECISION,
    "outcome" TEXT NOT NULL,
    "exitDay" INTEGER,
    "exitPrice" DOUBLE PRECISION,
    "realizedPct" DOUBLE PRECISION,
    "closePct" DOUBLE PRECISION,
    "targetTouchDay" INTEGER,
    "stopTouchDay" INTEGER,
    "mfePct" DOUBLE PRECISION,
    "maePct" DOUBLE PRECISION,
    "features" TEXT NOT NULL,
    "verdicts" TEXT,
    "resolvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PredictionOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PredictionOutcome_forDate_idx" ON "PredictionOutcome"("forDate");

-- CreateIndex
CREATE UNIQUE INDEX "PredictionOutcome_forDate_code_key" ON "PredictionOutcome"("forDate", "code");
