-- Tenant-level custom frontend/headless API configuration.
-- Raw public frontend keys are never stored; only a SHA-256 hash and preview.
ALTER TABLE "TenantSettings"
ADD COLUMN "customFrontendEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "customFrontendPublicKeyHash" TEXT,
ADD COLUMN "customFrontendKeyPreview" TEXT,
ADD COLUMN "customFrontendAllowedOrigins" JSONB,
ADD COLUMN "customFrontendAllowedRedirects" JSONB;