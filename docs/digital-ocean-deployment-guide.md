# Form Filler DigitalOcean Deployment Guide

This guide deploys Form Filler for Switchbox as a production-ready multi-tenant merchant application intake system.

## Target architecture

- **Frontend:** Next.js merchant/admin UI (`packages/frontend`)
- **Backend:** Express API + Prisma (`packages/backend`)
- **Database:** DigitalOcean Managed PostgreSQL
- **Object storage:** DigitalOcean Spaces, AWS S3, or Switchbox-owned S3-compatible bucket
- **Delivery:** Switchbox/lender API webhook with signed application PDF + bank statements

Recommended production model:

1. Use one shared managed Postgres database for tenants, applications, audit logs, analytics, settings, and CRM delivery metadata.
2. Store signed PDFs and bank statement PDFs in tenant/Switchbox object storage when configured.
3. Keep Postgres byte storage as fallback only when object storage is disabled.
4. Send Switchbox both base64 attachments and object-storage metadata for compatibility.

## DigitalOcean resources

Create these resources:

1. **Managed PostgreSQL**
   - PostgreSQL 16+ recommended.
   - Use the private/internal connection string from App Platform where available.
2. **Backend App Platform service**
   - Node runtime.
   - HTTP port `4000`.
3. **Frontend App Platform service**
   - Node runtime.
   - HTTP port `3000`.
4. **DigitalOcean Spaces bucket** or Switchbox-owned S3 bucket
   - Private bucket by default.
   - Use limited app access keys.
   - Prefer tenant/application prefixes.

## Build and run settings

Because this is an npm workspace repository, configure services from the repository root.

### Backend service

- Source directory: repository root
- Build command: `npm install && npm --workspace=packages/backend run db:generate && npm --workspace=packages/backend run build`
- Run command: `npm --workspace=packages/backend run start`
- HTTP port: `4000`

### Frontend service

- Source directory: repository root
- Build command: `npm install && npm --workspace=packages/frontend run build`
- Run command: `npm --workspace=packages/frontend run start`
- HTTP port: `3000`

## Environment variables and credential inventory

Do **not** commit real credential values to this repository or to exported Postman files. Transfer real values through Switchbox's approved password manager and set them as DigitalOcean encrypted environment variables or tenant settings.

### Backend environment variables

| Variable | Required | Secret | Purpose | Where to get/set |
|---|---:|---:|---|---|
| `NODE_ENV` | yes | no | Use `production` on DigitalOcean | App Platform env |
| `PORT` | yes | no | Backend listen port, normally `4000` | App Platform env |
| `DATABASE_URL` | yes | yes | Managed Postgres connection string | DO Managed Database |
| `JWT_SECRET` | yes | yes | Signs admin auth JWTs | Generate 32+ byte random secret |
| `ENCRYPTION_KEY` | yes | yes | Encrypts SSNs and stored tenant storage secrets | Generate app secret; keep stable |
| `ALLOWED_ORIGINS` | yes | no | Frontend URL(s), comma-separated | DO frontend URL/custom domains |
| `OPENCORPORATES_API_KEY` | optional | yes | Business lookup enrichment | OpenCorporates account |
| `GOOGLE_PLACES_API_KEY` | optional | yes | Address autocomplete/place details | Google Cloud project |
| `OPENAI_API_KEY` | optional | yes | Bank help instructions and live AI chat | OpenAI project |
| `OPENAI_MODEL` | optional | no | Shared AI model, default `gpt-4o-mini` | App Platform env |
| `CRM_WEBHOOK_URL` | optional | maybe | Global fallback Switchbox webhook URL | Switchbox API owner |
| `CRM_API_KEY` | optional | yes | Global fallback Switchbox API key | Switchbox API owner |

### Frontend environment variables

| Variable | Required | Secret | Purpose |
|---|---:|---:|---|
| `NEXT_PUBLIC_API_URL` | yes | no | Public backend URL |
| `NEXT_PUBLIC_TENANT_SLUG` | yes | no | Tenant slug, e.g. `default` |

### Tenant settings credentials

Configured in `/settings` by an authenticated admin and stored on `TenantSettings`:

| Setting | Secret | Notes |
|---|---:|---|
| Switchbox endpoint URL | no/maybe | Saved as `switchboxApiUrl` |
| Switchbox API key | yes | Write-only in UI; sent as `Authorization: Bearer` and `X-Api-Key` |
| Document storage provider | no | `database` or `s3` |
| Storage endpoint | no | Example `https://nyc3.digitaloceanspaces.com` |
| Storage region | no | Example `nyc3` |
| Storage bucket | no | Private bucket recommended |
| Storage prefix | no | Example `tenants/default/` |
| Storage access key ID | yes | Treat as sensitive |
| Storage secret access key | yes | Encrypted/write-only; API returns only configured true/false |
| Storage public/CDN base URL | no | Optional; only use if objects can be safely referenced |

