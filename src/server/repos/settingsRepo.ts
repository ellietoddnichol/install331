import { dbAll, dbGet, dbRun } from '../db/query.ts';
import { CatalogSyncStatusRecord, SettingsRecord, type IntakeCatalogAutoApplyMode } from '../../shared/types/estimator.ts';
import { sanitizeProposalSettings } from '../../shared/utils/proposalDefaults.ts';

type SettingsDbRow = {
  id: string;
  company_name: string | null;
  company_address: string | null;
  company_phone: string | null;
  company_email: string | null;
  logo_url: string | null;
  default_labor_rate_per_hour: number | null;
  default_overhead_percent: number | null;
  default_profit_percent: number | null;
  default_tax_percent: number | null;
  default_labor_burden_percent: number | null;
  default_labor_overhead_percent: number | null;
  proposal_intro: string | null;
  proposal_terms: string | null;
  proposal_exclusions: string | null;
  proposal_clarifications: string | null;
  proposal_acceptance_label: string | null;
  intake_catalog_auto_apply_mode: string | null;
  intake_catalog_tier_a_min_score: number | null;
  updated_at: string;
};

function coerceIntakeCatalogAutoApplyMode(raw: unknown): IntakeCatalogAutoApplyMode {
  const s = String(raw ?? 'off').trim();
  if (s === 'preselect_only' || s === 'auto_link_tier_a') return s;
  return 'off';
}

function coerceIntakeTierAMinScore(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0.82;
  return Math.min(0.99, Math.max(0.5, n));
}

type CatalogSyncStatusDbRow = {
  id: string;
  last_attempt_at: string | null;
  last_success_at: string | null;
  status: string;
  message: string | null;
  items_synced: number | null;
  modifiers_synced: number | null;
  bundles_synced: number | null;
  bundle_items_synced: number | null;
  warnings_json: string | null;
};

type CatalogSyncRunDbRow = {
  id: string;
  attempted_at: string;
  status: 'success' | 'failed';
  message: string | null;
  items_synced: number | null;
  modifiers_synced: number | null;
  bundles_synced: number | null;
  bundle_items_synced: number | null;
  warnings_json: string | null;
};

function mapSettingsRow(row: SettingsDbRow): SettingsRecord {
  return sanitizeProposalSettings({
    id: row.id,
    companyName: row.company_name,
    companyAddress: row.company_address,
    companyPhone: row.company_phone,
    companyEmail: row.company_email,
    logoUrl: row.logo_url,
    defaultLaborRatePerHour: Number(row.default_labor_rate_per_hour ?? 100),
    defaultOverheadPercent: Number(row.default_overhead_percent ?? 15),
    defaultProfitPercent: Number(row.default_profit_percent ?? 10),
    defaultTaxPercent: Number(row.default_tax_percent ?? 8.25),
    defaultLaborBurdenPercent: Number(row.default_labor_burden_percent ?? 0),
    defaultLaborOverheadPercent: Number(row.default_labor_overhead_percent ?? 5),
    proposalIntro: row.proposal_intro,
    proposalTerms: row.proposal_terms,
    proposalExclusions: row.proposal_exclusions,
    proposalClarifications: row.proposal_clarifications,
    proposalAcceptanceLabel: row.proposal_acceptance_label,
    intakeCatalogAutoApplyMode: coerceIntakeCatalogAutoApplyMode(row.intake_catalog_auto_apply_mode),
    intakeCatalogTierAMinScore: coerceIntakeTierAMinScore(row.intake_catalog_tier_a_min_score),
    updatedAt: row.updated_at
  }) as SettingsRecord;
}

function defaultGlobalSettingsRow(): SettingsDbRow {
  const now = new Date().toISOString();
  return {
    id: 'global',
    company_name: '',
    company_address: '',
    company_phone: '',
    company_email: '',
    logo_url: '',
    default_labor_rate_per_hour: 100,
    default_overhead_percent: 15,
    default_profit_percent: 10,
    default_tax_percent: 8.25,
    default_labor_burden_percent: 0,
    default_labor_overhead_percent: 5,
    proposal_intro: '',
    proposal_terms: '',
    proposal_exclusions: '',
    proposal_clarifications: '',
    proposal_acceptance_label: 'Accepted By',
    intake_catalog_auto_apply_mode: 'off',
    intake_catalog_tier_a_min_score: 0.82,
    updated_at: now,
  };
}

export async function getSettings(): Promise<SettingsRecord> {
  const row = (await dbGet('SELECT * FROM settings_v1 WHERE id = ?', ['global'])) as SettingsDbRow | undefined;
  if (!row) {
    return mapSettingsRow(defaultGlobalSettingsRow());
  }
  return mapSettingsRow(row);
}

