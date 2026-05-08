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
psql "$DATABASE_URL" -f supabase/migrations/0003_estimator_catalog_normalization_v1.sql

# Option A2: repo helper (runs every file in supabase/migrations/*.sql)
npm run db:migrate

# Option B: Supabase CLI (if linked)
supabase db push
```

After migration, verify the read surface exists:

```sql
select * from public.catalog_items_clean limit 1;
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
| `DIRECT_URL` | Optional direct Postgres URL for admin scripts / migrations |
| `CATALOG_BACKEND` | `pg` |
| `SUPABASE_URL` | Project URL |
| `SUPABASE_ANON_KEY` | For `getUser(jwt)` validation |
| `SUPABASE_SERVICE_ROLE_KEY` | DB admin tasks + Storage uploads |
| `SUPABASE_JWT_SECRET` | Optional extra verify; anon client also validates JWT |
| `SUPABASE_STORAGE_BUCKET` | `project-files` |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | Spreadsheet with `CLEAN_ITEMS`, `BUNDLES`, `ALIASES`, `ATTRIBUTES`, etc. |
| `GOOGLE_SERVICE_ACCOUNT` | JSON or base64/secret-backed service account for sync |
| `GOOGLE_SHEETS_TAB_ITEMS` | `CLEAN_ITEMS` |
| `AUTO_SYNC_CATALOG_ON_START` | `1` to sync after boot |
| `DEFAULT_LABOR_RATE_PER_HOUR` | Fallback estimator labor rate when settings row is unset |
| `AUTH_REQUIRED` | `1` in production once users exist in Supabase Auth |

### SPA public config

The browser can read Supabase URL + anon key from either:

1. build-time `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, or
2. runtime-safe server output at `GET /api/v1/public-config.js`

That runtime fallback means Cloud Run can serve a working sign-in flow even when the
container image was built without `VITE_*` values.

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
- Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (same values as `SUPABASE_URL` / `SUPABASE_ANON_KEY`) if you want them baked into the bundle; otherwise the SPA falls back to `/api/v1/public-config.js`.
- With `AUTH_REQUIRED=1`, the API accepts either `Authorization: Bearer <access_token>` or Supabase auth cookies on same-origin requests (`credentials` are enabled in `apiFetch`).
- `GET /api/v1/session` returns `{ data: { user } }` without requiring auth (useful for bootstrapping the client).

## 7. Deployment verification

After deploy:

1. `GET /healthz` → startup passes
2. `GET /api/v1/health` → API ready
3. `GET /api/v1/public-config.js` → emits public Supabase config
4. `GET /api/v1/catalog-health` → verifies the Postgres catalog views when `DB_DRIVER=pg`
5. Settings → **Environment readiness** should show:
   - `DB_DRIVER=pg`
   - `DATABASE_URL` configured
   - catalog backend `pg`
   - browser Supabase config configured
   - Google Sheets credentials + spreadsheet ID configured
   - expected default labor rate
