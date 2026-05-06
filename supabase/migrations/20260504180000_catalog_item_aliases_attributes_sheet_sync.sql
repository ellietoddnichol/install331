-- Companion tables for `googleSheetsCatalogSync.ts` aliases/attributes tabs.
-- Matches SQLite DDL in src/server/db/schema.ts and ON CONFLICT targets:
--   catalog_item_aliases: (catalog_item_id, alias_type, alias_value)
--   catalog_item_attributes: (catalog_item_id, attribute_type, attribute_value)
-- Kept distinct from estimator_sku_aliases / estimator_catalog_item_attributes (0003_*).

CREATE TABLE IF NOT EXISTS catalog_item_aliases (
  id TEXT PRIMARY KEY,
  catalog_item_id TEXT NOT NULL,
  alias_type TEXT NOT NULL,
  alias_value TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_catalog_item_aliases_unique
  ON catalog_item_aliases (catalog_item_id, alias_type, alias_value);

CREATE INDEX IF NOT EXISTS idx_catalog_item_aliases_item
  ON catalog_item_aliases (catalog_item_id);

CREATE INDEX IF NOT EXISTS idx_catalog_item_aliases_value
  ON catalog_item_aliases (alias_value);

CREATE TABLE IF NOT EXISTS catalog_item_attributes (
  id TEXT PRIMARY KEY,
  catalog_item_id TEXT NOT NULL,
  attribute_type TEXT NOT NULL,
  attribute_value TEXT NOT NULL,
  material_delta_type TEXT,
  material_delta_value DOUBLE PRECISION,
  labor_delta_type TEXT,
  labor_delta_value DOUBLE PRECISION,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_catalog_item_attributes_unique
  ON catalog_item_attributes (catalog_item_id, attribute_type, attribute_value);

CREATE INDEX IF NOT EXISTS idx_catalog_item_attributes_item
  ON catalog_item_attributes (catalog_item_id);

CREATE INDEX IF NOT EXISTS idx_catalog_item_attributes_type
  ON catalog_item_attributes (attribute_type);
