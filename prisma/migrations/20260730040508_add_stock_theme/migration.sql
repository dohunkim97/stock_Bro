-- CreateTable
CREATE TABLE "StockTheme" (
    "name" TEXT NOT NULL,
    "theme" TEXT NOT NULL,
    "source" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockTheme_pkey" PRIMARY KEY ("name")
);
