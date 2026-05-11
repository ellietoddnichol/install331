-- =============================================================================
-- Bridge: native Supabase schema (projects, project_areas, takeoff_rows,
-- bundle_defs, bundle_items, modifiers, catalog_item_attributes + defs, …)
--  →  install331 Node expectations (projects_v1, rooms_v1, takeoff_lines_v1,
--     bundles_v1, bundle_items_v1, modifiers_v1, …)
--
-- Run in Supabase SQL Editor on a BACKUP / staging project first.
--
-- What this does
--   • CREATE OR REPLACE VIEW for read paths the app already queries by name.
--   • CREATE TABLE IF NOT EXISTS for small estimator tables that are missing
--     in your project (settings row, catalog sync status, line_modifiers, …).
--
-- What this does NOT guarantee
--   • INSERT/UPDATE into projects_v1 / rooms_v1 / takeoff_lines_v1: these are
--     VIEWS. Project/room/takeoff mutations from install331 still need either
--     INSTEAD OF triggers, real *_v1 tables from repo migrations, or a native
--     API layer. Reads (list/get) and catalog flows are the main win.
--
-- After apply
--   • Optional: CATALOG_ITEM_ATTRIBUTES_READ_TABLE=catalog_item_attributes_compat
--   • Do NOT set WORKSPACE_TAKEOFF_LINES_TABLE=takeoff_rows (wrong columns);
--     keep default takeoff_lines_v1 so this VIEW is used.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0) Helper: ISO-8601 text (matches what better-sqlite3 / app strings use)
-- ---------------------------------------------------------------------------
-- Use inline to_char(..., 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') below.

-- ---------------------------------------------------------------------------
-- 1) Drop old bridge views (safe re-run). Order: children first.
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS public.takeoff_lines_v1 CASCADE;
DROP VIEW IF EXISTS public.rooms_v1 CASCADE;
DROP VIEW IF EXISTS public.projects_v1 CASCADE;
DROP VIEW IF EXISTS public.bundle_items_v1 CASCADE;
DROP VIEW IF EXISTS public.bundles_v1 CASCADE;
DROP VIEW IF EXISTS public.modifiers_v1 CASCADE;
DROP VIEW IF EXISTS public.catalog_item_attributes_compat CASCADE;

