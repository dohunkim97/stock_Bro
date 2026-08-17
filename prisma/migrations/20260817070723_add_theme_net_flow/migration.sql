-- CreateTable
CREATE TABLE "ThemeNetFlow" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "theme" TEXT NOT NULL,
    "foreignNet" DOUBLE PRECISION NOT NULL,
    "institutionNet" DOUBLE PRECISION NOT NULL,
    "individualNet" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThemeNetFlow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ThemeNetFlow_date_code_key" ON "ThemeNetFlow"("date", "code");
