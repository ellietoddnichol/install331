-- Quote-driven workflow: persisted source quote staging fields + parser metadata.
-- Safe for existing environments where quote tables may already exist.

CREATE TABLE IF NOT EXISTS source_quotes_v1 (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects_v1(id) ON DELETE CASCADE,
  vendor_name TEXT NOT NULL,
  quote_number TEXT,
  quote_date TEXT,
  delivery_date TEXT,
  ship_to TEXT,
  source_file_id TEXT REFERENCES project_files_v1(id) ON DELETE SET NULL,
  notes TEXT,
  import_status TEXT NOT NULL DEFAULT 'manual_review',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_source_quotes_v1_project ON source_quotes_v1(project_id);

CREATE TABLE IF NOT EXISTS source_quote_lines_v1 (
  id TEXT PRIMARY KEY,
  source_quote_id TEXT NOT NULL REFERENCES source_quotes_v1(id) ON DELETE CASCADE,
  line_number TEXT,
  raw_description TEXT NOT NULL,
  normalized_description TEXT,
  manufacturer TEXT,
  sku_model TEXT,
  qty DOUBLE PRECISION NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'EA',
  unit_cost DOUBLE PRECISION,
  total_cost DOUBLE PRECISION,
  material_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
  row_type TEXT NOT NULL DEFAULT 'material',
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  import_selected INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_source_quote_lines_v1_quote ON source_quote_lines_v1(source_quote_id);

ALTER TABLE source_quotes_v1 ADD COLUMN IF NOT EXISTS delivery_date TEXT;
ALTER TABLE source_quotes_v1 ADD COLUMN IF NOT EXISTS ship_to TEXT;

ALTER TABLE source_quote_lines_v1 ADD COLUMN IF NOT EXISTS line_number TEXT;
ALTER TABLE source_quote_lines_v1 ADD COLUMN IF NOT EXISTS unit_cost DOUBLE PRECISION;
ALTER TABLE source_quote_lines_v1 ADD COLUMN IF NOT EXISTS total_cost DOUBLE PRECISION;
ALTER TABLE source_quote_lines_v1 ADD COLUMN IF NOT EXISTS row_type TEXT NOT NULL DEFAULT 'material';
