-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN     "userId" TEXT;

-- CreateIndex
CREATE INDEX "ChatMessage_userId_date_idx" ON "ChatMessage"("userId", "date");

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
