/**
 * Same row shape as `public.takeoff_lines_v1` from the bridge script
 * (`scripts/supabase-bridge-native-to-install331-views.sql`), built from
 * `v_takeoff_rows_estimate_pricing` + `takeoff_rows` + default `project_areas` room.
 *
 * Contract: columns must stay aligned with `mapTakeoffRow` in takeoffRepo.ts.
 */
export const NATIVE_PRICED_TAKEOFF_LINES_BODY = `
FROM public.v_takeoff_rows_estimate_pricing v
JOIN public.takeoff_rows tr ON tr.id = v.takeoff_row_id
LEFT JOIN LATERAL (
  SELECT pa.id
  FROM public.project_areas pa
  WHERE pa.project_id = v.project_id
  ORDER BY pa.sort_order NULLS LAST, pa.created_at
  LIMIT 1
) pa ON true
`.trim();

export const NATIVE_PRICED_TAKEOFF_LINES_SELECT = `
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
${NATIVE_PRICED_TAKEOFF_LINES_BODY}
`.trim();
