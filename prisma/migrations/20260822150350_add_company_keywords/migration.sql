-- CreateTable
CREATE TABLE "CompanyKeywords" (
    "code" TEXT NOT NULL,
    "keywords" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyKeywords_pkey" PRIMARY KEY ("code")
);
