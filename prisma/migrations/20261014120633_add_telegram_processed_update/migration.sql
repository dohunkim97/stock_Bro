-- CreateTable
CREATE TABLE "TelegramProcessedUpdate" (
    "updateId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramProcessedUpdate_pkey" PRIMARY KEY ("updateId")
);
