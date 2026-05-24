-- AlterTable
ALTER TABLE "TenantSettings" ADD COLUMN     "pdfShowAmountRequested" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "pdfShowAnnualRevenue" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "pdfShowContactEmail" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "pdfShowContactPhone" BOOLEAN NOT NULL DEFAULT true;
