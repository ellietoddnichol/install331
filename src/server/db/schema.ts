import { estimatorDb } from './connection.ts';
import {
  DEFAULT_PROPOSAL_ACCEPTANCE_LABEL,
  DEFAULT_PROPOSAL_CLARIFICATIONS,
  DEFAULT_PROPOSAL_EXCLUSIONS,
  DEFAULT_PROPOSAL_INTRO,
  DEFAULT_PROPOSAL_TERMS,
  sanitizeProposalSettings,
} from '../../shared/utils/proposalDefaults.ts';

export function initEstimatorSchema() {
  const defaultLaborRatePerHour = Number(process.env.DEFAULT_LABOR_RATE_PER_HOUR || 85);

  estimatorDb.exec(`
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
      default_labor_rate_per_hour REAL NOT NULL DEFAULT 85,
      default_overhead_percent REAL NOT NULL DEFAULT 0,
      default_profit_percent REAL NOT NULL DEFAULT 0,
      default_tax_percent REAL NOT NULL DEFAULT 0,
      default_labor_burden_percent REAL NOT NULL DEFAULT 0,
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

    CREATE INDEX IF NOT EXISTS idx_rooms_v1_project ON rooms_v1(project_id);
    CREATE INDEX IF NOT EXISTS idx_takeoff_v1_project ON takeoff_lines_v1(project_id);
    CREATE INDEX IF NOT EXISTS idx_takeoff_v1_room ON takeoff_lines_v1(room_id);
    CREATE INDEX IF NOT EXISTS idx_bundle_items_v1_bundle ON bundle_items_v1(bundle_id);
    CREATE INDEX IF NOT EXISTS idx_line_modifiers_v1_line ON line_modifiers_v1(line_id);
    CREATE INDEX IF NOT EXISTS idx_project_files_v1_project ON project_files_v1(project_id);
  `);

  const settingsExists = estimatorDb.prepare('SELECT 1 FROM settings_v1 WHERE id = ?').get('global');

  const settingsColumns = estimatorDb.prepare("PRAGMA table_info(settings_v1)").all() as Array<{ name: string }>;
  const hasProposalExclusions = settingsColumns.some((column) => column.name === 'proposal_exclusions');
  if (!hasProposalExclusions) {
    estimatorDb.exec("ALTER TABLE settings_v1 ADD COLUMN proposal_exclusions TEXT NOT NULL DEFAULT ''");
  }

  const hasDefaultLaborRatePerHour = settingsColumns.some((column) => column.name === 'default_labor_rate_per_hour');
  if (!hasDefaultLaborRatePerHour) {
    estimatorDb.exec(`ALTER TABLE settings_v1 ADD COLUMN default_labor_rate_per_hour REAL NOT NULL DEFAULT ${defaultLaborRatePerHour}`);
  }

  const hasProposalClarifications = settingsColumns.some((column) => column.name === 'proposal_clarifications');
  if (!hasProposalClarifications) {
    estimatorDb.exec("ALTER TABLE settings_v1 ADD COLUMN proposal_clarifications TEXT NOT NULL DEFAULT ''");
  }

  const hasProposalAcceptanceLabel = settingsColumns.some((column) => column.name === 'proposal_acceptance_label');
  if (!hasProposalAcceptanceLabel) {
    estimatorDb.exec("ALTER TABLE settings_v1 ADD COLUMN proposal_acceptance_label TEXT NOT NULL DEFAULT 'Accepted By'");
  }

  const takeoffColumns = estimatorDb.prepare("PRAGMA table_info(takeoff_lines_v1)").all() as Array<{ name: string }>;

  const projectColumns = estimatorDb.prepare("PRAGMA table_info(projects_v1)").all() as Array<{ name: string }>;
  const hasPricingMode = projectColumns.some((column) => column.name === 'pricing_mode');
  if (!hasPricingMode) {
    estimatorDb.exec("ALTER TABLE projects_v1 ADD COLUMN pricing_mode TEXT NOT NULL DEFAULT 'labor_and_material'");
  }

  const hasJobConditions = projectColumns.some((column) => column.name === 'job_conditions_json');
  if (!hasJobConditions) {
    estimatorDb.exec("ALTER TABLE projects_v1 ADD COLUMN job_conditions_json TEXT NOT NULL DEFAULT '{}'");
  }

  const hasScopeCategories = projectColumns.some((column) => column.name === 'scope_categories_json');
  if (!hasScopeCategories) {
    estimatorDb.exec("ALTER TABLE projects_v1 ADD COLUMN scope_categories_json TEXT NOT NULL DEFAULT '[]'");
  }

  const hasSpecialNotes = projectColumns.some((column) => column.name === 'special_notes');
  if (!hasSpecialNotes) {
    estimatorDb.exec('ALTER TABLE projects_v1 ADD COLUMN special_notes TEXT');
  }

  const hasGeneralContractor = projectColumns.some((column) => column.name === 'general_contractor');
  if (!hasGeneralContractor) {
    estimatorDb.exec('ALTER TABLE projects_v1 ADD COLUMN general_contractor TEXT');
  }

  const hasProposalDate = projectColumns.some((column) => column.name === 'proposal_date');
  if (!hasProposalDate) {
    estimatorDb.exec('ALTER TABLE projects_v1 ADD COLUMN proposal_date TEXT');
  }

  estimatorDb.exec("UPDATE projects_v1 SET job_conditions_json = '{}' WHERE job_conditions_json IS NULL OR trim(job_conditions_json) = ''");
  estimatorDb.exec("UPDATE projects_v1 SET scope_categories_json = '[]' WHERE scope_categories_json IS NULL OR trim(scope_categories_json) = ''");
  const hasBaseMaterialCost = takeoffColumns.some((column) => column.name === 'base_material_cost');
  if (!hasBaseMaterialCost) {
    estimatorDb.exec("ALTER TABLE takeoff_lines_v1 ADD COLUMN base_material_cost REAL NOT NULL DEFAULT 0");
    estimatorDb.exec("UPDATE takeoff_lines_v1 SET base_material_cost = material_cost WHERE base_material_cost = 0");
  }

  const hasBaseLaborCost = takeoffColumns.some((column) => column.name === 'base_labor_cost');
  if (!hasBaseLaborCost) {
    estimatorDb.exec("ALTER TABLE takeoff_lines_v1 ADD COLUMN base_labor_cost REAL NOT NULL DEFAULT 0");
    estimatorDb.exec("UPDATE takeoff_lines_v1 SET base_labor_cost = labor_cost WHERE base_labor_cost = 0");
  }

  const hasPricingSource = takeoffColumns.some((column) => column.name === 'pricing_source');
  if (!hasPricingSource) {
    estimatorDb.exec("ALTER TABLE takeoff_lines_v1 ADD COLUMN pricing_source TEXT NOT NULL DEFAULT 'auto'");
  }

  estimatorDb.exec(`
    UPDATE takeoff_lines_v1
    SET pricing_source = CASE
      WHEN abs(coalesce(unit_sell, 0) - round(coalesce(material_cost, 0) + coalesce(labor_cost, 0), 2)) > 0.009 THEN 'manual'
      ELSE 'auto'
    END
    WHERE pricing_source IS NULL OR trim(pricing_source) = ''
  `);

  if (Number.isFinite(defaultLaborRatePerHour) && defaultLaborRatePerHour > 0) {
    const rows = estimatorDb.prepare(`
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

    const updateLine = estimatorDb.prepare(`
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

    estimatorDb.prepare(`
      UPDATE bundle_items_v1
      SET labor_cost = round((labor_minutes / 60.0) * ?, 2)
      WHERE labor_minutes > 0
        AND labor_cost <= 0
    `).run(defaultLaborRatePerHour);
  }

  if (!settingsExists) {
    estimatorDb.prepare(`
      INSERT INTO settings_v1 (
        id, company_name, company_address, company_phone, company_email, logo_url, default_labor_rate_per_hour,
        default_overhead_percent, default_profit_percent, default_tax_percent, default_labor_burden_percent,
        proposal_intro, proposal_terms, proposal_exclusions, proposal_clarifications, proposal_acceptance_label, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      25,
      DEFAULT_PROPOSAL_INTRO,
      DEFAULT_PROPOSAL_TERMS,
      DEFAULT_PROPOSAL_EXCLUSIONS,
      DEFAULT_PROPOSAL_CLARIFICATIONS,
      DEFAULT_PROPOSAL_ACCEPTANCE_LABEL,
      new Date().toISOString()
    );
  } else {
    estimatorDb.prepare(`
      UPDATE settings_v1
      SET default_labor_rate_per_hour = ?, updated_at = ?
      WHERE id = 'global' AND (default_labor_rate_per_hour IS NULL OR default_labor_rate_per_hour <= 0)
    `).run(defaultLaborRatePerHour, new Date().toISOString());

    estimatorDb.prepare(`
      UPDATE settings_v1
      SET company_name = ?, updated_at = ?
      WHERE id = 'global' AND company_name = 'Brighten Install'
    `).run('Brighten Builders, LLC', new Date().toISOString());

    estimatorDb.prepare(`
      UPDATE settings_v1
      SET company_address = ?, updated_at = ?
      WHERE id = 'global' AND (company_address IS NULL OR company_address = '')
    `).run('512 S. 70th Street, Kansas City, KS 66611', new Date().toISOString());

    estimatorDb.prepare(`
      UPDATE settings_v1
      SET logo_url = ?, updated_at = ?
      WHERE id = 'global' AND (logo_url IS NULL OR logo_url = '')
    `).run('https://static.wixstatic.com/media/18d091_be2178f095264ea0a1d2c8d78520b2ce%7Emv2.png/v1/fit/w_2500,h_1330,al_c/18d091_be2178f095264ea0a1d2c8d78520b2ce%7Emv2.png', new Date().toISOString());

    const settingsRow = estimatorDb.prepare(`
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
        estimatorDb.prepare(`
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

  const modifiersCount = estimatorDb.prepare('SELECT COUNT(*) as count FROM modifiers_v1').get() as { count: number };
  if (modifiersCount.count === 0) {
    const now = new Date().toISOString();
    const insertModifier = estimatorDb.prepare(`
      INSERT INTO modifiers_v1 (
        id, name, modifier_key, applies_to_categories, add_labor_minutes, add_material_cost,
        percent_labor, percent_material, active, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertModifier.run('mod-ada', 'ADA', 'ADA', JSON.stringify(['Toilet Accessories', 'Partitions']), 5, 0, 0, 0, 1, now);
    insertModifier.run('mod-recessed', 'Recessed', 'RECESSED', JSON.stringify(['Toilet Accessories', 'Fire Specialties']), 10, 15, 0, 0, 1, now);
    insertModifier.run('mod-stainless', 'Stainless Upgrade', 'STAINLESS', JSON.stringify(['Toilet Accessories', 'Partitions']), 0, 40, 0, 10, 1, now);
  }

  const bundleCount = estimatorDb.prepare('SELECT COUNT(*) as count FROM bundles_v1').get() as { count: number };
  if (bundleCount.count === 0) {
    const now = new Date().toISOString();
    estimatorDb.prepare('INSERT INTO bundles_v1 (id, bundle_name, category, active, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run('bundle-ada-single-stall', 'ADA Single Stall Restroom Bundle', 'Restroom', 1, now);

    const insertBundleItem = estimatorDb.prepare(`
      INSERT INTO bundle_items_v1 (
        id, bundle_id, catalog_item_id, sku, description, qty, material_cost, labor_minutes, labor_cost, sort_order, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertBundleItem.run('bundle-item-1', 'bundle-ada-single-stall', 'c1', 'GA-36', 'Grab Bar 36" Stainless Steel', 1, 45, 30, 25, 1, null);
    insertBundleItem.run('bundle-item-2', 'bundle-ada-single-stall', 'c5', 'M-1836', 'Mirror 18" x 36" Channel Frame', 1, 65, 20, 18, 2, null);
    insertBundleItem.run('bundle-item-3', 'bundle-ada-single-stall', 'c6', 'TD-262', 'Paper Towel Dispenser, Surface', 1, 85, 20, 18, 3, null);
  }

  const syncStatusExists = estimatorDb.prepare('SELECT 1 FROM catalog_sync_status_v1 WHERE id = ?').get('catalog');
  if (!syncStatusExists) {
    estimatorDb.prepare(`
      INSERT INTO catalog_sync_status_v1 (
        id, last_attempt_at, last_success_at, status, message, items_synced, modifiers_synced, bundles_synced, bundle_items_synced, warnings_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('catalog', null, null, 'never', null, 0, 0, 0, 0, '[]');
  }
}
