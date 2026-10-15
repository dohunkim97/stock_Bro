-- AlterTable
ALTER TABLE "User" ADD COLUMN     "investmentPrinciples" TEXT;

-- CreateTable
CREATE TABLE "HoldingThesis" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "invalidation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HoldingThesis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HoldingThesis_userId_code_key" ON "HoldingThesis"("userId", "code");

-- AddForeignKey
ALTER TABLE "HoldingThesis" ADD CONSTRAINT "HoldingThesis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
