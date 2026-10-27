-- CreateTable
CREATE TABLE "HoldingEventLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "HoldingEventLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HoldingEventLog_userId_code_idx" ON "HoldingEventLog"("userId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "HoldingEventLog_userId_eventKey_key" ON "HoldingEventLog"("userId", "eventKey");

-- AddForeignKey
ALTER TABLE "HoldingEventLog" ADD CONSTRAINT "HoldingEventLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

