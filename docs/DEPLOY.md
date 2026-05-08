# Deploy notes

## SQLite migrations (projects, takeoff, etc.)

On every process start, **`server.ts`** calls `initDb()` then **`initEstimatorSchema()`** from [`src/server/db/schema.ts`](../src/server/db/schema.ts). That function applies idempotent `ALTER TABLE ... ADD COLUMN` migrations when the SQLite schema is older than the code (for example `proposal_include_special_notes` on `projects_v1`).

**Production:** The same `tsx server.ts` (or `npm start`) entrypoint must run on Cloud Run (or your host) so existing databases pick up new columns before the v1 API reads or writes those fields.

## Postgres / Supabase migrations

When deploying with `DB_DRIVER=pg`, apply every file under [`supabase/migrations/`](../supabase/migrations) before cutting traffic to the new revision.

Options:

- `npm run db:migrate` — runs all SQL files in lexical order against `DIRECT_URL` or `DATABASE_URL`
- `supabase db push` — if your local repo is linked to the target project

Verify `public.catalog_items_clean` exists after migration because it is the default read relation for the Postgres catalog backend.

## Durable project persistence (Cloud Run)

Cloud Run does **not** preserve the container filesystem across deploys/revisions. If SQLite is stored inside the container (for example `./estimator.db` under `/app`), **projects and takeoff lines will be lost on deploy**.

This repo supports two durability strategies without changing estimate math:

1. **Preferred (POSIX volume)**: run SQLite on a real mounted filesystem (VM/Kubernetes persistent volume / NFS).
   - Set `DATABASE_PATH` to that mounted path (example: `/data/estimator.db`).

2. **Cloud Run fallback (GCS snapshot restore + backup loop)**: restore SQLite from a GCS object at boot if the file is missing, and periodically upload a consistent DB snapshot.
   - Set:
     - `DATABASE_GCS_BUCKET`
     - `DATABASE_GCS_OBJECT` (default `estimator.db`)
     - `DATABASE_GCS_BACKUP_INTERVAL_MS` (default `30000`)
   - Ensure the Cloud Run runtime service account has read/write access to that bucket’s objects.

3. **Supabase Storage (alternative to GCS)**: use a Supabase private bucket to restore/backup the same SQLite file. If `DATABASE_SUPABASE_BUCKET` is set (and credentials are valid), it **takes precedence** over GCS.
   - Set:
     - `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL` — from Supabase project API settings
     - `SUPABASE_SERVICE_ROLE_KEY` — **server only**; never put this in the Vite client bundle
     - `DATABASE_SUPABASE_BUCKET` — bucket name you created under Storage
     - `DATABASE_SUPABASE_OBJECT` (default `estimator.db`) — object path inside that bucket; use a folder prefix if you want, e.g. `backups/estimator.db`
     - `DATABASE_SUPABASE_BACKUP_INTERVAL_MS` (optional, default `30000`)
   - In the Supabase dashboard: Storage → create the bucket (private is recommended). The service role key bypasses Storage RLS for uploads/downloads from the server.

Limitations:
- GCS backup is **eventual** (interval-based) durability; the last few seconds of writes may be lost if an instance is terminated before the next backup.

## Operational observability (recommended)

The app surfaces SQLite persistence health in **Settings → Project Durability**:
- effective server DB path
- detected mode (`volume` vs `ephemeral_gcs` vs `ephemeral`)
- whether a restore from GCS occurred on startup (and why/why not)
- last successful backup time
- last backup failure + error message
- the current GCS object metadata (updated time / size) when configured

Use **Backup now** for an on-demand snapshot (only works when `DATABASE_GCS_BUCKET` is configured).

## Deployment readiness checks

The app now exposes a runtime-safe browser config endpoint:

- `GET /api/v1/public-config.js` — publishes only public Supabase browser values (URL + publishable/anon key)

That endpoint lets the SPA authenticate even if `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (or `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) were not baked into the image at build time.

In **Settings → Environment readiness**, verify:

- database driver + `DATABASE_URL`
- catalog backend + auto-sync status
- Google Sheets credentials + spreadsheet ID
- Supabase server keys + browser-safe config
- PDF provider / Document AI flags
- default labor rate per hour

## Secrets

Do not commit Google service account JSON or `gen-lang-client-*.json` (see `.gitignore`). Configure Cloud Run with environment variables or Secret Manager for Gemini and Sheets as needed.