export async function updateSettings(input: Partial<SettingsRecord>): Promise<SettingsRecord> {
  const current = await getSettings();
  const merged: SettingsRecord = {
    ...current,
    ...input,
    id: 'global',
    updatedAt: new Date().toISOString(),
    intakeCatalogAutoApplyMode: coerceIntakeCatalogAutoApplyMode(
      input.intakeCatalogAutoApplyMode ?? current.intakeCatalogAutoApplyMode
    ),
    intakeCatalogTierAMinScore: coerceIntakeTierAMinScore(
      input.intakeCatalogTierAMinScore ?? current.intakeCatalogTierAMinScore
    ),
  };
  const next = sanitizeProposalSettings(merged) as SettingsRecord;
  next.updatedAt = merged.updatedAt;
  next.intakeCatalogAutoApplyMode = merged.intakeCatalogAutoApplyMode;
  next.intakeCatalogTierAMinScore = merged.intakeCatalogTierAMinScore;

  await dbRun(
    `
    INSERT INTO settings_v1 (
      id, company_name, company_address, company_phone, company_email, logo_url,
      default_labor_rate_per_hour, default_overhead_percent, default_profit_percent, default_tax_percent,
      default_labor_burden_percent, default_labor_overhead_percent,
      proposal_intro, proposal_terms, proposal_exclusions, proposal_clarifications, proposal_acceptance_label,
      intake_catalog_auto_apply_mode, intake_catalog_tier_a_min_score, updated_at
    ) VALUES (
      'global', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
    ON CONFLICT(id) DO UPDATE SET
      company_name = excluded.company_name,
      company_address = excluded.company_address,
      company_phone = excluded.company_phone,
      company_email = excluded.company_email,
      logo_url = excluded.logo_url,
      default_labor_rate_per_hour = excluded.default_labor_rate_per_hour,
      default_overhead_percent = excluded.default_overhead_percent,
      default_profit_percent = excluded.default_profit_percent,
      default_tax_percent = excluded.default_tax_percent,
      default_labor_burden_percent = excluded.default_labor_burden_percent,
      default_labor_overhead_percent = excluded.default_labor_overhead_percent,
      proposal_intro = excluded.proposal_intro,
      proposal_terms = excluded.proposal_terms,
      proposal_exclusions = excluded.proposal_exclusions,
      proposal_clarifications = excluded.proposal_clarifications,
      proposal_acceptance_label = excluded.proposal_acceptance_label,
      intake_catalog_auto_apply_mode = excluded.intake_catalog_auto_apply_mode,
      intake_catalog_tier_a_min_score = excluded.intake_catalog_tier_a_min_score,
      updated_at = excluded.updated_at
  `,
    [
      next.companyName,
      next.companyAddress,
      next.companyPhone,
      next.companyEmail,
      next.logoUrl,
      next.defaultLaborRatePerHour,
      next.defaultOverheadPercent,
      next.defaultProfitPercent,
      next.defaultTaxPercent,
      next.defaultLaborBurdenPercent,
      next.defaultLaborOverheadPercent,
      next.proposalIntro,
      next.proposalTerms,
      next.proposalExclusions,
      next.proposalClarifications,
      next.proposalAcceptanceLabel,
      next.intakeCatalogAutoApplyMode,
      next.intakeCatalogTierAMinScore,
      next.updatedAt,
    ]
  );

  return next;
}

export async function getCatalogSyncStatus(): Promise<CatalogSyncStatusRecord> {
  const row = (await dbGet('SELECT * FROM catalog_sync_status_v1 WHERE id = ?', ['catalog'])) as CatalogSyncStatusDbRow | undefined;
  if (!row) {
    return {
      id: 'catalog',
      lastAttemptAt: null,
      lastSuccessAt: null,
      status: 'never',
      message: null,
      itemsSynced: 0,
      modifiersSynced: 0,
      bundlesSynced: 0,
      bundleItemsSynced: 0,
      aliasesSynced: 0,
      attributesSynced: 0,
      warnings: [],
    };
  }

  return {
    id: row.id,
    lastAttemptAt: row.last_attempt_at,
    lastSuccessAt: row.last_success_at,
    status: row.status as CatalogSyncStatusRecord['status'],
    message: row.message,
    itemsSynced: Number(row.items_synced || 0),
    modifiersSynced: Number(row.modifiers_synced || 0),
    bundlesSynced: Number(row.bundles_synced || 0),
    bundleItemsSynced: Number(row.bundle_items_synced || 0),
    aliasesSynced: Number((row as any).aliases_synced || 0),
    attributesSynced: Number((row as any).attributes_synced || 0),
    warnings: row.warnings_json ? JSON.parse(row.warnings_json) : [],
  };
}

export async function listCatalogSyncRuns(limit = 10): Promise<Array<{
  id: string;
  attemptedAt: string;
  status: 'success' | 'failed';
  message: string | null;
  itemsSynced: number;
  modifiersSynced: number;
  bundlesSynced: number;
  bundleItemsSynced: number;
  aliasesSynced: number;
  attributesSynced: number;
  warnings: string[];
}>> {
  const rows = (await dbAll(
    `
    SELECT *
    FROM catalog_sync_runs_v1
    ORDER BY attempted_at DESC
    LIMIT ?
  `,
    [limit]
  )) as CatalogSyncRunDbRow[];

  return rows.map((row) => ({
    id: row.id,
    attemptedAt: row.attempted_at,
    status: row.status,
    message: row.message,
    itemsSynced: Number(row.items_synced || 0),
    modifiersSynced: Number(row.modifiers_synced || 0),
    bundlesSynced: Number(row.bundles_synced || 0),
    bundleItemsSynced: Number(row.bundle_items_synced || 0),
    aliasesSynced: Number((row as any).aliases_synced || 0),
    attributesSynced: Number((row as any).attributes_synced || 0),
    warnings: row.warnings_json ? JSON.parse(row.warnings_json) : [],
  }));
}
