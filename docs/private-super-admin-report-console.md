# Private Lead Export (Local-Only Tool)

This documents the private cross-tenant lead CSV export. It is intentionally **not** in the Postman collection and must never be copied into tenant-facing or Switchbox handover docs.

## Architecture: fully isolated from the merchant/Switchbox app

There is **no deployed page and no deployed endpoint** for this capability. It does not exist in the frontend that tenants/merchants load, and it does not exist in the backend that Switchbox integrates with. Export runs as a **local CLI script** on the owner's machine against the database.

- No `/mycba/...` route ships in the frontend build (verify with `npm run build` — it is absent from the route table).
- No `/api/admin/*` endpoint is mounted in the backend.
- No `super_admin` login, JWT, or account is involved in the export.

## How to run

Script: `packages/backend/src/scripts/export-leads.ts` (run via `npm run report:export`).

```bash
# from packages/backend, with a local .env (see "Local env" below)
npm run report:export -- --start=2025-01-01 --end=2025-12-31 --sensitive --out=report.csv
```

Flags (all optional):
- `--start=YYYY-MM-DD` / `--end=YYYY-MM-DD`: filter by application `createdAt`.
- `--sensitive`: include full SSN + DOB (otherwise SSN is last-four, DOB blank).
- `--out=path.csv`: output file (default `merchant-report-<date>.csv` in the current directory).

## CSV behavior

- Source: the primary Postgres application tables (read-only).
- Scope: all tenants.
- Date filters: application `createdAt` start/end (`--start`/`--end`).
- Sorting: newest applications first.
- De-duplication order:
  1. contact/owner email
  2. contact/owner/business phone
  3. business legal name + business ZIP
- The CSV is written to a local file (`--out`); nothing is streamed over the network.

## Sensitive export mode

Pass `--sensitive` to include full SSN and DOB.

If `--sensitive` is omitted:

- SSN is exported as last four only.
- DOB is blank.

If `--sensitive` is passed:

- SSN is decrypted locally using `ENCRYPTION_KEY`.
- DOB is included.
- Treat the output file as highly sensitive (see Safety notes).

## No audit row / read-only access

The local tool is designed to run against a **read-only** database role, so it does **not** write a `ReportExportAudit` row — the owner running the script is the audit boundary. The `ReportExportAudit` table still exists in the schema; it is simply not written by this tool.

## Local env

Create a local `.env` in `packages/backend` (never commit it) with:

```text
DATABASE_URL=<read-only connection string to the primary Postgres>
ENCRYPTION_KEY=<the SAME key used in production — never rotate it>
```

Notes:
- `ENCRYPTION_KEY` must match production exactly or SSN decryption fails. Never rotate it; existing SSN/ITIN data would become unreadable.
- Leave `NODE_ENV` unset (development) when running locally so the script does not require unrelated production env vars like `JWT_SECRET`.

## Read-only database role (recommended)

Run the export with a least-privilege role so the tool can never modify data. In Postgres:

```sql
CREATE ROLE lead_export LOGIN PASSWORD '<strong-password>';
GRANT CONNECT ON DATABASE <dbname> TO lead_export;
GRANT USAGE ON SCHEMA public TO lead_export;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO lead_export;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO lead_export;
```

Use that role's credentials in the local `DATABASE_URL`.

## Why this is isolated

- The tenant/Switchbox-facing frontend and backend contain no route, endpoint, link, or build-manifest entry for the export — it physically isn't in their deployment.
- The capability exists only as code that runs on the owner's machine, on demand.
- There is one copy of the data (the primary DB); the tool reads it via a read-only role.

## Restore a web console later (if ever needed)

This was previously a `super_admin`-gated web page (`/mycba/...`) plus `POST /api/admin/sync`. Both were removed for isolation. If a browser-based console is ever required again, re-add a route file under the frontend `app/` directory and a backend route mounted in `packages/backend/src/app.ts`, reusing the same de-dup/CSV logic now in `export-leads.ts`. Prefer keeping it local unless a web UI is strictly necessary.

## Safety notes

- Do not add any export route to Postman, tenant docs, or Switchbox handover docs.
- Do not deploy this script as an HTTP endpoint.
- Do not email CSVs containing full SSN/DOB.
- Store downloaded CSVs only on trusted devices; delete local copies when no longer needed.
- Use `--start`/`--end` to limit exports to the smallest practical range.
- Never rotate `ENCRYPTION_KEY`.