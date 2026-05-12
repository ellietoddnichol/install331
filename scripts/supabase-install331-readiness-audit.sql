-- =============================================================================
-- install331 setup readiness audit (Supabase Postgres `public`)
-- Run in: Supabase Dashboard → SQL Editor, or: psql "$DATABASE_URL" -f scripts/supabase-install331-readiness-audit.sql
--
-- Result 1: one row per check (PASS | FAIL | WARN).
-- Result 2: summary counts + fail_detail / warn_detail (which checks need attention).
-- Pair with scripts/supabase-public-schema-audit.sql for full relation lists + drift.
-- =============================================================================

WITH
rel AS (
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_type IN ('BASE TABLE', 'VIEW')
),
col AS (
  SELECT table_name, column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
),
f AS (
  SELECT
    EXISTS (SELECT 1 FROM rel WHERE table_name = 'catalog_items') AS has_catalog_items,
    EXISTS (SELECT 1 FROM rel WHERE table_name = 'catalog_items_clean') AS has_catalog_items_clean,
    EXISTS (SELECT 1 FROM rel WHERE table_name IN ('catalog_item_aliases', 'catalog_aliases')) AS has_any_aliases,
    EXISTS (SELECT 1 FROM rel WHERE table_name = 'catalog_item_aliases') AS has_sheet_aliases,
    EXISTS (
      SELECT 1 FROM col
      WHERE table_name = 'catalog_item_attributes' AND column_name = 'attribute_type'
    ) AS has_attr_sheet_columns,
    EXISTS (SELECT 1 FROM rel WHERE table_name = 'catalog_item_attributes_compat') AS has_attr_compat,
    EXISTS (SELECT 1 FROM rel WHERE table_name = 'catalog_item_attributes') AS has_attr_table,
    EXISTS (
      SELECT 1 FROM col
      WHERE table_name = 'catalog_item_attributes_clean' AND column_name = 'attribute_type'
    ) AS has_attr_clean_type,
    EXISTS (SELECT 1 FROM rel WHERE table_name = 'catalog_item_attributes_clean') AS has_attr_clean,
    EXISTS (SELECT 1 FROM rel WHERE table_name IN ('modifiers_v1', 'modifiers')) AS has_modifiers,
    EXISTS (SELECT 1 FROM rel WHERE table_name IN ('bundles_v1', 'bundles')) AS has_bundles,
    EXISTS (SELECT 1 FROM rel WHERE table_name IN ('bundle_items_v1', 'bundle_items')) AS has_bundle_items,
    EXISTS (SELECT 1 FROM rel WHERE table_name IN ('projects_v1', 'projects')) AS has_projects,
    EXISTS (SELECT 1 FROM rel WHERE table_name IN ('rooms_v1', 'project_areas')) AS has_rooms,
    EXISTS (SELECT 1 FROM rel WHERE table_name = 'takeoff_lines_v1') AS has_takeoff_v1,
    EXISTS (SELECT 1 FROM rel WHERE table_name = 'takeoff_rows') AS has_takeoff_rows,
    EXISTS (SELECT 1 FROM rel WHERE table_name = 'settings_v1') AS has_settings,
    EXISTS (SELECT 1 FROM rel WHERE table_name = 'catalog_sync_status_v1') AS has_sync_status,
    EXISTS (SELECT 1 FROM rel WHERE table_name = 'intake_catalog_memory_v1') AS has_intake_memory,
    EXISTS (SELECT 1 FROM rel WHERE table_name = 'intake_review_overrides_v1') AS has_intake_overrides,
    EXISTS (SELECT 1 FROM rel WHERE table_name = 'estimator_parametric_modifiers') AS has_est_mod,
    EXISTS (SELECT 1 FROM rel WHERE table_name = 'estimator_sku_aliases') AS has_est_sku,
    EXISTS (SELECT 1 FROM rel WHERE table_name = 'estimator_catalog_item_attributes') AS has_est_attr
  FROM (SELECT 1) AS _
),
checks AS (
  SELECT * FROM (
    SELECT
      10 AS sort_key,
      'catalog_items (base table)' AS check_name,
      'catalog / writes' AS hint,
      CASE WHEN f.has_catalog_items THEN 'PASS' ELSE 'FAIL' END AS status
    FROM f
    UNION ALL
    SELECT 20, 'catalog_items_clean (view)', 'optional read surface; set CATALOG_ITEMS_TABLE=catalog_items_clean',
      CASE WHEN f.has_catalog_items_clean THEN 'PASS' ELSE 'WARN' END FROM f
    UNION ALL
    SELECT 30, 'aliases: catalog_item_aliases OR catalog_aliases', 'sheet aliases vs Div10 Brain synonyms',
      CASE WHEN f.has_any_aliases THEN 'PASS' ELSE 'FAIL' END FROM f
    UNION ALL
    SELECT 40, 'attributes: sheet-shape reads (table.attribute_type OR compat view)', 'native EAV → run bridge script for catalog_item_attributes_compat',
      CASE
        WHEN f.has_attr_sheet_columns OR f.has_attr_compat THEN 'PASS'
        WHEN f.has_attr_table THEN 'FAIL'
        ELSE 'WARN'
      END
    FROM f
    UNION ALL
    SELECT 50, 'catalog_item_attributes_compat (view)', 'scripts/supabase-bridge-native-to-install331-views.sql',
      CASE WHEN f.has_attr_compat THEN 'PASS' ELSE 'WARN' END FROM f
    UNION ALL
    SELECT 60, 'catalog_item_attributes_clean exposes attribute_type', 'migration 20260512180000_catalog_item_attributes_clean_native_fallback.sql',
      CASE
        WHEN f.has_attr_clean_type THEN 'PASS'
        WHEN NOT f.has_attr_clean THEN 'WARN'
        ELSE 'FAIL'
      END
    FROM f
    UNION ALL
    SELECT 70, 'modifiers: modifiers_v1 OR modifiers', 'CATALOG_MODIFIERS_READ_TABLE',
      CASE WHEN f.has_modifiers THEN 'PASS' ELSE 'FAIL' END FROM f
    UNION ALL
    SELECT 80, 'bundles: bundles_v1 OR bundles', 'CATALOG_BUNDLES_READ_TABLE',
      CASE WHEN f.has_bundles THEN 'PASS' ELSE 'FAIL' END FROM f
    UNION ALL
    SELECT 90, 'bundle lines: bundle_items_v1 OR bundle_items', 'CATALOG_BUNDLE_ITEMS_READ_TABLE',
      CASE WHEN f.has_bundle_items THEN 'PASS' ELSE 'FAIL' END FROM f
    UNION ALL
    SELECT 100, 'projects: projects_v1 OR projects', 'bridge → projects_v1 if native only',
      CASE WHEN f.has_projects THEN 'PASS' ELSE 'FAIL' END FROM f
    UNION ALL
    SELECT 110, 'rooms: rooms_v1 OR project_areas', 'bridge → rooms_v1 if native only',
      CASE WHEN f.has_rooms THEN 'PASS' ELSE 'FAIL' END FROM f
    UNION ALL
    SELECT 120, 'takeoff lines: takeoff_lines_v1 (recommended)', 'avoid WORKSPACE_TAKEOFF_LINES_TABLE=takeoff_rows',
      CASE
        WHEN f.has_takeoff_v1 THEN 'PASS'
        WHEN f.has_takeoff_rows THEN 'WARN'
        ELSE 'WARN'
      END
    FROM f
    UNION ALL
    SELECT 130, 'settings_v1', 'app settings row',
      CASE WHEN f.has_settings THEN 'PASS' ELSE 'FAIL' END FROM f
    UNION ALL
    SELECT 140, 'catalog_sync_status_v1', 'catalog sync UI / status',
      CASE WHEN f.has_sync_status THEN 'PASS' ELSE 'WARN' END FROM f
    UNION ALL
    SELECT 150, 'intake_catalog_memory_v1', 'intake matcher memory',
      CASE WHEN f.has_intake_memory THEN 'PASS' ELSE 'WARN' END FROM f
    UNION ALL
    SELECT 160, 'intake_review_overrides_v1', 'intake review overrides',
      CASE WHEN f.has_intake_overrides THEN 'PASS' ELSE 'WARN' END FROM f
    UNION ALL
    SELECT 170, 'catalog_item_aliases (sheet table)', 'required if CATALOG_ITEM_ALIASES_READ_TABLE=catalog_item_aliases',
      CASE WHEN f.has_sheet_aliases THEN 'PASS' ELSE 'WARN' END FROM f
    UNION ALL
    SELECT 180, 'estimator_parametric_modifiers', 'optional estimator reads',
      CASE WHEN f.has_est_mod THEN 'PASS' ELSE 'WARN' END FROM f
    UNION ALL
    SELECT 190, 'estimator_sku_aliases', 'optional estimator reads',
      CASE WHEN f.has_est_sku THEN 'PASS' ELSE 'WARN' END FROM f
    UNION ALL
    SELECT 200, 'estimator_catalog_item_attributes', 'optional estimator reads',
      CASE WHEN f.has_est_attr THEN 'PASS' ELSE 'WARN' END FROM f
  ) AS u
)
SELECT sort_key, check_name, hint, status
FROM checks
ORDER BY sort_key;

