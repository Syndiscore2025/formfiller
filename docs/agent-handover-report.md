# Agent Handover Report — FormFiller / Syndiscore

> **Purpose:** This document is the single source of truth for any AI coding agent or developer picking up this project. Read it fully before making any changes. It reflects the exact state of the codebase as of the last update.

---

## 1. Project Identity

**Product:** A white-label merchant funding application platform.
**Client:** Syndiscore / Switchbox
**Repo:** `https://github.com/Syndiscore2025/formfiller`
**Branch:** `main`
**Monorepo root:** `c:\Users\rakin\formfiller\formfiller`

A **tenant** (e.g. a funding broker or ISO) embeds the merchant form on their site. Merchants fill out a multi-step application. When complete, the signed application + bank statements are delivered to the tenant's Switchbox CRM endpoint via webhook.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js + Express + TypeScript |
| ORM | Prisma (PostgreSQL) |
| Frontend | Next.js 14 (App Router, `use client`) |
| Styling | Tailwind CSS (dark-first design system) |
| PDF generation | PDFKit (streaming) |
| Email | Nodemailer (SMTP, per-tenant config) |
| Encryption | AES-256-GCM via `crypto` (Node built-in) |
| Auth | JWT (jsonwebtoken) |
| AI | OpenAI (`gpt-4o-mini` default, configurable) |
| Validation | Zod (backend) |
| Rate limiting | express-rate-limit |
| Document storage | Database (Bytes) or S3-compatible (DigitalOcean Spaces / AWS S3) |

---

## 3. Repository Structure

```
formfiller/
├── packages/
│   ├── backend/
│   │   ├── prisma/
│   │   │   ├── schema.prisma          # Single source of truth for DB
│   │   │   └── migrations/            # 13 applied migrations
│   │   └── src/
│   │       ├── app.ts                 # Express app setup, middleware, routes
│   │       ├── server.ts              # Entry point, DB connect, starts jobs
│   │       ├── config.ts              # All env vars in one place
│   │       ├── jobs/
│   │       │   └── abandonmentDetector.ts  # Background job (warm lead + email)
│   │       ├── middleware/
│   │       │   ├── auth.ts            # requireAuth / optionalAuth / requireTenant
│   │       │   ├── errorHandler.ts
│   │       │   ├── rateLimiter.ts
│   │       │   └── validate.ts        # Zod middleware
│   │       ├── routes/
│   │       │   ├── applications.routes.ts  # Core application CRUD + docs + PDF
│   │       │   ├── auth.routes.ts          # Login/register
│   │       │   ├── analytics.routes.ts     # Field event tracking
│   │       │   ├── einLookup.routes.ts     # EIN / business lookup (OpenCorporates + Google)
│   │       │   ├── formSections.routes.ts  # Step data (business, owner, financial, loan)
│   │       │   ├── signature.routes.ts     # e-Signature (ESIGN/UETA compliant)
│   │       │   └── tenant.routes.ts        # Public + admin settings
│   │       ├── services/
│   │       │   ├── auditLog.service.ts
│   │       │   ├── bankHelp.service.ts     # OpenAI + web scraping for bank instructions
│   │       │   ├── businessLookup.service.ts
│   │       │   ├── crm.service.ts          # Switchbox webhook delivery + retry
│   │       │   ├── documentStorage.service.ts  # DB or S3 upload/download
│   │       │   ├── email.service.ts        # Nodemailer + 3 template scenarios
│   │       │   ├── googlePlaces.service.ts
│   │       │   └── pdf.service.ts          # PDFKit 2-page signed application PDF
│   │       └── utils/
│   │           ├── asyncHandler.ts
│   │           ├── encryption.ts      # AES-256-GCM encrypt/decrypt
│   │           ├── industry.ts
│   │           └── industryCodes.ts
│   └── frontend/
│       └── src/
│           ├── app/
│           │   ├── apply/             # Merchant form entry point
│           │   ├── login/             # JWT login page
│           │   ├── settings/          # Admin settings (no auth required)
│           │   └── layout.tsx + globals.css
│           ├── components/
│           │   ├── form/              # Multi-step form components
│           │   ├── settings/          # Settings panel sections
│           │   └── ui/               # Shared UI primitives
│           ├── hooks/
│           │   ├── useAnalytics.ts
│           │   ├── useAuth.ts
│           │   └── useTheme.ts
│           ├── lib/
│           │   └── api.ts             # Typed fetch wrapper (sends x-tenant-slug)
│           └── types/
│               └── application.ts
├── docs/
│   ├── agent-handover-report.md           # This file
│   ├── syndiscore-switchbox-handover-report.md  # Client-facing handover
│   ├── digital-ocean-deployment-guide.md
│   ├── tenant-settings-foundation.md      # Future form builder spec
│   ├── formfiller.postman_collection.json
│   └── formfiller.postman_environment.json
└── package.json                           # npm workspaces root
```


