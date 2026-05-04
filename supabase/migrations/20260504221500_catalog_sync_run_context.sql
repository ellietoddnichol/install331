-- Historically self-describing catalog sync runs (workbook-first operator audit).
ALTER TABLE catalog_sync_runs_v1 ADD COLUMN IF NOT EXISTS run_context_json TEXT;
