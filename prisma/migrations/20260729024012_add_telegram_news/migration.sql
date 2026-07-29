-- CreateTable
CREATE TABLE "TelegramNews" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "messageId" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "link" TEXT,
    "sourceName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramNews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TelegramNews_chatId_messageId_key" ON "TelegramNews"("chatId", "messageId");