---

## 4. Local Development Setup

### Backend `.env` (in `packages/backend/`)
```
DATABASE_URL=postgresql://USER:PASS@localhost:5433/formfiller
JWT_SECRET=<long random string>
ENCRYPTION_KEY=<32-byte hex string — AES-256-GCM>
NODE_ENV=development
PORT=4000
ALLOWED_ORIGINS=http://localhost:3002
FRONTEND_URL=http://localhost:3002
OPENCORPORATES_API_KEY=   # optional
GOOGLE_PLACES_API_KEY=    # optional
OPENAI_API_KEY=           # required for bank-help and future AI agent
OPENAI_MODEL=gpt-4o-mini  # default
CRM_WEBHOOK_URL=          # optional (Switchbox endpoint)
CRM_API_KEY=              # optional (Switchbox bearer token)
```

### Frontend `.env.local` (in `packages/frontend/`)
```
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_TENANT_SLUG=default
```

### Run locally
```bash
# Backend
cd packages/backend && npm run build && node dist/server.js

# Frontend (separate terminal)
cd packages/frontend && npm run build && npx next start -p 3002
```

### Migrations
```bash
cd packages/backend
npx prisma migrate dev --name <description>
```

---

## 5. Database Schema — All Models

### Tenant
One per broker/ISO. `slug` (unique) is sent by frontend as `x-tenant-slug` header to scope every request.

### TenantSettings (1-to-1 with Tenant, ~60 fields)
| Group | Key fields |
|---|---|
| Branding | `companyName`, `legalBusinessName`, `logoUrl`, `companyEmail`, `companyPhone`, `companyAddress` |
| Theme | `theme` (dark/light), `accentColor`, `surfaceColor` |
| PDF Privacy | `pdfShowContactEmail`, `pdfShowContactPhone`, `pdfShowAnnualRevenue`, `pdfShowAmountRequested` — all default true; when false, field is redacted from lender PDF |
| Post-completion | `websiteUrl` (redirect), `supportEmail` |
| Switchbox CRM | `switchboxApiUrl`, `switchboxApiKey` (AES-encrypted) |
| Document Storage | `documentStorageProvider` (database\|s3), endpoint, region, bucket, prefix, access key, `documentStorageSecretAccessKey` (AES-encrypted), publicBaseUrl |
| SMTP | `smtpHost`, `smtpPort`, `smtpSecure`, `smtpUser`, `smtpPass` (AES-encrypted), `smtpFrom`, `smtpFromName` |
| Email: Abandoned | `emailAbandonedEnabled`, `emailAbandonedDelayMinutes` (default 1440=24h), subject, body, includeLogo, includeSig |
| Email: No Banks | `emailNoBanksEnabled`, subject, body, includeLogo, includeSig |
| Email: Insufficient Banks | `emailInsufficientBanksEnabled`, `emailMinBankStatements` (default 3), subject, body, includeLogo, includeSig |

**Write-only rule:** `switchboxApiKey`, `documentStorageSecretAccessKey`, `smtpPass` are NEVER returned to the frontend. API returns only `switchboxApiKeyConfigured: boolean`, `documentStorageSecretConfigured: boolean`, `smtpPassConfigured: boolean`.

### Application
| Field | Notes |
|---|---|
| `status` | `draft` → `submitted` → finalized |
| `currentStep` | 1–8 |
| `completionPct` | `(currentStep - 1) * 20` |
| `tcpaConsentStep1` / `tcpaConsentStep1At` | TCPA consent at step 1 |
| `lastActivityAt` | Touched on every API call; drives abandonment logic |
| `warmLeadSentAt` | Set after Switchbox warm-lead push (15 min inactivity) |
| `abandonedEmailSentAt` | Set after abandonment email fires (per-tenant minutes delay) |
| `finalizedAt` | Set when merchant clicks Submit on bank statements screen |

