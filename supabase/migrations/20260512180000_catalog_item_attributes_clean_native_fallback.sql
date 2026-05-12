-- catalog_item_attributes_clean is normally SELECT * FROM catalog_item_attributes (sheet-style DDL
-- from 20260504180000_catalog_item_aliases_attributes_sheet_sync.sql). If a native DB already had
-- public.catalog_item_attributes with a different shape (e.g. attribute_def_id + value_*), the
-- 20260504 migration skipped CREATE TABLE and the clean view exposed columns without attribute_type,
-- breaking catalog + intake queries that SELECT attribute_type.
--
-- Fix paths (in order):
--   1) Physical table already has attribute_type → clean view = SELECT * FROM table.
--   2) View catalog_item_attributes_compat already exists → clean = SELECT * FROM compat.
--   3) Native EAV: create compat (same projection as scripts/supabase-bridge-native-to-install331-views.sql §7),
--      then clean = SELECT * FROM compat.
--   4) Else raise with concrete prereqs.

DROP VIEW IF EXISTS public.catalog_item_attributes_clean;

DO $migration$
DECLARE
  has_sheet_type boolean;
  has_compat boolean;
  has_cia boolean;
  has_cad boolean;
  cia_ok boolean;
  cad_ok boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'catalog_item_attributes'
      AND column_name = 'attribute_type'
  )
  INTO has_sheet_type;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.views
    WHERE table_schema = 'public'
      AND table_name = 'catalog_item_attributes_compat'
  )
  INTO has_compat;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'catalog_item_attributes'
      AND table_type IN ('BASE TABLE', 'VIEW')
  )
  INTO has_cia;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'catalog_attribute_defs'
      AND table_type IN ('BASE TABLE', 'VIEW')
  )
  INTO has_cad;

  SELECT
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'catalog_item_attributes' AND column_name = 'id'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'catalog_item_attributes' AND column_name = 'catalog_item_id'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'catalog_item_attributes' AND column_name = 'attribute_def_id'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'catalog_item_attributes' AND column_name = 'created_at'
    )
    AND (
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'catalog_item_attributes' AND column_name = 'value_text'
      )
      OR EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'catalog_item_attributes' AND column_name = 'value_number'
      )
      OR EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'catalog_item_attributes' AND column_name = 'value_boolean'
      )
    )
  INTO cia_ok;

  SELECT
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'catalog_attribute_defs' AND column_name = 'id'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'catalog_attribute_defs' AND column_name = 'key'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'catalog_attribute_defs' AND column_name = 'sort_order'
    )
  INTO cad_ok;

  IF has_sheet_type THEN
    EXECUTE $qv$
      CREATE VIEW public.catalog_item_attributes_clean AS
      SELECT * FROM public.catalog_item_attributes
    $qv$;
  ELSIF has_compat THEN
    EXECUTE $qv$
      CREATE VIEW public.catalog_item_attributes_clean AS
      SELECT * FROM public.catalog_item_attributes_compat
    $qv$;
  ELSIF has_cia AND has_cad AND cia_ok AND cad_ok THEN
    EXECUTE $qv$
      CREATE OR REPLACE VIEW public.catalog_item_attributes_compat AS
      SELECT
        cia.id::text AS id,
        cia.catalog_item_id::text AS catalog_item_id,
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
      JOIN public.catalog_attribute_defs cad ON cad.id = cia.attribute_def_id
    $qv$;
    EXECUTE $qv2$
      CREATE VIEW public.catalog_item_attributes_clean AS
      SELECT * FROM public.catalog_item_attributes_compat
    $qv2$;
  ELSE
    RAISE EXCEPTION
      'install331: cannot build catalog_item_attributes_clean. '
      'Sheet-style path: run supabase/migrations/20260504180000_catalog_item_aliases_attributes_sheet_sync.sql on a DB without a conflicting catalog_item_attributes table. '
      'Native EAV path needs public.catalog_item_attributes (columns id, catalog_item_id, attribute_def_id, created_at, and at least one of value_text/value_number/value_boolean) '
      'and public.catalog_attribute_defs (columns id, key, sort_order). '
      'Has catalog_item_attributes: %. Has catalog_attribute_defs: %. CIA column set OK: %. CAD column set OK: %. '
      'Or run scripts/supabase-bridge-native-to-install331-views.sql and re-run this migration.',
      has_cia,
      has_cad,
      cia_ok,
      cad_ok;
  END IF;
END
$migration$;
