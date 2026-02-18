-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "contactFirstName" TEXT,
ADD COLUMN     "contactLastName" TEXT,
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "tcpaConsentStep1" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tcpaConsentStep1At" TIMESTAMP(3),
ADD COLUMN     "warmLeadSentAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Application_status_tcpaConsentStep1_warmLeadSentAt_lastActi_idx" ON "Application"("status", "tcpaConsentStep1", "warmLeadSentAt", "lastActivityAt");
