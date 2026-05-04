import type Database from 'better-sqlite3';
import {
  DEFAULT_PROPOSAL_ACCEPTANCE_LABEL,
  DEFAULT_PROPOSAL_CLARIFICATIONS,
  DEFAULT_PROPOSAL_EXCLUSIONS,
  DEFAULT_PROPOSAL_INTRO,
  DEFAULT_PROPOSAL_TERMS,
  sanitizeProposalSettings,
} from '../../shared/utils/proposalDefaults.ts';

export function initEstimatorSchema(db: Database) {
  const defaultLaborRatePerHour = Number(process.env.DEFAULT_LABOR_RATE_PER_HOUR || 100);

  db.exec(`
    CREATE TABLE IF NOT EXISTS projects_v1 (
      id TEXT PRIMARY KEY,
      project_number TEXT,
      project_name TEXT NOT NULL,
      client_name TEXT,
      general_contractor TEXT,
      estimator TEXT,
      bid_date TEXT,
      proposal_date TEXT,
      due_date TEXT,
      address TEXT,
      project_type TEXT,
      project_size TEXT,
      floor_level TEXT,
      access_difficulty TEXT,
      install_height TEXT,
      material_handling TEXT,
      wall_substrate TEXT,
      labor_burden_percent REAL NOT NULL DEFAULT 0,
      overhead_percent REAL NOT NULL DEFAULT 0,
      profit_percent REAL NOT NULL DEFAULT 0,
      tax_percent REAL NOT NULL DEFAULT 0,
      pricing_mode TEXT NOT NULL DEFAULT 'labor_and_material',
      scope_categories_json TEXT NOT NULL DEFAULT '[]',
      job_conditions_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'Draft',
      notes TEXT,
      special_notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rooms_v1 (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      room_name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects_v1(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS takeoff_lines_v1 (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      room_id TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_ref TEXT,
      description TEXT NOT NULL,
      sku TEXT,
      category TEXT,
      subcategory TEXT,
      base_type TEXT,
      qty REAL NOT NULL,
      unit TEXT NOT NULL,
      material_cost REAL NOT NULL DEFAULT 0,
      base_material_cost REAL NOT NULL DEFAULT 0,
      labor_minutes REAL NOT NULL DEFAULT 0,
      labor_cost REAL NOT NULL DEFAULT 0,
      base_labor_cost REAL NOT NULL DEFAULT 0,
      pricing_source TEXT NOT NULL DEFAULT 'auto',
      unit_sell REAL NOT NULL DEFAULT 0,
      line_total REAL NOT NULL DEFAULT 0,
      notes TEXT,
      bundle_id TEXT,
      catalog_item_id TEXT,
      variant_id TEXT,
      catalog_attribute_snapshot_json TEXT,
      base_material_cost_snapshot REAL,
      base_labor_minutes_snapshot REAL,
      attribute_delta_material_snapshot_json TEXT,
      attribute_delta_labor_snapshot_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects_v1(id) ON DELETE CASCADE,
      FOREIGN KEY(room_id) REFERENCES rooms_v1(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings_v1 (
      id TEXT PRIMARY KEY,
      company_name TEXT NOT NULL,
      company_address TEXT NOT NULL,
      company_phone TEXT NOT NULL,
      company_email TEXT NOT NULL,
      logo_url TEXT NOT NULL,
      default_labor_rate_per_hour REAL NOT NULL DEFAULT 100,
      default_overhead_percent REAL NOT NULL DEFAULT 0,
      default_profit_percent REAL NOT NULL DEFAULT 0,
      default_tax_percent REAL NOT NULL DEFAULT 0,
      default_labor_burden_percent REAL NOT NULL DEFAULT 0,
      default_labor_overhead_percent REAL NOT NULL DEFAULT 5,
      proposal_intro TEXT NOT NULL,
      proposal_terms TEXT NOT NULL,
      proposal_exclusions TEXT NOT NULL DEFAULT '',
      proposal_clarifications TEXT NOT NULL DEFAULT '',
      proposal_acceptance_label TEXT NOT NULL DEFAULT 'Accepted By',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS modifiers_v1 (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      modifier_key TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      applies_to_categories TEXT NOT NULL,
      add_labor_minutes REAL NOT NULL DEFAULT 0,
      add_material_cost REAL NOT NULL DEFAULT 0,
      percent_labor REAL NOT NULL DEFAULT 0,
      percent_material REAL NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bundles_v1 (
      id TEXT PRIMARY KEY,
      bundle_name TEXT NOT NULL,
      category TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bundle_items_v1 (
      id TEXT PRIMARY KEY,
      bundle_id TEXT NOT NULL,
      catalog_item_id TEXT,
      sku TEXT,
      description TEXT NOT NULL,
      qty REAL NOT NULL DEFAULT 1,
      material_cost REAL NOT NULL DEFAULT 0,
      labor_minutes REAL NOT NULL DEFAULT 0,
      labor_cost REAL NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      FOREIGN KEY(bundle_id) REFERENCES bundles_v1(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS line_modifiers_v1 (
      id TEXT PRIMARY KEY,
      line_id TEXT NOT NULL,
      modifier_id TEXT NOT NULL,
      name TEXT NOT NULL,
      add_material_cost REAL NOT NULL DEFAULT 0,
      add_labor_minutes REAL NOT NULL DEFAULT 0,
      percent_material REAL NOT NULL DEFAULT 0,
      percent_labor REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY(line_id) REFERENCES takeoff_lines_v1(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS catalog_sync_status_v1 (
      id TEXT PRIMARY KEY,
      last_attempt_at TEXT,
      last_success_at TEXT,
      status TEXT NOT NULL DEFAULT 'never',
      message TEXT,
      items_synced INTEGER NOT NULL DEFAULT 0,
      modifiers_synced INTEGER NOT NULL DEFAULT 0,
      bundles_synced INTEGER NOT NULL DEFAULT 0,
      bundle_items_synced INTEGER NOT NULL DEFAULT 0,
      aliases_synced INTEGER NOT NULL DEFAULT 0,
      attributes_synced INTEGER NOT NULL DEFAULT 0,
      warnings_json TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS catalog_sync_runs_v1 (
      id TEXT PRIMARY KEY,
      attempted_at TEXT NOT NULL,
      status TEXT NOT NULL,
      message TEXT,
      items_synced INTEGER NOT NULL DEFAULT 0,
      modifiers_synced INTEGER NOT NULL DEFAULT 0,
      bundles_synced INTEGER NOT NULL DEFAULT 0,
      bundle_items_synced INTEGER NOT NULL DEFAULT 0,
      aliases_synced INTEGER NOT NULL DEFAULT 0,
      attributes_synced INTEGER NOT NULL DEFAULT 0,
      warnings_json TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS project_files_v1 (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      data_base64 TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects_v1(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS db_persistence_status_v1 (
      id TEXT PRIMARY KEY,
      db_path TEXT NOT NULL,
      mode TEXT NOT NULL, -- 'local' | 'volume' | 'ephemeral_gcs' | 'ephemeral'
      gcs_bucket TEXT,
      gcs_object TEXT,
      restore_attempted_at TEXT,
      restore_status TEXT, -- 'not_configured' | 'skipped_existing_db' | 'no_snapshot' | 'restored' | 'failed'
      restore_message TEXT,
      last_backup_success_at TEXT,
      last_backup_failure_at TEXT,
      last_backup_error TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_rooms_v1_project ON rooms_v1(project_id);
    CREATE INDEX IF NOT EXISTS idx_takeoff_v1_project ON takeoff_lines_v1(project_id);
    CREATE INDEX IF NOT EXISTS idx_takeoff_v1_room ON takeoff_lines_v1(room_id);
    CREATE INDEX IF NOT EXISTS idx_bundle_items_v1_bundle ON bundle_items_v1(bundle_id);
    CREATE INDEX IF NOT EXISTS idx_line_modifiers_v1_line ON line_modifiers_v1(line_id);
    CREATE INDEX IF NOT EXISTS idx_project_files_v1_project ON project_files_v1(project_id);

    CREATE TABLE IF NOT EXISTS intake_catalog_memory_v1 (
      memory_key TEXT PRIMARY KEY,
      catalog_item_id TEXT NOT NULL,
      hit_count INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS intake_review_overrides_v1 (
      review_line_fingerprint TEXT PRIMARY KEY,
      status TEXT NOT NULL, -- 'ignored'
      updated_at TEXT NOT NULL
    );
  `);

  // db_persistence_status_v1 seed row (safe, idempotent).
  try {
    db.prepare(`
      INSERT OR IGNORE INTO db_persistence_status_v1 (id, db_path, mode, updated_at)
      VALUES ('db', '', 'local', datetime('now'))
    `).run();
  } catch {
    // Best-effort only.
  }

  // Install-labor modifiers: governed install configuration deltas for configurable systems (e.g. partitions).
  // Additive and safe: no existing reads depend on this table yet.
  db.exec(`
    CREATE TABLE IF NOT EXISTS install_labor_modifiers_v1 (
      id TEXT PRIMARY KEY,
      modifier_key TEXT NOT NULL,
      applies_to_install_labor_family TEXT NOT NULL,
      description TEXT NOT NULL,
      labor_minutes_adder REAL,
      labor_multiplier REAL,
      material_adder REAL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_install_labor_modifiers_family ON install_labor_modifiers_v1(applies_to_install_labor_family);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_install_labor_modifiers_unique ON install_labor_modifiers_v1(modifier_key, applies_to_install_labor_family);
  `);

  // Seed partition/urinal modifiers (seed-only framework; selection/application can evolve without schema churn).
  try {
    const seed = db.prepare(`
      INSERT OR IGNORE INTO install_labor_modifiers_v1 (
        id, modifier_key, applies_to_install_labor_family, description,
        labor_minutes_adder, labor_multiplier, material_adder, active, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now')
      )
    `);

    const families = [
      'toilet_partition_hdpe',
      'toilet_partition_phenolic',
      'toilet_partition_powder_coated_steel',
      'toilet_partition_hpl',
      'toilet_partition_stainless',
      'urinal_screen_hdpe',
      'urinal_screen_steel',
    ];

    const seedForAll = (modifierKey: string, description: string, input: { addMinutes?: number; multiplier?: number; materialAdder?: number }) => {
      for (const fam of families) {
        seed.run(
          `ilm-${modifierKey}-${fam}`,
          modifierKey,
          fam,
          description,
          input.addMinutes ?? null,
          input.multiplier ?? null,
          input.materialAdder ?? null
        );
      }
    };

    seedForAll('ada_stall', 'ADA stall / compliant compartment (often more detailing and anchoring).', { addMinutes: 25 });
    seedForAll('ambulatory_stall', 'Ambulatory stall (36" wide) compartment detailing.', { addMinutes: 15 });
    seedForAll('full_height_privacy', 'Full-height / enhanced privacy configuration.', { addMinutes: 35 });
    seedForAll('ceiling_hung', 'Ceiling-hung mounting (coordination and install complexity).', { addMinutes: 20 });
    seedForAll('floor_anchored', 'Floor-anchored mounting.', { addMinutes: 10 });
    seedForAll('overhead_braced', 'Overhead braced system.', { addMinutes: 10 });
    seedForAll('masonry_anchoring', 'Masonry anchoring / drilling (productivity impact).', { multiplier: 1.15 });
    seedForAll('uneven_floor', 'Uneven floor / shimming and layout rework.', { addMinutes: 20 });
    seedForAll('demolition_existing', 'Demo/remove existing partitions and prep area.', { addMinutes: 45 });
    seedForAll('occupied_renovation', 'Occupied renovation constraints (phasing, protection, slower logistics).', { multiplier: 1.15 });
    seedForAll('multi_stall_layout', 'Multi-stall bank layout/coordination (alignment, scribing, sequencing).', { multiplier: 1.1 });
    seedForAll('corner_condition', 'Corner conditions / returns (layout complexity).', { addMinutes: 15 });
    seedForAll('end_panel_condition', 'End panels / wing walls beyond standard compartment.', { addMinutes: 15 });
  } catch {
    // Best-effort seeding only.
  }

  try {
    const intakeOverrideCols = db.prepare('PRAGMA table_info(intake_review_overrides_v1)').all() as Array<{ name: string }>;
    const intakeOverrideNames = new Set(intakeOverrideCols.map((c) => c.name));
    if (!intakeOverrideNames.has('content_ignore_key')) {
      db.exec('ALTER TABLE intake_review_overrides_v1 ADD COLUMN content_ignore_key TEXT');
      db.exec(
        'CREATE INDEX IF NOT EXISTS idx_intake_review_overrides_content_ignore_key ON intake_review_overrides_v1(content_ignore_key)'
      );
    }
  } catch {
    // best-effort
  }

  // Idempotent migration for new sync-count columns.
  try {
    const statusCols = db.prepare('PRAGMA table_info(catalog_sync_status_v1)').all() as Array<{ name: string }>;
    const statusNames = new Set(statusCols.map((c) => c.name));
    if (!statusNames.has('aliases_synced')) db.exec('ALTER TABLE catalog_sync_status_v1 ADD COLUMN aliases_synced INTEGER NOT NULL DEFAULT 0');
    if (!statusNames.has('attributes_synced')) db.exec('ALTER TABLE catalog_sync_status_v1 ADD COLUMN attributes_synced INTEGER NOT NULL DEFAULT 0');
  } catch {
    // best-effort
  }
  try {
    const runCols = db.prepare('PRAGMA table_info(catalog_sync_runs_v1)').all() as Array<{ name: string }>;
    const runNames = new Set(runCols.map((c) => c.name));
    if (!runNames.has('aliases_synced')) db.exec('ALTER TABLE catalog_sync_runs_v1 ADD COLUMN aliases_synced INTEGER NOT NULL DEFAULT 0');
    if (!runNames.has('attributes_synced')) db.exec('ALTER TABLE catalog_sync_runs_v1 ADD COLUMN attributes_synced INTEGER NOT NULL DEFAULT 0');
  } catch {
    // best-effort
  }

  db.exec(`
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
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS catalog_item_attributes (
      id TEXT PRIMARY KEY,
      catalog_item_id TEXT NOT NULL,
      attribute_type TEXT NOT NULL,
      attribute_value TEXT NOT NULL,
      material_delta_type TEXT,
      material_delta_value REAL,
      labor_delta_type TEXT,
      labor_delta_value REAL,
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_catalog_item_attributes_item ON catalog_item_attributes(catalog_item_id);
    CREATE INDEX IF NOT EXISTS idx_catalog_item_attributes_type ON catalog_item_attributes(attribute_type);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_catalog_item_attributes_unique ON catalog_item_attributes(catalog_item_id, attribute_type, attribute_value);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS estimator_catalog_attribute_defs (
      id TEXT PRIMARY KEY,
      attribute_key TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      value_kind TEXT NOT NULL DEFAULT 'freeform',
      sort_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS estimator_parametric_modifiers (
      id TEXT PRIMARY KEY,
      modifier_key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      applies_to_categories_json TEXT NOT NULL DEFAULT '[]',
      add_labor_minutes REAL NOT NULL DEFAULT 0,
      add_material_cost REAL NOT NULL DEFAULT 0,
      percent_labor REAL NOT NULL DEFAULT 0,
      percent_material REAL NOT NULL DEFAULT 0,
      labor_cost_multiplier REAL NOT NULL DEFAULT 1,
      active INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS estimator_sku_aliases (
      id TEXT PRIMARY KEY,
      alias_text TEXT NOT NULL,
      alias_kind TEXT NOT NULL,
      target_catalog_item_id TEXT NOT NULL,
      notes TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(target_catalog_item_id) REFERENCES catalog_items(id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_estimator_sku_aliases_lower ON estimator_sku_aliases (lower(alias_text));

    CREATE TABLE IF NOT EXISTS estimator_catalog_item_attributes (
      id TEXT PRIMARY KEY,
      catalog_item_id TEXT NOT NULL,
      attribute_id TEXT NOT NULL,
      value TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(catalog_item_id) REFERENCES catalog_items(id) ON DELETE CASCADE,
      FOREIGN KEY(attribute_id) REFERENCES estimator_catalog_attribute_defs(id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_estimator_item_attr
      ON estimator_catalog_item_attributes (catalog_item_id, attribute_id);
    CREATE INDEX IF NOT EXISTS idx_estimator_item_attr_item ON estimator_catalog_item_attributes (catalog_item_id);

    CREATE TABLE IF NOT EXISTS estimator_norm_bundles_v1 (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT,
      description TEXT,
      legacy_bundle_id TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS estimator_norm_bundle_items_v1 (
      id TEXT PRIMARY KEY,
      norm_bundle_id TEXT NOT NULL,
      catalog_item_id TEXT NOT NULL,
      qty REAL NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      FOREIGN KEY(norm_bundle_id) REFERENCES estimator_norm_bundles_v1(id) ON DELETE CASCADE,
      FOREIGN KEY(catalog_item_id) REFERENCES catalog_items(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_enbi_norm_bundle ON estimator_norm_bundle_items_v1 (norm_bundle_id);

    CREATE TABLE IF NOT EXISTS estimator_catalog_validation_issues (
      id TEXT PRIMARY KEY,
      issue_type TEXT NOT NULL,
      entity_kind TEXT,
      entity_id TEXT,
      source_ref TEXT,
      message TEXT NOT NULL,
      detail_json TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      severity TEXT,
      created_at TEXT NOT NULL,
      resolved_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_ecvi_status ON estimator_catalog_validation_issues (status, issue_type);
  `);

  const projectFilesColumns = db.prepare('PRAGMA table_info(project_files_v1)').all() as Array<{ name: string }>;
  if (projectFilesColumns.length > 0 && !projectFilesColumns.some((c) => c.name === 'storage_object_key')) {
    db.exec('ALTER TABLE project_files_v1 ADD COLUMN storage_object_key TEXT');
  }

  const settingsExists = db.prepare('SELECT 1 FROM settings_v1 WHERE id = ?').get('global');

  const settingsColumns = db.prepare("PRAGMA table_info(settings_v1)").all() as Array<{ name: string }>;
  const hasProposalExclusions = settingsColumns.some((column) => column.name === 'proposal_exclusions');
  if (!hasProposalExclusions) {
    db.exec("ALTER TABLE settings_v1 ADD COLUMN proposal_exclusions TEXT NOT NULL DEFAULT ''");
  }

  const hasDefaultLaborRatePerHour = settingsColumns.some((column) => column.name === 'default_labor_rate_per_hour');
  if (!hasDefaultLaborRatePerHour) {
    db.exec(`ALTER TABLE settings_v1 ADD COLUMN default_labor_rate_per_hour REAL NOT NULL DEFAULT ${defaultLaborRatePerHour}`);
  }

  const hasProposalClarifications = settingsColumns.some((column) => column.name === 'proposal_clarifications');
  if (!hasProposalClarifications) {
    db.exec("ALTER TABLE settings_v1 ADD COLUMN proposal_clarifications TEXT NOT NULL DEFAULT ''");
  }

  const hasProposalAcceptanceLabel = settingsColumns.some((column) => column.name === 'proposal_acceptance_label');
  if (!hasProposalAcceptanceLabel) {
    db.exec("ALTER TABLE settings_v1 ADD COLUMN proposal_acceptance_label TEXT NOT NULL DEFAULT 'Accepted By'");
  }

  const hasDefaultLaborOverheadPercent = settingsColumns.some((column) => column.name === 'default_labor_overhead_percent');
  if (!hasDefaultLaborOverheadPercent) {
    db.exec('ALTER TABLE settings_v1 ADD COLUMN default_labor_overhead_percent REAL NOT NULL DEFAULT 5');
  }

  const settingsColsAutomation = db.prepare('PRAGMA table_info(settings_v1)').all() as Array<{ name: string }>;
  if (!settingsColsAutomation.some((column) => column.name === 'intake_catalog_auto_apply_mode')) {
    db.exec("ALTER TABLE settings_v1 ADD COLUMN intake_catalog_auto_apply_mode TEXT NOT NULL DEFAULT 'off'");
  }
  const settingsColsAutomation2 = db.prepare('PRAGMA table_info(settings_v1)').all() as Array<{ name: string }>;
  if (!settingsColsAutomation2.some((column) => column.name === 'intake_catalog_tier_a_min_score')) {
    db.exec('ALTER TABLE settings_v1 ADD COLUMN intake_catalog_tier_a_min_score REAL NOT NULL DEFAULT 0.82');
  }

  const takeoffColumns = db.prepare("PRAGMA table_info(takeoff_lines_v1)").all() as Array<{ name: string }>;

  const projectColumns = db.prepare("PRAGMA table_info(projects_v1)").all() as Array<{ name: string }>;
  const ensureProjectColumn = (name: string, ddl: string) => {
    if (!projectColumns.some((column) => column.name === name)) {
      db.exec(`ALTER TABLE projects_v1 ADD COLUMN ${ddl}`);
    }
  };
  const hasPricingMode = projectColumns.some((column) => column.name === 'pricing_mode');
  if (!hasPricingMode) {
    db.exec("ALTER TABLE projects_v1 ADD COLUMN pricing_mode TEXT NOT NULL DEFAULT 'labor_and_material'");
  }

  const hasJobConditions = projectColumns.some((column) => column.name === 'job_conditions_json');
  if (!hasJobConditions) {
    db.exec("ALTER TABLE projects_v1 ADD COLUMN job_conditions_json TEXT NOT NULL DEFAULT '{}'");
  }

  const hasScopeCategories = projectColumns.some((column) => column.name === 'scope_categories_json');
  if (!hasScopeCategories) {
    db.exec("ALTER TABLE projects_v1 ADD COLUMN scope_categories_json TEXT NOT NULL DEFAULT '[]'");
  }

  const hasSpecialNotes = projectColumns.some((column) => column.name === 'special_notes');
  if (!hasSpecialNotes) {
    db.exec('ALTER TABLE projects_v1 ADD COLUMN special_notes TEXT');
  }

  const hasGeneralContractor = projectColumns.some((column) => column.name === 'general_contractor');
  if (!hasGeneralContractor) {
    db.exec('ALTER TABLE projects_v1 ADD COLUMN general_contractor TEXT');
  }

  const hasProposalDate = projectColumns.some((column) => column.name === 'proposal_date');
  if (!hasProposalDate) {
    db.exec('ALTER TABLE projects_v1 ADD COLUMN proposal_date TEXT');
  }

  const hasLaborOverheadPercent = projectColumns.some((column) => column.name === 'labor_overhead_percent');
  if (!hasLaborOverheadPercent) {
    db.exec('ALTER TABLE projects_v1 ADD COLUMN labor_overhead_percent REAL NOT NULL DEFAULT 15');
    db.exec('UPDATE projects_v1 SET labor_overhead_percent = overhead_percent');
  }

  const hasLaborProfitPercent = projectColumns.some((column) => column.name === 'labor_profit_percent');
  if (!hasLaborProfitPercent) {
    db.exec('ALTER TABLE projects_v1 ADD COLUMN labor_profit_percent REAL NOT NULL DEFAULT 10');
    db.exec('UPDATE projects_v1 SET labor_profit_percent = profit_percent');
  }

  const hasSubLaborFeeEnabled = projectColumns.some((column) => column.name === 'sub_labor_management_fee_enabled');
  if (!hasSubLaborFeeEnabled) {
    db.exec('ALTER TABLE projects_v1 ADD COLUMN sub_labor_management_fee_enabled INTEGER NOT NULL DEFAULT 0');
  }

  const hasSubLaborFeePercent = projectColumns.some((column) => column.name === 'sub_labor_management_fee_percent');
  if (!hasSubLaborFeePercent) {
    db.exec('ALTER TABLE projects_v1 ADD COLUMN sub_labor_management_fee_percent REAL NOT NULL DEFAULT 5');
  }

  const hasProposalIncludeSpecialNotes = projectColumns.some((column) => column.name === 'proposal_include_special_notes');
  if (!hasProposalIncludeSpecialNotes) {
    db.exec('ALTER TABLE projects_v1 ADD COLUMN proposal_include_special_notes INTEGER NOT NULL DEFAULT 0');
  }

  const hasProposalFormat = projectColumns.some((column) => column.name === 'proposal_format');
  if (!hasProposalFormat) {
    db.exec("ALTER TABLE projects_v1 ADD COLUMN proposal_format TEXT NOT NULL DEFAULT 'standard'");
  }

  const hasProposalIncludeCatalogImages = projectColumns.some((column) => column.name === 'proposal_include_catalog_images');
  if (!hasProposalIncludeCatalogImages) {
    db.exec('ALTER TABLE projects_v1 ADD COLUMN proposal_include_catalog_images INTEGER NOT NULL DEFAULT 0');
  }

  const projectCols2 = db.prepare('PRAGMA table_info(projects_v1)').all() as Array<{ name: string }>;
  if (!projectCols2.some((column) => column.name === 'structured_assumptions_json')) {
    db.exec("ALTER TABLE projects_v1 ADD COLUMN structured_assumptions_json TEXT NOT NULL DEFAULT '[]'");
  }

  // Defaulting sources (non-destructive; used to label auto-filled values in UI and keep them stable).
  try {
    ensureProjectColumn('project_number_source', "project_number_source TEXT NOT NULL DEFAULT 'manual'");
    ensureProjectColumn('client_name_source', "client_name_source TEXT NOT NULL DEFAULT 'manual'");
    ensureProjectColumn('address_source', "address_source TEXT NOT NULL DEFAULT 'manual'");
    ensureProjectColumn('location_label_source', "location_label_source TEXT NOT NULL DEFAULT 'manual'");
  } catch {
    // Best-effort only; do not block boot.
  }

  db.exec("UPDATE projects_v1 SET job_conditions_json = '{}' WHERE job_conditions_json IS NULL OR trim(job_conditions_json) = ''");
  db.exec("UPDATE projects_v1 SET scope_categories_json = '[]' WHERE scope_categories_json IS NULL OR trim(scope_categories_json) = ''");
  const hasBaseMaterialCost = takeoffColumns.some((column) => column.name === 'base_material_cost');
  if (!hasBaseMaterialCost) {
    db.exec("ALTER TABLE takeoff_lines_v1 ADD COLUMN base_material_cost REAL NOT NULL DEFAULT 0");
    db.exec("UPDATE takeoff_lines_v1 SET base_material_cost = material_cost WHERE base_material_cost = 0");
  }

  const hasBaseLaborCost = takeoffColumns.some((column) => column.name === 'base_labor_cost');
  if (!hasBaseLaborCost) {
    db.exec("ALTER TABLE takeoff_lines_v1 ADD COLUMN base_labor_cost REAL NOT NULL DEFAULT 0");
    db.exec("UPDATE takeoff_lines_v1 SET base_labor_cost = labor_cost WHERE base_labor_cost = 0");
  }

  const hasPricingSource = takeoffColumns.some((column) => column.name === 'pricing_source');
  if (!hasPricingSource) {
    db.exec("ALTER TABLE takeoff_lines_v1 ADD COLUMN pricing_source TEXT NOT NULL DEFAULT 'auto'");
  }

  db.exec(`
    UPDATE takeoff_lines_v1
    SET pricing_source = CASE
      WHEN abs(coalesce(unit_sell, 0) - round(coalesce(material_cost, 0) + coalesce(labor_cost, 0), 2)) > 0.009 THEN 'manual'
      ELSE 'auto'
    END
    WHERE pricing_source IS NULL OR trim(pricing_source) = ''
  `);

  if (Number.isFinite(defaultLaborRatePerHour) && defaultLaborRatePerHour > 0) {
    const rows = db.prepare(`
      SELECT id, qty, material_cost, labor_minutes, labor_cost, base_labor_cost, pricing_source, unit_sell
      FROM takeoff_lines_v1
      WHERE labor_minutes > 0
        AND (labor_cost <= 0 OR base_labor_cost <= 0)
    `).all() as Array<{
      id: string;
      qty: number;
      material_cost: number;
      labor_minutes: number;
      labor_cost: number;
      base_labor_cost: number;
      pricing_source: string;
      unit_sell: number;
    }>;

    const updateLine = db.prepare(`
      UPDATE takeoff_lines_v1
      SET labor_cost = ?,
          base_labor_cost = ?,
          pricing_source = ?,
          unit_sell = ?,
          line_total = ?,
          updated_at = ?
      WHERE id = ?
    `);

    rows.forEach((row) => {
      const derivedLaborCost = Number(((row.labor_minutes / 60) * defaultLaborRatePerHour).toFixed(2));
      const resolvedLaborCost = row.labor_cost > 0 ? row.labor_cost : derivedLaborCost;
      const resolvedBaseLaborCost = row.base_labor_cost > 0 ? row.base_labor_cost : derivedLaborCost;
      const resolvedPricingSource = row.pricing_source === 'manual' ? 'manual' : 'auto';
      const calculatedUnitSell = Number((row.material_cost + resolvedLaborCost).toFixed(2));
      const resolvedUnitSell = resolvedPricingSource === 'manual' && row.unit_sell > 0
        ? row.unit_sell
        : calculatedUnitSell;
      const resolvedLineTotal = Number((resolvedUnitSell * Number(row.qty || 0)).toFixed(2));

      updateLine.run(
        resolvedLaborCost,
        resolvedBaseLaborCost,
        resolvedPricingSource,
        resolvedUnitSell,
        resolvedLineTotal,
        new Date().toISOString(),
        row.id
      );
    });

    db.prepare(`
      UPDATE bundle_items_v1
      SET labor_cost = round((labor_minutes / 60.0) * ?, 2)
      WHERE labor_minutes > 0
        AND labor_cost <= 0
    `).run(defaultLaborRatePerHour);
  }

  const takeoffIntakeCols = db.prepare('PRAGMA table_info(takeoff_lines_v1)').all() as Array<{ name: string }>;
  if (!takeoffIntakeCols.some((c) => c.name === 'intake_scope_bucket')) {
    db.exec('ALTER TABLE takeoff_lines_v1 ADD COLUMN intake_scope_bucket TEXT');
  }
  const takeoffIntakeCols2 = db.prepare('PRAGMA table_info(takeoff_lines_v1)').all() as Array<{ name: string }>;
  if (!takeoffIntakeCols2.some((c) => c.name === 'intake_match_confidence')) {
    db.exec('ALTER TABLE takeoff_lines_v1 ADD COLUMN intake_match_confidence TEXT');
  }

  const takeoffIntakeCols3 = db.prepare('PRAGMA table_info(takeoff_lines_v1)').all() as Array<{ name: string }>;
  const ensureTakeoffColumn = (name: string, ddl: string) => {
    if (!takeoffIntakeCols3.some((c) => c.name === name)) {
      db.exec(`ALTER TABLE takeoff_lines_v1 ADD COLUMN ${ddl}`);
    }
  };
  ensureTakeoffColumn('source_manufacturer', 'source_manufacturer TEXT');
  ensureTakeoffColumn('source_bid_bucket', 'source_bid_bucket TEXT');
  ensureTakeoffColumn('source_section_header', 'source_section_header TEXT');
  ensureTakeoffColumn('is_installable_scope', 'is_installable_scope INTEGER');
  ensureTakeoffColumn('install_scope_type', 'install_scope_type TEXT');
  ensureTakeoffColumn('source_material_cost', 'source_material_cost REAL');
  ensureTakeoffColumn('generated_labor_minutes', 'generated_labor_minutes REAL');
  ensureTakeoffColumn('labor_origin', 'labor_origin TEXT');
  ensureTakeoffColumn('install_labor_family', 'install_labor_family TEXT');
  ensureTakeoffColumn('catalog_attribute_snapshot_json', 'catalog_attribute_snapshot_json TEXT');
  ensureTakeoffColumn('base_material_cost_snapshot', 'base_material_cost_snapshot REAL');
  ensureTakeoffColumn('base_labor_minutes_snapshot', 'base_labor_minutes_snapshot REAL');
  ensureTakeoffColumn('attribute_delta_material_snapshot_json', 'attribute_delta_material_snapshot_json TEXT');
  ensureTakeoffColumn('attribute_delta_labor_snapshot_json', 'attribute_delta_labor_snapshot_json TEXT');

  const modifierColumns = db.prepare('PRAGMA table_info(modifiers_v1)').all() as Array<{ name: string }>;
  if (modifierColumns.length > 0 && !modifierColumns.some((c) => c.name === 'description')) {
    db.exec("ALTER TABLE modifiers_v1 ADD COLUMN description TEXT NOT NULL DEFAULT ''");
    db.exec(`
      UPDATE modifiers_v1 SET description = 'Americans with Disabilities Act (ADA) accessibility requirements—typically added clearances, reach ranges, and mounting heights for toilet accessories (e.g., grab bars, dispensers, mirrors). Use when scope must meet accessible restroom standards.'
      WHERE id = 'mod-ada' AND trim(description) = ''
    `);
    db.exec(`
      UPDATE modifiers_v1 SET description = 'Recessed or semi-recessed installation: fixture or accessory is set into the wall or chase for a flush finish. Expect added rough-opening, blocking, and finish-cut labor versus surface mount.'
      WHERE id = 'mod-recessed' AND trim(description) = ''
    `);
    db.exec(`
      UPDATE modifiers_v1 SET description = 'Stainless steel finish upgrade for durability and corrosion resistance in wet or high-traffic restrooms; material cost uplift versus painted or plated equivalents.'
      WHERE id = 'mod-stainless' AND trim(description) = ''
    `);
  }

  const catalogItemColumns = db.prepare('PRAGMA table_info(catalog_items)').all() as Array<{ name: string }>;
  if (catalogItemColumns.length > 0) {
    const ensureCatalogColumn = (name: string, ddl: string) => {
      if (!catalogItemColumns.some((c) => c.name === name)) {
        db.exec(`ALTER TABLE catalog_items ADD COLUMN ${ddl}`);
      }
    };
    if (!catalogItemColumns.some((c) => c.name === 'brand')) {
      db.exec('ALTER TABLE catalog_items ADD COLUMN brand TEXT');
    }
    if (!catalogItemColumns.some((c) => c.name === 'model_number')) {
      db.exec('ALTER TABLE catalog_items ADD COLUMN model_number TEXT');
    }
    if (!catalogItemColumns.some((c) => c.name === 'series')) {
      db.exec('ALTER TABLE catalog_items ADD COLUMN series TEXT');
    }
    if (!catalogItemColumns.some((c) => c.name === 'image_url')) {
      db.exec('ALTER TABLE catalog_items ADD COLUMN image_url TEXT');
    }
    if (!catalogItemColumns.some((c) => c.name === 'install_labor_family')) {
      db.exec('ALTER TABLE catalog_items ADD COLUMN install_labor_family TEXT');
    }

    // Transitional canonicalization fields (keep all existing reads working).
    ensureCatalogColumn('canonical_sku', 'canonical_sku TEXT');
    ensureCatalogColumn('is_canonical', 'is_canonical INTEGER NOT NULL DEFAULT 1');
    ensureCatalogColumn('alias_of', 'alias_of TEXT');
    ensureCatalogColumn('labor_basis', 'labor_basis TEXT');
    ensureCatalogColumn('default_mounting_type', 'default_mounting_type TEXT');
    ensureCatalogColumn('finish_group', 'finish_group TEXT');
    ensureCatalogColumn('attribute_group', 'attribute_group TEXT');
    ensureCatalogColumn('duplicate_group_key', 'duplicate_group_key TEXT');
    ensureCatalogColumn('deprecated', 'deprecated INTEGER NOT NULL DEFAULT 0');
    ensureCatalogColumn('deprecated_reason', 'deprecated_reason TEXT');

    // Governed system/catalog metadata (additive; used heavily by configurable systems like toilet partitions).
    ensureCatalogColumn('record_granularity', 'record_granularity TEXT');
    ensureCatalogColumn('material_family', 'material_family TEXT');
    ensureCatalogColumn('system_series', 'system_series TEXT');
    ensureCatalogColumn('privacy_level', 'privacy_level TEXT');
    ensureCatalogColumn('manufacturer_configured_item', 'manufacturer_configured_item INTEGER NOT NULL DEFAULT 0');
    ensureCatalogColumn('canonical_match_anchor', 'canonical_match_anchor INTEGER NOT NULL DEFAULT 0');
    ensureCatalogColumn('exact_component_sku', 'exact_component_sku INTEGER NOT NULL DEFAULT 0');
    ensureCatalogColumn('requires_project_configuration', 'requires_project_configuration INTEGER NOT NULL DEFAULT 0');
    ensureCatalogColumn('default_unit', 'default_unit TEXT');
    ensureCatalogColumn('estimator_notes', 'estimator_notes TEXT');

    // Backfill safe defaults so older rows behave as canonical rows by default.
    db.exec(`UPDATE catalog_items SET canonical_sku = sku WHERE (canonical_sku IS NULL OR trim(canonical_sku) = '') AND sku IS NOT NULL`);
    db.exec(`UPDATE catalog_items SET is_canonical = 1 WHERE is_canonical IS NULL`);
    db.exec(`UPDATE catalog_items SET deprecated = 0 WHERE deprecated IS NULL`);

    // Seed grouping helpers for a few high-value Div 10 categories without changing reads.
    // Conservative heuristics: detect common finish suffixes on SKUs and derive canonical_sku + finish_group + duplicate_group_key.
    try {
      const seedCategories = new Set(['grab bars', 'washroom accessories', 'toilet partitions', 'toilet accessories', 'partitions']);
      const rows = db
        .prepare(
          `SELECT id, sku, category
           FROM catalog_items
           WHERE sku IS NOT NULL
             AND category IS NOT NULL
             AND (finish_group IS NULL OR trim(finish_group) = '' OR duplicate_group_key IS NULL OR trim(duplicate_group_key) = '')
          `
        )
        .all() as Array<{ id: string; sku: string; category: string }>;

      const finishTokenRegex = /^(.*?)(?:[-_ ]?(SS|CH|PB|BN|ORB|PC))$/i;
      const normalizeKey = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

      const update = db.prepare(
        `UPDATE catalog_items
         SET canonical_sku = COALESCE(?, canonical_sku),
             finish_group = COALESCE(?, finish_group),
             duplicate_group_key = COALESCE(?, duplicate_group_key)
         WHERE id = ?`
      );

      for (const row of rows) {
        const categoryKey = normalizeKey(row.category);
        if (!seedCategories.has(categoryKey)) continue;

        const skuRaw = String(row.sku || '').trim();
        if (!skuRaw) continue;

        const match = finishTokenRegex.exec(skuRaw);
        if (!match) continue;

        const baseSku = match[1]?.trim();
        const finish = match[2]?.toUpperCase();
        if (!baseSku || !finish) continue;

        const dupKey = `${normalizeKey(categoryKey)}|${normalizeKey(baseSku)}`;
        update.run(baseSku, finish, dupKey, row.id);
      }
    } catch {
      // Best-effort backfill only; never block app boot.
    }

    // Backfill first-class aliases from seeded duplicate patterns (best-effort; no estimate math changes).
    // For finish-suffixed SKUs, add a legacy_sku alias onto the canonical item record.
    try {
      db.exec(`
        INSERT OR IGNORE INTO catalog_item_aliases (id, catalog_item_id, alias_type, alias_value, created_at, updated_at)
        SELECT
          'alias-' || lower(hex(randomblob(8))) AS id,
          canon.id AS catalog_item_id,
          'legacy_sku' AS alias_type,
          dup.sku AS alias_value,
          datetime('now') AS created_at,
          datetime('now') AS updated_at
        FROM catalog_items dup
        JOIN catalog_items canon
          ON canon.duplicate_group_key = dup.duplicate_group_key
         AND canon.sku = canon.canonical_sku
        WHERE dup.duplicate_group_key IS NOT NULL
          AND trim(dup.duplicate_group_key) <> ''
          AND dup.sku IS NOT NULL
          AND trim(dup.sku) <> ''
          AND canon.id IS NOT NULL
          AND lower(dup.sku) <> lower(canon.sku);
      `);
    } catch {
      // Best-effort only.
    }

    // Seed structured attributes from existing canonicalization hints (best-effort).
    // - finish_group -> (finish)
    // - default_mounting_type -> (mounting)
    // - keyword heuristics from description/sku -> coating/grip/assembly/mounting
    try {
      const seedCategories = new Set([
        'grab bars',
        'washroom accessories',
        'toilet partitions',
        'toilet accessories',
        'partitions',
        'lockers',
        'fire protection specialties',
        'fire specialties',
      ]);
      const normalizeKey = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

      const rows = db
        .prepare(
          `SELECT id, sku, category, description, finish_group, default_mounting_type
           FROM catalog_items
           WHERE active = 1`
        )
        .all() as Array<{
        id: string;
        sku: string;
        category: string;
        description: string;
        finish_group: string | null;
        default_mounting_type: string | null;
      }>;

      const insert = db.prepare(`
        INSERT OR IGNORE INTO catalog_item_attributes (
          id, catalog_item_id, attribute_type, attribute_value,
          material_delta_type, material_delta_value, labor_delta_type, labor_delta_value,
          active, sort_order, created_at, updated_at
        ) VALUES ('attr-' || lower(hex(randomblob(8))), ?, ?, ?, NULL, NULL, NULL, NULL, 1, 0, datetime('now'), datetime('now'))
      `);

      for (const row of rows) {
        const categoryKey = normalizeKey(row.category || '');
        if (!seedCategories.has(categoryKey)) continue;

        const sku = String(row.sku || '').toLowerCase();
        const desc = String(row.description || '').toLowerCase();
        const text = `${sku} ${desc}`;

        const finish = row.finish_group ? String(row.finish_group).trim() : '';
        if (finish) insert.run(row.id, 'finish', finish);

        const mounting = row.default_mounting_type ? String(row.default_mounting_type).trim() : '';
        if (mounting) insert.run(row.id, 'mounting', mounting);

        // Heuristics (conservative; adds attributes but does not alter costs yet).
        if (text.includes('matte black') || text.includes('black') || sku.includes('-mb') || sku.includes('_mb')) {
          insert.run(row.id, 'finish', 'MATTE_BLACK');
        }
        if (text.includes('antimicrobial') || text.includes('anti-microbial')) {
          insert.run(row.id, 'coating', 'ANTIMICROBIAL');
        }
        if (text.includes('peened') || text.includes('peen')) {
          insert.run(row.id, 'grip', 'PEENED');
        }
        if (text.includes('semi-recess') || text.includes('semi recess')) {
          insert.run(row.id, 'mounting', 'SEMI_RECESSED');
        } else if (text.includes('recess')) {
          insert.run(row.id, 'mounting', 'RECESSED');
        } else if (text.includes('surface')) {
          insert.run(row.id, 'mounting', 'SURFACE');
        }
        if (text.includes('kd') || text.includes('knock down') || text.includes('knock-down')) {
          insert.run(row.id, 'assembly', 'KD');
        }
      }
    } catch {
      // Best-effort only.
    }

    // Partition/urinal screen governed canonicals: seed strong alias phrases to support matching.
    // Best-effort; never blocks boot. Uses canonical SKUs inserted via takeoff registry seeding.
    try {
      const db2 = db;
      const ensureAliases = (canonicalSku: string, aliasValues: string[]) => {
        const row = db2.prepare(`SELECT id FROM catalog_items WHERE lower(sku) = lower(?) LIMIT 1`).get(canonicalSku) as { id: string } | undefined;
        if (!row?.id) return;
        const insert = db2.prepare(
          `INSERT OR IGNORE INTO catalog_item_aliases (id, catalog_item_id, alias_type, alias_value, created_at, updated_at)
           VALUES ('alias-' || lower(hex(randomblob(8))), ?, 'parser_phrase', ?, datetime('now'), datetime('now'))`
        );
        for (const v of aliasValues) {
          const trimmed = String(v || '').trim();
          if (!trimmed) continue;
          insert.run(row.id, trimmed);
        }
      };

      ensureAliases('Scranton-Eclipse-HDPE', [
        'eclipse hdpe partitions',
        'scranton eclipse partitions',
        'solid plastic toilet partitions',
        'hdpe toilet partitions',
        'partition compartment',
        'toilet partition stall',
      ]);
      ensureAliases('ASI-Phenolic-UltimatePrivacy', [
        'phenolic ultimate privacy',
        'ultimate privacy phenolic',
        'privacy enhanced phenolic partitions',
        'full height privacy partitions',
        'black core phenolic partitions',
      ]);
      ensureAliases('Hadrian-PowderCoated-Steel', [
        'powder coated steel partitions',
        'hadrian powder coated partitions',
        'painted steel toilet partitions',
      ]);
      ensureAliases('ASI-HPL-PlasticLaminate', [
        'plastic laminate partitions',
        'hpl toilet partitions',
        'laminate toilet partitions',
      ]);
      ensureAliases('Hadrian-Stainless', [
        'hadrian stainless partitions',
        'stainless steel toilet partitions',
      ]);
      ensureAliases('Scranton-UrinalScreen-HDPE', [
        'urinal screen',
        'privacy screen',
        'divider screen',
        'hdpe urinal screen',
      ]);
      ensureAliases('Hadrian-UrinalScreen-Steel', [
        'powder coated urinal screen',
        'steel urinal screen',
      ]);
    } catch {
      // Best-effort only.
    }

    // Fire specialties: seed mounting + rating attributes as governed variants (no duplicate SKUs).
    try {
      const rows = db.prepare(`SELECT id, sku FROM catalog_items WHERE sku IN ('FE-CABINET','AED-CABINET')`).all() as Array<{ id: string; sku: string }>;
      const bySku = new Map(rows.map((r) => [r.sku, r.id]));

      const insertAttr = db.prepare(`
        INSERT OR IGNORE INTO catalog_item_attributes (
          id, catalog_item_id, attribute_type, attribute_value,
          material_delta_type, material_delta_value, labor_delta_type, labor_delta_value,
          active, sort_order, created_at, updated_at
        ) VALUES ('attr-' || lower(hex(randomblob(8))), ?, ?, ?, NULL, NULL, NULL, NULL, 1, ?, datetime('now'), datetime('now'))
      `);

      const feId = bySku.get('FE-CABINET');
      if (feId) {
        insertAttr.run(feId, 'mounting', 'SURFACE', 0);
        insertAttr.run(feId, 'mounting', 'SEMI_RECESSED', 1);
        insertAttr.run(feId, 'mounting', 'RECESSED', 2);
        // Use assembly for rating until a dedicated rating attribute type exists.
        insertAttr.run(feId, 'assembly', 'FIRE_RATED', 3);
      }

      const aedId = bySku.get('AED-CABINET');
      if (aedId) {
        insertAttr.run(aedId, 'mounting', 'SURFACE', 0);
        insertAttr.run(aedId, 'mounting', 'RECESSED', 1);
      }
    } catch {
      // Best-effort only.
    }

    // Lockers: seed canonical anchors + assembly attributes (no duplicate rows for assembly wording).
    try {
      const rows = db
        .prepare(
          `SELECT id, sku
           FROM catalog_items
           WHERE sku IN (
             'LOCKER-STEEL-1T','LOCKER-STEEL-2T','LOCKER-STEEL-3T','LOCKER-STEEL-6T',
             'LOCKER-BENCH-48',
             'ASI-LOCKER-TRADITIONAL-STEEL',
             'Scranton-Tufftec-HDPE-1T','Scranton-Tufftec-HDPE-6T'
           )`
        )
        .all() as Array<{ id: string; sku: string }>;
      const bySku = new Map(rows.map((r) => [r.sku, r.id]));

      const insertAttr = db.prepare(`
        INSERT OR IGNORE INTO catalog_item_attributes (
          id, catalog_item_id, attribute_type, attribute_value,
          material_delta_type, material_delta_value, labor_delta_type, labor_delta_value,
          active, sort_order, created_at, updated_at
        ) VALUES ('attr-' || lower(hex(randomblob(8))), ?, ?, ?, NULL, NULL, NULL, NULL, 1, ?, datetime('now'), datetime('now'))
      `);

      const insertAlias = db.prepare(
        `INSERT OR IGNORE INTO catalog_item_aliases (id, catalog_item_id, alias_type, alias_value, created_at, updated_at)
         VALUES ('alias-' || lower(hex(randomblob(8))), ?, 'parser_phrase', ?, datetime('now'), datetime('now'))`
      );

      const lockerSkus = ['LOCKER-STEEL-1T', 'LOCKER-STEEL-2T', 'LOCKER-STEEL-3T', 'LOCKER-STEEL-6T'] as const;
      for (const sku of lockerSkus) {
        const id = bySku.get(sku);
        if (!id) continue;
        insertAttr.run(id, 'assembly', 'KD', 0);
        insertAttr.run(id, 'assembly', 'WELDED', 1);
        insertAttr.run(id, 'assembly', 'ASSEMBLED', 2);
        insertAttr.run(id, 'assembly', 'SLOPE_TOP', 3);
      }

      const asiTraditional = bySku.get('ASI-LOCKER-TRADITIONAL-STEEL');
      if (asiTraditional) {
        insertAttr.run(asiTraditional, 'assembly', 'KD', 0);
        insertAttr.run(asiTraditional, 'assembly', 'ASSEMBLED', 1);
        insertAttr.run(asiTraditional, 'assembly', 'SLOPE_TOP', 2);
        for (const v of ['steel lockers', 'asi lockers', 'traditional collection lockers']) insertAlias.run(asiTraditional, v);
      }

      const scranton1t = bySku.get('Scranton-Tufftec-HDPE-1T');
      if (scranton1t) {
        insertAttr.run(scranton1t, 'assembly', 'KD', 0);
        insertAttr.run(scranton1t, 'assembly', 'ASSEMBLED', 1);
        for (const v of ['plastic lockers', 'hdpe lockers', 'tufftec lockers', 'scranton lockers', 'solid plastic lockers']) insertAlias.run(scranton1t, v);
      }
      const scranton6t = bySku.get('Scranton-Tufftec-HDPE-6T');
      if (scranton6t) {
        insertAttr.run(scranton6t, 'assembly', 'KD', 0);
        insertAttr.run(scranton6t, 'assembly', 'ASSEMBLED', 1);
        for (const v of ['plastic box locker', 'hdpe box locker', 'six tier plastic locker', 'tufftec box locker']) insertAlias.run(scranton6t, v);
      }

      const oneT = bySku.get('LOCKER-STEEL-1T');
      if (oneT) {
        for (const v of ['single tier locker', '1 tier locker', 'one tier locker', 'full height locker']) insertAlias.run(oneT, v);
      }
      const twoT = bySku.get('LOCKER-STEEL-2T');
      if (twoT) {
        for (const v of ['double tier locker', '2 tier locker', 'two tier locker']) insertAlias.run(twoT, v);
      }
      const threeT = bySku.get('LOCKER-STEEL-3T');
      if (threeT) {
        for (const v of ['triple tier locker', '3 tier locker', 'three tier locker']) insertAlias.run(threeT, v);
      }
      const sixT = bySku.get('LOCKER-STEEL-6T');
      if (sixT) {
        for (const v of ['six tier locker', '6 tier locker', 'box locker']) insertAlias.run(sixT, v);
      }

      // Slope-top phrases: bias toward the 1T steel canonical unless tier is otherwise inferred upstream.
      if (oneT) {
        for (const v of ['slope top locker', 'sloped top locker', 'locker slope top']) insertAlias.run(oneT, v);
      }

      // KD / welded phrases as global-ish alias nudges (land on the tier canonical first).
      if (oneT) {
        for (const v of ['kd locker', 'knock down locker', 'knockdown locker', 'welded locker', 'fully welded locker', 'fully assembled locker']) {
          insertAlias.run(oneT, v);
        }
      }

      const benchId = bySku.get('LOCKER-BENCH-48');
      if (benchId) {
        for (const v of ['locker bench', 'bench', 'wood bench', 'changing room bench']) insertAlias.run(benchId, v);
      }
    } catch {
      // Best-effort only.
    }

    // Visual display boards: seed aliases (avoid size/frame wording duplicates; land on canonicals).
    try {
      const rows = db
        .prepare(
          `SELECT id, sku
           FROM catalog_items
           WHERE sku IN ('VDB-MARKERBOARD','VDB-TACKBOARD','ASI-VDB-9800-PORC','ASI-VDB-9800-CORK')`
        )
        .all() as Array<{ id: string; sku: string }>;
      const bySku = new Map(rows.map((r) => [r.sku, r.id]));

      const insertAlias = db.prepare(
        `INSERT OR IGNORE INTO catalog_item_aliases (id, catalog_item_id, alias_type, alias_value, created_at, updated_at)
         VALUES ('alias-' || lower(hex(randomblob(8))), ?, 'parser_phrase', ?, datetime('now'), datetime('now'))`
      );

      const marker = bySku.get('VDB-MARKERBOARD');
      if (marker) {
        for (const v of ['whiteboard', 'markerboard', 'writing board', 'dry erase board', 'dry-erase board']) insertAlias.run(marker, v);
        // Common size phrases should still land on the canonical, not become their own SKUs.
        for (const v of ['4x8 whiteboard', '4x8 markerboard', '48x96 whiteboard', '48x96 markerboard']) insertAlias.run(marker, v);
      }

      const tack = bySku.get('VDB-TACKBOARD');
      if (tack) {
        for (const v of ['tackboard', 'bulletin board', 'cork board', 'pin board']) insertAlias.run(tack, v);
        for (const v of ['4x8 tackboard', '48x96 tackboard', '4x8 bulletin board', '48x96 bulletin board']) insertAlias.run(tack, v);
      }

      const asiPorc = bySku.get('ASI-VDB-9800-PORC');
      if (asiPorc) {
        for (const v of ['asi markerboard', 'asi porcelain markerboard', 'series 9800 markerboard', 'asi visual display markerboard']) insertAlias.run(asiPorc, v);
      }
      const asiCork = bySku.get('ASI-VDB-9800-CORK');
      if (asiCork) {
        for (const v of ['asi tackboard', 'asi cork tackboard', 'series 9800 tackboard', 'asi visual display tackboard']) insertAlias.run(asiCork, v);
      }
    } catch {
      // Best-effort only.
    }

    // Wall / corner protection: seed mounting attributes + aliases (no dimension/finish duplicates).
    try {
      const rows = db
        .prepare(
          `SELECT id, sku
           FROM catalog_items
           WHERE sku IN ('WCP-CORNER-GUARD','WCP-CHAIR-RAIL','WCP-CRASH-RAIL')`
        )
        .all() as Array<{ id: string; sku: string }>;
      const bySku = new Map(rows.map((r) => [r.sku, r.id]));

      const insertAttr = db.prepare(`
        INSERT OR IGNORE INTO catalog_item_attributes (
          id, catalog_item_id, attribute_type, attribute_value,
          material_delta_type, material_delta_value, labor_delta_type, labor_delta_value,
          active, sort_order, created_at, updated_at
        ) VALUES ('attr-' || lower(hex(randomblob(8))), ?, ?, ?, NULL, NULL, NULL, NULL, 1, ?, datetime('now'), datetime('now'))
      `);
      const insertAlias = db.prepare(
        `INSERT OR IGNORE INTO catalog_item_aliases (id, catalog_item_id, alias_type, alias_value, created_at, updated_at)
         VALUES ('alias-' || lower(hex(randomblob(8))), ?, 'parser_phrase', ?, datetime('now'), datetime('now'))`
      );

      const mountAttrs = (id: string) => {
        insertAttr.run(id, 'mounting', 'ADHESIVE', 0);
        insertAttr.run(id, 'mounting', 'MECHANICAL_FASTENED', 1);
      };

      const cg = bySku.get('WCP-CORNER-GUARD');
      if (cg) {
        mountAttrs(cg);
        for (const v of ['corner guard', 'corner guards', 'wall corner guard', 'wall protection corner guard', 'acrovyn corner guard']) {
          insertAlias.run(cg, v);
        }
      }

      const chair = bySku.get('WCP-CHAIR-RAIL');
      if (chair) {
        mountAttrs(chair);
        for (const v of ['chair rail', 'chair rails', 'wall guard', 'wall guards', 'acrovyn wall guard', 'wall protection chair rail']) {
          insertAlias.run(chair, v);
        }
      }

      const crash = bySku.get('WCP-CRASH-RAIL');
      if (crash) {
        mountAttrs(crash);
        for (const v of ['crash rail', 'crash rails', 'bumper rail', 'bumper rails', 'acrovyn crash rail', 'scr crash rail']) {
          insertAlias.run(crash, v);
        }
      }
    } catch {
      // Best-effort only.
    }

    // Postal specialties: seed aliases (4C, CBU, parcel lockers) without per-config SKU clutter.
    try {
      const rows = db
        .prepare(
          `SELECT id, sku
           FROM catalog_items
           WHERE sku IN ('POSTAL-4C-HORIZONTAL','POSTAL-4C-HORIZONTAL-3500','POSTAL-CBU-1570','POSTAL-PARCEL-LOCKER-1590')`
        )
        .all() as Array<{ id: string; sku: string }>;
      const bySku = new Map(rows.map((r) => [r.sku, r.id]));

      const insertAlias = db.prepare(
        `INSERT OR IGNORE INTO catalog_item_aliases (id, catalog_item_id, alias_type, alias_value, created_at, updated_at)
         VALUES ('alias-' || lower(hex(randomblob(8))), ?, 'parser_phrase', ?, datetime('now'), datetime('now'))`
      );

      const fourC = bySku.get('POSTAL-4C-HORIZONTAL');
      if (fourC) {
        for (const v of ['4c mailbox', 'std-4c mailbox', 'usps 4c mailbox', 'horizontal mailbox', '4c horizontal mailboxes', 'mail receptacle 4c']) {
          insertAlias.run(fourC, v);
        }
        for (const v of ['florence 4c', 'florence std-4c', 'versatile 4c']) insertAlias.run(fourC, v);
        for (const v of ['tenant mailboxes', 'tenant mailbox system', '4c mailbox system', 'usps tenant mailbox']) insertAlias.run(fourC, v);
      }

      const fourC3500 = bySku.get('POSTAL-4C-HORIZONTAL-3500');
      if (fourC3500) {
        for (const v of ['salsbury 4c', 'salsbury 3500', '3500 series mailbox', '4c mailbox salsbury', 'salsbury horizontal mailbox', 'usps 4c salsbury']) {
          insertAlias.run(fourC3500, v);
        }
      }

      const cbu = bySku.get('POSTAL-CBU-1570');
      if (cbu) {
        for (const v of ['cbu', 'cluster box unit', 'cluster mailbox', 'cluster mailboxes', 'usps cbu', 'florence 1570', 'community mailbox', 'community mailboxes']) {
          insertAlias.run(cbu, v);
        }
        for (const v of ['1570-8af', '1570-12af', '1570-16af', '1570-4t5af', '1570-8t6af']) insertAlias.run(cbu, v);
      }

      const parcel = bySku.get('POSTAL-PARCEL-LOCKER-1590');
      if (parcel) {
        for (const v of ['parcel locker', 'package locker', 'outdoor parcel locker', 'usps parcel locker', 'florence 1590']) {
          insertAlias.run(parcel, v);
        }
        for (const v of ['1590-t1af', '1590-t2af']) insertAlias.run(parcel, v);
      }
    } catch {
      // Best-effort only.
    }

    // Toilet accessories (second-pass hygiene): keep backward compatibility for older shorthand SKUs
    // by seeding legacy_sku aliases onto the upgraded manufacturer-backed rows.
    try {
      const rows = db
        .prepare(
          `SELECT id, sku
           FROM catalog_items
           WHERE sku IN ('B-6806-36','B-6806-42','B-2706','B-270','ASI-W556509','ASI-W51919-04')`
        )
        .all() as Array<{ id: string; sku: string }>;
      const bySku = new Map(rows.map((r) => [r.sku, r.id]));

      const insertLegacySku = db.prepare(
        `INSERT OR IGNORE INTO catalog_item_aliases (id, catalog_item_id, alias_type, alias_value, created_at, updated_at)
         VALUES ('alias-' || lower(hex(randomblob(8))), ?, 'legacy_sku', ?, datetime('now'), datetime('now'))`
      );

      const gb36 = bySku.get('B-6806-36');
      if (gb36) {
        for (const v of ['GB-36']) insertLegacySku.run(gb36, v);
      }
      const gb42 = bySku.get('B-6806-42');
      if (gb42) {
        for (const v of ['GB-B6806-42']) insertLegacySku.run(gb42, v);
      }
      const snv = bySku.get('B-2706');
      if (snv) {
        for (const v of ['SNV-B2706']) insertLegacySku.run(snv, v);
      }
      const snd = bySku.get('B-270');
      if (snd) {
        for (const v of ['SND-B270']) insertLegacySku.run(snd, v);
      }
      const ttd = bySku.get('ASI-W556509');
      if (ttd) {
        for (const v of ['TTD-W556509']) insertLegacySku.run(ttd, v);
      }
      const sd = bySku.get('ASI-W51919-04');
      if (sd) {
        for (const v of ['SD-W51919-04']) insertLegacySku.run(sd, v);
      }

      // Deprecate a few internal/shorthand-only rows from forward-facing use (still compatible for old lines).
      db.prepare(
        `UPDATE catalog_items
         SET deprecated = 1, is_canonical = 0, deprecated_reason = 'Shorthand/internal seed; use manufacturer-backed canonicals.'
         WHERE sku IN ('2-WALL-GB')`
      ).run();
    } catch {
      // Best-effort only.
    }

    // Fire protection specialties: seed canonical anchors + variant phrases without SKU explosion.
    try {
      const db3 = db;
      const ensureAliases = (canonicalSku: string, aliasValues: string[]) => {
        const row = db3.prepare(`SELECT id FROM catalog_items WHERE lower(sku) = lower(?) LIMIT 1`).get(canonicalSku) as { id: string } | undefined;
        if (!row?.id) return;
        const insert = db3.prepare(
          `INSERT OR IGNORE INTO catalog_item_aliases (id, catalog_item_id, alias_type, alias_value, created_at, updated_at)
           VALUES ('alias-' || lower(hex(randomblob(8))), ?, 'parser_phrase', ?, datetime('now'), datetime('now'))`
        );
        for (const v of aliasValues) {
          const trimmed = String(v || '').trim();
          if (!trimmed) continue;
          insert.run(row.id, trimmed);
        }
      };

      ensureAliases('FE-CABINET', [
        'fire extinguisher cabinet',
        'extinguisher cabinet',
        'fe cabinet',
        'fire rated extinguisher cabinet',
        'semi recessed extinguisher cabinet',
        'semi-recessed extinguisher cabinet',
        'recessed extinguisher cabinet',
        'surface extinguisher cabinet',
      ]);
      ensureAliases('AED-CABINET', [
        'aed cabinet',
        'aed wall cabinet',
        'recessed aed cabinet',
        'surface aed cabinet',
      ]);
    } catch {
      // Best-effort only.
    }
  }

  if (!settingsExists) {
    db.prepare(`
      INSERT INTO settings_v1 (
        id, company_name, company_address, company_phone, company_email, logo_url, default_labor_rate_per_hour,
        default_overhead_percent, default_profit_percent, default_tax_percent, default_labor_burden_percent, default_labor_overhead_percent,
        proposal_intro, proposal_terms, proposal_exclusions, proposal_clarifications, proposal_acceptance_label, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'global',
      'Brighten Builders, LLC',
      '512 S. 70th Street, Kansas City, KS 66611',
      '',
      '',
      'https://static.wixstatic.com/media/18d091_be2178f095264ea0a1d2c8d78520b2ce%7Emv2.png/v1/fit/w_2500,h_1330,al_c/18d091_be2178f095264ea0a1d2c8d78520b2ce%7Emv2.png',
      defaultLaborRatePerHour,
      15,
      10,
      8.25,
      0,
      5,
      DEFAULT_PROPOSAL_INTRO,
      DEFAULT_PROPOSAL_TERMS,
      DEFAULT_PROPOSAL_EXCLUSIONS,
      DEFAULT_PROPOSAL_CLARIFICATIONS,
      DEFAULT_PROPOSAL_ACCEPTANCE_LABEL,
      new Date().toISOString()
    );
  } else {
    db.prepare(`
      UPDATE settings_v1
      SET default_labor_rate_per_hour = ?, updated_at = ?
      WHERE id = 'global' AND (default_labor_rate_per_hour IS NULL OR default_labor_rate_per_hour <= 0)
    `).run(defaultLaborRatePerHour, new Date().toISOString());

    db.prepare(`
      UPDATE settings_v1
      SET company_name = ?, updated_at = ?
      WHERE id = 'global' AND company_name = 'Brighten Install'
    `).run('Brighten Builders, LLC', new Date().toISOString());

    db.prepare(`
      UPDATE settings_v1
      SET company_address = ?, updated_at = ?
      WHERE id = 'global' AND (company_address IS NULL OR company_address = '')
    `).run('512 S. 70th Street, Kansas City, KS 66611', new Date().toISOString());

    db.prepare(`
      UPDATE settings_v1
      SET logo_url = ?, updated_at = ?
      WHERE id = 'global' AND (logo_url IS NULL OR logo_url = '')
    `).run('https://static.wixstatic.com/media/18d091_be2178f095264ea0a1d2c8d78520b2ce%7Emv2.png/v1/fit/w_2500,h_1330,al_c/18d091_be2178f095264ea0a1d2c8d78520b2ce%7Emv2.png', new Date().toISOString());

    const settingsRow = db.prepare(`
      SELECT proposal_intro, proposal_terms, proposal_exclusions, proposal_clarifications, proposal_acceptance_label
      FROM settings_v1
      WHERE id = 'global'
    `).get() as {
      proposal_intro: string;
      proposal_terms: string;
      proposal_exclusions: string;
      proposal_clarifications: string;
      proposal_acceptance_label: string;
    } | undefined;

    if (settingsRow) {
      const sanitized = sanitizeProposalSettings({
        proposalIntro: settingsRow.proposal_intro,
        proposalTerms: settingsRow.proposal_terms,
        proposalExclusions: settingsRow.proposal_exclusions,
        proposalClarifications: settingsRow.proposal_clarifications,
        proposalAcceptanceLabel: settingsRow.proposal_acceptance_label,
      });

      if (
        sanitized.proposalIntro !== settingsRow.proposal_intro ||
        sanitized.proposalTerms !== settingsRow.proposal_terms ||
        sanitized.proposalExclusions !== settingsRow.proposal_exclusions ||
        sanitized.proposalClarifications !== settingsRow.proposal_clarifications ||
        sanitized.proposalAcceptanceLabel !== settingsRow.proposal_acceptance_label
      ) {
        db.prepare(`
          UPDATE settings_v1
          SET proposal_intro = ?, proposal_terms = ?, proposal_exclusions = ?, proposal_clarifications = ?, proposal_acceptance_label = ?, updated_at = ?
          WHERE id = 'global'
        `).run(
          sanitized.proposalIntro,
          sanitized.proposalTerms,
          sanitized.proposalExclusions,
          sanitized.proposalClarifications,
          sanitized.proposalAcceptanceLabel,
          new Date().toISOString()
        );
      }
    }
  }

  const modifiersCount = db.prepare('SELECT COUNT(*) as count FROM modifiers_v1').get() as { count: number };
  if (modifiersCount.count === 0) {
    const now = new Date().toISOString();
    const insertModifier = db.prepare(`
      INSERT INTO modifiers_v1 (
        id, name, modifier_key, description, applies_to_categories, add_labor_minutes, add_material_cost,
        percent_labor, percent_material, active, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertModifier.run(
      'mod-ada',
      'ADA',
      'ADA',
      'Americans with Disabilities Act (ADA) accessibility requirements—typically added clearances, reach ranges, and mounting heights for toilet accessories (e.g., grab bars, dispensers, mirrors). Use when scope must meet accessible restroom standards.',
      JSON.stringify(['Toilet Accessories', 'Partitions']),
      5,
      0,
      0,
      0,
      1,
      now
    );
    insertModifier.run(
      'mod-recessed',
      'Recessed',
      'RECESSED',
      'Recessed or semi-recessed installation: fixture or accessory is set into the wall or chase for a flush finish. Expect added rough-opening, blocking, and finish-cut labor versus surface mount.',
      JSON.stringify(['Toilet Accessories', 'Fire Specialties']),
      10,
      15,
      0,
      0,
      1,
      now
    );
    insertModifier.run(
      'mod-stainless',
      'Stainless Upgrade',
      'STAINLESS',
      'Stainless steel finish upgrade for durability and corrosion resistance in wet or high-traffic restrooms; material cost uplift versus painted or plated equivalents.',
      JSON.stringify(['Toilet Accessories', 'Partitions']),
      0,
      40,
      0,
      10,
      1,
      now
    );
  }

  const bundleCount = db.prepare('SELECT COUNT(*) as count FROM bundles_v1').get() as { count: number };
  if (bundleCount.count === 0) {
    const now = new Date().toISOString();
    db.prepare('INSERT INTO bundles_v1 (id, bundle_name, category, active, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run('bundle-ada-single-stall', 'ADA Single Stall Restroom Bundle', 'Restroom', 1, now);

    const insertBundleItem = db.prepare(`
      INSERT INTO bundle_items_v1 (
        id, bundle_id, catalog_item_id, sku, description, qty, material_cost, labor_minutes, labor_cost, sort_order, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertBundleItem.run('bundle-item-1', 'bundle-ada-single-stall', 'c1', 'GA-36', 'Grab Bar 36" Stainless Steel', 1, 45, 30, 25, 1, null);
    insertBundleItem.run('bundle-item-2', 'bundle-ada-single-stall', 'c5', 'M-1836', 'Mirror 18" x 36" Channel Frame', 1, 65, 20, 18, 2, null);
    insertBundleItem.run('bundle-item-3', 'bundle-ada-single-stall', 'c6', 'TD-262', 'Paper Towel Dispenser, Surface', 1, 85, 20, 18, 3, null);
  }

  const syncStatusExists = db.prepare('SELECT 1 FROM catalog_sync_status_v1 WHERE id = ?').get('catalog');
  if (!syncStatusExists) {
    db.prepare(`
      INSERT INTO catalog_sync_status_v1 (
        id, last_attempt_at, last_success_at, status, message, items_synced, modifiers_synced, bundles_synced, bundle_items_synced, warnings_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('catalog', null, null, 'never', null, 0, 0, 0, 0, '[]');
  }

  seedEstimatorNormLayerExamples(db);
}

/** Idempotent example rows for / supabase/migrations/0003_estimator_catalog_normalization_v1.sql (no bulk catalog migration). */
function seedEstimatorNormLayerExamples(db: Database) {
  const now = new Date().toISOString();
  const insCat = db.prepare(`
    INSERT OR IGNORE INTO catalog_items (
      id, sku, category, description, uom, base_material_cost, base_labor_minutes, manufacturer, model, taxable, ada_flag, active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  // Aligns with 0001_v1_baseline.sql so foreign keys resolve before takeoff auto-seed runs
  insCat.run('c1', 'GA-36', 'Toilet Accessories', 'Grab Bar 36" Stainless Steel', 'EA', 45, 30, 'Bobrick', 'B-6806', 1, 0, 1);
  insCat.run('c3', 'TP-101', 'Partitions', 'Toilet Partition, Powder Coated', 'EA', 450, 120, 'Hadrian', 'Standard', 1, 0, 1);
  insCat.run('c5', 'M-1836', 'Toilet Accessories', 'Mirror 18" x 36" Channel Frame', 'EA', 65, 20, 'Bobrick', 'B-165', 1, 0, 1);
  insCat.run('c6', 'TD-262', 'Toilet Accessories', 'Paper Towel Dispenser, Surface', 'EA', 85, 20, 'Bobrick', 'B-262', 1, 0, 1);
  const insAttrDef = db.prepare(
    `INSERT OR IGNORE INTO estimator_catalog_attribute_defs (id, attribute_key, label, value_kind, sort_order, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  insAttrDef.run('ead-material', 'material', 'Material / finish family', 'freeform', 10, 1, now);
  insAttrDef.run('ead-mounting', 'mounting', 'Mounting', 'freeform', 20, 1, now);
  insAttrDef.run('ead-partition-material', 'partition_material', 'Toilet partition core material', 'freeform', 30, 1, now);

  const insPm = db.prepare(
    `INSERT OR IGNORE INTO estimator_parametric_modifiers (id, modifier_key, name, description, applies_to_categories_json, add_labor_minutes, add_material_cost, percent_labor, percent_material, labor_cost_multiplier, active, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  insPm.run(
    'epm-surface',
    'MOUNT-SURFACE',
    'Surface mount',
    'Default surface-mounted accessory install (baseline for mounting comparisons).',
    JSON.stringify(['Toilet Accessories', 'Washroom Accessories', 'Fire Specialties']),
    0,
    0,
    0,
    0,
    1,
    1,
    now
  );
  insPm.run(
    'epm-recessed',
    'MOUNT-RECESSED',
    'Recessed mount',
    'Recessed install with extra opening/finish cut labor; slight labor multiplier on install minutes.',
    JSON.stringify(['Toilet Accessories', 'Partitions', 'Fire Specialties']),
    10,
    0,
    0,
    0,
    1.08,
    1,
    now
  );
  insPm.run(
    'epm-stainless-uplift',
    'FINISH-STAINLESS',
    'Stainless material uplift',
    'Stainless option material uplift; matches typical stainless premium vs painted.',
    JSON.stringify(['Toilet Accessories', 'Partitions']),
    0,
    40,
    0,
    10,
    1,
    1,
    now
  );
  insPm.run(
    'epm-ada',
    'REG-ADA',
    'ADA restroom compliance',
    'ADA-related labor bump for clearances, heights, and coordination in restroom accessories.',
    JSON.stringify(['Toilet Accessories', 'Partitions', 'Restroom']),
    5,
    0,
    0,
    0,
    1,
    1,
    now
  );

  const insAlias = db.prepare(
    `INSERT OR IGNORE INTO estimator_sku_aliases (id, alias_text, alias_kind, target_catalog_item_id, notes, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  insAlias.run(
    'alias-bradley-812',
    'BRADLEY-812',
    'vendor_sku',
    'c1',
    'Example: competitive grab bar as alias to Bobrick B-6806 / GA-36 line',
    1,
    now,
    now
  );

  const insIa = db.prepare(
    `INSERT OR IGNORE INTO estimator_catalog_item_attributes (id, catalog_item_id, attribute_id, value, created_at) VALUES (?, ?, ?, ?, ?)`
  );
  insIa.run('eiat-c1-mat', 'c1', 'ead-material', 'stainless', now);
  insIa.run('eiat-c1-mount', 'c1', 'ead-mounting', 'surface', now);
  if (db.prepare('SELECT 1 FROM catalog_items WHERE id = ?').get('c3')) {
    insIa.run('eiat-c3-ptn', 'c3', 'ead-partition-material', 'HDPE', now);
  }

  const insNb = db.prepare(
    `INSERT OR IGNORE INTO estimator_norm_bundles_v1 (id, name, category, description, legacy_bundle_id, sort_order, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  insNb.run(
    'norm-bundle-ada-restroom',
    'ADA restroom bundle (example)',
    'Restroom',
    'Seeded example tying grab bar, mirror, towel; compare to bundles_v1 for migration.',
    'bundle-ada-single-stall',
    1,
    1,
    now,
    now
  );
  const insNbi = db.prepare(
    `INSERT OR IGNORE INTO estimator_norm_bundle_items_v1 (id, norm_bundle_id, catalog_item_id, qty, sort_order, notes) VALUES (?, ?, ?, ?, ?, ?)`
  );
  if (db.prepare('SELECT 1 FROM catalog_items WHERE id = ?').get('c5') && db.prepare('SELECT 1 FROM catalog_items WHERE id = ?').get('c6')) {
    insNbi.run('enbi-ada-1', 'norm-bundle-ada-restroom', 'c1', 1, 1, 'Bobrick B-6806 / GA-36 line');
    insNbi.run('enbi-ada-2', 'norm-bundle-ada-restroom', 'c5', 1, 2, 'Mirror line');
    insNbi.run('enbi-ada-3', 'norm-bundle-ada-restroom', 'c6', 1, 3, 'Towel dispenser line');
  }
}
