# Syndiscore to Switchbox Comprehensive Handover Report

## 1. Executive summary

Form Filler is a multi-tenant business funding application intake platform built for merchant application capture, electronic authorization/signature, signed PDF packet generation, bank statement upload, and Switchbox/lender API delivery.

The product currently supports:

- Merchant-facing multi-step application flow
- Business lookup and address autocomplete enrichment
- Owner identity collection
- TCPA/ESIGN/UETA authorization capture
- Signed application PDF generation, compacted to a two-page packet in normal/full-data cases
- Required bank statement PDF upload flow
- Tenant admin settings for branding, theme, PDF privacy, Switchbox API delivery, document storage, email notifications, and AI chat agent
- S3-compatible object storage for bank statements and signed application PDFs
- CRM/Switchbox delivery queue with retries
- Privacy-aware redaction in the outbound Switchbox/lender API payload and attached signed PDF
- AI-powered live application chat assistant (SYNDIBOT) embedded in the merchant form throughout all steps

## 2. Ownership and repository structure

| Area | Path | Purpose |
|---|---|---|
| Frontend | `packages/frontend` | Next.js merchant/admin UI |
| Backend | `packages/backend` | Express API, Prisma, PDF, CRM delivery |
| Prisma schema | `packages/backend/prisma/schema.prisma` | Database source of truth |
| AI chat agent | `packages/backend/src/services/chatAgent.service.ts` | OpenAI integration, safety layers, next-field logic |
| AI guardrails | `packages/backend/src/services/chatGuardrails.service.ts` | Category classification, field help, funding safety |
| Chat routes | `packages/backend/src/routes/chat.routes.ts` | Pre-app, per-app, and transition chat endpoints |
| Chat UI widget | `packages/frontend/src/components/form/ChatWidget.tsx` | Floating chat bubble + portal mount |
| Chat UI drawer | `packages/frontend/src/components/form/ChatDrawer.tsx` | Message thread, auto-apply logic, form bridge |
| Deployment docs | `docs/digital-ocean-deployment-guide.md` | DO deployment procedure |
| Postman | `docs/formfiller.postman_collection.json` | API collection |
| Postman env | `docs/formfiller.postman_environment.json` | Safe placeholders for variables/secrets |

## 3. Technical architecture

### Frontend

- Framework: Next.js App Router
- Styling: Tailwind CSS and theme-aware global CSS variables
- Main merchant route: `/apply`
- Admin route: `/settings`
- Auth route: `/login`

### Backend

- Framework: Express
- ORM: Prisma
- Database: PostgreSQL
- PDF generation: PDFKit
- Document storage: S3-compatible upload/download service with Postgres fallback
- API delivery: HTTP JSON webhook to tenant Switchbox endpoint or global fallback endpoint

### Data stores

- Postgres stores tenants, users, applications, business/owner/financial/loan/signature data, analytics, audit logs, document metadata/content fallback, tenant settings, and CRM delivery status.
- Object storage stores bank statement PDFs and signed application PDFs when configured.

## 4. Tenant model

Tenants are resolved by:

- Public/merchant endpoints: `x-tenant-slug` header
- Admin endpoints: JWT bearer token, which includes tenant context

The default local/demo tenant slug is `default`.

Tenant settings include branding, theme, PDF privacy, Switchbox delivery credentials, and document storage credentials.

## 5. Merchant application flow

1. Merchant opens `/apply`. The AI chat drawer opens automatically and greets the merchant.
2. Merchant enters contact/business name/state and consents to contact (TCPA). Chat can capture verbal TCPA consent and auto-advance.
3. Backend creates draft application.
4. Business lookup attempts OpenCorporates and Google Places enrichment.
5. Merchant confirms/edits business details. Chat greets with a step-specific message.
6. Merchant selects revenue and requested funding information. Chat guides toward each field.
7. Merchant enters owner/guarantor information.
8. Merchant reviews authorizations and signs electronically.
9. Backend saves signature and marks app `submitted` via `/submit`.
10. Merchant uploads bank statement PDFs.
11. Merchant clicks final **Submit Application**.
12. Backend calls `/finalize`, sets `finalizedAt`, queues Switchbox delivery, generates final signed PDF, and sends package to the configured API.

## 6. Switchbox/lender delivery flow

