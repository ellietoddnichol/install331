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