### BusinessInfo (1-to-1)
`legalName`, `dba`, `entityType`, `industry`, `stateOfFormation`, `ein`, `businessStartDate`, `phone`, `website`, address fields, `sicCode`, `naicsCode`, `autoPopulated` (JSON — data prefilled from OpenCorporates/Google)

### OwnerInfo (1-to-many, by `ownerIndex`)
`firstName`, `lastName`, `email`, `phone`, `ownershipPct`, `ssnEncrypted` (AES-256-GCM), `dateOfBirth` (YYYY-MM-DD string), `creditScore`, address fields

### FinancialInfo (1-to-1)
`annualRevenue` (dropdown range string e.g. `"100k-250k"`). Other fields deprecated, kept for backwards compat.

### LoanRequest (1-to-1)
`amountRequested` (dropdown range string e.g. `"50k-100k"`), `purpose`, `urgency`, `termPreference`

### Signature (1-to-1)
`signatureData` (base64 canvas PNG), `signerName`, `signerEmail`, `ipAddress`, `userAgent`, `consentText` (full legal text stored verbatim), `signedAt`, `marketingConsent`, `marketingConsentTimestamp`

### ApplicationDocument
One row per bank statement. `statementMonth` format `YYYY-MM`. File stored as `content` (Bytes) in DB **OR** via S3 keys (`storageProvider`, `storageBucket`, `storageKey`, `storageUrl`, `storageEtag`) — never both at once.

### CrmDelivery (1-to-1)
`status`: pending/sent/failed/skipped. Max 4 attempts, retry delays: 0s, 1m, 5m, 15m. Stores `payload` JSON snapshot for debugging.

### BankHelpCache
AI-generated bank statement download instructions per normalized bank name. Prevents repeated OpenAI calls.

### AnalyticsEvent
`field_focus`, `field_blur`, `typing_pause`, `field_revisit` events. Used to build heatmaps sent to Switchbox with warm leads.

### AuditLog
Immutable append-only. Actions: `APPLICATION_CREATED`, `STEP_N_REACHED`, `APPLICATION_UPDATED`, `APPLICATION_SIGNED`, `APPLICATION_SUBMITTED`, `APPLICATION_FINALIZED`, `BANK_STATEMENT_UPLOADED`, `BANK_HELP_LOOKUP`.


---

## 6. API Endpoints — Complete Reference

All routes prefixed with `/api`. Every request must include `x-tenant-slug` header (or a valid JWT). JSON body only.

### Auth — `/api/auth`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/login` | None | Returns JWT. Body: `{ email, password }` |
| POST | `/register` | None | Creates user+tenant. Body: `{ email, password, tenantName, tenantSlug }` |

### Applications — `/api/applications`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | requireAuth | List all applications for tenant |
| POST | `/` | guest | Create new draft. Body: `{ contactFirstName, contactLastName, contactEmail, contactPhone, tcpaConsent: true }` |
| GET | `/:id` | guest | Full application with all relations |
| PATCH | `/:id` | guest | Update `hasAdditionalOwners` |
| PATCH | `/:id/step` | guest | Update `currentStep` (1–8). Recalculates `completionPct` |
| GET | `/:id/documents` | guest | List uploaded bank statements (metadata only) |
| POST | `/:id/documents` | guest | Upload bank statement PDF. Body: `{ statementMonth, fileName, mimeType, fileData (base64) }` |
| POST | `/:id/bank-help` | guest | AI lookup for bank statement download instructions. Body: `{ bankName, bankUrl? }`. Rate-limited. Cached in `BankHelpCache`. |
| POST | `/:id/submit` | guest | Mark application `submitted`. Requires signature to exist. |
| POST | `/:id/finalize` | guest | Final submit on bank statements screen. Sets `finalizedAt`, enqueues CRM delivery. Requires `status = submitted`. |
| GET | `/:id/pdf` | guest | Stream signed PDF (applies tenant PDF privacy toggles) |

### Form Sections — `/api/forms`
All guest-accessible. Each upserts the relevant related model.
| Method | Path | Body |
|---|---|---|
| PUT | `/:id/business` | BusinessInfo fields |
| PUT | `/:id/owner/:index` | OwnerInfo fields (SSN is encrypted before storage) |
| PUT | `/:id/financial` | `{ annualRevenue }` |
| PUT | `/:id/loan` | `{ amountRequested, purpose, urgency, termPreference }` |

