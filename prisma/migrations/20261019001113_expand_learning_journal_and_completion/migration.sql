-- AlterTable
ALTER TABLE "LearningJournalEntry" ADD COLUMN     "businessStructure" TEXT,
ADD COLUMN     "dataToCheck" TEXT,
ADD COLUMN     "disclosureNote" TEXT,
ADD COLUMN     "earningsChange" TEXT,
ADD COLUMN     "marketCause" TEXT,
ADD COLUMN     "nextDayCheck" TEXT,
ADD COLUMN     "priceMoveReason" TEXT,
ADD COLUMN     "volumeSupplyNote" TEXT;

-- AlterTable
ALTER TABLE "LearningProgress" ADD COLUMN     "lastCompletedDate" TEXT;
