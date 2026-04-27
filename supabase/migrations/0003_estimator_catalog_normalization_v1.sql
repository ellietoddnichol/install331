-- Phase 2: Additive "normalization layer" for estimator v1.
-- Does NOT change catalog_items, modifiers_v1, bundles_v1, or takeoff. Same TEXT ids as 0001.
-- Kept in estimator_* to avoid clashing with Div 10 Brain tables (e.g. public.catalog_items uuid in other migrations).

CREATE TABLE IF NOT EXISTS estimator_catalog_attribute_defs (
  id TEXT PRIMARY KEY,
  attribute_key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  value_kind TEXT NOT NULL DEFAULT 'freeform',
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS estimator_parametric_modifiers (
  id TEXT PRIMARY KEY,
  modifier_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  applies_to_categories_json TEXT NOT NULL DEFAULT '[]',
  add_labor_minutes DOUBLE PRECISION NOT NULL DEFAULT 0,
  add_material_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
  percent_labor DOUBLE PRECISION NOT NULL DEFAULT 0,
  percent_material DOUBLE PRECISION NOT NULL DEFAULT 0,
  labor_cost_multiplier DOUBLE PRECISION NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS estimator_sku_aliases (
  id TEXT PRIMARY KEY,
  alias_text TEXT NOT NULL,
  alias_kind TEXT NOT NULL,
  target_catalog_item_id TEXT NOT NULL REFERENCES catalog_items (id) ON DELETE CASCADE,
  notes TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_estimator_sku_aliases_lower ON estimator_sku_aliases (lower(alias_text));

CREATE TABLE IF NOT EXISTS estimator_catalog_item_attributes (
  id TEXT PRIMARY KEY,
  catalog_item_id TEXT NOT NULL REFERENCES catalog_items (id) ON DELETE CASCADE,
  attribute_id TEXT NOT NULL REFERENCES estimator_catalog_attribute_defs (id) ON DELETE CASCADE,
  value TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_estimator_item_attr
  ON estimator_catalog_item_attributes (catalog_item_id, attribute_id);
CREATE INDEX IF NOT EXISTS idx_estimator_item_attr_item ON estimator_catalog_item_attributes (catalog_item_id);

CREATE TABLE IF NOT EXISTS estimator_norm_bundles_v1 (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  description TEXT,
  legacy_bundle_id TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS estimator_norm_bundle_items_v1 (
  id TEXT PRIMARY KEY,
  norm_bundle_id TEXT NOT NULL REFERENCES estimator_norm_bundles_v1 (id) ON DELETE CASCADE,
  catalog_item_id TEXT NOT NULL REFERENCES catalog_items (id) ON DELETE CASCADE,
  qty DOUBLE PRECISION NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_enbi_norm_bundle ON estimator_norm_bundle_items_v1 (norm_bundle_id);

CREATE TABLE IF NOT EXISTS estimator_catalog_validation_issues (
  id TEXT PRIMARY KEY,
  issue_type TEXT NOT NULL,
  entity_kind TEXT,
  entity_id TEXT,
  source_ref TEXT,
  message TEXT NOT NULL,
  detail_json TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  severity TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_ecvi_status ON estimator_catalog_validation_issues (status, issue_type);

-- ---------------------------------------------------------------------------
-- Idempotent example seeds (Bobrick/Bradley alias, materials, mountings, ADA norm bundle)
-- Only inserts when the row id is absent.
-- ---------------------------------------------------------------------------
INSERT INTO estimator_catalog_attribute_defs (id, attribute_key, label, value_kind, sort_order, active, created_at)
SELECT 'ead-material', 'material', 'Material / finish family', 'freeform', 10, 1, to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
WHERE NOT EXISTS (SELECT 1 FROM estimator_catalog_attribute_defs WHERE id = 'ead-material');
INSERT INTO estimator_catalog_attribute_defs (id, attribute_key, label, value_kind, sort_order, active, created_at)
SELECT 'ead-mounting', 'mounting', 'Mounting', 'freeform', 20, 1, to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
WHERE NOT EXISTS (SELECT 1 FROM estimator_catalog_attribute_defs WHERE id = 'ead-mounting');
INSERT INTO estimator_catalog_attribute_defs (id, attribute_key, label, value_kind, sort_order, active, created_at)
SELECT 'ead-partition-material', 'partition_material', 'Toilet partition core material', 'freeform', 30, 1, to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
WHERE NOT EXISTS (SELECT 1 FROM estimator_catalog_attribute_defs WHERE id = 'ead-partition-material');

-- Parametric: surface vs recessed, stainless uplift, ADA labor bump
INSERT INTO estimator_parametric_modifiers (id, modifier_key, name, description, applies_to_categories_json, add_labor_minutes, add_material_cost, percent_labor, percent_material, labor_cost_multiplier, active, updated_at)
SELECT 'epm-surface', 'MOUNT-SURFACE', 'Surface mount', 'Default surface-mounted accessory install (baseline for mounting comparisons).',
  '["Toilet Accessories","Washroom Accessories","Fire Specialties"]', 0, 0, 0, 0, 1, 1, to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
WHERE NOT EXISTS (SELECT 1 FROM estimator_parametric_modifiers WHERE id = 'epm-surface');
INSERT INTO estimator_parametric_modifiers (id, modifier_key, name, description, applies_to_categories_json, add_labor_minutes, add_material_cost, percent_labor, percent_material, labor_cost_multiplier, active, updated_at)
SELECT 'epm-recessed', 'MOUNT-RECESSED', 'Recessed mount', 'Recessed install with extra opening/finish cut labor; slight labor multiplier on install minutes.',
  '["Toilet Accessories","Partitions","Fire Specialties"]', 10, 0, 0, 0, 1.08, 1, to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
WHERE NOT EXISTS (SELECT 1 FROM estimator_parametric_modifiers WHERE id = 'epm-recessed');
INSERT INTO estimator_parametric_modifiers (id, modifier_key, name, description, applies_to_categories_json, add_labor_minutes, add_material_cost, percent_labor, percent_material, labor_cost_multiplier, active, updated_at)
SELECT 'epm-stainless-uplift', 'FINISH-STAINLESS', 'Stainless material uplift', 'Stainless option material uplift; matches typical stainless premium vs painted.',
  '["Toilet Accessories","Partitions"]', 0, 40, 0, 10, 1, 1, to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
WHERE NOT EXISTS (SELECT 1 FROM estimator_parametric_modifiers WHERE id = 'epm-stainless-uplift');
INSERT INTO estimator_parametric_modifiers (id, modifier_key, name, description, applies_to_categories_json, add_labor_minutes, add_material_cost, percent_labor, percent_material, labor_cost_multiplier, active, updated_at)
SELECT 'epm-ada', 'REG-ADA', 'ADA restroom compliance', 'ADA-related labor bump for clearances, heights, and coordination in restroom accessories.',
  '["Toilet Accessories","Partitions","Restroom"]', 5, 0, 0, 0, 1, 1, to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
WHERE NOT EXISTS (SELECT 1 FROM estimator_parametric_modifiers WHERE id = 'epm-ada');

-- Bobrick B-6806 (canonical row c1 / GA-36) and Bradley 812 as vendor alias
INSERT INTO estimator_sku_aliases (id, alias_text, alias_kind, target_catalog_item_id, notes, active, created_at, updated_at)
SELECT
  'alias-bradley-812', 'BRADLEY-812', 'vendor_sku', 'c1', 'Example: competitive grab bar as alias to Bobrick B-6806 / GA-36 line', 1,
  to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
WHERE NOT EXISTS (SELECT 1 FROM estimator_sku_aliases WHERE id = 'alias-bradley-812')
  AND EXISTS (SELECT 1 FROM catalog_items WHERE id = 'c1');

-- Attribute examples on canonical grab bar (c1) and partition (c3)
INSERT INTO estimator_catalog_item_attributes (id, catalog_item_id, attribute_id, value, created_at)
SELECT 'eiat-c1-mat', 'c1', 'ead-material', 'stainless', to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
WHERE NOT EXISTS (SELECT 1 FROM estimator_catalog_item_attributes WHERE id = 'eiat-c1-mat') AND EXISTS (SELECT 1 FROM catalog_items WHERE id = 'c1');
INSERT INTO estimator_catalog_item_attributes (id, catalog_item_id, attribute_id, value, created_at)
SELECT 'eiat-c1-mount', 'c1', 'ead-mounting', 'surface', to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
WHERE NOT EXISTS (SELECT 1 FROM estimator_catalog_item_attributes WHERE id = 'eiat-c1-mount') AND EXISTS (SELECT 1 FROM catalog_items WHERE id = 'c1');
INSERT INTO estimator_catalog_item_attributes (id, catalog_item_id, attribute_id, value, created_at)
SELECT 'eiat-c3-ptn', 'c3', 'ead-partition-material', 'HDPE', to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
WHERE NOT EXISTS (SELECT 1 FROM estimator_catalog_item_attributes WHERE id = 'eiat-c3-ptn') AND EXISTS (SELECT 1 FROM catalog_items WHERE id = 'c3');

-- Example normative ADA restroom bundle (parallel to bundles_v1; optional link)
INSERT INTO estimator_norm_bundles_v1 (id, name, category, description, legacy_bundle_id, sort_order, active, created_at, updated_at)
SELECT
  'norm-bundle-ada-restroom', 'ADA restroom bundle (example)', 'Restroom',
  'Seeded example tying grab bar, mirror, towel; compare to bundles_v1 for migration.', 'bundle-ada-single-stall', 1, 1,
  to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
WHERE NOT EXISTS (SELECT 1 FROM estimator_norm_bundles_v1 WHERE id = 'norm-bundle-ada-restroom');

INSERT INTO estimator_norm_bundle_items_v1 (id, norm_bundle_id, catalog_item_id, qty, sort_order, notes)
SELECT 'enbi-ada-1', 'norm-bundle-ada-restroom', 'c1', 1, 1, 'Bobrick B-6806 / GA-36 line'
WHERE NOT EXISTS (SELECT 1 FROM estimator_norm_bundle_items_v1 WHERE id = 'enbi-ada-1') AND EXISTS (SELECT 1 FROM catalog_items WHERE id = 'c1');
INSERT INTO estimator_norm_bundle_items_v1 (id, norm_bundle_id, catalog_item_id, qty, sort_order, notes)
SELECT 'enbi-ada-2', 'norm-bundle-ada-restroom', 'c5', 1, 2, 'Mirror line'
WHERE NOT EXISTS (SELECT 1 FROM estimator_norm_bundle_items_v1 WHERE id = 'enbi-ada-2') AND EXISTS (SELECT 1 FROM catalog_items WHERE id = 'c5');
INSERT INTO estimator_norm_bundle_items_v1 (id, norm_bundle_id, catalog_item_id, qty, sort_order, notes)
SELECT 'enbi-ada-3', 'norm-bundle-ada-restroom', 'c6', 1, 3, 'Towel dispenser line'
WHERE NOT EXISTS (SELECT 1 FROM estimator_norm_bundle_items_v1 WHERE id = 'enbi-ada-3') AND EXISTS (SELECT 1 FROM catalog_items WHERE id = 'c6');