### Signatures — `/api/signatures`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/:appId/sign` | guest | Create signature. Requires `consentAcknowledged`, `marketingConsent`, `applicationAuthorizationAcknowledged`, `esignAndCommunicationConsent` all `true`. Idempotent-safe (errors 409 if already signed). |
| GET | `/:appId/signature` | guest | Returns signature metadata (no signatureData blob) |

### Analytics — `/api/analytics`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/:id/events` | guest | Record field interaction events. Body: `{ events: [{ fieldName, eventType, durationMs, metadata }] }` |

### Business Lookup — `/api/business`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/ein/:ein` | guest | OpenCorporates EIN lookup |
| GET | `/search` | guest | Google Places business search. Query: `?name=&address=` |

### Tenant — `/api/tenant`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/settings` | none | Public branding/theme subset. Never returns secrets. |
| GET | `/settings/admin` | none (x-tenant-slug) | Full settings. Secrets returned as `*Configured: boolean` only. |
| PATCH | `/settings/admin` | none (x-tenant-slug) | Upsert all settings. Secrets encrypted before storage. |

> **Note:** Admin settings endpoints use `optionalAuth + requireTenant` — they require a valid `x-tenant-slug` header but no JWT login. This is intentional for local/admin access.

### Health
| Method | Path | Auth |
|---|---|---|
| GET | `/health` | None |

---

## 7. Services

### `crm.service.ts`
- `enqueueCrmDelivery(applicationId, tenantId)` — creates CrmDelivery record, fires async delivery with retry (4 attempts, 0/1m/5m/15m)
- `buildSwitchboxPayload(applicationId)` — builds full outbound JSON including base64 PDF, base64 bank statements, all application data, tenant branding
- `pushWarmLeadToSwitchbox(payload)` — sends warm lead (incomplete application with analytics heatmap) to Switchbox
- `buildHeatmap(applicationId)` — aggregates AnalyticsEvents into per-field friction data

### `pdf.service.ts`
- `generateApplicationPdf(data, branding?, visibility?)` — returns a PDFKit `ReadableStream` of a 2-page signed application PDF
- Applies `PdfVisibility` toggles: if `showContactEmail=false`, that field is replaced with "Redacted"
- Always generates exactly 2 pages for a complete application

### `email.service.ts`
- `sendAbandonedEmail(settings, to, ctx)` — only fires if `emailAbandonedEnabled=true` and SMTP configured
- `sendNoBanksEmail(settings, to, ctx)` — for zero-statement submissions
- `sendInsufficientBanksEmail(settings, to, ctx)` — for below-minimum submissions
- All use Nodemailer, decrypt `smtpPass` at send time, render HTML with optional logo and signature block
- Template placeholders: `{firstName}`, `{companyName}`, `{applicationUrl}`, `{uploadedCount}`, `{requiredCount}`

### `documentStorage.service.ts`
- `uploadTenantDocument(...)` — routes to DB or S3 based on `documentStorageProvider` setting
- `downloadTenantDocument(tenantId, storageKey)` — retrieves from S3 using tenant credentials
- S3 credentials are decrypted at runtime

### `bankHelp.service.ts`
- `generateBankStatementHelp({ bankName, bankUrl? })` — checks `BankHelpCache` first, then uses OpenAI + web scraping to generate step-by-step instructions for downloading bank statements
- Rate-limited at the route level (`bankHelpLimiter`)

### `businessLookup.service.ts` / `googlePlaces.service.ts`
- EIN lookup via OpenCorporates API
- Business name/address search via Google Places API
- Results drive the `autoPopulated` JSON field on BusinessInfo

### `auditLog.service.ts`
- `writeAuditLog({ applicationId, action, actor, ipAddress, details })` — appends to AuditLog

### `encryption.ts`
- `encrypt(plaintext)` — AES-256-GCM, returns `iv:authTag:ciphertext` (hex colon-separated)
- `decrypt(ciphertext)` — reverses the above
- `ENCRYPTION_KEY` env var must be set; if empty, encryption operations throw


---

## 8. Background Jobs

### `abandonmentDetector.ts` — started in `server.ts` on boot

Two independent loops, both running every 5 minutes:

**Loop 1 — Warm Lead Push (Switchbox CRM)**
- Cutoff: 15 minutes of inactivity
- Criteria: `status=draft`, `tcpaConsentStep1=true`, `warmLeadSentAt=null`, has full contact info
- Action: builds analytics heatmap → pushes to Switchbox → sets `warmLeadSentAt`
- First run: 30 seconds after boot

