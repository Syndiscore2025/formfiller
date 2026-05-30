-- Tenant-level visibility toggle for the owner estimated credit score field.
ALTER TABLE "TenantSettings"
ADD COLUMN "showEstimatedCreditScore" BOOLEAN NOT NULL DEFAULT true;