-- ---------------------------------------------------------------------------
-- 2) projects_v1 — read mapping from public.projects (uuid id → text id)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.projects_v1 AS
SELECT
  p.id::text AS id,
  p.project_number,
  'manual'::text AS project_number_source,
  p.name AS project_name,
  p.customer_name AS client_name,
  'manual'::text AS client_name_source,
  NULL::text AS general_contractor,
  NULL::text AS estimator,
  NULL::text AS bid_date,
  NULL::text AS proposal_date,
  NULL::text AS due_date,
  p.address,
  'manual'::text AS address_source,
  'manual'::text AS location_label_source,
  NULL::text AS project_type,
  NULL::text AS project_size,
  NULL::text AS floor_level,
  NULL::text AS access_difficulty,
  NULL::text AS install_height,
  NULL::text AS material_handling,
  NULL::text AS wall_substrate,
  0::double precision AS labor_burden_percent,
  15::double precision AS overhead_percent,
  10::double precision AS profit_percent,
  8.25::double precision AS tax_percent,
  'labor_and_material'::text AS pricing_mode,
  '[]'::text AS scope_categories_json,
  '[]'::text AS preferred_brands_json,
  '{}'::text AS job_conditions_json,
  CASE lower(p.status::text)
    WHEN 'draft' THEN 'Draft'
    WHEN 'archived' THEN 'Archived'
    ELSE initcap(p.status::text)
  END AS status,
  p.notes,
  NULL::text AS special_notes,
  5::double precision AS labor_overhead_percent,
  0::double precision AS labor_profit_percent,
  0::integer AS sub_labor_management_fee_enabled,
  5::double precision AS sub_labor_management_fee_percent,
  0::integer AS proposal_include_special_notes,
  'standard'::text AS proposal_format,
  0::integer AS proposal_include_catalog_images,
  '[]'::text AS structured_assumptions_json,
  to_char(p.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
  to_char(p.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at
FROM public.projects p;

-- ---------------------------------------------------------------------------
-- 3) rooms_v1 — from project_areas (name → room_name)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.rooms_v1 AS
SELECT
  pa.id::text AS id,
  pa.project_id::text AS project_id,
  pa.name AS room_name,
  pa.sort_order,
  NULL::text AS notes,
  to_char(pa.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
  to_char(pa.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at
FROM public.project_areas pa;

-- ---------------------------------------------------------------------------
-- 4) takeoff_lines_v1 — from pricing view + takeoff_rows (intake → estimator row)
--     Requires at least one project_areas row per project OR area_id set;
--     otherwise room_id falls back to first area by sort_order.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.takeoff_lines_v1 AS
SELECT
  v.takeoff_row_id::text AS id,
  v.project_id::text AS project_id,
  COALESCE(v.area_id::text, pa.id::text) AS room_id,
  'takeoff_upload'::text AS source_type,
  v.takeoff_upload_id::text AS source_ref,
  COALESCE(v.raw_description, v.normalized_description, v.catalog_description, '') AS description,
  'customer_visible'::text AS proposal_visibility,
  NULL::text AS proposal_description_override,
  NULL::text AS parent_estimate_line_id,
  'catalog_item'::text AS source_line_type,
  v.sku,
  v.category,
  v.subcategory,
  NULL::text AS base_type,
  COALESCE(v.qty, 1)::double precision AS qty,
  COALESCE(NULLIF(btrim(v.takeoff_unit), ''), v.catalog_uom, 'EA') AS unit,
  (
    COALESCE(v.resolved_material_unit_cost, v.item_material_unit_cost, 0)::double precision
    * COALESCE(v.qty, 1)::double precision
  ) AS material_cost,
  (
    COALESCE(v.resolved_material_unit_cost, v.item_material_unit_cost, 0)::double precision
    * COALESCE(v.qty, 1)::double precision
  ) AS base_material_cost,
  (
    COALESCE(v.resolved_labor_minutes_per_unit, v.item_labor_minutes_per_unit, 0)::double precision
    * COALESCE(v.qty, 1)::double precision
  ) AS labor_minutes,
  0::double precision AS labor_cost,
  0::double precision AS base_labor_cost,
  'auto'::text AS pricing_source,
  CASE
    WHEN COALESCE(v.qty, 0) <> 0 THEN (
      (
        COALESCE(v.resolved_material_unit_cost, v.item_material_unit_cost, 0)::double precision
        * COALESCE(v.qty, 1)::double precision
      )
      / NULLIF(v.qty::double precision, 0)
    )
    ELSE COALESCE(v.resolved_material_unit_cost, v.item_material_unit_cost, 0)::double precision
  END AS unit_sell,
  (
    COALESCE(v.resolved_material_unit_cost, v.item_material_unit_cost, 0)::double precision
    * COALESCE(v.qty, 1)::double precision
  ) AS line_total,
  v.takeoff_notes AS notes,
  NULL::text AS bundle_id,
  COALESCE(v.accepted_catalog_item_id, v.resolved_catalog_item_id, v.catalog_item_id) AS catalog_item_id,
  NULL::text AS variant_id,
  v.scope_bucket AS intake_scope_bucket,
  CASE
    WHEN v.match_confidence_score IS NULL THEN NULL::text
    WHEN v.match_confidence_score >= 0.85 THEN 'strong'
    WHEN v.match_confidence_score >= 0.5 THEN 'possible'
    ELSE 'none'
  END AS intake_match_confidence,
  v.manufacturer AS source_manufacturer,
  NULL::text AS source_bid_bucket,
  NULL::text AS source_section_header,
  NULL::integer AS is_installable_scope,
  NULL::text AS install_scope_type,
  NULL::text AS install_labor_family,
  NULL::double precision AS source_material_cost,
  NULL::double precision AS generated_labor_minutes,
  NULL::text AS labor_origin,
  NULL::text AS catalog_attribute_snapshot_json,
  NULL::double precision AS base_material_cost_snapshot,
  NULL::double precision AS base_labor_minutes_snapshot,
  NULL::text AS attribute_delta_material_snapshot_json,
  NULL::text AS attribute_delta_labor_snapshot_json,
  to_char(tr.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
  to_char(tr.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at
FROM public.v_takeoff_rows_estimate_pricing v
JOIN public.takeoff_rows tr ON tr.id = v.takeoff_row_id
LEFT JOIN LATERAL (
  SELECT pa.id
  FROM public.project_areas pa
  WHERE pa.project_id = v.project_id
  ORDER BY pa.sort_order NULLS LAST, pa.created_at
  LIMIT 1
) pa ON true;

-- ---------------------------------------------------------------------------
-- 5) bundles_v1 / bundle_items_v1 — from bundle_defs + bundle_items + catalog_items
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.bundles_v1 AS
SELECT
  d.id::text AS id,
  d.name AS bundle_name,
  d.category,
  (CASE WHEN d.active THEN 1 ELSE 0 END)::smallint AS active,
  to_char(d.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at
FROM public.bundle_defs d;

CREATE OR REPLACE VIEW public.bundle_items_v1 AS
SELECT
  bi.id::text AS id,
  bi.bundle_def_id::text AS bundle_id,
  bi.catalog_item_id,
  ci.sku,
  COALESCE(ci.description, '')::text AS description,
  bi.qty::double precision AS qty,
  (COALESCE(ci.base_material_cost, 0)::double precision * bi.qty::double precision) AS material_cost,
  (COALESCE(ci.base_labor_minutes, 0)::double precision * bi.qty::double precision) AS labor_minutes,
  0::double precision AS labor_cost,
  bi.sort_order,
  NULL::text AS notes
FROM public.bundle_items bi
LEFT JOIN public.catalog_items ci ON ci.id = bi.catalog_item_id;

-- ---------------------------------------------------------------------------
-- 6) modifiers_v1 — from public.modifiers (shape differs; best-effort)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.modifiers_v1 AS
SELECT
  m.id::text AS id,
  m.name,
  m.code AS modifier_key,
  ''::text AS description,
  '[]'::text AS applies_to_categories,
  CASE WHEN lower(m.modifier_type) LIKE '%minute%' THEN m.value::double precision ELSE 0::double precision END AS add_labor_minutes,
  CASE WHEN lower(m.modifier_type) LIKE '%material%' OR lower(m.modifier_type) LIKE '%cost%' THEN m.value::double precision ELSE 0::double precision END AS add_material_cost,
  0::double precision AS percent_labor,
  0::double precision AS percent_material,
  CASE WHEN m.active THEN 1 ELSE 0 END AS active,
  to_char(m.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at
FROM public.modifiers m;

-- ---------------------------------------------------------------------------
-- 7) catalog_item_attributes_compat — sheet-style columns for install331 UI
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.catalog_item_attributes_compat AS
SELECT
  cia.id::text AS id,
  cia.catalog_item_id,
  cad.key AS attribute_type,
  COALESCE(cia.value_text, cia.value_number::text, cia.value_boolean::text) AS attribute_value,
  NULL::text AS material_delta_type,
  NULL::double precision AS material_delta_value,
  NULL::text AS labor_delta_type,
  NULL::double precision AS labor_delta_value,
  1::smallint AS active,
  cad.sort_order,
  to_char(cia.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
  to_char(cia.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at
FROM public.catalog_item_attributes cia
JOIN public.catalog_attribute_defs cad ON cad.id = cia.attribute_def_id;

-- ---------------------------------------------------------------------------
-- 8) Physical tables expected by the app but often absent in “native only” DBs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.settings_v1 (
  id text PRIMARY KEY,
  company_name text NOT NULL,
  company_address text NOT NULL,
  company_phone text NOT NULL,
  company_email text NOT NULL,
  logo_url text NOT NULL,
  default_labor_rate_per_hour double precision NOT NULL DEFAULT 100,
  default_overhead_percent double precision NOT NULL DEFAULT 0,
  default_profit_percent double precision NOT NULL DEFAULT 0,
  default_tax_percent double precision NOT NULL DEFAULT 0,
  default_labor_burden_percent double precision NOT NULL DEFAULT 0,
  default_labor_overhead_percent double precision NOT NULL DEFAULT 5,
  proposal_intro text NOT NULL,
  proposal_terms text NOT NULL,
  proposal_exclusions text NOT NULL DEFAULT '',
  proposal_clarifications text NOT NULL DEFAULT '',
  proposal_acceptance_label text NOT NULL DEFAULT 'Accepted By',
  intake_catalog_auto_apply_mode text NOT NULL DEFAULT 'off',
  intake_catalog_tier_a_min_score double precision NOT NULL DEFAULT 0.82,
  updated_at text NOT NULL
);

INSERT INTO public.settings_v1 (
  id, company_name, company_address, company_phone, company_email, logo_url,
  default_labor_rate_per_hour, default_overhead_percent, default_profit_percent, default_tax_percent,
  default_labor_burden_percent, default_labor_overhead_percent,
  proposal_intro, proposal_terms, proposal_exclusions, proposal_clarifications, proposal_acceptance_label,
  intake_catalog_auto_apply_mode, intake_catalog_tier_a_min_score, updated_at
)
SELECT
  'global', 'Company', '', '', '', '',
  100, 15, 10, 8.25, 0, 5,
  'Thank you for the opportunity to provide this proposal.',
  'Payment terms net 30. Prices valid for 30 days.',
  '', '', 'Accepted By',
  'off', 0.82,
  to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
WHERE NOT EXISTS (SELECT 1 FROM public.settings_v1 s WHERE s.id = 'global');

CREATE TABLE IF NOT EXISTS public.catalog_sync_status_v1 (
  id text PRIMARY KEY,
  last_attempt_at text,
  last_success_at text,
  status text NOT NULL DEFAULT 'never',
  message text,
  items_synced integer NOT NULL DEFAULT 0,
  modifiers_synced integer NOT NULL DEFAULT 0,
  bundles_synced integer NOT NULL DEFAULT 0,
  bundle_items_synced integer NOT NULL DEFAULT 0,
  aliases_synced integer NOT NULL DEFAULT 0,
  attributes_synced integer NOT NULL DEFAULT 0,
  warnings_json text NOT NULL DEFAULT '[]'
);

INSERT INTO public.catalog_sync_status_v1 (id, status, warnings_json)
SELECT 'catalog', 'never', '[]'
WHERE NOT EXISTS (SELECT 1 FROM public.catalog_sync_status_v1 WHERE id = 'catalog');

CREATE TABLE IF NOT EXISTS public.catalog_sync_runs_v1 (
  id text PRIMARY KEY,
  attempted_at text NOT NULL,
  status text NOT NULL,
  message text,
  items_synced integer NOT NULL DEFAULT 0,
  modifiers_synced integer NOT NULL DEFAULT 0,
  bundles_synced integer NOT NULL DEFAULT 0,
  bundle_items_synced integer NOT NULL DEFAULT 0,
  aliases_synced integer NOT NULL DEFAULT 0,
  attributes_synced integer NOT NULL DEFAULT 0,
  warnings_json text NOT NULL DEFAULT '[]',
  run_context_json text
);

CREATE TABLE IF NOT EXISTS public.intake_catalog_memory_v1 (
  memory_key text PRIMARY KEY,
  catalog_item_id text NOT NULL,
  hit_count integer NOT NULL DEFAULT 1,
  updated_at text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.intake_review_overrides_v1 (
  review_line_fingerprint text PRIMARY KEY,
  status text NOT NULL,
  updated_at text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.line_modifiers_v1 (
  id text PRIMARY KEY,
  line_id text NOT NULL,
  modifier_id text NOT NULL,
  name text NOT NULL,
  add_material_cost double precision NOT NULL DEFAULT 0,
  add_labor_minutes double precision NOT NULL DEFAULT 0,
  percent_material double precision NOT NULL DEFAULT 0,
  percent_labor double precision NOT NULL DEFAULT 0,
  created_at text NOT NULL
);

COMMIT;

-- =============================================================================
-- Post-run env (server / Cloud Run), adjust to taste:
--
--   CATALOG_MODIFIERS_READ_TABLE=modifiers_v1
--   CATALOG_BUNDLES_READ_TABLE=bundles_v1
--   CATALOG_BUNDLE_ITEMS_READ_TABLE=bundle_items_v1
--   CATALOG_ITEM_ATTRIBUTES_READ_TABLE=catalog_item_attributes_compat
--
-- Optional: merge proposal defaults from app_settings JSON into settings_v1
-- (manual SQL / admin UI) — this script seeds a minimal global row only.
-- =============================================================================
