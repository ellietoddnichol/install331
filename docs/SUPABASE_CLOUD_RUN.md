# Supabase + Cloud Run (Phase 5)

## 1. Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. In **Settings → API**, copy:
   - `Project URL` → `SUPABASE_URL`
   - `anon public` → `SUPABASE_ANON_KEY` (browser + `Authorization: Bearer`)
   - `service_role` → `SUPABASE_SERVICE_ROLE_KEY` (server only; never expose to the client)
3. In **Settings → API → JWT Settings**, copy **JWT Secret** → `SUPABASE_JWT_SECRET` (Express verifies access tokens with this).
4. In **Settings → Database**, copy the **URI** (pooler recommended for Cloud Run) → `DATABASE_URL`.

## 2. Schema on Postgres

Apply SQL migrations in repo order:

```bash
# Option A: psql
psql "$DATABASE_URL" -f supabase/migrations/0001_v1_baseline.sql
psql "$DATABASE_URL" -f supabase/migrations/0002_project_files_storage.sql

# Option B: Supabase CLI (if linked)
supabase db push
```

## 3. Storage bucket

1. **Storage → New bucket** → name `project-files` (or set `SUPABASE_STORAGE_BUCKET`).
2. Policies: for MVP, server uses **service role** only (no public bucket). Tighten RLS later.

## 4. Cloud Run service

### Startup / health checks

The Node process **listens on `PORT` before** `prepareEstimatorDbForServer()` finishes (SQLite restore from Supabase/GCS can take tens of seconds). That way Supabase Preview, Cloud Run, and Docker health checks can get HTTP responses immediately.

| Path | When it works | Use |
|------|----------------|-----|
| `GET /healthz` | Immediately after listen | **Startup probes**, Docker `HEALTHCHECK`, quick “is the process up?” |
| `GET /` and static assets | Immediately in production (`dist/`) | Preview UIs that fetch the deployed URL |
| `GET /api/v1/health` | After DB preparation completes | Full stack “API + DB path” check |

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
