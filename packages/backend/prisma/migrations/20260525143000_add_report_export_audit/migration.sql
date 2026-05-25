-- CreateTable
CREATE TABLE "ReportExportAudit" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "reportType" TEXT NOT NULL,
    "includeSensitive" BOOLEAN NOT NULL DEFAULT false,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportExportAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReportExportAudit_createdAt_idx" ON "ReportExportAudit"("createdAt");

-- CreateIndex
CREATE INDEX "ReportExportAudit_userId_idx" ON "ReportExportAudit"("userId");

-- AddForeignKey
ALTER TABLE "ReportExportAudit" ADD CONSTRAINT "ReportExportAudit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;