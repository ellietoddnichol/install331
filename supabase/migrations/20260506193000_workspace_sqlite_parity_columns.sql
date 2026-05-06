-- Align Postgres estimator tables with current SQLite/schema.ts + repo INSERTs.
-- 0001_v1_baseline predates several columns used by projectsRepo / takeoffRepo.

ALTER TABLE projects_v1 ADD COLUMN IF NOT EXISTS project_number_source TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE projects_v1 ADD COLUMN IF NOT EXISTS client_name_source TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE projects_v1 ADD COLUMN IF NOT EXISTS address_source TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE projects_v1 ADD COLUMN IF NOT EXISTS location_label_source TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE projects_v1 ADD COLUMN IF NOT EXISTS preferred_brands_json TEXT NOT NULL DEFAULT '[]';

ALTER TABLE takeoff_lines_v1 ADD COLUMN IF NOT EXISTS proposal_visibility TEXT NOT NULL DEFAULT 'customer_visible';
ALTER TABLE takeoff_lines_v1 ADD COLUMN IF NOT EXISTS proposal_description_override TEXT;
ALTER TABLE takeoff_lines_v1 ADD COLUMN IF NOT EXISTS parent_estimate_line_id TEXT;
ALTER TABLE takeoff_lines_v1 ADD COLUMN IF NOT EXISTS source_line_type TEXT NOT NULL DEFAULT 'catalog_item';
ALTER TABLE takeoff_lines_v1 ADD COLUMN IF NOT EXISTS catalog_attribute_snapshot_json TEXT;
ALTER TABLE takeoff_lines_v1 ADD COLUMN IF NOT EXISTS base_material_cost_snapshot DOUBLE PRECISION;
ALTER TABLE takeoff_lines_v1 ADD COLUMN IF NOT EXISTS base_labor_minutes_snapshot DOUBLE PRECISION;
ALTER TABLE takeoff_lines_v1 ADD COLUMN IF NOT EXISTS attribute_delta_material_snapshot_json TEXT;
ALTER TABLE takeoff_lines_v1 ADD COLUMN IF NOT EXISTS attribute_delta_labor_snapshot_json TEXT;
