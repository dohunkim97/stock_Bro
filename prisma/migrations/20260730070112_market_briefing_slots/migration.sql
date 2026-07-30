-- DropIndex
DROP INDEX "MarketBriefing_date_key";

-- AlterTable
ALTER TABLE "MarketBriefing" ADD COLUMN     "slot" TEXT NOT NULL DEFAULT 'close';

-- CreateIndex
CREATE UNIQUE INDEX "MarketBriefing_date_slot_key" ON "MarketBriefing"("date", "slot");