-- -----------------------------------------------------------------------------
-- Summary + which checks failed / warned (read this if you only see counts)
-- -----------------------------------------------------------------------------
WITH
rel AS (
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_type IN ('BASE TABLE', 'VIEW')
),
col AS (
  SELECT table_name, column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
),
f AS (
  SELECT
    EXISTS (SELECT 1 FROM rel WHERE table_name = 'catalog_items') AS has_catalog_items,
    EXISTS (SELECT 1 FROM rel WHERE table_name = 'catalog_items_clean') AS has_catalog_items_clean,
    EXISTS (SELECT 1 FROM rel WHERE table_name IN ('catalog_item_aliases', 'catalog_aliases')) AS has_any_aliases,
    EXISTS (SELECT 1 FROM rel WHERE table_name = 'catalog_item_aliases') AS has_sheet_aliases,
    EXISTS (
      SELECT 1 FROM col
      WHERE table_name = 'catalog_item_attributes' AND column_name = 'attribute_type'
    ) AS has_attr_sheet_columns,
    EXISTS (SELECT 1 FROM rel WHERE table_name = 'catalog_item_attributes_compat') AS has_attr_compat,
    EXISTS (SELECT 1 FROM rel WHERE table_name = 'catalog_item_attributes') AS has_attr_table,
    EXISTS (
      SELECT 1 FROM col
      WHERE table_name = 'catalog_item_attributes_clean' AND column_name = 'attribute_type'
    ) AS has_attr_clean_type,
    EXISTS (SELECT 1 FROM rel WHERE table_name = 'catalog_item_attributes_clean') AS has_attr_clean,
    EXISTS (SELECT 1 FROM rel WHERE table_name IN ('modifiers_v1', 'modifiers')) AS has_modifiers,
    EXISTS (SELECT 1 FROM rel WHERE table_name IN ('bundles_v1', 'bundles')) AS has_bundles,
    EXISTS (SELECT 1 FROM rel WHERE table_name IN ('bundle_items_v1', 'bundle_items')) AS has_bundle_items,
    EXISTS (SELECT 1 FROM rel WHERE table_name IN ('projects_v1', 'projects')) AS has_projects,
    EXISTS (SELECT 1 FROM rel WHERE table_name IN ('rooms_v1', 'project_areas')) AS has_rooms,
    EXISTS (SELECT 1 FROM rel WHERE table_name = 'takeoff_lines_v1') AS has_takeoff_v1,
    EXISTS (SELECT 1 FROM rel WHERE table_name = 'takeoff_rows') AS has_takeoff_rows,
    EXISTS (SELECT 1 FROM rel WHERE table_name = 'settings_v1') AS has_settings,
    EXISTS (SELECT 1 FROM rel WHERE table_name = 'catalog_sync_status_v1') AS has_sync_status,
    EXISTS (SELECT 1 FROM rel WHERE table_name = 'intake_catalog_memory_v1') AS has_intake_memory,
    EXISTS (SELECT 1 FROM rel WHERE table_name = 'intake_review_overrides_v1') AS has_intake_overrides,
    EXISTS (SELECT 1 FROM rel WHERE table_name = 'estimator_parametric_modifiers') AS has_est_mod,
    EXISTS (SELECT 1 FROM rel WHERE table_name = 'estimator_sku_aliases') AS has_est_sku,
    EXISTS (SELECT 1 FROM rel WHERE table_name = 'estimator_catalog_item_attributes') AS has_est_attr
  FROM (SELECT 1) AS _
),
checks AS (
  SELECT * FROM (
    SELECT 10 AS sort_key, 'catalog_items (base table)' AS check_name, 'catalog / writes' AS hint,
      CASE WHEN f.has_catalog_items THEN 'PASS' ELSE 'FAIL' END AS status FROM f
    UNION ALL SELECT 20, 'catalog_items_clean (view)', 'optional read surface; set CATALOG_ITEMS_TABLE=catalog_items_clean',
      CASE WHEN f.has_catalog_items_clean THEN 'PASS' ELSE 'WARN' END FROM f
    UNION ALL SELECT 30, 'aliases: catalog_item_aliases OR catalog_aliases', 'sheet aliases vs Div10 Brain synonyms',
      CASE WHEN f.has_any_aliases THEN 'PASS' ELSE 'FAIL' END FROM f
    UNION ALL SELECT 40, 'attributes: sheet-shape reads (table.attribute_type OR compat view)', 'native EAV → run bridge script for catalog_item_attributes_compat',
      CASE WHEN f.has_attr_sheet_columns OR f.has_attr_compat THEN 'PASS' WHEN f.has_attr_table THEN 'FAIL' ELSE 'WARN' END FROM f
    UNION ALL SELECT 50, 'catalog_item_attributes_compat (view)', 'scripts/supabase-bridge-native-to-install331-views.sql',
      CASE WHEN f.has_attr_compat THEN 'PASS' ELSE 'WARN' END FROM f
    UNION ALL SELECT 60, 'catalog_item_attributes_clean exposes attribute_type', 'migration 20260512180000_catalog_item_attributes_clean_native_fallback.sql',
      CASE WHEN f.has_attr_clean_type THEN 'PASS' WHEN NOT f.has_attr_clean THEN 'WARN' ELSE 'FAIL' END FROM f
    UNION ALL SELECT 70, 'modifiers: modifiers_v1 OR modifiers', 'CATALOG_MODIFIERS_READ_TABLE',
      CASE WHEN f.has_modifiers THEN 'PASS' ELSE 'FAIL' END FROM f
    UNION ALL SELECT 80, 'bundles: bundles_v1 OR bundles', 'CATALOG_BUNDLES_READ_TABLE',
      CASE WHEN f.has_bundles THEN 'PASS' ELSE 'FAIL' END FROM f
    UNION ALL SELECT 90, 'bundle lines: bundle_items_v1 OR bundle_items', 'CATALOG_BUNDLE_ITEMS_READ_TABLE',
      CASE WHEN f.has_bundle_items THEN 'PASS' ELSE 'FAIL' END FROM f
    UNION ALL SELECT 100, 'projects: projects_v1 OR projects', 'bridge → projects_v1 if native only',
      CASE WHEN f.has_projects THEN 'PASS' ELSE 'FAIL' END FROM f
    UNION ALL SELECT 110, 'rooms: rooms_v1 OR project_areas', 'bridge → rooms_v1 if native only',
      CASE WHEN f.has_rooms THEN 'PASS' ELSE 'FAIL' END FROM f
    UNION ALL SELECT 120, 'takeoff lines: takeoff_lines_v1 (recommended)', 'avoid WORKSPACE_TAKEOFF_LINES_TABLE=takeoff_rows',
      CASE WHEN f.has_takeoff_v1 THEN 'PASS' WHEN f.has_takeoff_rows THEN 'WARN' ELSE 'WARN' END FROM f
    UNION ALL SELECT 130, 'settings_v1', 'app settings row',
      CASE WHEN f.has_settings THEN 'PASS' ELSE 'FAIL' END FROM f
    UNION ALL SELECT 140, 'catalog_sync_status_v1', 'catalog sync UI / status',
      CASE WHEN f.has_sync_status THEN 'PASS' ELSE 'WARN' END FROM f
    UNION ALL SELECT 150, 'intake_catalog_memory_v1', 'intake matcher memory',
      CASE WHEN f.has_intake_memory THEN 'PASS' ELSE 'WARN' END FROM f
    UNION ALL SELECT 160, 'intake_review_overrides_v1', 'intake review overrides',
      CASE WHEN f.has_intake_overrides THEN 'PASS' ELSE 'WARN' END FROM f
    UNION ALL SELECT 170, 'catalog_item_aliases (sheet table)', 'required if CATALOG_ITEM_ALIASES_READ_TABLE=catalog_item_aliases',
      CASE WHEN f.has_sheet_aliases THEN 'PASS' ELSE 'WARN' END FROM f
    UNION ALL SELECT 180, 'estimator_parametric_modifiers', 'optional estimator reads',
      CASE WHEN f.has_est_mod THEN 'PASS' ELSE 'WARN' END FROM f
    UNION ALL SELECT 190, 'estimator_sku_aliases', 'optional estimator reads',
      CASE WHEN f.has_est_sku THEN 'PASS' ELSE 'WARN' END FROM f
    UNION ALL SELECT 200, 'estimator_catalog_item_attributes', 'optional estimator reads',
      CASE WHEN f.has_est_attr THEN 'PASS' ELSE 'WARN' END FROM f
  ) AS u
)
SELECT
  COUNT(*) FILTER (WHERE status = 'FAIL')::bigint AS fail_count,
  COUNT(*) FILTER (WHERE status = 'WARN')::bigint AS warn_count,
  COUNT(*) FILTER (WHERE status = 'PASS')::bigint AS pass_count,
  CASE WHEN COUNT(*) FILTER (WHERE status = 'FAIL') = 0 THEN 'OK for core checks (review WARN)' ELSE 'FIX FAIL rows before deploy' END AS rollup,
  (SELECT string_agg(check_name || ' — ' || hint, E'\n' ORDER BY sort_key) FROM checks WHERE status = 'FAIL') AS fail_detail,
  (SELECT string_agg(check_name || ' — ' || hint, E'\n' ORDER BY sort_key) FROM checks WHERE status = 'WARN') AS warn_detail
FROM checks;
