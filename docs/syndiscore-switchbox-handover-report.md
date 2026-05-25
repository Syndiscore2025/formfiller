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
- Tenant admin settings for branding, theme, PDF privacy, Switchbox API delivery, and document storage
- S3-compatible object storage for bank statements and signed application PDFs
- CRM/Switchbox delivery queue with retries
- Privacy-aware redaction in the outbound Switchbox/lender API payload and attached signed PDF

## 2. Ownership and repository structure

| Area | Path | Purpose |
|---|---|---|
| Frontend | `packages/frontend` | Next.js merchant/admin UI |
| Backend | `packages/backend` | Express API, Prisma, PDF, CRM delivery |
| Prisma schema | `packages/backend/prisma/schema.prisma` | Database source of truth |
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

1. Merchant opens `/apply`.
2. Merchant enters contact/business name/state and consents to contact.
3. Backend creates draft application.
4. Business lookup attempts OpenCorporates and Google Places enrichment.
5. Merchant confirms/edits business details.
6. Merchant selects revenue and requested funding information.
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
| OpenAI API key | optional | Switchbox | Bank help instructions | DO encrypted env |
| Switchbox API endpoint | yes for delivery | Switchbox | Tenant settings or env fallback | `/settings` or DO env |
| Switchbox API key | yes for delivery | Switchbox | Tenant settings or env fallback | `/settings` write-only or DO env |
| Spaces/S3 access key ID | recommended | Switchbox | Document storage | `/settings` or password manager |
| Spaces/S3 secret access key | recommended | Switchbox | Document storage | `/settings` encrypted/write-only |
| Spaces/S3 bucket name | recommended | Switchbox | Document storage | `/settings` |

## 12. Postman handoff

Files:

- `docs/formfiller.postman_collection.json`
- `docs/formfiller.postman_environment.json`

The environment file contains placeholders only. Before use, Switchbox should import it and set local/current values for backend URL, tenant slug, auth token, admin credentials, Switchbox API credentials, and storage credentials.

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
3. Run full application smoke test.
4. Verify Switchbox receives JSON payload, signed PDF, and bank statements.
5. Verify privacy toggles redaction with all toggles off.
6. Confirm `CrmDelivery.status = sent` and external account ID mapping.
7. Update this report with actual production URLs, resource names, and credential owner references after deployment.op  