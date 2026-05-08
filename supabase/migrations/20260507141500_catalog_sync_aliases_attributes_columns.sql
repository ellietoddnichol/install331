-- Postgres parity for SQLite ALTER TABLE adds in src/server/db/schema.ts:
-- catalog_sync_status_v1 / catalog_sync_runs_v1 gain aliases_synced and
-- attributes_synced counters used by the Google Sheets catalog sync.

ALTER TABLE public.catalog_sync_status_v1
  ADD COLUMN IF NOT EXISTS aliases_synced integer NOT NULL DEFAULT 0;

ALTER TABLE public.catalog_sync_status_v1
  ADD COLUMN IF NOT EXISTS attributes_synced integer NOT NULL DEFAULT 0;

ALTER TABLE public.catalog_sync_runs_v1
  ADD COLUMN IF NOT EXISTS aliases_synced integer NOT NULL DEFAULT 0;

ALTER TABLE public.catalog_sync_runs_v1
  ADD COLUMN IF NOT EXISTS attributes_synced integer NOT NULL DEFAULT 0;
