-- CreateTable
CREATE TABLE "IntradaySignal" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "theme" TEXT,
    "detectedAt" TEXT NOT NULL,
    "triggerPrice" DOUBLE PRECISION NOT NULL,
    "triggerValue" DOUBLE PRECISION NOT NULL,
    "baselineValue" DOUBLE PRECISION NOT NULL,
    "isBullish" BOOLEAN NOT NULL,
    "hasLowerWick" BOOLEAN NOT NULL,
    "sectorConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'open',
    "exitPrice" DOUBLE PRECISION,
    "exitAt" TEXT,
    "finalPct" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntradaySignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntradaySignal_date_idx" ON "IntradaySignal"("date");

-- CreateIndex
CREATE UNIQUE INDEX "IntradaySignal_date_code_detectedAt_key" ON "IntradaySignal"("date", "code", "detectedAt");
