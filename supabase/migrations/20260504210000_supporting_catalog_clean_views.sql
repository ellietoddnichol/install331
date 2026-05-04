-- Published read surface for workbook-first catalog (parity with catalog_items_clean).
-- Each *_clean object is a VIEW over the physical table — no duplicated storage.

-- modifiers_v1_clean
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'modifiers_v1_clean'
      AND c.relkind = 'r'
  ) THEN
    RAISE EXCEPTION
      'public.modifiers_v1_clean exists as a BASE TABLE. Drop or rename it before creating the compatibility VIEW.';
  END IF;
END $$;
DROP VIEW IF EXISTS public.modifiers_v1_clean;
CREATE VIEW public.modifiers_v1_clean AS
SELECT * FROM public.modifiers_v1;

-- bundles_v1_clean
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'bundles_v1_clean'
      AND c.relkind = 'r'
  ) THEN
    RAISE EXCEPTION
      'public.bundles_v1_clean exists as a BASE TABLE. Drop or rename it before creating the compatibility VIEW.';
  END IF;
END $$;
DROP VIEW IF EXISTS public.bundles_v1_clean;
CREATE VIEW public.bundles_v1_clean AS
SELECT * FROM public.bundles_v1;

-- bundle_items_v1_clean
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'bundle_items_v1_clean'
      AND c.relkind = 'r'
  ) THEN
    RAISE EXCEPTION
      'public.bundle_items_v1_clean exists as a BASE TABLE. Drop or rename it before creating the compatibility VIEW.';
  END IF;
END $$;
DROP VIEW IF EXISTS public.bundle_items_v1_clean;
CREATE VIEW public.bundle_items_v1_clean AS
SELECT * FROM public.bundle_items_v1;

-- catalog_item_aliases_clean
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'catalog_item_aliases_clean'
      AND c.relkind = 'r'
  ) THEN
    RAISE EXCEPTION
      'public.catalog_item_aliases_clean exists as a BASE TABLE. Drop or rename it before creating the compatibility VIEW.';
  END IF;
END $$;
DROP VIEW IF EXISTS public.catalog_item_aliases_clean;
CREATE VIEW public.catalog_item_aliases_clean AS
SELECT * FROM public.catalog_item_aliases;

-- catalog_item_attributes_clean
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'catalog_item_attributes_clean'
      AND c.relkind = 'r'
  ) THEN
    RAISE EXCEPTION
      'public.catalog_item_attributes_clean exists as a BASE TABLE. Drop or rename it before creating the compatibility VIEW.';
  END IF;
END $$;
DROP VIEW IF EXISTS public.catalog_item_attributes_clean;
CREATE VIEW public.catalog_item_attributes_clean AS
SELECT * FROM public.catalog_item_attributes;

-- estimator_parametric_modifiers_clean
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'estimator_parametric_modifiers_clean'
      AND c.relkind = 'r'
  ) THEN
    RAISE EXCEPTION
      'public.estimator_parametric_modifiers_clean exists as a BASE TABLE. Drop or rename it before creating the compatibility VIEW.';
  END IF;
END $$;
DROP VIEW IF EXISTS public.estimator_parametric_modifiers_clean;
CREATE VIEW public.estimator_parametric_modifiers_clean AS
SELECT * FROM public.estimator_parametric_modifiers;

-- estimator_sku_aliases_clean
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'estimator_sku_aliases_clean'
      AND c.relkind = 'r'
  ) THEN
    RAISE EXCEPTION
      'public.estimator_sku_aliases_clean exists as a BASE TABLE. Drop or rename it before creating the compatibility VIEW.';
  END IF;
END $$;
DROP VIEW IF EXISTS public.estimator_sku_aliases_clean;
CREATE VIEW public.estimator_sku_aliases_clean AS
SELECT * FROM public.estimator_sku_aliases;

-- estimator_catalog_item_attributes_clean
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'estimator_catalog_item_attributes_clean'
      AND c.relkind = 'r'
  ) THEN
    RAISE EXCEPTION
      'public.estimator_catalog_item_attributes_clean exists as a BASE TABLE. Drop or rename it before creating the compatibility VIEW.';
  END IF;
END $$;
DROP VIEW IF EXISTS public.estimator_catalog_item_attributes_clean;
CREATE VIEW public.estimator_catalog_item_attributes_clean AS
SELECT * FROM public.estimator_catalog_item_attributes;