**Loop 2 — Abandonment Email**
- Cutoff: per-tenant `emailAbandonedDelayMinutes` (default 1440 = 24h)
- Criteria: `status=draft`, `tcpaConsentStep1=true`, `abandonedEmailSentAt=null`, SMTP configured for tenant
- Action: calls `sendAbandonedEmail()` → sets `abandonedEmailSentAt`
- First run: 60 seconds after boot
- Only queries tenants where `emailAbandonedEnabled=true` AND `smtpHost` AND `smtpFrom` are set

Both are idempotent — the sentinel fields (`warmLeadSentAt`, `abandonedEmailSentAt`) prevent re-sending.

---

## 9. Frontend Architecture

### Pages
| Route | File | Auth | Purpose |
|---|---|---|---|
| `/apply` | `app/apply/page.tsx` | None | Merchant form entry — renders `MultiStepForm` |
| `/settings` | `app/settings/page.tsx` | None | Admin settings panel — no login required |
| `/login` | `app/login/page.tsx` | None | JWT login for legacy agent access |
| `/` | `app/page.tsx` | None | Redirects to `/apply` |

### Form Steps (8 steps)
1. **Contact & TCPA** — name, email, phone, consent checkbox
2. **Business Confirm** — EIN lookup + Google Places prefill, merchant confirms legal name/address
3. **Business Details** — entity type, industry, state, start date, website
4. **Revenue** — annual revenue dropdown (range buckets)
5. **Loan Request** — amount, purpose, urgency, term preference
6. **Owner Details** — name, DOB, SSN, address, ownership %, credit score
7. **Review & Sign** — full application review + e-signature canvas + consent checkboxes
8. **Bank Statements** — upload PDFs per month, bank-help AI lookup, final Submit button

### Key Components
- `MultiStepForm.tsx` — master orchestrator, holds all form state, calls APIs
- `ApplyFormClient.tsx` — client wrapper for the apply page
- `BankStatementUpload.tsx` — step 8, handles uploads + bank-help lookup
- `CompletionOverlay.tsx` — shown after finalization, handles redirect
- `Step2ConfirmBusiness.tsx` — EIN/Google prefill flow
- `Step8ReviewSign.tsx` — signature canvas + consent

### Settings Components
- `SettingsForm.tsx` — master form with `AdminSettings` interface, handles save
- `BrandingSection.tsx` — logo, company info
- `ThemeSection.tsx` — dark/light, accent/surface colors
- `IntegrationSection.tsx` — Switchbox API URL + key
- `DocumentStorageSection.tsx` — S3/database toggle + S3 credentials
- `EmailNotificationsSection.tsx` — SMTP config + 3 email template cards

### API Client (`lib/api.ts`)
- Always sends `x-tenant-slug` header (from `NEXT_PUBLIC_TENANT_SLUG` env var)
- Optionally sends `Authorization: Bearer <token>` if token provided
- Sanitizes error messages — never exposes Prisma errors to users

### Hooks
- `useAuth.ts` — JWT token management (localStorage)
- `useTheme.ts` — applies `theme`, `accentColor`, `surfaceColor` CSS vars from tenant settings
- `useAnalytics.ts` — field event tracking (focus, blur, pause, revisit)

---

## 10. Security Architecture

### Authentication Middleware (3 tiers)
1. `requireAuth` — valid JWT required; sets `req.userId`, `req.tenantId`, `req.role`
2. `optionalAuth` — extracts JWT if present; otherwise resolves tenant from `x-tenant-slug`; never blocks
3. `requireTenant` — must follow `optionalAuth`; rejects if `req.tenantId` still unset

### Tenant Isolation
- Every DB query includes `tenantId: req.tenantId!` in the `where` clause
- Guest applicants (merchants) are scoped by `x-tenant-slug` header → tenant lookup → `tenantId`
- No cross-tenant data access is possible at the query level

### Encryption
- AES-256-GCM via Node.js built-in `crypto`
- Encrypted fields: `OwnerInfo.ssnEncrypted`, `TenantSettings.switchboxApiKey`, `TenantSettings.documentStorageSecretAccessKey`, `TenantSettings.smtpPass`
- Format: `hex(iv):hex(authTag):hex(ciphertext)` — all three components stored together
- `ENCRYPTION_KEY` env var must be a consistent 32-byte hex string across all deployments

