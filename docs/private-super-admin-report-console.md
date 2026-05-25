# Private Super-Admin Report Console

This file documents the private cross-tenant CSV export feature. It was intentionally **not** added to the Postman collection and should not be copied into tenant-facing or Switchbox handover docs.

## Purpose

The report console lets the platform owner download a de-duplicated merchant lead CSV across all tenants from the primary DigitalOcean Postgres database.

## Private frontend link

```text
/mycba/0c7f2e9a5b184d6f/portal/91a3d8e0c4b7
```

The page requires an authenticated user whose JWT role is `super_admin`.

This path is intentionally deep, unlinked, and unrelated to the normal merchant form routes. Do not add backlinks to it from `/apply`, `/settings`, tenant pages, Postman, public docs, or shared handover reports.

## Backend route

```text
POST /api/admin/sync
```

The path is generic by design. Request filters are sent in the JSON body, not the URL.

## CSV behavior

- Source: existing DO Postgres application tables.
- Scope: all tenants.
- Date filters: application `createdAt` start/end dates.
- Sorting: newest applications first.
- De-duplication order:
  1. contact/owner email
  2. contact/owner/business phone
  3. business legal name + business ZIP
- CSV is streamed directly to the browser.
- The app does not write the generated CSV to disk.

## Sensitive export mode

The frontend has a checkbox to include full SSN and DOB. When enabled, the page requires this exact confirmation phrase:

```text
EXPORT_FULL_SSN_DOB
```

If sensitive mode is off:

- SSN is exported as last four only.
- DOB is blank.

If sensitive mode is on:

- SSN is decrypted inside the backend export stream.
- DOB is included.
- Values are not logged or stored in the audit row.

## Audit trail

Each export creates a `ReportExportAudit` row with:

- user ID
- report type
- whether sensitive mode was used
- start/end date filters
- row count
- timestamp

No merchant values, SSNs, DOBs, CSV rows, or request/response bodies are stored in the audit table.

## DO setup

1. Deploy the backend migration containing `ReportExportAudit`.
2. Create or identify the platform owner user.
3. Promote that user in Postgres:

```sql
UPDATE "User"
SET "role" = 'super_admin'
WHERE "email" = '<owner-email>';
```

4. Sign out/in so the browser stores a JWT with `role: super_admin`.
5. Visit the private frontend link listed above.

## Disable / rollback plan

There is intentionally **no environment-variable toggle** for this feature. The preferred control is access-based and module-based so no sensitive private reporting capability is advertised in deployment env vars.

### Fastest live disable: remove super-admin access

Run this in Postgres to immediately prevent the private report page and backend export endpoint from working for the owner account:

```sql
UPDATE "User"
SET "role" = 'admin'
WHERE "email" = '<owner-email>';
```

Then sign out of the browser. Existing JWTs expire after the normal auth window, so for immediate lockout rotate `JWT_SECRET` and redeploy the backend.

### Disable at the app/proxy layer

If DigitalOcean routing/proxy controls are available, block both paths:

```text
/mycba/0c7f2e9a5b184d6f/portal/91a3d8e0c4b7
/api/admin/sync
```

This disables the frontend screen and backend export route without changing the database.

### Code-level disable

To disable the backend module in code, remove the route mount from `packages/backend/src/app.ts`:

```ts
app.use('/api/admin', adminReportRoutes);
```

To disable the frontend module in code, remove or rename:

```text
packages/frontend/src/app/mycba/0c7f2e9a5b184d6f/portal/91a3d8e0c4b7/page.tsx
```

### Full rollback

If the feature must be fully removed later:

1. Remove `packages/backend/src/routes/adminReport.routes.ts`.
2. Remove the `/api/admin` route mount from `packages/backend/src/app.ts`.
3. Remove `packages/frontend/src/app/mycba/0c7f2e9a5b184d6f/portal/91a3d8e0c4b7/page.tsx`.
4. Keep or drop `ReportExportAudit` depending on retention requirements. Keeping it preserves export audit history.

Do not remove merchant/application source data; the report reads existing records and does not maintain a separate lead database.

## Safety notes

- Do not add this route to Postman or tenant docs.
- Do not add a public env var advertising this capability.
- Do not add links to the private page from any visible frontend navigation.
- The private route has `noindex`/`nofollow` metadata; do not create a robots.txt entry that reveals the path.
- Do not email CSVs containing full SSN/DOB.
- Store downloaded CSVs only on trusted devices.
- Delete local CSV copies when no longer needed.
- Use the date filters to limit exports to the smallest practical range.