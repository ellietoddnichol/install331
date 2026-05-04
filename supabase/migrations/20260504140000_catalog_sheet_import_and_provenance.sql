-- Raw Google Sheets import audit trail (optional reads for debugging; not app-facing catalog reads).
CREATE TABLE IF NOT EXISTS catalog_sheet_import_rows (
  id TEXT PRIMARY KEY,
  sync_batch_id TEXT NOT NULL,
  source_tab TEXT NOT NULL,
  sheet_row_number INTEGER NOT NULL,
  raw_cells_json TEXT NOT NULL,
  imported_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_catalog_sheet_import_batch ON catalog_sheet_import_rows (sync_batch_id);

-- Additive provenance + normalization columns on physical catalog storage (sync writes target catalog_items only).
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS catalog_source TEXT;
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS catalog_source_tab TEXT;
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS catalog_source_row INTEGER;
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS catalog_sync_batch_id TEXT;
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS sku_normalized TEXT;
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS manufacturer_normalized TEXT;
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS category_main TEXT;
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS item_type TEXT;

CREATE INDEX IF NOT EXISTS idx_catalog_items_batch ON catalog_items (catalog_sync_batch_id);
