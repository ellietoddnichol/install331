-- Align Postgres `catalog_items` with the estimator SQLite evolution (canonicalization + governance fields).
-- Baseline migration `0001_v1_baseline.sql` created the core columns; app runtime SQLite adds many more via schema migrations.
-- Keep these changes additive + safe to re-run.

ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS canonical_sku TEXT;
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS is_canonical INTEGER NOT NULL DEFAULT 1;
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS alias_of TEXT;
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS labor_basis TEXT;
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS default_mounting_type TEXT;
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS finish_group TEXT;
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS attribute_group TEXT;
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS duplicate_group_key TEXT;
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS deprecated INTEGER NOT NULL DEFAULT 0;
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS deprecated_reason TEXT;

ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS record_granularity TEXT;
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS material_family TEXT;
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS system_series TEXT;
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS privacy_level TEXT;
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS manufacturer_configured_item INTEGER NOT NULL DEFAULT 0;
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS canonical_match_anchor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS exact_component_sku INTEGER NOT NULL DEFAULT 0;
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS requires_project_configuration INTEGER NOT NULL DEFAULT 0;
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS default_unit TEXT;
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS estimator_notes TEXT;

UPDATE catalog_items
SET canonical_sku = sku
WHERE (canonical_sku IS NULL OR trim(canonical_sku) = '')
  AND sku IS NOT NULL
  AND trim(sku) <> '';

UPDATE catalog_items
SET is_canonical = 1
WHERE is_canonical IS NULL;

UPDATE catalog_items
SET deprecated = 0
WHERE deprecated IS NULL;
