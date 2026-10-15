-- CreateTable
CREATE TABLE "LearningProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "currentDay" INTEGER NOT NULL DEFAULT 1,
    "lastPushDate" TEXT,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningJournalEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "marketRegime" TEXT,
    "company" TEXT,
    "companyCode" TEXT,
    "thesis" TEXT,
    "bullish" TEXT,
    "bearish" TEXT,
    "invalidation" TEXT,
    "learnings" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearningJournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LearningProgress_userId_key" ON "LearningProgress"("userId");

-- CreateIndex
CREATE INDEX "LearningJournalEntry_userId_idx" ON "LearningJournalEntry"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LearningJournalEntry_userId_date_key" ON "LearningJournalEntry"("userId", "date");

-- AddForeignKey
ALTER TABLE "LearningProgress" ADD CONSTRAINT "LearningProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningJournalEntry" ADD CONSTRAINT "LearningJournalEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
