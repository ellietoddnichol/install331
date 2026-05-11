-- =============================================================================
-- Supabase public schema audit (install331)
-- Run in: Supabase Dashboard → SQL Editor, or psql against your project DB.
--
-- Use the results to align .env.local (see comments in expected_surface) and
-- code table whitelists under src/server/db/catalogTable.ts, workspaceTable.ts.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Every relation in public (tables + views), sorted
-- -----------------------------------------------------------------------------
SELECT
  t.table_schema,
  t.table_name,
  t.table_type,
  COALESCE(
    (SELECT COUNT(*)::bigint
     FROM information_schema.columns c
     WHERE c.table_schema = t.table_schema
       AND c.table_name = t.table_name),
    0
  ) AS column_count
FROM information_schema.tables t
WHERE t.table_schema = 'public'
ORDER BY t.table_type, t.table_name;


-- -----------------------------------------------------------------------------
-- 2) Coverage: names this repo may reference vs what exists in public
--     status: PRESENT | MISSING
--     expected_surface: rough area in the app
--     env_hint: suggested override when your physical name differs
-- -----------------------------------------------------------------------------
WITH expected (
  relation_name,
  expected_surface,
  env_hint
) AS (
  VALUES
    -- Workspace (estimator DB when DB_DRIVER=pg)
    ('projects_v1', 'projects / workspace', NULL),
    ('rooms_v1', 'rooms / workspace', NULL),
    ('takeoff_lines_v1', 'takeoff lines / workspace (or bridge VIEW)', 'scripts/supabase-bridge-native-to-install331-views.sql'),
    ('takeoff_rows', 'native intake rows (not install331 line shape)', 'Use bridge VIEW takeoff_lines_v1; do not set WORKSPACE_TAKEOFF_LINES_TABLE=takeoff_rows'),
    ('projects', 'native projects table (Supabase)', 'Bridge → projects_v1 VIEW in supabase-bridge-native-to-install331-views.sql'),
    ('project_areas', 'native “rooms”', 'Bridge → rooms_v1 VIEW'),
    ('bundle_defs', 'native bundle headers', 'Bridge → bundles_v1 VIEW'),
    ('catalog_item_attributes_compat', 'attribute_def-style → sheet columns', 'CATALOG_ITEM_ATTRIBUTES_READ_TABLE=catalog_item_attributes_compat'),
    ('settings_v1', 'app settings row', NULL),
    ('line_modifiers_v1', 'per-line modifier instances', NULL),
    ('project_files_v1', 'uploaded project files', NULL),
    ('db_persistence_status_v1', 'SQLite backup metadata (often unused on pure PG)', NULL),
    ('intake_catalog_memory_v1', 'intake matcher memory', NULL),
    ('intake_review_overrides_v1', 'intake review overrides', NULL),
    ('install_labor_modifiers_v1', 'install labor modifier presets', NULL),
    -- Catalog core
    ('catalog_items', 'catalog items (physical writes)', NULL),
    ('catalog_items_clean', 'catalog items read view', 'CATALOG_ITEMS_TABLE=catalog_items_clean'),
    ('catalog_item_aliases', 'sheet-style aliases (alias_value)', NULL),
    ('catalog_item_aliases_clean', 'aliases clean view', 'CATALOG_ITEM_ALIASES_READ_TABLE=…'),
    ('catalog_aliases', 'Div 10 Brain synonyms (alias_text)', 'CATALOG_ITEM_ALIASES_READ_TABLE=catalog_aliases'),
    ('catalog_item_attributes', 'sheet-style attributes', NULL),
    ('catalog_item_attributes_clean', 'attributes clean view', NULL),
    ('modifiers_v1', 'catalog modifiers', 'CATALOG_MODIFIERS_READ_TABLE=…'),
    ('modifiers_v1_clean', 'modifiers clean view', NULL),
    ('bundles_v1', 'bundle headers', 'CATALOG_BUNDLES_READ_TABLE=…'),
    ('bundles_v1_clean', 'bundles clean view', NULL),
    ('bundles', 'bundle headers (short name)', 'CATALOG_BUNDLES_READ_TABLE=bundles'),
    ('bundle_items_v1', 'bundle lines', 'CATALOG_BUNDLE_ITEMS_READ_TABLE=…'),
    ('bundle_items_v1_clean', 'bundle items clean view', NULL),
    ('bundle_items', 'bundle lines (short name)', 'CATALOG_BUNDLE_ITEMS_READ_TABLE=bundle_items'),
    ('catalog_sync_status_v1', 'last catalog sync status', NULL),
    ('catalog_sync_runs_v1', 'catalog sync run history', NULL),
    ('catalog_sheet_import_rows', 'sheet import audit rows', NULL),
    -- Estimator normalization / validation (optional in some deployments)
    ('estimator_catalog_attribute_defs', 'estimator attrs', NULL),
    ('estimator_parametric_modifiers', 'parametric modifiers', NULL),
    ('estimator_parametric_modifiers_clean', 'parametric modifiers view', NULL),
    ('estimator_sku_aliases', 'estimator SKU aliases', NULL),
    ('estimator_sku_aliases_clean', 'estimator SKU aliases view', NULL),
    ('estimator_catalog_item_attributes', 'estimator item attrs', NULL),
    ('estimator_catalog_item_attributes_clean', 'estimator item attrs view', NULL),
    ('estimator_norm_bundles_v1', 'norm bundles', NULL),
    ('estimator_norm_bundle_items_v1', 'norm bundle items', NULL),
    ('estimator_catalog_validation_issues', 'validation issues', NULL),
    -- Div 10 / other common alternate names (may or may not exist)
    ('estimate_lines', 'estimate lines (some schemas)', NULL),
    ('catalog_health', 'optional health view (catalog health route)', NULL),
    ('catalog_attributes_clean', 'optional clean view', NULL),
    ('catalog_aliases_clean', 'optional clean view', NULL),
    ('catalog_labor_rules_clean', 'optional clean view', NULL),
    ('catalog_modifier_rules_clean', 'optional clean view', NULL)
),
actual AS (
  SELECT table_name AS relation_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_type IN ('BASE TABLE', 'VIEW')
)
SELECT
  e.relation_name,
  e.expected_surface,
  e.env_hint,
  CASE WHEN a.relation_name IS NOT NULL THEN 'PRESENT' ELSE 'MISSING' END AS status
