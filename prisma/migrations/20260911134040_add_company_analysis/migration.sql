-- CreateTable
CREATE TABLE "CompanyAnalysis" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "reportName" TEXT NOT NULL,
    "reportUrl" TEXT NOT NULL,
    "rawJson" TEXT NOT NULL,
    "sourceFile" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyAnalysis_pkey" PRIMARY KEY ("code")
);
