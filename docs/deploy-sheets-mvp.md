# Deploy Sheets + GCS MVP to Cloud Run

Step-by-step checklist for production on **Cloud Run** (`install58`, `europe-west1`) using the same profile as local MVP: **Sheets + SQLite + GCS**, no Supabase Postgres/Storage.

Architecture reference: [`google-sheets-gcs-mvp.md`](./google-sheets-gcs-mvp.md) · SQLite durability: [`DEPLOY.md`](./DEPLOY.md) · Smoke after deploy: [`mvp-smoke-checklist.md`](./mvp-smoke-checklist.md)

---

## 1. Preconditions (code on `main`)

- [ ] `npx tsc --noEmit` and `npm test` pass on the commit you deploy
- [ ] Browser MVP smoke passed locally (`docs/mvp-smoke-checklist.md`)
- [ ] Three Div 10 workbooks seeded: `npm run seed:div10-sheets:dry` then `npm run seed:div10-sheets`
- [ ] `.env.local` is **not** committed (never in `git status`)

---

## 2. GCP project & service account

| Item | Value (this repo) |
|------|-------------------|
| GCP project | `gen-lang-client-0568373820` |
| Cloud Run service | `install58` |
| Region | `europe-west1` |
| Runtime SA | `353363250924-compute@developer.gserviceaccount.com` |
| Sheets/GCS SA email | `labor-catalog@gen-lang-client-0568373820.iam.gserviceaccount.com` |

- [ ] Share **all three** spreadsheet workbooks with the Sheets SA (**Viewer** or higher)
- [ ] Optional: share install-intelligence workbook (reduces 403 warnings; fallback works without it)

---

## 3. GCS buckets & IAM

Two uses (can be the **same** bucket for a pilot, e.g. `brightenlabor518`):

| Env var | Purpose |
|---------|---------|
| `GCS_PROJECT_FILES_BUCKET` | Quote PDFs / project file blobs |
| `DATABASE_GCS_BUCKET` | SQLite snapshot restore + periodic backup (`estimator.db`) |

On the **runtime** service account (`353363250924-compute@...` or the SA your revision uses):

- [ ] **Storage Object Admin** (or create/read/delete) on the project-files bucket
- [ ] **Storage Object Admin** on the SQLite backup bucket (if different)

Verify locally (already done if API smoke passed):

```powershell
# With .env.local pointing at the bucket
npx tsx scripts/mvp-api-smoke.ts
```

---

## 4. Secret Manager (create before deploy)

Create secrets in project `gen-lang-client-0568373820` (names can match env var names):

| Secret ID | Maps to env | Required |
|-----------|-------------|----------|
| `GOOGLE_PRIVATE_KEY` | Service account PEM (`\n` newlines OK) | **Yes** |
| `AUTH_SESSION_SECRET` | Long random string for cookies | **Yes** if `AUTH_REQUIRED=1` |
| `GEMINI_API_KEY` | AI PDF intake | Optional |
| `AUTH_LOGIN_PASSWORD` | Password gate | Optional |

Grant **Secret Accessor** to:

- Cloud Run runtime SA
- Cloud Build SA (`labor-catalog@...`) if deploy binds secrets via `cloudbuild.yaml`

Do **not** put `GOOGLE_PRIVATE_KEY` in `_CLOUDRUN_ENV_VARS` or Vite `VITE_*`.

---

## 5. Cloud Build / `cloudbuild.yaml`

The repo default substitutions target the **Sheets MVP** profile (see `cloudbuild.yaml`).

### Non-sensitive env (`_CLOUDRUN_ENV_VARS`)

Already includes: `DATA_BACKEND=sheets`, `DB_DRIVER=sqlite`, `PROJECT_FILES_STORAGE=gcs`, workbook IDs, GCS bucket names, `DIV10_BRAIN_ENABLED=0`.

Override in the **Cloud Build trigger** if your bucket or spreadsheet IDs differ:

```text
_GCS_PROJECT_FILES_BUCKET=your-bucket
_DATABASE_GCS_BUCKET=your-bucket
_PROJECT_SETUP_SPREADSHEET_ID=...
_VENDOR_INTAKE_SPREADSHEET_ID=...
_CATALOG_LABOR_SPREADSHEET_ID=...
```

### Secrets (`_CLOUDRUN_SECRETS`)

Set on the trigger when secrets exist (comma-separated, no spaces):

```text
GOOGLE_PRIVATE_KEY=GOOGLE_PRIVATE_KEY:latest,AUTH_SESSION_SECRET=AUTH_SESSION_SECRET:latest
```

