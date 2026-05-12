# Supabase + Cloud Run (Phase 5)

## 1. Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. In **Settings → API**, copy:
   - `Project URL` → `SUPABASE_URL`
   - `anon public` → `SUPABASE_ANON_KEY` (browser + `Authorization: Bearer`)
   - `service_role` → `SUPABASE_SERVICE_ROLE_KEY` (server only; never expose to the client)
3. In **Settings → API → JWT Settings**, copy **JWT Secret** → `SUPABASE_JWT_SECRET` (Express verifies access tokens with this).
4. In **Settings → Database**, copy the **URI** (pooler recommended for Cloud Run) → `DATABASE_URL`.

## 2. Postgres tables and views (`public`)

The app expects objects in the **`public`** schema. How you create them depends on whether this Supabase project is **empty / estimator-first** or already has a **native** estimating schema (`projects`, `takeoff_rows`, …).

### 2.1 Estimator-first (greenfield or “only install331”)

Use the SQL files under **`supabase/migrations/`** in **exactly this order** (do **not** sort by filename alone: `20260414…` must run **after** the core `catalog_items` + clean-view migrations so `0001`’s `catalog_items` table remains the TEXT-key workbook shape the rest of the chain expects).

| Step | File | What it adds (short) |
|------|------|------------------------|
| 1 | `0001_v1_baseline.sql` | Workspace `*_v1` tables, **`catalog_items`** (TEXT id), modifiers/bundles, intake memory, catalog sync status, etc. |
| 2 | `0002_project_files_storage.sql` | Storage-related metadata for `project_files_v1`. |
| 3 | `0003_estimator_catalog_normalization_v1.sql` | `estimator_*` normalization tables. |
| 4 | `20260430130000_catalog_items_clean_view.sql` | Read view **`catalog_items_clean`**. |
| 5 | `20260430131500_estimator_catalog_columns.sql` | Extra catalog columns aligned with the estimator. |
| 6 | `20260504140000_catalog_sheet_import_and_provenance.sql` | **`catalog_sheet_import_rows`**. |
| 7 | `20260504180000_catalog_item_aliases_attributes_sheet_sync.sql` | **`catalog_item_aliases`**, **`catalog_item_attributes`** (required for catalog search + intake when env points at sheet-style aliases/attrs). |
| 8 | `20260504210000_supporting_catalog_clean_views.sql` | `*_clean` views for modifiers, bundles, aliases, attributes. |
| 9 | `20260504221500_catalog_sync_run_context.sql` | Extra columns/context on catalog sync runs. |
| 10 | `20260506193000_workspace_sqlite_parity_columns.sql` | Workspace column parity vs SQLite. |
| 11 | `20260507141500_catalog_sync_aliases_attributes_columns.sql` | Sync metadata for aliases/attributes. |
| 12 | `20260512180000_catalog_item_attributes_clean_native_fallback.sql` | Fixes **`catalog_item_attributes_clean`** when `public.catalog_item_attributes` is a **native** shape (no `attribute_type`): rebinds the clean view to **`catalog_item_attributes_compat`** if that bridge view exists. |
| 13 | `20260414120000_div10_brain_init.sql` | **Optional:** `vector` + **`knowledge_*`**, **`estimate_examples`**, etc. Uses `CREATE TABLE IF NOT EXISTS` for `catalog_items` — if step 1 already created `catalog_items`, this step **does not replace** it; you still get Brain-side tables. Enable **`pgvector`** in Supabase (**Database → Extensions**) if the script errors on `vector`. |

**Apply with `psql` (bash)** — from the **repository root**:

