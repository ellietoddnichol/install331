-- Estimator v1 baseline for PostgreSQL (Supabase).
-- Mirrors merged state of src/server/db/schema.ts + src/server/legacyInit.ts catalog_items.

CREATE TABLE IF NOT EXISTS projects_v1 (
  id TEXT PRIMARY KEY,
  project_number TEXT,
  project_name TEXT NOT NULL,
  client_name TEXT,
  general_contractor TEXT,
  estimator TEXT,
  bid_date TEXT,
  proposal_date TEXT,
  due_date TEXT,
  address TEXT,
  project_type TEXT,
  project_size TEXT,
  floor_level TEXT,
  access_difficulty TEXT,
  install_height TEXT,
  material_handling TEXT,
  wall_substrate TEXT,
  labor_burden_percent DOUBLE PRECISION NOT NULL DEFAULT 0,
  overhead_percent DOUBLE PRECISION NOT NULL DEFAULT 0,
  profit_percent DOUBLE PRECISION NOT NULL DEFAULT 0,
  tax_percent DOUBLE PRECISION NOT NULL DEFAULT 0,
  pricing_mode TEXT NOT NULL DEFAULT 'labor_and_material',
  scope_categories_json TEXT NOT NULL DEFAULT '[]',
  job_conditions_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'Draft',
  notes TEXT,
  special_notes TEXT,
  labor_overhead_percent DOUBLE PRECISION NOT NULL DEFAULT 15,
  labor_profit_percent DOUBLE PRECISION NOT NULL DEFAULT 10,
  sub_labor_management_fee_enabled INTEGER NOT NULL DEFAULT 0,
  sub_labor_management_fee_percent DOUBLE PRECISION NOT NULL DEFAULT 5,
  proposal_include_special_notes INTEGER NOT NULL DEFAULT 0,
  proposal_format TEXT NOT NULL DEFAULT 'standard',
  proposal_include_catalog_images INTEGER NOT NULL DEFAULT 0,
  structured_assumptions_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rooms_v1 (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects_v1(id) ON DELETE CASCADE,
  room_name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS catalog_items (
  id TEXT PRIMARY KEY,
  sku TEXT,
  category TEXT,
  subcategory TEXT,
  family TEXT,
  description TEXT,
  manufacturer TEXT,
  brand TEXT,
  model TEXT,
  model_number TEXT,
  series TEXT,
  image_url TEXT,
  uom TEXT,
  base_material_cost DOUBLE PRECISION,
  base_labor_minutes DOUBLE PRECISION,
  labor_unit_type TEXT,
  taxable INTEGER DEFAULT 1,
  ada_flag INTEGER DEFAULT 0,
  tags TEXT,
  notes TEXT,
  active INTEGER DEFAULT 1,
  install_labor_family TEXT
);

CREATE TABLE IF NOT EXISTS takeoff_lines_v1 (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects_v1(id) ON DELETE CASCADE,
  room_id TEXT NOT NULL REFERENCES rooms_v1(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_ref TEXT,
  description TEXT NOT NULL,
  sku TEXT,
  category TEXT,
  subcategory TEXT,
  base_type TEXT,
  qty DOUBLE PRECISION NOT NULL,
  unit TEXT NOT NULL,
  material_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
  base_material_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
  labor_minutes DOUBLE PRECISION NOT NULL DEFAULT 0,
  labor_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
  base_labor_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
  pricing_source TEXT NOT NULL DEFAULT 'auto',
  unit_sell DOUBLE PRECISION NOT NULL DEFAULT 0,
  line_total DOUBLE PRECISION NOT NULL DEFAULT 0,
  notes TEXT,
  bundle_id TEXT,
  catalog_item_id TEXT,
  variant_id TEXT,
  intake_scope_bucket TEXT,
  intake_match_confidence TEXT,
  source_manufacturer TEXT,
  source_bid_bucket TEXT,
  source_section_header TEXT,
  is_installable_scope INTEGER,
  install_scope_type TEXT,
  source_material_cost DOUBLE PRECISION,
  generated_labor_minutes DOUBLE PRECISION,
  labor_origin TEXT,
  install_labor_family TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings_v1 (
  id TEXT PRIMARY KEY,
  company_name TEXT NOT NULL,
  company_address TEXT NOT NULL,
  company_phone TEXT NOT NULL,
  company_email TEXT NOT NULL,
  logo_url TEXT NOT NULL,
  default_labor_rate_per_hour DOUBLE PRECISION NOT NULL DEFAULT 100,
  default_overhead_percent DOUBLE PRECISION NOT NULL DEFAULT 0,
  default_profit_percent DOUBLE PRECISION NOT NULL DEFAULT 0,
  default_tax_percent DOUBLE PRECISION NOT NULL DEFAULT 0,
  default_labor_burden_percent DOUBLE PRECISION NOT NULL DEFAULT 0,
  default_labor_overhead_percent DOUBLE PRECISION NOT NULL DEFAULT 5,
  proposal_intro TEXT NOT NULL,
  proposal_terms TEXT NOT NULL,
  proposal_exclusions TEXT NOT NULL DEFAULT '',
  proposal_clarifications TEXT NOT NULL DEFAULT '',
  proposal_acceptance_label TEXT NOT NULL DEFAULT 'Accepted By',
  intake_catalog_auto_apply_mode TEXT NOT NULL DEFAULT 'off',
  intake_catalog_tier_a_min_score DOUBLE PRECISION NOT NULL DEFAULT 0.82,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS modifiers_v1 (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  modifier_key TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  applies_to_categories TEXT NOT NULL,
  add_labor_minutes DOUBLE PRECISION NOT NULL DEFAULT 0,
  add_material_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
  percent_labor DOUBLE PRECISION NOT NULL DEFAULT 0,
  percent_material DOUBLE PRECISION NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bundles_v1 (
  id TEXT PRIMARY KEY,
  bundle_name TEXT NOT NULL,
  category TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bundle_items_v1 (
  id TEXT PRIMARY KEY,
  bundle_id TEXT NOT NULL REFERENCES bundles_v1(id) ON DELETE CASCADE,
  catalog_item_id TEXT,
  sku TEXT,
  description TEXT NOT NULL,
  qty DOUBLE PRECISION NOT NULL DEFAULT 1,
  material_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
  labor_minutes DOUBLE PRECISION NOT NULL DEFAULT 0,
  labor_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS line_modifiers_v1 (
  id TEXT PRIMARY KEY,
  line_id TEXT NOT NULL REFERENCES takeoff_lines_v1(id) ON DELETE CASCADE,
  modifier_id TEXT NOT NULL,
  name TEXT NOT NULL,
  add_material_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
  add_labor_minutes DOUBLE PRECISION NOT NULL DEFAULT 0,
  percent_material DOUBLE PRECISION NOT NULL DEFAULT 0,
  percent_labor DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS catalog_sync_status_v1 (
  id TEXT PRIMARY KEY,
  last_attempt_at TEXT,
  last_success_at TEXT,
  status TEXT NOT NULL DEFAULT 'never',
  message TEXT,
  items_synced INTEGER NOT NULL DEFAULT 0,
  modifiers_synced INTEGER NOT NULL DEFAULT 0,
  bundles_synced INTEGER NOT NULL DEFAULT 0,
  bundle_items_synced INTEGER NOT NULL DEFAULT 0,
  warnings_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS catalog_sync_runs_v1 (
  id TEXT PRIMARY KEY,
  attempted_at TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT,
  items_synced INTEGER NOT NULL DEFAULT 0,
  modifiers_synced INTEGER NOT NULL DEFAULT 0,
  bundles_synced INTEGER NOT NULL DEFAULT 0,
  bundle_items_synced INTEGER NOT NULL DEFAULT 0,
  warnings_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS project_files_v1 (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects_v1(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  data_base64 TEXT,
  storage_object_key TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS intake_catalog_memory_v1 (
  memory_key TEXT PRIMARY KEY,
  catalog_item_id TEXT NOT NULL,
  hit_count INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rooms_v1_project ON rooms_v1(project_id);
CREATE INDEX IF NOT EXISTS idx_takeoff_v1_project ON takeoff_lines_v1(project_id);
CREATE INDEX IF NOT EXISTS idx_takeoff_v1_room ON takeoff_lines_v1(room_id);
CREATE INDEX IF NOT EXISTS idx_bundle_items_v1_bundle ON bundle_items_v1(bundle_id);
CREATE INDEX IF NOT EXISTS idx_line_modifiers_v1_line ON line_modifiers_v1(line_id);
CREATE INDEX IF NOT EXISTS idx_project_files_v1_project ON project_files_v1(project_id);

-- Seed global settings (idempotent)
INSERT INTO settings_v1 (
  id, company_name, company_address, company_phone, company_email, logo_url, default_labor_rate_per_hour,
  default_overhead_percent, default_profit_percent, default_tax_percent, default_labor_burden_percent, default_labor_overhead_percent,
  proposal_intro, proposal_terms, proposal_exclusions, proposal_clarifications, proposal_acceptance_label,
  intake_catalog_auto_apply_mode, intake_catalog_tier_a_min_score, updated_at
)
SELECT
  'global',
  'Brighten Builders, LLC',
  '512 S. 70th Street, Kansas City, KS 66611',
  '',
  '',
  'https://static.wixstatic.com/media/18d091_be2178f095264ea0a1d2c8d78520b2ce%7Emv2.png/v1/fit/w_2500,h_1330,al_c/18d091_be2178f095264ea0a1d2c8d78520b2ce%7Emv2.png',
  100,
  15,
  10,
  8.25,
  0,
  5,
  'Thank you for the opportunity to provide this proposal.',
  'Payment terms net 30. Prices valid for 30 days.',
  '',
  '',
  'Accepted By',
  'off',
  0.82,
  to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
WHERE NOT EXISTS (SELECT 1 FROM settings_v1 WHERE id = 'global');

-- Seed modifiers (when empty)
INSERT INTO modifiers_v1 (id, name, modifier_key, description, applies_to_categories, add_labor_minutes, add_material_cost, percent_labor, percent_material, active, updated_at)
SELECT 'mod-ada', 'ADA', 'ADA',
  'Americans with Disabilities Act (ADA) accessibility requirements—typically added clearances, reach ranges, and mounting heights for toilet accessories (e.g., grab bars, dispensers, mirrors). Use when scope must meet accessible restroom standards.',
  '["Toilet Accessories","Partitions"]', 5, 0, 0, 0, 1, to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
WHERE NOT EXISTS (SELECT 1 FROM modifiers_v1 WHERE id = 'mod-ada');

INSERT INTO modifiers_v1 (id, name, modifier_key, description, applies_to_categories, add_labor_minutes, add_material_cost, percent_labor, percent_material, active, updated_at)
SELECT 'mod-recessed', 'Recessed', 'RECESSED',
  'Recessed or semi-recessed installation: fixture or accessory is set into the wall or chase for a flush finish. Expect added rough-opening, blocking, and finish-cut labor versus surface mount.',
  '["Toilet Accessories","Fire Specialties"]', 10, 15, 0, 0, 1, to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
WHERE NOT EXISTS (SELECT 1 FROM modifiers_v1 WHERE id = 'mod-recessed');

INSERT INTO modifiers_v1 (id, name, modifier_key, description, applies_to_categories, add_labor_minutes, add_material_cost, percent_labor, percent_material, active, updated_at)
SELECT 'mod-stainless', 'Stainless Upgrade', 'STAINLESS',
  'Stainless steel finish upgrade for durability and corrosion resistance in wet or high-traffic restrooms; material cost uplift versus painted or plated equivalents.',
  '["Toilet Accessories","Partitions"]', 0, 40, 0, 10, 1, to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
WHERE NOT EXISTS (SELECT 1 FROM modifiers_v1 WHERE id = 'mod-stainless');

-- Seed default bundle
INSERT INTO bundles_v1 (id, bundle_name, category, active, updated_at)
SELECT 'bundle-ada-single-stall', 'ADA Single Stall Restroom Bundle', 'Restroom', 1, to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
WHERE NOT EXISTS (SELECT 1 FROM bundles_v1 WHERE id = 'bundle-ada-single-stall');

INSERT INTO bundle_items_v1 (id, bundle_id, catalog_item_id, sku, description, qty, material_cost, labor_minutes, labor_cost, sort_order, notes)
SELECT 'bundle-item-1', 'bundle-ada-single-stall', 'c1', 'GA-36', 'Grab Bar 36" Stainless Steel', 1, 45, 30, 25, 1, NULL
WHERE NOT EXISTS (SELECT 1 FROM bundle_items_v1 WHERE id = 'bundle-item-1');

INSERT INTO bundle_items_v1 (id, bundle_id, catalog_item_id, sku, description, qty, material_cost, labor_minutes, labor_cost, sort_order, notes)
SELECT 'bundle-item-2', 'bundle-ada-single-stall', 'c5', 'M-1836', 'Mirror 18" x 36" Channel Frame', 1, 65, 20, 18, 2, NULL
WHERE NOT EXISTS (SELECT 1 FROM bundle_items_v1 WHERE id = 'bundle-item-2');

INSERT INTO bundle_items_v1 (id, bundle_id, catalog_item_id, sku, description, qty, material_cost, labor_minutes, labor_cost, sort_order, notes)
SELECT 'bundle-item-3', 'bundle-ada-single-stall', 'c6', 'TD-262', 'Paper Towel Dispenser, Surface', 1, 85, 20, 18, 3, NULL
WHERE NOT EXISTS (SELECT 1 FROM bundle_items_v1 WHERE id = 'bundle-item-3');

INSERT INTO catalog_sync_status_v1 (id, last_attempt_at, last_success_at, status, message, items_synced, modifiers_synced, bundles_synced, bundle_items_synced, warnings_json)
SELECT 'catalog', NULL, NULL, 'never', NULL, 0, 0, 0, 0, '[]'
WHERE NOT EXISTS (SELECT 1 FROM catalog_sync_status_v1 WHERE id = 'catalog');

-- Starter catalog (matches legacyInit seed when table empty)
INSERT INTO catalog_items (id, sku, category, description, uom, base_material_cost, base_labor_minutes, manufacturer, model, taxable, ada_flag, active)
SELECT 'c1', 'GA-36', 'Toilet Accessories', 'Grab Bar 36" Stainless Steel', 'EA', 45, 30, 'Bobrick', 'B-6806', 1, 0, 1
WHERE NOT EXISTS (SELECT 1 FROM catalog_items WHERE id = 'c1');

INSERT INTO catalog_items (id, sku, category, description, uom, base_material_cost, base_labor_minutes, manufacturer, model, taxable, ada_flag, active)
SELECT 'c2', 'SD-822', 'Toilet Accessories', 'Soap Dispenser, Deck Mounted', 'EA', 35, 25, 'Bobrick', 'B-822', 1, 0, 1
WHERE NOT EXISTS (SELECT 1 FROM catalog_items WHERE id = 'c2');

INSERT INTO catalog_items (id, sku, category, description, uom, base_material_cost, base_labor_minutes, manufacturer, model, taxable, ada_flag, active)
SELECT 'c5', 'M-1836', 'Toilet Accessories', 'Mirror 18" x 36" Channel Frame', 'EA', 65, 20, 'Bobrick', 'B-165', 1, 0, 1
WHERE NOT EXISTS (SELECT 1 FROM catalog_items WHERE id = 'c5');

INSERT INTO catalog_items (id, sku, category, description, uom, base_material_cost, base_labor_minutes, manufacturer, model, taxable, ada_flag, active)
SELECT 'c6', 'TD-262', 'Toilet Accessories', 'Paper Towel Dispenser, Surface', 'EA', 85, 20, 'Bobrick', 'B-262', 1, 0, 1
WHERE NOT EXISTS (SELECT 1 FROM catalog_items WHERE id = 'c6');

INSERT INTO catalog_items (id, sku, category, description, uom, base_material_cost, base_labor_minutes, manufacturer, model, taxable, ada_flag, active)
SELECT 'c7', 'ND-270', 'Toilet Accessories', 'Sanitary Napkin Disposal', 'EA', 42, 15, 'Bobrick', 'B-270', 1, 0, 1
WHERE NOT EXISTS (SELECT 1 FROM catalog_items WHERE id = 'c7');

INSERT INTO catalog_items (id, sku, category, description, uom, base_material_cost, base_labor_minutes, manufacturer, model, taxable, ada_flag, active)
SELECT 'c3', 'TP-101', 'Partitions', 'Toilet Partition, Powder Coated', 'EA', 450, 120, 'Hadrian', 'Standard', 1, 0, 1
WHERE NOT EXISTS (SELECT 1 FROM catalog_items WHERE id = 'c3');

INSERT INTO catalog_items (id, sku, category, description, uom, base_material_cost, base_labor_minutes, manufacturer, model, taxable, ada_flag, active)
SELECT 'c8', 'TP-201', 'Partitions', 'Toilet Partition, Stainless Steel', 'EA', 850, 150, 'Hadrian', 'Elite', 1, 0, 1
WHERE NOT EXISTS (SELECT 1 FROM catalog_items WHERE id = 'c8');

INSERT INTO catalog_items (id, sku, category, description, uom, base_material_cost, base_labor_minutes, manufacturer, model, taxable, ada_flag, active)
SELECT 'c9', 'TP-301', 'Partitions', 'Urinal Screen, Powder Coated', 'EA', 150, 45, 'Hadrian', 'Standard', 1, 0, 1
WHERE NOT EXISTS (SELECT 1 FROM catalog_items WHERE id = 'c9');

INSERT INTO catalog_items (id, sku, category, description, uom, base_material_cost, base_labor_minutes, manufacturer, model, taxable, ada_flag, active)
SELECT 'c4', 'L-1212', 'Lockers', 'Single Tier Locker 12x12x72', 'EA', 185, 45, 'Penco', 'Vanguard', 1, 0, 1
WHERE NOT EXISTS (SELECT 1 FROM catalog_items WHERE id = 'c4');

INSERT INTO catalog_items (id, sku, category, description, uom, base_material_cost, base_labor_minutes, manufacturer, model, taxable, ada_flag, active)
SELECT 'c10', 'L-1515', 'Lockers', 'Double Tier Locker 15x15x36', 'EA', 210, 60, 'Penco', 'Vanguard', 1, 0, 1
WHERE NOT EXISTS (SELECT 1 FROM catalog_items WHERE id = 'c10');

INSERT INTO catalog_items (id, sku, category, description, uom, base_material_cost, base_labor_minutes, manufacturer, model, taxable, ada_flag, active)
SELECT 'c11', 'L-BENCH', 'Lockers', 'Locker Bench 48" Maple', 'EA', 125, 30, 'Penco', 'Standard', 1, 0, 1
WHERE NOT EXISTS (SELECT 1 FROM catalog_items WHERE id = 'c11');

INSERT INTO catalog_items (id, sku, category, description, uom, base_material_cost, base_labor_minutes, manufacturer, model, taxable, ada_flag, active)
SELECT 'c12', 'WB-4896', 'Visual Display', 'Whiteboard 4x8 Magnetic', 'EA', 320, 60, 'Claridge', 'LCS', 1, 0, 1
WHERE NOT EXISTS (SELECT 1 FROM catalog_items WHERE id = 'c12');

INSERT INTO catalog_items (id, sku, category, description, uom, base_material_cost, base_labor_minutes, manufacturer, model, taxable, ada_flag, active)
SELECT 'c13', 'TB-4896', 'Visual Display', 'Tackboard 4x8 Cork', 'EA', 240, 45, 'Claridge', 'Standard', 1, 0, 1
WHERE NOT EXISTS (SELECT 1 FROM catalog_items WHERE id = 'c13');

INSERT INTO catalog_items (id, sku, category, description, uom, base_material_cost, base_labor_minutes, manufacturer, model, taxable, ada_flag, active)
SELECT 'c14', 'FE-10', 'Fire Specialties', 'Fire Extinguisher 10lb ABC', 'EA', 75, 10, 'Larsen', 'MP10', 1, 0, 1
WHERE NOT EXISTS (SELECT 1 FROM catalog_items WHERE id = 'c14');

INSERT INTO catalog_items (id, sku, category, description, uom, base_material_cost, base_labor_minutes, manufacturer, model, taxable, ada_flag, active)
SELECT 'c15', 'FEC-2409', 'Fire Specialties', 'Fire Extinguisher Cabinet, Recessed', 'EA', 145, 40, 'Larsen', '2409', 1, 0, 1
WHERE NOT EXISTS (SELECT 1 FROM catalog_items WHERE id = 'c15');