The only final signed-application API handoff is:

```text
POST /api/applications/:id/finalize
```

The older `/submit` endpoint is intentionally retained only to mark the signed application submitted and move the merchant to bank statement upload. It does **not** push raw application data to Switchbox.

Delivery implementation:

- `enqueueCrmDelivery(applicationId, tenantId)` creates/updates `CrmDelivery`.
- `buildSwitchboxPayload(applicationId)` builds the full outbound payload.
- `generateApplicationPdf(...)` creates the signed PDF attachment with privacy redaction applied.
- Bank statements are always included regardless of the four PDF privacy toggles.
- `pushWebhook(...)` posts JSON to the tenant Switchbox endpoint.

Delivery retry policy:

- Attempts: 4
- Delay schedule: immediate, 1 minute, 5 minutes, 15 minutes
- Success stores `sentAt` and optional `externalAccountId` from response `accountId`.
- Missing Switchbox config marks delivery as `skipped`.

## 7. Outbound Switchbox payload

Event: `application.complete`

Schema version: `1.0`

High-level fields:

- `applicationId`
- `tenantSlug`
- `submittedAt`
- `contact`
- `business`
- `owners`
- `financial`
- `loanRequest`
- `signature`
- `signedApplication`
- `bankStatements[]`

### Privacy-aware redaction

When a PDF Privacy toggle is off, the Switchbox JSON payload sends the related value as `null`, and the signed PDF attachment omits the same information.

| Toggle | JSON fields redacted | PDF redaction |
|---|---|---|
| Show contact email off | `contact.email`, `signature.signerEmail` | Contact email and signer email omitted |
| Show contact phone off | `contact.phone`, `business.phone` | Contact/business phone omitted |
| Show annual revenue off | `financial.annualRevenue` | Annual revenue omitted |
| Show amount requested off | `loanRequest.amountRequested` | Amount requested omitted |

Bank statement files are **not** controlled by these toggles and are still sent to Switchbox.

### Signed application attachment

`signedApplication` includes `mimeType`, `fileName`, base64 `content`, and object-storage metadata when available.

### Bank statement attachments

`bankStatements[]` includes statement month, filename, MIME type, storage metadata, and base64 PDF content when content can be loaded.

## 8. API endpoint inventory

Use `x-tenant-slug: default` or the correct tenant slug on public tenant-aware endpoints. Admin-only endpoints require `Authorization: Bearer {JWT}`.

### Live deployment URLs (DigitalOcean App Platform)

| Service | URL |
|---|---|
| Backend API base | `https://formfiller-backend-wtxtc.ondigitalocean.app` |
| Merchant application form | `https://formfiller-frontend-uasuj.ondigitalocean.app/apply` |
| Admin login | `https://formfiller-frontend-uasuj.ondigitalocean.app/login` |
| Backend health check | `https://formfiller-backend-wtxtc.ondigitalocean.app/health` |

All paths in the tables below are relative to the backend API base. The backend's `ALLOWED_ORIGINS` must include the frontend URL above for cross-origin requests to succeed.

### Health

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | none | Backend health check |

### Auth

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | none | Register admin/agent for tenant |
| POST | `/api/auth/login` | none | Login and receive JWT |

### Tenant settings

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/tenant/settings` | tenant header | Public-safe branding/theme/privacy settings |
| GET | `/api/tenant/settings/admin` | bearer JWT | Full admin settings; secrets masked |
| PATCH | `/api/tenant/settings/admin` | bearer JWT | Update branding/theme/privacy/Switchbox/storage settings |

### Applications

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/applications` | bearer JWT | List tenant applications |
| POST | `/api/applications` | tenant header | Create draft application |
| GET | `/api/applications/:id` | tenant header/JWT | Fetch full application |
| PATCH | `/api/applications/:id/step` | tenant header/JWT | Save current step |
| PATCH | `/api/applications/:id` | tenant header/JWT | Update application flags |
| GET | `/api/applications/:id/documents` | tenant header/JWT | List uploaded documents |
| POST | `/api/applications/:id/documents` | tenant header/JWT | Upload bank statement PDF |
| POST | `/api/applications/:id/bank-help` | tenant header/JWT | Generate bank statement download help |
| POST | `/api/applications/:id/submit` | tenant header/JWT | Mark signed app submitted; no lender push |
| POST | `/api/applications/:id/finalize` | tenant header/JWT | Final submit; enqueue Switchbox delivery |
| GET | `/api/applications/:id/pdf` | tenant header/JWT | Download signed application PDF |