FROM expected e
LEFT JOIN actual a ON a.relation_name = e.relation_name
ORDER BY status DESC, e.relation_name;


-- -----------------------------------------------------------------------------
-- 3) Extra relations in public NOT in the expected list (discover drift)
-- -----------------------------------------------------------------------------
WITH expected (relation_name) AS (
  VALUES
    ('projects_v1'),
    ('rooms_v1'),
    ('takeoff_lines_v1'),
    ('takeoff_rows'),
    ('projects'),
    ('project_areas'),
    ('bundle_defs'),
    ('catalog_item_attributes_compat'),
    ('settings_v1'),
    ('line_modifiers_v1'),
    ('project_files_v1'),
    ('db_persistence_status_v1'),
    ('intake_catalog_memory_v1'),
    ('intake_review_overrides_v1'),
    ('install_labor_modifiers_v1'),
    ('catalog_items'),
    ('catalog_items_clean'),
    ('catalog_item_aliases'),
    ('catalog_item_aliases_clean'),
    ('catalog_aliases'),
    ('catalog_item_attributes'),
    ('catalog_item_attributes_clean'),
    ('modifiers_v1'),
    ('modifiers_v1_clean'),
    ('bundles_v1'),
    ('bundles_v1_clean'),
    ('bundles'),
    ('bundle_items_v1'),
    ('bundle_items_v1_clean'),
    ('bundle_items'),
    ('catalog_sync_status_v1'),
    ('catalog_sync_runs_v1'),
    ('catalog_sheet_import_rows'),
    ('estimator_catalog_attribute_defs'),
    ('estimator_parametric_modifiers'),
    ('estimator_parametric_modifiers_clean'),
    ('estimator_sku_aliases'),
    ('estimator_sku_aliases_clean'),
    ('estimator_catalog_item_attributes'),
    ('estimator_catalog_item_attributes_clean'),
    ('estimator_norm_bundles_v1'),
    ('estimator_norm_bundle_items_v1'),
    ('estimator_catalog_validation_issues'),
    ('estimate_lines'),
    ('catalog_health'),
    ('catalog_attributes_clean'),
    ('catalog_aliases_clean'),
    ('catalog_labor_rules_clean'),
    ('catalog_modifier_rules_clean')
)
SELECT
  t.table_name AS extra_relation,
  t.table_type
FROM information_schema.tables t
WHERE t.table_schema = 'public'
  AND t.table_type IN ('BASE TABLE', 'VIEW')
  AND NOT EXISTS (SELECT 1 FROM expected e WHERE e.relation_name = t.table_name)
ORDER BY t.table_name;


-- -----------------------------------------------------------------------------
-- 4) Foreign keys into catalog_items (helps confirm TEXT id joins / table names)
-- -----------------------------------------------------------------------------
SELECT
  tc.table_schema AS referencing_schema,
  tc.table_name AS referencing_table,
  kcu.column_name AS referencing_column,
  ccu.table_schema AS referenced_schema,
  ccu.table_name AS referenced_table,
  ccu.column_name AS referenced_column,
  tc.constraint_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
 AND tc.constraint_schema = kcu.constraint_schema
 AND tc.table_schema = kcu.table_schema
 AND tc.table_name = kcu.table_name
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
 AND ccu.constraint_schema = tc.constraint_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND ccu.table_schema = 'public'
  AND ccu.table_name = 'catalog_items'
ORDER BY tc.table_name, kcu.column_name;


-- -----------------------------------------------------------------------------
-- 5) Column headers for key patterns (paste into a spreadsheet / diff vs code)
--     Adjust the LIKE list if you care about other prefixes.
-- -----------------------------------------------------------------------------
SELECT
  c.table_name,
  c.column_name,
  c.data_type,
  c.is_nullable,
  c.column_default
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND (
    c.table_name ILIKE '%catalog%'
    OR c.table_name ILIKE '%takeoff%'
    OR c.table_name ILIKE '%estimate%'
    OR c.table_name ILIKE '%bundle%'
    OR c.table_name ILIKE '%project%'
    OR c.table_name ILIKE '%room%'
    OR c.table_name ILIKE '%modifier%'
    OR c.table_name ILIKE '%settings%'
    OR c.table_name ILIKE '%intake%'
    OR c.table_name ILIKE '%line_%'
  )
ORDER BY c.table_name, c.ordinal_position;