```bash
export DATABASE_URL='postgresql://...'   # pooler URI from Supabase → Settings → Database

run() { psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$1"; }

run supabase/migrations/0001_v1_baseline.sql
run supabase/migrations/0002_project_files_storage.sql
run supabase/migrations/0003_estimator_catalog_normalization_v1.sql
run supabase/migrations/20260430130000_catalog_items_clean_view.sql
run supabase/migrations/20260430131500_estimator_catalog_columns.sql
run supabase/migrations/20260504140000_catalog_sheet_import_and_provenance.sql
run supabase/migrations/20260504180000_catalog_item_aliases_attributes_sheet_sync.sql
run supabase/migrations/20260504210000_supporting_catalog_clean_views.sql
run supabase/migrations/20260504221500_catalog_sync_run_context.sql
run supabase/migrations/20260506193000_workspace_sqlite_parity_columns.sql
run supabase/migrations/20260507141500_catalog_sync_aliases_attributes_columns.sql
run supabase/migrations/20260512180000_catalog_item_attributes_clean_native_fallback.sql
# optional:
run supabase/migrations/20260414120000_div10_brain_init.sql
```

**Apply with `psql` (PowerShell)** — from the **repository root**, with `psql` on `PATH`:

```powershell
Set-Location "C:\path\to\install331"   # your clone
$env:DATABASE_URL = "postgresql://..."   # same URI as server .env

function Run-Migration($relativePath) {
  psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f $relativePath
  if ($LASTEXITCODE -ne 0) { throw "Failed: $relativePath" }
}

Run-Migration "supabase/migrations/0001_v1_baseline.sql"
Run-Migration "supabase/migrations/0002_project_files_storage.sql"
Run-Migration "supabase/migrations/0003_estimator_catalog_normalization_v1.sql"
Run-Migration "supabase/migrations/20260430130000_catalog_items_clean_view.sql"
Run-Migration "supabase/migrations/20260430131500_estimator_catalog_columns.sql"
Run-Migration "supabase/migrations/20260504140000_catalog_sheet_import_and_provenance.sql"
Run-Migration "supabase/migrations/20260504180000_catalog_item_aliases_attributes_sheet_sync.sql"
Run-Migration "supabase/migrations/20260504210000_supporting_catalog_clean_views.sql"
Run-Migration "supabase/migrations/20260504221500_catalog_sync_run_context.sql"
Run-Migration "supabase/migrations/20260506193000_workspace_sqlite_parity_columns.sql"
Run-Migration "supabase/migrations/20260507141500_catalog_sync_aliases_attributes_columns.sql"
Run-Migration "supabase/migrations/20260512180000_catalog_item_attributes_clean_native_fallback.sql"
# optional Div10 Brain + vector:
Run-Migration "supabase/migrations/20260414120000_div10_brain_init.sql"
```

**Supabase Dashboard:** **SQL → New query** → paste a migration file → **Run**. Repeat in the same order (good for one-off fixes; tedious for all migrations in the table).

**Supabase CLI:** `supabase db push` only works if this repo is **linked** as a Supabase project with migration history in sync; otherwise prefer `psql` or the SQL Editor.

### 2.2 Native Supabase schema + install331 Node (bridge)

If you already have **native** tables (`projects`, `project_areas`, `takeoff_rows`, native catalog attribute defs, …) and want the Node app to read them via the **`*_v1`** names and **`catalog_item_attributes_compat`**:

1. Apply **every migration your database is still missing** from §2.1 (at minimum anything the app queries: often **`catalog_item_aliases`** / **`catalog_item_attributes`** from step 7 if those relations are absent).
2. Run **`scripts/supabase-bridge-native-to-install331-views.sql`** once (staging first). It creates/replaces views such as **`projects_v1`**, **`rooms_v1`**, **`takeoff_lines_v1`**, **`modifiers_v1`**, **`bundles_v1`**, **`bundle_items_v1`**, **`catalog_item_attributes_compat`**, and depends on native tables documented at the top of that file.

Then set env overrides as in **`.env.example`** (e.g. `CATALOG_ITEM_ATTRIBUTES_READ_TABLE=catalog_item_attributes_compat`, modifiers/bundles read tables pointing at `*_v1` or native names allowed in `src/server/db/catalogTable.ts`).

### 2.3 Verify and fix drift

