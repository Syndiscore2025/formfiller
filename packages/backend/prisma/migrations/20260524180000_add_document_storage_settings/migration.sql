-- Tenant-level S3-compatible document storage settings.
ALTER TABLE "TenantSettings"
ADD COLUMN "documentStorageProvider" TEXT DEFAULT 'database',
ADD COLUMN "documentStorageEndpoint" TEXT,
ADD COLUMN "documentStorageRegion" TEXT,
ADD COLUMN "documentStorageBucket" TEXT,
ADD COLUMN "documentStoragePrefix" TEXT,
ADD COLUMN "documentStorageAccessKeyId" TEXT,
ADD COLUMN "documentStorageSecretAccessKey" TEXT,
ADD COLUMN "documentStoragePublicBaseUrl" TEXT;

-- Application documents can now live in object storage instead of Postgres bytes.
ALTER TABLE "ApplicationDocument"
ALTER COLUMN "content" DROP NOT NULL,
ADD COLUMN "storageProvider" TEXT,
ADD COLUMN "storageBucket" TEXT,
ADD COLUMN "storageKey" TEXT,
ADD COLUMN "storageUrl" TEXT,
ADD COLUMN "storageEtag" TEXT;

CREATE INDEX "ApplicationDocument_storageProvider_idx" ON "ApplicationDocument"("storageProvider");