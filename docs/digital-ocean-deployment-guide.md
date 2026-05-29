# DigitalOcean Deployment Guide

Step-by-step instructions for deploying the Form Filler app (frontend + backend + database) on DigitalOcean App Platform.

---

## Step 1 — Create the Managed PostgreSQL database

1. In the DigitalOcean dashboard go to **Databases → Create Database**.
2. Choose **PostgreSQL 18**.
3. Pick **Regular** CPU / **$13/mo** plan (1 vCPU, 1 GB RAM, 10 GiB). You can scale up later without losing data.
4. Pick the same region you'll use for the app services.
5. Once it's running, copy the **private connection string** — you'll need it in Step 3.

> **Your data is completely safe across redeployments.** The Managed PostgreSQL database is a standalone service that runs independently of your App Platform services. Redeploying or restarting the backend app has zero effect on the database or any data inside it.

---

## Step 2 — Create the backend App Platform service

1. Go to **App Platform → Create App → GitHub**.
2. Select the `formfiller` repo, branch `main`.
3. Set the **source directory** to the repository root (leave it blank / `/`).
4. Set the **build command**:
   ```
   npm install && npm --workspace=packages/backend run db:generate && npm --workspace=packages/backend run build
   ```
5. Set the **run command**:
   ```
   npm --workspace=packages/backend run start
   ```
6. Set the **HTTP port** to `4000`.

---

## Step 3 — Add backend environment variables

Add these as **encrypted** environment variables on the backend service:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `4000` |
| `DATABASE_URL` | Postgres connection string from Step 1 |
| `JWT_SECRET` | Random 32+ character secret (generate one) |
| `ENCRYPTION_KEY` | Random secret — **never change this after launch** |
| `ALLOWED_ORIGINS` | Your frontend URL (e.g. `https://apply.yourdomain.com`) |
| `OPENAI_API_KEY` | Your OpenAI key — required for the AI chat agent |
| `ADMIN_REGISTRATION_KEY` | Any long random string — required to create new user accounts via `/register` |
| `OPENCORPORATES_API_KEY` | Optional — enables business lookup |
| `GOOGLE_PLACES_API_KEY` | Optional — enables address autocomplete |

> Do not commit real values to the repo. Set them only inside DigitalOcean's encrypted env panel.

---

## Step 4 — Deploy the backend and run database migrations

1. Click **Deploy** on the backend service.
2. Once the deploy finishes, open the **Console** tab for the backend service.

### First deploy only — run both commands once:
```
npm --workspace=packages/backend exec prisma migrate deploy
npm --workspace=packages/backend exec prisma db seed
```
- `migrate deploy` creates all the tables. Safe to run again on later deploys — it only applies new changes and never deletes data.
- `db seed` creates the default tenant row. It checks before inserting, so it's safe to run again, but you only need to do it this once.

### Every subsequent redeploy — run only migrations:
```
npm --workspace=packages/backend exec prisma migrate deploy
```
That's it. Your data (applications, leads, signatures, tenant settings) is untouched.

3. Verify the backend is running by hitting its health endpoint:
   ```
   GET https://<your-backend-url>/health
   ```
   You should get a `200 OK`.

---

## Step 5 — Create the frontend App Platform service

1. Go to **App Platform → Create App → GitHub**.
2. Select the same `formfiller` repo, branch `main`.
3. Set the **source directory** to the repository root.
4. Set the **build command**:
   ```
   npm install && npm --workspace=packages/frontend run build
   ```
5. Set the **run command**:
   ```
   npm --workspace=packages/frontend run start
   ```
6. Set the **HTTP port** to `3000`.

---

## Step 6 — Add frontend environment variables

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | Your backend URL (e.g. `https://api.yourdomain.com`) |
| `NEXT_PUBLIC_TENANT_SLUG` | `default` |

Deploy the frontend service after setting these.

---

## Step 7 — Configure app settings

1. Open the frontend in your browser and go to `/login`.
2. Register the owner admin account.
3. Go to `/settings` and fill in:
   - Branding (logo, colors)
   - Switchbox API endpoint and API key
   - Document storage (choose `s3` for DigitalOcean Spaces or leave as `database`)
   - Privacy/redaction toggles
   - AI persona name (optional — defaults to "Funding Assistant")

---

## Step 8 — Private lead export

Lead export is **not deployed** with this app — there is no admin page or admin endpoint in the deployed frontend/backend. Export runs as a local CLI script on the owner's machine against the database. Setup and usage are documented separately in `private-super-admin-report-console.md`; nothing about it needs to be configured in DigitalOcean.

---

## Step 9 — Smoke test

Run through these checks after everything is deployed:

- [ ] `GET /health` returns 200
- [ ] `/apply` loads the merchant form in the browser
- [ ] AI chat opens automatically and responds
- [ ] Fill out and submit a test application end-to-end
- [ ] Confirm the application is delivered to Switchbox (check `/settings` delivery status)

---

## Notes

- **Never rotate `ENCRYPTION_KEY`** after launch — it encrypts SSNs already stored in the database. Rotating it will break decryption of existing records.
- **`/submit`** moves the merchant to bank statement upload. It does not send data to Switchbox.
- **`/finalize`** is what actually delivers the signed PDF, bank statements, and application data to Switchbox.
- SSN and DOB are excluded from CSV exports by default. The local export tool includes them only when run with the `--sensitive` flag (see `private-super-admin-report-console.md`).
- Keep all buckets private. Never make signed PDFs or bank statements publicly accessible.