1. In **SQL Editor**, run **`scripts/supabase-install331-readiness-audit.sql`** — one row per check (**PASS** / **FAIL** / **WARN**) plus a summary row; fix all **FAIL** before treating the DB as ready for the app.
2. Run **`scripts/supabase-public-schema-audit.sql`** — section **1** lists every `public` table/view; sections **2–3** compare to names the repo expects.
3. Hit **`GET /api/v1/health`** and **`GET /api/v1/settings/integration-health`** after the server is up (`DB_DRIVER=pg`, valid `DATABASE_URL`).
4. Common missing objects that break **intake** or **catalog**: **`public.catalog_item_aliases`**, **`public.catalog_item_attributes`** (sheet columns), **`attribute_type`** on attributes read surfaces, or bridge views when using native data — create or point env at an existing equivalent (see **`CATALOG_ITEM_ALIASES_READ_TABLE`** / **`catalog_aliases`** in `.env.example`).

## 3. Storage bucket

1. **Storage → New bucket** → name `project-files` (or set `SUPABASE_STORAGE_BUCKET`).
2. Policies: for MVP, server uses **service role** only (no public bucket). Tighten RLS later.

## 4. Cloud Run service

### Startup / health checks

The Node process **listens on `PORT` before** `prepareEstimatorDbForServer()` finishes (SQLite restore from Supabase/GCS can take tens of seconds). Production builds register **`dist/` static + SPA** as soon as the process listens so the browser shell loads while DB prep runs.

| Path | When it works | Use |
|------|----------------|-----|
| `GET /healthz` | Immediately after listen | **Startup probes**, Docker `HEALTHCHECK`, quick “is the process up?” |
| `GET /` and static assets | Immediately in production (`dist/`) | Preview UIs that fetch the deployed URL |
| `GET /api/*` | After `prepareEstimatorDbForServer()` completes | Until then returns **503** JSON `{ "code": "API_NOT_READY" }` — clients should retry briefly. |
| `GET /api/v1/health` | After DB preparation completes | Readiness: `{ status: "ok", dbOk: true, database: "pg"|"sqlite" }` or **503** `{ status: "degraded", dbOk: false, error }` if the DB ping fails |

If a preview still fails on a short timeout, point its health URL at **`/healthz`** (or `/` for the SPA shell), not `/api/v1/health`.

Set environment variables (use **Secrets** for keys):

| Variable | Notes |
|----------|--------|
| `DB_DRIVER` | `pg` |
| `DATABASE_URL` | Supabase Postgres connection string |
| `SUPABASE_URL` | Project URL |
| `SUPABASE_ANON_KEY` | For `getUser(jwt)` validation |
| `SUPABASE_SERVICE_ROLE_KEY` | DB admin tasks + Storage uploads |
| `SUPABASE_JWT_SECRET` | Optional extra verify; anon client also validates JWT |
| `SUPABASE_STORAGE_BUCKET` | `project-files` |
| `AUTH_REQUIRED` | `1` in production once users exist in Supabase Auth |
| `CATALOG_BACKEND` | `pg` (Postgres catalog surfaces) |
| `CATALOG_SOURCE` | `supabase` (catalog rows authoritative in Supabase, not Sheets) |
| `CATALOG_ITEMS_TABLE` | `public.catalog_items_clean` (or `catalog_items_clean`) |
| `AUTO_SYNC_CATALOG_ON_START` | `0` — do not pull Google Sheets on every boot unless operators set `1` |

## 5. Migrating data from SQLite

With `estimator.db` on disk and Storage bucket ready:

```bash
set DATABASE_URL=postgresql://...
set SUPABASE_URL=https://xxx.supabase.co
set SUPABASE_SERVICE_ROLE_KEY=...
set SQLITE_PATH=.\estimator.db
set DRY_RUN=1
npm run migrate:sqlite-to-pg
npm run migrate:sqlite-to-pg
```

## 6. Auth

- Users must exist in **Supabase Auth** (email/password or SSO).
- Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (same values as `SUPABASE_URL` / `SUPABASE_ANON_KEY`) so the SPA can call `signInWithPassword`.
- With `AUTH_REQUIRED=1`, the API accepts either `Authorization: Bearer <access_token>` or Supabase auth cookies on same-origin requests (`credentials` are enabled in `apiFetch`).
- `GET /api/v1/session` returns `{ data: { user } }` without requiring auth (useful for bootstrapping the client).

