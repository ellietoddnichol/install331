# Google Sheets + GCS MVP (no Supabase)

This profile runs the Div 10 estimator without Supabase Postgres, Auth, or Storage. Structured data lives in Google Sheets; uploaded quote PDFs and project files use Google Cloud Storage.

## Required environment

```env
DATA_BACKEND=sheets
CATALOG_BACKEND=sheet
DB_DRIVER=sqlite
SQLITE_PATH=./estimator.db

PROJECT_FILES_STORAGE=gcs
GCS_PROJECT_FILES_BUCKET=your-project-files-bucket

DIV10_BRAIN_ENABLED=0

# Three workbooks (see scripts/seed-div10-sheets)
PROJECT_SETUP_ESTIMATE_PROPOSAL_SPREADSHEET_ID=
VENDOR_INTAKE_BACKEND_SPREADSHEET_ID=
CATALOG_LABOR_BACKEND_SPREADSHEET_ID=

# Google service account (server only — never VITE_*)
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Do **not** set `VITE_SUPABASE_*`, `SUPABASE_URL`, `DATABASE_URL`, or `DIRECT_URL` for this profile unless you intentionally enable optional Supabase features.

## Google Sheets tabs

### Project / estimate / proposal workbook

- `Projects`, `ProjectSetup`, `EstimateLines`, `ProposalSettings`, `ProposalClauses`, `TaxSettings`, `ProjectReadiness`

### Vendor intake workbook

- `SourceQuotes`, `StagedQuoteRows`, `QuoteFiles` (or `ProjectFiles`)

### Catalog / labor workbook

- `CLEAN_ITEMS`, `CLEAN_MODIFIERS`, `BUNDLES`, `BUNDLE_ITEMS`, `ALIASES`, `ATTRIBUTES`
- `LABOR_FALLBACK_RULES`, `INSTALL_LABOR_FACTORS`, `CATEGORY_DEFAULTS`, `ADDINS`

Seed headers: `npm run seed:div10-sheets:dry` then `npm run seed:div10-sheets` (see `package.json`).

## Google Cloud Storage

1. Create a bucket (e.g. `your-project-files`) in the same GCP project as the service account.
2. Grant the service account **Storage Object Admin** (or narrower: create/read/delete on that bucket).
3. Set `GCS_PROJECT_FILES_BUCKET` and `PROJECT_FILES_STORAGE=gcs`.

On Cloud Run, do not use local disk for uploads — the container filesystem is ephemeral.

## Local auth

```env
AUTH_REQUIRED=0
AUTH_SESSION_SECRET=<long-random-secret>
```

Optional password login: `AUTH_LOGIN_EMAIL` + `AUTH_LOGIN_PASSWORD`.

## Div 10 Brain

Disabled when `DIV10_BRAIN_ENABLED=0` or when `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `OPENAI_API_KEY` are unset. Admin routes return **503** with a clear message; quote import, estimate, proposal, and catalog are unaffected.

## Health checks

- `GET /healthz` — process up (no DB)
- `GET /api/v1/health` — full stack after DB prep
- `GET /api/v1/settings/integration-health` — non-secret flags (Sheets, GCS, catalog source)
- `GET /api/admin/div10-sheets/health` — workbook tab validation (when signed in)

## Migrating off Supabase

1. Export catalog rows into the catalog/labor workbook tabs.
2. Copy stored quote/project files from Supabase Storage into the GCS bucket (preserve `projectId/fileId` paths if reusing metadata).
3. Remove Supabase env vars from `.env.local` and Cloud Run.
4. Run the MVP smoke checklist: `docs/mvp-smoke-checklist.md`.
5. Deploy to Cloud Run: `docs/deploy-sheets-mvp.md` (env substitutions in `cloudbuild.yaml`).

