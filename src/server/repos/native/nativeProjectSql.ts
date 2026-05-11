/**
 * Row shape matches `public.projects_v1` / `mapProjectRow` in projectsRepo.ts
 * (same projection as `scripts/supabase-bridge-native-to-install331-views.sql`).
 */
export const NATIVE_PROJECT_ROW_SELECT = `
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
FROM public.projects p
`.trim();

export const NATIVE_ROOM_ROW_SELECT = `
SELECT
  pa.id::text AS id,
  pa.project_id::text AS project_id,
  pa.name AS room_name,
  pa.sort_order,
  NULL::text AS notes,
  to_char(pa.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
  to_char(pa.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at
FROM public.project_areas pa
`.trim();