### Form sections

| Method | Path | Auth | Purpose |
|---|---|---|---|
| PUT | `/api/forms/:appId/business` | tenant header/JWT | Save business section |
| PUT | `/api/forms/:appId/owners` | tenant header/JWT | Save owner section |
| PUT | `/api/forms/:appId/financial` | tenant header/JWT | Save financial section |
| PUT | `/api/forms/:appId/loan` | tenant header/JWT | Save loan request section |

### Signature

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/signatures/:appId/sign` | tenant header/JWT | Capture signature and consent acknowledgements |
| GET | `/api/signatures/:appId/signature` | tenant header/JWT | Fetch signature metadata |

### AI chat agent

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/chat/message` | tenant header | Pre-application chat (Step 1, no applicationId yet) |
| POST | `/api/chat/:appId/message` | tenant header/JWT | Per-application chat message |
| POST | `/api/chat/:appId/post-consent-transition` | tenant header/JWT | Fires the post-TCPA-consent transition message on step change |
| GET | `/api/chat/:appId/history` | tenant header/JWT | Fetch stored chat message history (up to 100) |

All chat endpoints require `x-tenant-slug` header. All are rate-limited by `chatLimiter`. If `aiChatEnabled` is `false` in tenant settings, all endpoints return `403`.

### Lookup and analytics

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/business/lookup` | tenant header/JWT | Business lookup by name/state |
| GET | `/api/business/autocomplete` | tenant header/JWT | Address autocomplete |
| GET | `/api/business/place` | tenant header/JWT | Place details |
| POST | `/api/analytics/:appId/events` | tenant header/JWT | Ingest UX/friction analytics |
| GET | `/api/analytics/:appId/summary` | bearer JWT | Per-application analytics summary |
| GET | `/api/analytics/tenant/friction` | bearer JWT | Tenant aggregate analytics |

## 9. Security architecture

### Authentication and authorization

- Admin settings and analytics reporting require JWT bearer auth.
- Merchant flow uses tenant slug + application IDs for guest continuation.
- Tenant scoping is enforced in queries using `tenantId`.
- Settings secrets are write-only/masked in admin responses.

### Secret handling

- Real secrets must live in DigitalOcean encrypted env vars, tenant settings, or Switchbox password manager.
- Do not commit real `DATABASE_URL`, `JWT_SECRET`, `ENCRYPTION_KEY`, API keys, storage secrets, or Switchbox credentials.
- Storage secret access keys are encrypted before database storage.
- Switchbox API key is treated as write-only in settings responses.

### Data protection

- SSNs are encrypted before storage.
- Bank statements and signed PDFs should be stored in private object storage for production.
- Database fallback for PDFs exists but should not be the preferred production mode.
- CORS is controlled by `ALLOWED_ORIGINS`.
- Rate limiting exists on authentication, business lookup, address autocomplete, and bank-help flows.

### Auditability

- Application creation, step transitions, document uploads, signing, submission, and finalization generate audit log entries.
- `CrmDelivery` records delivery status, attempts, errors, timestamps, and external account IDs.
- Signature records store signer name/email, IP address, user agent, consent text, acknowledgement flags, timestamp, and signature image.

## 10. Compliance posture

This product supports compliance workflows but final legal/compliance approval belongs to Switchbox.

### ESIGN and UETA

Implemented support:

- Electronic signature capture
- Explicit electronic signature and communication consent acknowledgement
- Stored consent text
- Stored signer name/email/IP/user agent/timestamp
- Signed PDF evidence packet

### TCPA / communications consent

Implemented support:

- Step 1 contact consent
- Consent language covering phone, email, and text contact
- Marketing/contact consent timestamp
- Consent text preserved in signature record/PDF

### GLBA-supporting controls

Implemented/supporting controls:

- Encryption for SSN values
- Private object storage recommendation for statements/PDFs
- Tenant-scoped access controls
- Audit logs
- Configurable redaction before lender handoff
- CORS allowlist
- Secret masking/write-only settings fields

Switchbox should still confirm its own GLBA Safeguards Rule program requirements, retention policy, vendor risk process, incident response, and access review cadence.

### Privacy / lender redaction

The PDF Privacy toggles support broker/lender forwarding controls. Redaction applies to both JSON payload and signed PDF attachment generated for the lender API payload.

### Records and retention

Not fully policy-defined in code. Switchbox must define how long to retain applications, bank statements, audit/signature evidence, backups, and deletion requests.

## 11. Credential register

Real credential values must be transferred outside the repo. The table below documents what Switchbox must own and where values are used.

| Credential | Required | Owner | Used by | Storage location |
|---|---:|---|---|---|
| DigitalOcean account access | yes | Switchbox | Deployment/admin | Switchbox password manager |
| Managed Postgres `DATABASE_URL` | yes | Switchbox/DO | Backend env | DO App Platform encrypted env |
| `JWT_SECRET` | yes | Switchbox | Backend auth | DO encrypted env |
| `ENCRYPTION_KEY` | yes | Switchbox | SSN/storage-secret encryption | DO encrypted env |
| `ALLOWED_ORIGINS` | yes | Switchbox | CORS | DO env |
| OpenCorporates API key | optional | Switchbox | Business lookup | DO encrypted env |
| Google Places API key | optional | Switchbox | Address autocomplete | DO encrypted env |
| OpenAI API key | **yes for AI chat** | Switchbox | AI chat agent (gpt-4o by default) | DO encrypted env |
| Switchbox API endpoint | yes for delivery | Switchbox | Tenant settings or env fallback | `/settings` or DO env |
| Switchbox API key | yes for delivery | Switchbox | Tenant settings or env fallback | `/settings` write-only or DO env |
| Spaces/S3 access key ID | recommended | Switchbox | Document storage | `/settings` or password manager |
| Spaces/S3 secret access key | recommended | Switchbox | Document storage | `/settings` encrypted/write-only |
| Spaces/S3 bucket name | recommended | Switchbox | Document storage | `/settings` |

## 12. Postman handoff

Files:

- `docs/formfiller.postman_collection.json`
- `docs/formfiller.postman_environment.json`

The environment file ships with the live DigitalOcean URLs preset for `backend_base_url`/`frontend_base_url`, plus `backend_base_url_local`/`frontend_base_url_local` for local development. All secrets remain placeholders. Before use, Switchbox should import it and set local/current values for tenant slug, auth token, admin credentials, Switchbox API credentials, and storage credentials.

Do not export real current values back into the repository.

## 13. Known operational notes

- The final account/package creation in Switchbox happens after bank statement upload finalization, not immediately at signature.
- If Switchbox needs earlier account creation plus later document upload, implement a two-stage Switchbox integration: privacy-aware account create at signature, then document attach after upload/finalize.
- Bank statement PDFs always remain part of the Switchbox package regardless of PDF Privacy toggles.
- Existing previously generated PDFs are not retroactively changed by privacy/layout updates; regenerate/download after changes.
- Current signed PDF output is designed to fit in two pages under normal full-data conditions.

## 14. Immediate next steps after DigitalOcean deployment

1. Enter real Switchbox endpoint/API key in `/settings`.
2. Enter real storage bucket credentials in `/settings`.
3. Enter OpenAI API key as `OPENAI_API_KEY` in DO encrypted env vars (required for AI chat).
4. Optionally configure AI persona name and system prompt override in `/settings`.
5. Run full application smoke test including the AI chat flow.
6. Verify Switchbox receives JSON payload, signed PDF, and bank statements.
7. Verify privacy toggles redaction with all toggles off.
8. Confirm `CrmDelivery.status = sent` and external account ID mapping.
9. Production URLs are recorded in Section 8 (Live deployment URLs); update resource names and credential owner references as ownership transfers.

---

## 15. AI chat agent (SYNDIBOT)

### Overview

The AI chat assistant is embedded in the merchant form from the moment `/apply` loads. It auto-opens on page load and remains accessible via the "💬 Need help? Chat now" bubble after being closed. The drawer uses a scrollbar-hidden overflow area so the UI stays clean.

The assistant's core job is to:

- Guide the merchant through each form field without ever quoting rates, terms, payments, or funding amounts.
- Silently qualify leads by detecting signals like startup status, low revenue, or stated credit issues.
- Push every conversation toward completing and signing the application.

### Architecture

```
Merchant browser
  └── ChatWidget.tsx          Portal-mounted bubble + open/close state
        └── ChatDrawer.tsx    Message thread, auto-apply bridge, form state reader
              │
              ├── POST /api/chat/message                  (pre-application, Step 1)
              ├── POST /api/chat/:appId/message           (Steps 2–5)
              └── POST /api/chat/:appId/post-consent-transition  (TCPA → Step 2 handoff)