### CORS
- Configured origins only (`ALLOWED_ORIGINS` env var + dev localhost ports)
- `credentials: true` — required for cookie-based flows if added later

### Rate Limiting
- Global limiter on all routes
- Additional `bankHelpLimiter` on `POST /:id/bank-help` (OpenAI call — expensive)

### Secrets — write-only pattern
Admin settings API never returns raw secret values. Always returns boolean `*Configured` flags. Secrets are only decrypted in-process at the moment of use (SMTP send, S3 upload, CRM push).

### PDF Privacy Toggles
When a tenant sets `pdfShowContactEmail=false`, the merchant's email is replaced with "Redacted" in the PDF that gets base64-encoded and sent to the lender via Switchbox. The raw data still exists in the DB — only the delivered document is redacted.

---

## 11. Multi-Tenant Model

- **Tenant** = one broker/ISO/partner
- **TenantSettings** = all their configuration (branding, SMTP, CRM, storage)
- **Applications** are scoped to a tenant — merchants never see each other's data
- The frontend `NEXT_PUBLIC_TENANT_SLUG` env var determines which tenant the form represents
- For white-label deployments: each tenant gets their own frontend deployment with their own slug
- The backend is shared across all tenants; isolation is enforced at the query level

---

## 12. Migration History (chronological)

| Migration | What it added |
|---|---|
| `20260218132103_init` | All initial models: Tenant, User, Application, Business, Owner, Financial, LoanRequest, Signature, Analytics |
| `20260218152255_add_contact_and_warm_lead_tracking` | `contactFirstName/LastName/Email/Phone`, `warmLeadSentAt`, `lastActivityAt` on Application |
| `20260218161837_micro_step_flow` | `currentStep`, `completionPct`, `tcpaConsent*` fields |
| `20260327120000_add_application_documents` | `ApplicationDocument` model |
| `20260327153000_add_bank_help_cache` | `BankHelpCache` model |
| `20260524111348_add_tenant_settings_and_crm_delivery` | `TenantSettings`, `CrmDelivery`, `AuditLog` models |
| `20260524123301_add_application_finalized_at` | `finalizedAt` on Application |
| `20260524133942_add_pdf_privacy_toggles` | 4 `pdfShow*` boolean fields on TenantSettings |
| `20260524140747_add_tenant_theme` | `theme`, `accentColor`, `surfaceColor` on TenantSettings |
| `20260524172725_add_smtp_email_templates` | All SMTP + email template fields on TenantSettings (29 fields) |
| `20260524180000_add_document_storage_settings` | S3-compatible document storage fields on TenantSettings |
| `20260525113258_add_abandoned_email_sent_at` | `abandonedEmailSentAt` on Application |
| `20260525113843_rename_delay_hours_to_minutes` | Renamed `emailAbandonedDelayHours` → `emailAbandonedDelayMinutes`, default 1440 |


---

## 13. What Has Been Built (Completed Features)

### ✅ Multi-Step Merchant Application Form (8 steps)
Full React/Next.js form capturing all data needed for a merchant cash advance application. Steps: Contact → Business Confirm → Business Details → Revenue → Loan Request → Owner Details → Review & Sign → Bank Statements.

### ✅ EIN / Business Lookup Auto-fill
Step 2 queries OpenCorporates (EIN) and Google Places (name/address) to pre-populate business fields. Result stored in `autoPopulated` JSON on BusinessInfo.

### ✅ e-Signature with ESIGN/UETA Compliance
Canvas signature captured on step 7. Full consent text stored verbatim. IP, user agent, and timestamp recorded. Consent checkboxes required: TCPA (step 1), marketing, application authorization, e-sign communication.

### ✅ PDF Generation (PDFKit)
2-page signed application PDF generated on demand. Applies per-tenant privacy toggles to redact fields before lender delivery.

### ✅ Bank Statement Uploads (S3 or DB)
Step 8 accepts PDF uploads per statement month. Stored in the database (Bytes) or S3-compatible storage (DigitalOcean Spaces / AWS S3) based on tenant configuration.

### ✅ AI Bank Statement Help
`POST /:id/bank-help` — merchant types their bank name, AI returns step-by-step instructions for downloading statements. Cached in `BankHelpCache` per bank. Rate-limited. Falls back gracefully if OpenAI unavailable.