### First deploy off Supabase/pg

Set `_CLOUDRUN_REMOVE_ENV_VARS` (default in yaml) so old Supabase/Postgres env keys are stripped:

```text
DATABASE_URL,DIRECT_URL,SUPABASE_URL,SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY,SUPABASE_STORAGE_BUCKET,CATALOG_SOURCE,CATALOG_ITEMS_TABLE
```

### Auth for production

When ready for login, override on the trigger:

```text
_AUTH_REQUIRED=1
```

and ensure `AUTH_SESSION_SECRET` is bound. Pilot can stay `AUTH_REQUIRED=0`.

---

## 6. Deploy

### Option A — Git push (trigger)

Push to the branch wired to Cloud Build. Confirm the trigger uses the substitutions above (not the legacy `DB_DRIVER=pg` block).

### Option B — Manual build

```powershell
cd c:\Users\ellie\install331
$sha = git rev-parse HEAD
gcloud builds submit --project=gen-lang-client-0568373820 `
  --substitutions=COMMIT_SHA=$sha,_CLOUDRUN_SECRETS="GOOGLE_PRIVATE_KEY=GOOGLE_PRIVATE_KEY:latest,AUTH_SESSION_SECRET=AUTH_SESSION_SECRET:latest"
```

### Option C — Deploy image only (env already set)

```powershell
gcloud run services update install58 `
  --project=gen-lang-client-0568373820 `
  --region=europe-west1 `
  --update-env-vars="DATA_BACKEND=sheets,DB_DRIVER=sqlite"
```

Prefer **Option A/B** so env + secrets stay aligned with `cloudbuild.yaml`.

### Recommended runtime flags (Console or one-time)

| Setting | Suggested | Why |
|---------|-----------|-----|
| Request timeout | **300s** | Sheets API can be slow (~20–30s per write) |
| Min instances | **1** (pilot) | Fewer cold starts during demos |
| Memory | **1–2 GiB** | Node + SQLite + Sheets |
| CPU | **1+** | |

`cloudbuild.yaml` already sets `--timeout=300` and `--cpu-boost`.

---

## 7. Post-deploy verification

Replace `BASE` with `https://install58-XXXX.europe-west1.run.app` (your service URL).

```powershell
$base = "https://YOUR-SERVICE-URL"
Invoke-RestMethod "$base/healthz"
Invoke-RestMethod "$base/api/v1/health"
Invoke-RestMethod "$base/api/v1/settings/integration-health"
```

Expect:

- `health.database` → `"sqlite"`
- `integration-health` → `catalogDataSource: "sheets"`, GCS configured, Supabase flags false

Signed-in (if `AUTH_REQUIRED=1`):

```text
GET /api/admin/div10-sheets/health
```

Green is ideal; yellow/red with working quote import is acceptable for pilot — align tabs with `npm run seed:div10-sheets`.

### Browser smoke on production

Run [`mvp-smoke-checklist.md`](./mvp-smoke-checklist.md) against the **live URL**:

1. Create project (polished intake)
2. Setup persist
3. Upload quote PDF → GCS
4. Import → estimate
5. Install assumptions on a paused line
6. Hide from proposal
7. Proposal preview + print/PDF

Update [`mvp-smoke-checklist-results.md`](./mvp-smoke-checklist-results.md) with date + URL.

### API smoke against prod (optional)

```powershell
$env:SMOKE_HTTP_BASE = "https://YOUR-SERVICE-URL"
npx tsx scripts/mvp-api-smoke.ts
```

---

## 8. Settings → Project Durability

In the app **Settings** page, confirm:

- Mode is not `ephemeral` without GCS (should show GCS backup when `DATABASE_GCS_BUCKET` is set)
- **Backup now** succeeds after first project activity

---

## 9. Rollback to Supabase/pg (legacy)

Comment the Sheets block in `cloudbuild.yaml` and restore the legacy `_CLOUDRUN_ENV_VARS` / `_CLOUDRUN_SECRETS` from git history (`DB_DRIVER=pg`, `DATABASE_URL`, etc.). Redeploy. Not recommended for the current MVP path.

---

## 10. Sign-off

| Gate | |
|------|---|
| Cloud Run env = Sheets MVP | ☐ |
| Secrets bound (Google key + session) | ☐ |
| GCS IAM on runtime SA | ☐ |
| `/api/v1/health` + integration-health OK | ☐ |
| Browser MVP on `*.run.app` | ☐ |
| `mvp-smoke-checklist-results.md` updated | ☐ |

**Production-ready for pilot** when all boxes are checked.
