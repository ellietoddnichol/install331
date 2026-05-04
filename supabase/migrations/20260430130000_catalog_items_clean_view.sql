-- Optional compatibility alias for estimator catalog reads.
--
-- Many operators refer to the curated sheet tab as "items_clean" / CLEAN_ITEMS.
-- Some deployments also expect a DB table named `catalog_items_clean`.
--
-- The estimator's canonical relational table remains `catalog_items` (TEXT ids, SQLite parity).
-- This migration provides `catalog_items_clean` as a **view** so reads can target either name
-- without maintaining two physical tables.

-- A physical TABLE with this name blocks CREATE VIEW and `DROP VIEW IF EXISTS` will not remove it.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'catalog_items_clean'
      AND c.relkind = 'r'
  ) THEN
    RAISE EXCEPTION
      'public.catalog_items_clean exists as a BASE TABLE. Drop or rename it before creating the compatibility VIEW.';
  END IF;
END $$;

DROP VIEW IF EXISTS public.catalog_items_clean;
CREATE VIEW public.catalog_items_clean AS
SELECT * FROM public.catalog_items;
