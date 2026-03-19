import { estimatorDb } from '../db/connection.ts';
import { CatalogSyncStatusRecord, SettingsRecord } from '../../shared/types/estimator.ts';
import { sanitizeProposalSettings } from '../../shared/utils/proposalDefaults.ts';

function mapSettingsRow(row: any): SettingsRecord {
  return sanitizeProposalSettings({
    id: row.id,
    companyName: row.company_name,
    companyAddress: row.company_address,
    companyPhone: row.company_phone,
    companyEmail: row.company_email,
    logoUrl: row.logo_url,
    defaultLaborRatePerHour: Number(row.default_labor_rate_per_hour || 85),
    defaultOverheadPercent: Number(row.default_overhead_percent || 15),
    defaultProfitPercent: Number(row.default_profit_percent || 10),
    defaultTaxPercent: Number(row.default_tax_percent || 8.25),
    defaultLaborBurdenPercent: Number(row.default_labor_burden_percent || 25),
    proposalIntro: row.proposal_intro,
    proposalTerms: row.proposal_terms,
    proposalExclusions: row.proposal_exclusions,
    proposalClarifications: row.proposal_clarifications,
    proposalAcceptanceLabel: row.proposal_acceptance_label,
    updatedAt: row.updated_at
  }) as SettingsRecord;
}

export function getSettings(): SettingsRecord {
  const row = estimatorDb.prepare('SELECT * FROM settings_v1 WHERE id = ?').get('global');
  return mapSettingsRow(row);
}

export function updateSettings(input: Partial<SettingsRecord>): SettingsRecord {
  const current = getSettings();
  const next: SettingsRecord = {
    ...current,
    ...input,
    id: 'global',
    updatedAt: new Date().toISOString()
  };

  estimatorDb.prepare(`
    UPDATE settings_v1 SET
      company_name = ?, company_address = ?, company_phone = ?, company_email = ?, logo_url = ?, default_labor_rate_per_hour = ?,
      default_overhead_percent = ?, default_profit_percent = ?, default_tax_percent = ?, default_labor_burden_percent = ?,
      proposal_intro = ?, proposal_terms = ?, proposal_exclusions = ?, proposal_clarifications = ?, proposal_acceptance_label = ?, updated_at = ?
    WHERE id = 'global'
  `).run(
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
    next.proposalIntro,
    next.proposalTerms,
    next.proposalExclusions,
    next.proposalClarifications,
    next.proposalAcceptanceLabel,
    next.updatedAt
  );

  return next;
}

export function getCatalogSyncStatus(): CatalogSyncStatusRecord {
  const row = estimatorDb.prepare('SELECT * FROM catalog_sync_status_v1 WHERE id = ?').get('catalog') as any;

  return {
    id: row.id,
    lastAttemptAt: row.last_attempt_at,
    lastSuccessAt: row.last_success_at,
    status: row.status,
    message: row.message,
    itemsSynced: Number(row.items_synced || 0),
    modifiersSynced: Number(row.modifiers_synced || 0),
    bundlesSynced: Number(row.bundles_synced || 0),
    bundleItemsSynced: Number(row.bundle_items_synced || 0),
    warnings: row.warnings_json ? JSON.parse(row.warnings_json) : [],
  };
}

export function listCatalogSyncRuns(limit = 10): Array<{
  id: string;
  attemptedAt: string;
  status: 'success' | 'failed';
  message: string | null;
  itemsSynced: number;
  modifiersSynced: number;
  bundlesSynced: number;
  bundleItemsSynced: number;
  warnings: string[];
}> {
  const rows = estimatorDb.prepare(`
    SELECT *
    FROM catalog_sync_runs_v1
    ORDER BY attempted_at DESC
    LIMIT ?
  `).all(limit) as any[];

  return rows.map((row) => ({
    id: row.id,
    attemptedAt: row.attempted_at,
    status: row.status,
    message: row.message,
    itemsSynced: Number(row.items_synced || 0),
    modifiersSynced: Number(row.modifiers_synced || 0),
    bundlesSynced: Number(row.bundles_synced || 0),
    bundleItemsSynced: Number(row.bundle_items_synced || 0),
    warnings: row.warnings_json ? JSON.parse(row.warnings_json) : [],
  }));
}
