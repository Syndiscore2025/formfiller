-- AI chat agent foundation: tenant controls, application disqualification markers,
-- and tenant/application-scoped chat history.

ALTER TABLE "TenantSettings"
ADD COLUMN "aiChatEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "aiPersonaName" TEXT DEFAULT 'Funding Assistant',
ADD COLUMN "aiSystemPromptOverride" TEXT,
ADD COLUMN "aiEligibilityRules" JSONB,
ADD COLUMN "aiModel" TEXT;

ALTER TABLE "Application"
ADD COLUMN "disqualifiedAt" TIMESTAMP(3),
ADD COLUMN "disqualificationReason" TEXT,
ADD COLUMN "homeBasedBusiness" BOOLEAN,
ADD COLUMN "ownerHomeSameAsBusiness" BOOLEAN;

CREATE TABLE "ChatMessage" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChatMessage_tenantId_applicationId_createdAt_idx"
ON "ChatMessage"("tenantId", "applicationId", "createdAt");

CREATE INDEX "ChatMessage_applicationId_createdAt_idx"
ON "ChatMessage"("applicationId", "createdAt");

ALTER TABLE "ChatMessage"
ADD CONSTRAINT "ChatMessage_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatMessage"
ADD CONSTRAINT "ChatMessage_applicationId_fkey"
FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;