Backend
  └── chat.routes.ts
        └── chatAgent.service.ts       OpenAI call, next-field logic, safety enforcement
              └── chatGuardrails.service.ts   Category detection, field help, funding safety
```

### Chat flow by step

| Step | Behavior |
|---|---|
| Step 1 (pre-application) | Intro message on load. Chat answers questions, can capture verbal TCPA consent and auto-advance the form. Uses `POST /api/chat/message` (no appId yet). |
| Step 1 → Step 2 transition | `POST /api/chat/:appId/post-consent-transition` fires after TCPA consent. Tells merchant to review business details and answer Home Based Business. |
| Step 2 (business details) | If Google/lookup data was found, chat greets with a data-review message. AI then guides each field in order. |
| Steps 3–5 | AI reads `nextField` from server and asks targeted questions per field. Auto-applies simple answers directly into form state. |

### Auto-apply bridge

`ChatDrawer` evaluates every AI reply's `nextField` metadata and checks `shouldAutoApplyFieldAnswer()` before accepting user input as a field value. Rules:

- Hostile/profane messages are rejected before any field write.
- Industry answers must exactly match a value in the `INDUSTRIES` constant.
- Phone numbers are normalized to 10 digits before being written to state.
- SSN, DOB, and other sensitive fields are never accepted via chat.

### Guardrail system (`chatGuardrails.service.ts`)

**Step 1 — Category classification**

Every inbound message is classified into one of 11 categories:

| Category | Examples |
|---|---|
| `rate_cost` | "what's the rate?", "how much are payments?" |
| `approval_qualification` | "will I get approved?", "am I eligible?" |
| `credit` | "do you do a hard pull?", "bad credit ok?" |
| `documents_bank` | "how do I upload?", "do I need statements?" |
| `process_timeline` | "how long does this take?", "what happens next?" |
| `trust_security` | "is this a scam?", "is my data safe?" |
| `signing` | "what am I signing?", "what does authorization mean?" |
| `competitor_comparison` | "can you beat another offer?", "I'm shopping around" |
| `frustration` | "why so many questions?", "this is a waste of time" |
| `product_education` | "what is an MCA?", "do you do SBA loans?" |
| `field_help` | Direct questions about the current form field |

The category and any matching field-help guidance are injected into the OpenAI system prompt so the AI responds appropriately without being given free rein over sensitive topics.

**Step 2 — Qualification signal extraction**

Signals are extracted silently and stored in metadata on the `ChatMessage` record. They do not affect the merchant-facing response. Signals include:

- `startup_or_pre_revenue` — business just opened, no revenue yet
- `low_revenue` — stated revenue below thresholds
- `credit_concern` — stated low or bad credit
- `high_nsf` — mentions of NSF or overdrafts
- `tax_lien` — mentions of liens, back taxes, IRS issues
- `bankruptcy` — stated or implied bankruptcy
- `industry_restricted` — cannabis, gambling, adult content
- `existing_mca_stack` — already has MCA advances

**Step 3 — Final safety enforcement (`enforceFundingResponseSafety`)**

After the OpenAI response is generated, a final regex pass runs against the assistant reply. If any forbidden pattern is found, the entire reply is replaced with a hard-coded no-quote message. Patterns checked:

| Issue type | Pattern examples |
|---|---|
| `dollar_amount` | "$50,000", "50k", "fifty thousand dollars" |
| `rate_or_percent` | "12%", "APR", "factor rate", "buy rate" |
| `term_length` | "12 months", "6 weeks" |
| `payment_structure` | "daily payments", "weekly remittance" |
| `approval_promise` | "you are approved", "you're qualified" |
| `specific_offer` | "your offer is", "the rate is", "term is" |

**Bypass exceptions** (to prevent false positives):

- `isAnnualRevenueMathGuidance` — when `nextField` is `financial.annualRevenue` and the AI is doing revenue math (e.g. "$30k × 12 = $360k"), dollar amounts are allowed through.
- `isOwnershipPctAcknowledgement` — when `nextField` is `owner.ownershipPct` and the only flagged issue is a percentage echo (e.g. "82% ownership noted"), the block is skipped.

**Sensitive input redaction**

Before the user message reaches OpenAI, it is scanned for SSN-like patterns, DOB-like patterns, and full 9-digit EIN strings (unless the current `nextField` expects an EIN answer). Redacted input triggers a dedicated safe reply instead of passing to OpenAI.

**Opt-out / hostile message handling**

Messages containing phrases like "fuck off", "stop", "shut up", or "go away" are treated as opt-out requests. The assistant sends a polite exit message, sets `chatStopped = true` in the drawer, and disables the input for the session. These messages are also blocked from ever being auto-applied to form fields.

### Tenant-level AI configuration

AI chat settings live in `TenantSettings` and are configurable at `/settings` (admin panel) or directly via `PATCH /api/tenant/settings/admin`.

| Setting | DB column | Default | Description |
|---|---|---|---|
| Enable/disable | `aiChatEnabled` | `true` | If `false`, all `/api/chat/*` endpoints return 403 |
| Persona name | `aiPersonaName` | `"Funding Assistant"` | Name the AI uses to introduce itself |
| System prompt override | `aiSystemPromptOverride` | `null` | Replaces the entire default SYNDIBOT system prompt. Max 5,000 chars. |
| Eligibility rules | `aiEligibilityRules` | `null` | Reserved JSONB field for future rule-based qualification |
| OpenAI model | `aiModel` | `"gpt-4o"` | Any OpenAI chat model string. Falls back to `gpt-4o` if null. |

If `OPENAI_API_KEY` is not set in the environment, the backend falls back to a canned static reply instead of calling OpenAI. The flow still works end-to-end; the assistant just gives generic guidance.

### Database schema additions (migration `20260525130000_add_ai_chat_agent`)

```sql
-- TenantSettings additions
ALTER TABLE "TenantSettings"
  ADD COLUMN "aiChatEnabled"          BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "aiPersonaName"          TEXT DEFAULT 'Funding Assistant',
  ADD COLUMN "aiSystemPromptOverride" TEXT,
  ADD COLUMN "aiEligibilityRules"     JSONB,
  ADD COLUMN "aiModel"                TEXT;

-- Application additions
ALTER TABLE "Application"
  ADD COLUMN "disqualifiedAt"           TIMESTAMP(3),
  ADD COLUMN "disqualificationReason"   TEXT,
  ADD COLUMN "homeBasedBusiness"        BOOLEAN,
  ADD COLUMN "ownerHomeSameAsBusiness"  BOOLEAN;

-- ChatMessage table (new)
CREATE TABLE "ChatMessage" (
  id              TEXT PRIMARY KEY,
  tenantId        TEXT NOT NULL,
  applicationId   TEXT,          -- null for pre-application messages
  role            TEXT NOT NULL, -- 'user' | 'assistant' | 'system'
  content         TEXT NOT NULL,
  metadata        JSONB,         -- qualification signals, nextField, etc.
  createdAt       TIMESTAMP(3) DEFAULT now()
);
```

### Key implementation files

| File | Responsibility |
|---|---|
| `chatAgent.service.ts` | `createChatReply`, `createPreApplicationChatReply`, `createPostConsentTransitionReply`, OpenAI call, next-field determination, sensitive input redaction, opt-out detection |
| `chatGuardrails.service.ts` | `evaluateChatGuardrails`, `enforceFundingResponseSafety`, `extractQualificationSignals`, category classification, field help guidance, funding safety patterns |
| `chat.routes.ts` | Express router for all four chat endpoints with rate limiting and tenant guard |
| `ChatDrawer.tsx` | Message rendering, auto-apply bridge, `shouldAutoApplyFieldAnswer`, hostile message detection, industry validation, pre-app message persistence in localStorage |
| `ChatWidget.tsx` | Portal mount, open/close state (starts open on load), `autoOpen` prop for step transitions |
| `MultiStepForm.tsx` | `handleChatFieldAnswer`, `handleChatNavigateToField`, `handleAutoPopulate`, phone normalization, hostile input guard |