## 7. Cloud Build + Cloud Run (Gemini, Supabase, Google APIs)

The Docker image **does not** contain your API keys. Runtime env vars and **Secret Manager** bindings are applied at **`gcloud run deploy`** (see `cloudbuild.yaml`).

### Non-sensitive env vars (`_CLOUDRUN_ENV_VARS`)

Override the `substitutions._CLOUDRUN_ENV_VARS` value in your **Cloud Build trigger** (or manual build) with comma-separated `KEY=VALUE` pairs, for example:

- `NODE_ENV=production,DB_DRIVER=pg,AUTH_REQUIRED=1,SUPABASE_STORAGE_BUCKET=project-files`
- `GOOGLE_CLOUD_PROJECT_ID=your-gcp-project` and `DOCUMENT_AI_PROCESSOR_ID=...` if you use Document AI (`UPLOAD_PDF_PROVIDER` must match how you configure the app)

Use **Secret Manager** for passwords and API keys (next section), not plain text in `_CLOUDRUN_ENV_VARS`, unless the value is intentionally public (e.g. Supabase project URL).

### Secrets (`_CLOUDRUN_SECRETS`)

1. In **Google Cloud Console → Security → Secret Manager**, create secrets. Use the **same secret id as the environment variable name** (e.g. secret id `GEMINI_API_KEY`) so bindings stay obvious.
2. Add a **new version** for each secret with the value from your filled `.env.local`.
3. Grant **`roles/secretmanager.secretAccessor`** on each secret to:
   - the **Cloud Build** service account that runs the deploy step (so deploy can attach secrets to the service), and
   - the **Cloud Run runtime** service account (`_RUN_SERVICE_ACCOUNT` in `cloudbuild.yaml`, e.g. `353363250924-compute@developer.gserviceaccount.com`) so the container can read them at runtime.

4. In the Cloud Build trigger, set substitution **`_CLOUDRUN_SECRETS`** to a comma-separated list of **`ENV_VAR=SECRET_NAME:version`** (version is usually `latest`):

   Example (adjust to secrets you actually created):

   `GEMINI_API_KEY=GEMINI_API_KEY:latest,GOOGLE_GEMINI_API_KEY=GOOGLE_GEMINI_API_KEY:latest,DATABASE_URL=DATABASE_URL:latest,SUPABASE_URL=SUPABASE_URL:latest,SUPABASE_ANON_KEY=SUPABASE_ANON_KEY:latest,SUPABASE_SERVICE_ROLE_KEY=SUPABASE_SERVICE_ROLE_KEY:latest,SUPABASE_JWT_SECRET=SUPABASE_JWT_SECRET:latest,OPENAI_API_KEY=OPENAI_API_KEY:latest,AUTH_SESSION_SECRET=AUTH_SESSION_SECRET:latest,DIV10_BRAIN_ADMIN_SECRET=DIV10_BRAIN_ADMIN_SECRET:latest`

   For large JSON (`GOOGLE_SERVICE_ACCOUNT`), store the whole JSON as one secret value and bind `GOOGLE_SERVICE_ACCOUNT=GOOGLE_SERVICE_ACCOUNT:latest`.

5. Leave **`_CLOUDRUN_SECRETS` empty** in YAML until all listed secrets exist; otherwise the deploy step will fail.

### Helper: upload `.env.local` into Secret Manager (PowerShell)

From the repo root (after `gcloud` auth and project set):

```powershell
.\scripts\push-gcp-secrets-from-env.ps1 -ProjectId YOUR_GCP_PROJECT_ID -EnvFile .env.local
```

The script only pushes keys listed in the script (Gemini, Supabase, DB, OpenAI, auth, optional Google SA JSON). Review the file before running.

### Vite / client bundle note

`vite build` in Docker does not see Cloud Run’s runtime secrets. The server reads `GEMINI_API_KEY`, Supabase keys, etc. from `process.env` at **runtime** in Node. If you rely on **browser** code that needs `GEMINI_API_KEY` injected at build time, you would add Docker `ARG`/`ENV` during `docker build` in CI (avoid baking secrets into layers; prefer server-side calls only).
