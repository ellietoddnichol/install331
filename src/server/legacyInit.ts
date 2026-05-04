import type Database from 'better-sqlite3';

/** Legacy monolithic tables (`projects`, `catalog_items`, `settings`, …). Used inside each profile DB. */
export function initLegacyDb(db: Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      project_number TEXT,
      name TEXT NOT NULL,
      client_name TEXT,
      gc_name TEXT,
      address TEXT,
      bid_date TEXT,
      due_date TEXT,
      project_type TEXT,
      estimator TEXT,
      status TEXT NOT NULL,
      created_date TEXT NOT NULL,
      settings TEXT, -- JSON
      proposal_settings TEXT, -- JSON
      scopes TEXT, -- JSON
      rooms TEXT, -- JSON
      bundles TEXT, -- JSON
      alternates TEXT, -- JSON
      lines TEXT -- JSON
    );
  `);

  try {
    const tableInfo = db.prepare('PRAGMA table_info(projects)').all() as Array<{ name: string }>;
    const hasProjectNumber = tableInfo.some((col) => col.name === 'project_number');
    if (!hasProjectNumber) {
      db.exec('ALTER TABLE projects ADD COLUMN project_number TEXT');
    }
  } catch (e) {
    console.error('Migration failed:', e);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS catalog_items (
      id TEXT PRIMARY KEY,
      sku TEXT,
      canonical_sku TEXT,
      is_canonical INTEGER DEFAULT 1,
      alias_of TEXT,
      category TEXT,
      subcategory TEXT,
      family TEXT,
      record_granularity TEXT,
      material_family TEXT,
      system_series TEXT,
      privacy_level TEXT,
      manufacturer_configured_item INTEGER DEFAULT 0,
      canonical_match_anchor INTEGER DEFAULT 0,
      exact_component_sku INTEGER DEFAULT 0,
      requires_project_configuration INTEGER DEFAULT 0,
      default_unit TEXT,
      estimator_notes TEXT,
      description TEXT,
      manufacturer TEXT,
      brand TEXT,
      model TEXT,
      model_number TEXT,
      series TEXT,
      image_url TEXT,
      uom TEXT,
      base_material_cost REAL,
      base_labor_minutes REAL,
      labor_unit_type TEXT,
      labor_basis TEXT,
      install_labor_family TEXT,
      default_mounting_type TEXT,
      finish_group TEXT,
      attribute_group TEXT,
      duplicate_group_key TEXT,
      deprecated INTEGER DEFAULT 0,
      deprecated_reason TEXT,
      taxable INTEGER DEFAULT 1,
      ada_flag INTEGER DEFAULT 0,
      tags TEXT,
      notes TEXT,
      active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS catalog_item_aliases (
      id TEXT PRIMARY KEY,
      catalog_item_id TEXT NOT NULL,
      alias_type TEXT NOT NULL,
      alias_value TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_catalog_item_aliases_item ON catalog_item_aliases(catalog_item_id);
    CREATE INDEX IF NOT EXISTS idx_catalog_item_aliases_value ON catalog_item_aliases(alias_value);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_catalog_item_aliases_unique ON catalog_item_aliases(catalog_item_id, alias_type, alias_value);

    CREATE TABLE IF NOT EXISTS catalog_item_attributes (
      id TEXT PRIMARY KEY,
      catalog_item_id TEXT NOT NULL,
      attribute_type TEXT NOT NULL,
      attribute_value TEXT NOT NULL,
      material_delta_type TEXT,
      material_delta_value REAL,
      labor_delta_type TEXT,
      labor_delta_value REAL,
      active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_catalog_item_attributes_item ON catalog_item_attributes(catalog_item_id);
    CREATE INDEX IF NOT EXISTS idx_catalog_item_attributes_type ON catalog_item_attributes(attribute_type);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_catalog_item_attributes_unique ON catalog_item_attributes(catalog_item_id, attribute_type, attribute_value);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT -- JSON
    );

    CREATE TABLE IF NOT EXISTS global_bundles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      items TEXT -- JSON
    );

    CREATE TABLE IF NOT EXISTS global_addins (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      cost REAL,
      labor_minutes REAL
    );
  `);

  const hasSettings = db.prepare('SELECT count(*) as count FROM settings').get() as { count: number };
  if (hasSettings.count === 0) {
    const defaultSettings = {
      companyName: 'Brighten/CWA Install',
      companyAddress1: '123 Builder Lane',
      companyAddress2: 'Austin, TX 78701',
      email: 'contact@estimatorpro.com',
      preferences: {
        defaultLaborRate: 85,
        defaultLaborBurdenPct: 0.25,
        defaultOverheadPct: 0.15,
        defaultProfitPct: 0.1,
        defaultWorkDayHours: 8,
        defaultCrewSize: 1,
        currency: 'USD',
      },
    };
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('global', JSON.stringify(defaultSettings));
  }

  const hasItems = db.prepare('SELECT count(*) as count FROM catalog_items').get() as { count: number };
  if (hasItems.count === 0) {
    const seedItems = [
      { id: 'c1', sku: 'B-6806', category: 'Toilet Accessories', description: 'Grab Bar 36" Stainless Steel', uom: 'EA', mat: 45.0, lab: 30, mfr: 'Bobrick', model: 'B-6806' },
      { id: 'c2', sku: 'B-822', category: 'Toilet Accessories', description: 'Soap Dispenser, Deck Mounted', uom: 'EA', mat: 35.0, lab: 25, mfr: 'Bobrick', model: 'B-822' },
      { id: 'c5', sku: 'B-290', category: 'Toilet Accessories', description: 'Mirror 18" x 36" Stainless Steel Frame', uom: 'EA', mat: 65.0, lab: 20, mfr: 'Bobrick', model: 'B-290' },
      { id: 'c6', sku: 'B-262', category: 'Toilet Accessories', description: 'Paper Towel Dispenser, Surface Mount (Multifold/C-Fold)', uom: 'EA', mat: 85.0, lab: 20, mfr: 'Bobrick', model: 'B-262' },
      { id: 'c7', sku: 'B-270', category: 'Toilet Accessories', description: 'Sanitary Napkin Disposal', uom: 'EA', mat: 42.0, lab: 15, mfr: 'Bobrick', model: 'B-270' },
      { id: 'c3', sku: 'TP-101', category: 'Partitions', description: 'Toilet Partition, Powder Coated', uom: 'EA', mat: 450.0, lab: 120, mfr: 'Hadrian', model: 'Standard' },
      { id: 'c8', sku: 'TP-201', category: 'Partitions', description: 'Toilet Partition, Stainless Steel', uom: 'EA', mat: 850.0, lab: 150, mfr: 'Hadrian', model: 'Elite' },
      { id: 'c9', sku: 'TP-301', category: 'Partitions', description: 'Urinal Screen, Powder Coated', uom: 'EA', mat: 150.0, lab: 45, mfr: 'Hadrian', model: 'Standard' },
      { id: 'c4', sku: 'VANGUARD-1T', category: 'Lockers', description: 'Locker, Steel, Single Tier (1T)', uom: 'EA', mat: 185.0, lab: 45, mfr: 'Penco', model: 'Vanguard' },
      { id: 'c10', sku: 'VANGUARD-2T', category: 'Lockers', description: 'Locker, Steel, Double Tier (2T)', uom: 'EA', mat: 210.0, lab: 60, mfr: 'Penco', model: 'Vanguard' },
      { id: 'c11', sku: 'BENCH-48', category: 'Lockers', description: 'Locker Bench, 48"', uom: 'EA', mat: 125.0, lab: 30, mfr: 'Penco', model: 'Standard' },
      { id: 'c12', sku: 'WB-4896', category: 'Visual Display', description: 'Whiteboard 4x8 Magnetic', uom: 'EA', mat: 320.0, lab: 60, mfr: 'Claridge', model: 'LCS' },
      { id: 'c13', sku: 'TB-4896', category: 'Visual Display', description: 'Tackboard 4x8 Cork', uom: 'EA', mat: 240.0, lab: 45, mfr: 'Claridge', model: 'Standard' },
      { id: 'c14', sku: 'MP10', category: 'Fire Specialties', description: 'Fire Extinguisher 10lb ABC', uom: 'EA', mat: 75.0, lab: 10, mfr: 'Larsen', model: 'MP10' },
      { id: 'c15', sku: '2409', category: 'Fire Specialties', description: 'Fire Extinguisher Cabinet', uom: 'EA', mat: 145.0, lab: 40, mfr: 'Larsen', model: '2409' },
    ];

    const insert = db.prepare(`
      INSERT INTO catalog_items (id, sku, category, description, uom, base_material_cost, base_labor_minutes, manufacturer, model, taxable, ada_flag, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 1)
    `);

    for (const item of seedItems) {
      insert.run(item.id, item.sku, item.category, item.description, item.uom, item.mat, item.lab, item.mfr, item.model);
    }
  }
}
