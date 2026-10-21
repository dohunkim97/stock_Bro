-- CreateTable
CREATE TABLE "TradeJournalEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "costBasis" DOUBLE PRECISION,
    "realizedPnl" DOUBLE PRECISION,
    "realizedPnlPct" DOUBLE PRECISION,
    "holdingDays" INTEGER,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeJournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TradeJournalEntry_userId_date_idx" ON "TradeJournalEntry"("userId", "date");

-- AddForeignKey
ALTER TABLE "TradeJournalEntry" ADD CONSTRAINT "TradeJournalEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
