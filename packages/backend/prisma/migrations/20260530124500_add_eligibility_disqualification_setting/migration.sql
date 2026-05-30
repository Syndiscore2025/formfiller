-- Allows brokers to keep collecting applications even when a merchant states
-- no revenue, startup/pre-revenue status, or less than one month in business.
ALTER TABLE "TenantSettings"
ADD COLUMN "eligibilityDisqualificationEnabled" BOOLEAN NOT NULL DEFAULT true;