## Tenant document storage

The `/settings` page includes **Document Storage**. Supported modes:

- `database`: fallback; stores uploaded PDF bytes in Postgres.
- `s3`: uploads signed application PDFs and bank statement PDFs to an S3-compatible bucket.

Suggested object keys:

```text
{prefix}{tenantSlug}/applications/{applicationId}/signed_application/final-application-{applicationId}.pdf
{prefix}{tenantSlug}/applications/{applicationId}/bank_statement/{statementMonth}-{safeFileName}.pdf
```

If object storage is enabled but misconfigured, uploads fail intentionally so sensitive PDFs are not silently saved to the wrong location.

## Database migration and seed

Run after database connectivity is configured:

```bash
npm --workspace=packages/backend exec prisma migrate deploy
npm --workspace=packages/backend exec prisma db seed
```

The seed creates the `default` tenant used by the default merchant flow.

## Deployment order

1. Provision Managed PostgreSQL.
2. Create backend service.
3. Add backend environment variables.
4. Deploy backend.
5. Run migrations and seed.
6. Confirm `GET /health` works.
7. Create frontend service.
8. Set frontend environment variables.
9. Deploy frontend.
10. Register/login admin user.
11. Configure `/settings`: branding, theme, PDF privacy, Switchbox API, document storage.
12. Promote the platform owner account to `super_admin` if private cross-tenant reporting is needed.
13. Run full smoke test: create app, sign, upload bank statements, final submit.

### Super-admin report console setup

The private report console is not tenant-facing and is not included in Postman exports. It uses the normal admin login token but requires the user's `role` to be `super_admin`.

After creating/signing in the owner account, promote only that account in Postgres:

```sql
UPDATE "User"
SET "role" = 'super_admin'
WHERE "email" = '<owner-email>';
```

Then sign out/in again so the JWT contains the new role. Keep the exact private console URL only in the private owner-only report-console document. Do not add the private route to public API collections, tenant documentation, or shared handover docs.

## API smoke tests

- `GET {BACKEND_URL}/health`
- `GET {BACKEND_URL}/api/tenant/settings` with `x-tenant-slug`
- `POST {BACKEND_URL}/api/auth/register`
- `POST {BACKEND_URL}/api/auth/login`
- `GET {BACKEND_URL}/api/tenant/settings/admin` with bearer token
- `POST {BACKEND_URL}/api/applications`
- `PUT {BACKEND_URL}/api/forms/{applicationId}/business`
- `PUT {BACKEND_URL}/api/forms/{applicationId}/financial`
- `PUT {BACKEND_URL}/api/forms/{applicationId}/loan`
- `PUT {BACKEND_URL}/api/forms/{applicationId}/owners`
- `POST {BACKEND_URL}/api/signatures/{applicationId}/sign`
- `POST {BACKEND_URL}/api/applications/{applicationId}/submit`
- `POST {BACKEND_URL}/api/applications/{applicationId}/documents`
- `POST {BACKEND_URL}/api/applications/{applicationId}/finalize`

## Switchbox delivery behavior

Final lender/Switchbox delivery is triggered only by:

```text
POST /api/applications/:id/finalize
```

The earlier `/submit` route marks a signed app as submitted and moves the merchant into bank statement upload. It does **not** send raw application data to Switchbox.

`/finalize` enqueues `CrmDelivery`, builds the privacy-aware package, generates a compact signed PDF, includes bank statements, and POSTs the payload to the configured Switchbox endpoint.

## Security and compliance deployment notes

- Use HTTPS-only frontend/backend/custom domains.
- Keep all App Platform environment secrets encrypted.
- Keep object buckets private and use least-privilege keys.
- Rotate `JWT_SECRET`, `ENCRYPTION_KEY`, storage keys, and CRM keys if exposed.
- Restrict database access to App Platform and required admin IPs.
- Back up Postgres and object storage.
- Preserve audit logs for signed applications and settings changes.
- Preserve `ReportExportAudit` rows for private report downloads. Audit rows store export metadata only, not exported merchant values.
- Do not email raw secrets or store them in Markdown/Postman exports.
- Treat any CSV containing full SSN/DOB as highly sensitive. Download only from a trusted machine, do not store in shared folders, and delete local copies when no longer needed.

## Production follow-ups after DO deployment

- Confirm Switchbox's exact endpoint URL, auth scheme, response contract, size limits, and account ID field.
- Decide whether Switchbox wants base64 attachments, object keys, signed URLs, or both.
- Add short-lived signed URL generation if Switchbox prefers URL handoff over base64.
- Confirm document retention/deletion policy with Switchbox compliance/legal.
- Add uptime/error monitoring and delivery failure alerting.