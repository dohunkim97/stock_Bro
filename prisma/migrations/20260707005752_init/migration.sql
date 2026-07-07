-- CreateTable
CREATE TABLE "StockMaster" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "price" TEXT NOT NULL,
    "changePct" REAL NOT NULL
);

-- CreateTable
CREATE TABLE "DailyEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TEXT NOT NULL,
    "listType" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "sector" TEXT NOT NULL,
    "price" TEXT NOT NULL,
    "changePct" REAL NOT NULL,
    "volume" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "StockMaster_name_key" ON "StockMaster"("name");

-- CreateIndex
CREATE UNIQUE INDEX "StockMaster_code_key" ON "StockMaster"("code");

-- CreateIndex
CREATE INDEX "DailyEntry_date_listType_idx" ON "DailyEntry"("date", "listType");
