-- AlterTable
ALTER TABLE "ExpenseRecord" ADD COLUMN     "installmentGroupId" TEXT,
ADD COLUMN     "installmentIndex" INTEGER,
ADD COLUMN     "installmentMonths" INTEGER;

-- AlterTable
ALTER TABLE "PortfolioHolding" ADD COLUMN     "buyDate" TEXT;

-- CreateIndex
CREATE INDEX "ExpenseRecord_installmentGroupId_idx" ON "ExpenseRecord"("installmentGroupId");