### ✅ Switchbox CRM Delivery
On finalization: full JSON payload (including base64 PDF + bank statements) POSTed to Switchbox webhook. Up to 4 retry attempts with escalating delays (0s/1m/5m/15m). Tracked in `CrmDelivery` with status and payload snapshot.

### ✅ Warm Lead Push (Abandonment → CRM)
Background job fires 15 minutes after last activity on a draft application. Sends partial application data + field interaction heatmap to Switchbox so the broker can follow up.

### ✅ Abandonment Email
Background job fires after per-tenant configurable delay (default 24h). Sends templated email to the merchant with a link to resume their application. Fully idempotent.

### ✅ Admin Settings Panel (`/settings`)
Full UI for tenant configuration: branding, theme, Switchbox CRM, S3 document storage, SMTP credentials, and 3 email templates (abandoned, no banks, insufficient banks). Accessible without JWT — uses `x-tenant-slug` header. Write-only fields shown as configured/not-configured toggles.

### ✅ Analytics / Field Heatmap
Frontend tracks `field_focus`, `field_blur`, `typing_pause`, `field_revisit` events. Aggregated into per-field heatmap sent to Switchbox with warm lead data. Useful for product analytics.

### ✅ Audit Log
Immutable append-only log of all significant application lifecycle events.

---

## 14. What Is Being Planned Next — AI Form Agent

### Overview
The next major feature is an **AI chat widget** embedded in the merchant form. Its goal: increase application completion rates by actively helping merchants fill out the form, prompting them at the right moments, and gracefully disqualifying ineligible applicants before they waste time completing a full application.

**No human agent handoff is needed at this stage.** The AI handles everything.

### Planned Capabilities

#### A. Contextual Form Assistance
- Floating chat bubble available throughout all 8 steps
- Merchant can ask questions like "What does 'state of formation' mean?" or "I don't know my EIN"
- AI has full context of which step the merchant is on and which fields are already filled
- AI uses the conversation + current form state as its context window

#### B. Proactive Prompts (AI-initiated)
- AI watches which step the merchant is on and proactively surfaces help:
  - Step 7 (Review & Sign): "It looks like everything is ready — please scroll down to sign your application"
  - Step 8 (Bank Statements): "You'll need to upload your last 3 months of bank statements. Would you like instructions for [detected bank name]?"
- Step transitions can trigger a pre-configured prompt without merchant typing anything

#### C. AI-Assisted Pre-fill (suggest-first)
- AI can suggest filling specific form fields based on what the merchant says in chat
- E.g., merchant says "my revenue is about $300k a year" → AI suggests: "I can pre-fill the annual revenue field with '250k-500k' — shall I?"
- Merchant confirms → field is filled via a JS bridge into React form state
- Never auto-fills silently; always confirm-first for trust/UX

#### D. Bank Statement Help (enhanced)
- If merchant types "I don't know how to download my statement":
  - AI asks which bank they use
  - Calls the existing `bank-help` endpoint to fetch cached/AI-generated instructions
  - Returns the instructions in the chat

#### E. Disqualification Logic
- AI checks merchant responses against eligibility rules defined per-tenant:
  - Time in business (e.g., must be > 6 months)
  - Annual revenue (e.g., must be > $10k/month)
  - Business type (e.g., no startups, no restricted industries)
- If merchant reveals they are ineligible, AI politely communicates this and ends the application flow
- Disqualification reason is logged on the application record

### Planned Technical Design

#### New DB Models Needed
```
ChatMessage
  id            String   @id
  applicationId String
  role          String   -- "user" | "assistant"
  content       String
  metadata      Json?    -- e.g. { action: "fill_field", field: "annualRevenue", value: "250k-500k" }
  createdAt     DateTime

Application (additions)
  disqualifiedAt     DateTime?
  disqualifiedReason String?
```

#### New API Routes Needed
```
POST /api/chat/:appId/message
  Body: { message: string, currentStep: number, formSnapshot: object }
  Returns: { reply: string, action?: { type: "fill_field"|"disqualify", ... } }

GET /api/chat/:appId/history
  Returns: ChatMessage[]
```

#### New Frontend Components Needed
- `ChatWidget.tsx` — floating bubble (bottom-right), opens chat drawer
- `ChatDrawer.tsx` — message thread, input field, typing indicator
- JS bridge in `MultiStepForm.tsx` — listens for `fill_field` actions from chat, applies to form state
- Proactive trigger system — `MultiStepForm` emits step-change events → `ChatWidget` receives and may auto-send a prompt

#### System Prompt Design
The AI system prompt will include:
1. Tenant persona (company name, tone)
2. Current form step and step descriptions
3. Current form field values (sanitized snapshot — no SSN, no sensitive data)
4. Eligibility rules (configurable per-tenant, stored in TenantSettings)
5. Available actions: `fill_field`, `disqualify`, `suggest_bank_help`
6. Instructions to always respond in plain language, never technical jargon

#### AI Model
- **Live chat:** `gpt-4o-mini` (fast, cheap, fits well within token budgets)
- **Response format:** structured JSON `{ reply: string, action?: object }` via function calling or `response_format: json_object`
- **Future nightly analysis:** `o1-mini` or similar reasoning model for behavioral pattern analysis across sessions (not yet planned for implementation)

### Tenant Configuration to Add (TenantSettings)
```
aiChatEnabled          Boolean  @default(false)
aiPersonaName          String?  -- e.g. "Alex from Syndiscore"
aiSystemPromptOverride String?  -- replaces default system prompt if set
aiEligibilityRules     Json?    -- { minMonthsInBusiness: 6, minAnnualRevenue: 120000, ... }
aiModel                String?  -- defaults to gpt-4o-mini
```

---

## 15. Key Rules for the Next Agent

1. **Never modify the schema without a migration.** Always run `npx prisma migrate dev --name <description>` after changing `schema.prisma`. Never edit migration SQL files directly.

2. **Never return secrets to the frontend.** `switchboxApiKey`, `documentStorageSecretAccessKey`, `smtpPass` are encrypted in the DB. Return only `*Configured: boolean`. Decrypt only in-process at the point of use.

3. **Always scope DB queries by `tenantId`.** Every Prisma query on tenant-owned data must include `where: { tenantId: req.tenantId! }`. Violating this would allow cross-tenant data leakage.

4. **The `/settings` admin routes do not require JWT.** They use `optionalAuth + requireTenant`. The `x-tenant-slug` header is the access control mechanism for admin access. This is intentional.

5. **Bank statements are stored in DB or S3, never both.** The `documentStorage.service.ts` routes based on `documentStorageProvider`. When S3 is used, `content` (Bytes) on the ApplicationDocument row is null and vice versa.

6. **Abandonment jobs are idempotent.** Never re-send a warm lead or abandonment email. Check `warmLeadSentAt` and `abandonedEmailSentAt` before acting. Set them immediately after a successful send.

7. **PDF privacy toggles are applied at generation time.** The raw field values always exist in the DB. Only the generated PDF (delivered to lenders) has redactions.

8. **SSNs are always stored encrypted.** `OwnerInfo.ssnEncrypted` is the field name — it contains the AES-256-GCM ciphertext, not plaintext. Never log, return, or expose SSN values.

9. **The AI chat agent (when built) must never auto-fill fields.** Always use suggest-first UX. The merchant must confirm before any field is populated by AI.

10. **The `ENCRYPTION_KEY` env var must be identical across all deployments** (dev, staging, prod). Changing it will break decryption of all existing stored secrets.

11. **Form step numbers are 1-indexed.** `currentStep` 1 = Contact, 8 = Bank Statements. `completionPct = (currentStep - 1) * 20`.

12. **`lastActivityAt` is the abandonment clock.** It is set on every API call that touches an application. Do not forget to update it in new routes that handle form data.

---

## 16. Deployment Notes

The project is designed for deployment on **DigitalOcean** (App Platform or Droplet):
- Backend: Node.js app on port 4000
- Frontend: Next.js on port 3002 (or behind a proxy on 80/443)
- Database: Managed PostgreSQL (DigitalOcean)
- Document storage: DigitalOcean Spaces (S3-compatible)
- SMTP: Any provider (SendGrid, Mailgun, Gmail SMTP, etc.) configured per-tenant via admin panel

See `docs/digital-ocean-deployment-guide.md` for step-by-step deployment instructions.

**Environment variables required in production:**
- All variables listed in Section 4 above
- `NODE_ENV=production`
- `FRONTEND_URL=https://<your-domain>` — critical for abandonment email links
- `ENCRYPTION_KEY` — must match the key used when secrets were originally stored

---

*Last updated: 2026-05-25. Reflects the full codebase state as of the Email SMTP + Abandonment Job implementation. Next planned work: AI Chat Agent (Section 14).*
