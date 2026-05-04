import { getEstimatorDb } from '../db/connection.ts';
import { parseCatalogSyncWarningsPayload } from '../services/catalogSyncWorkbookValidation.ts';
import {
  buildCatalogSyncLastAttemptSummary,
  type CatalogSyncRunAuditSummary,
  parseCatalogSyncRunContextJson,
  sliceCatalogSyncRunContextBody,
  toCatalogSyncWorkbookSnapshotFromRunContext,
} from '../../shared/types/catalogSyncAudit.ts';
import { buildCatalogSyncServerConfigNow, buildCatalogSyncWorkbookSnapshot } from '../services/catalogSource.ts';
import {
  CatalogSyncRunHistoryRecord,
  CatalogSyncStatusRecord,
  SettingsRecord,
  type IntakeCatalogAutoApplyMode,
} from '../../shared/types/estimator.ts';
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
  run_context_json?: string | null;
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

export function getSettings(): SettingsRecord {
  const row = getEstimatorDb().prepare('SELECT * FROM settings_v1 WHERE id = ?').get('global') as SettingsDbRow | undefined;
  if (!row) {
    return mapSettingsRow({
      id: 'global',
      company_name: '',
      company_address: '',
      company_phone: '',
      company_email: '',
      logo_url: '',
      default_labor_rate_per_hour: 100,
      default_overhead_percent: 0,
      default_profit_percent: 0,
      default_tax_percent: 8.25,
      default_labor_burden_percent: 0,
      default_labor_overhead_percent: 5,
      proposal_intro: null,
      proposal_terms: null,
      proposal_exclusions: null,
      proposal_clarifications: null,
      proposal_acceptance_label: null,
      intake_catalog_auto_apply_mode: 'off',
      intake_catalog_tier_a_min_score: 0.82,
      updated_at: new Date().toISOString(),
    } as SettingsDbRow);
  }
  return mapSettingsRow(row);
}

export function updateSettings(input: Partial<SettingsRecord>): SettingsRecord {
  const current = getSettings();
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

  const db = getEstimatorDb();
  const params = [
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
  ] as const;

  const updated = db
    .prepare(
      `
    UPDATE settings_v1 SET
      company_name = ?, company_address = ?, company_phone = ?, company_email = ?, logo_url = ?, default_labor_rate_per_hour = ?,
      default_overhead_percent = ?, default_profit_percent = ?, default_tax_percent = ?, default_labor_burden_percent = ?, default_labor_overhead_percent = ?,
      proposal_intro = ?, proposal_terms = ?, proposal_exclusions = ?, proposal_clarifications = ?, proposal_acceptance_label = ?,
      intake_catalog_auto_apply_mode = ?, intake_catalog_tier_a_min_score = ?, updated_at = ?
    WHERE id = 'global'
  `
    )
    .run(...params);

  if (updated.changes === 0) {
    db.prepare(
      `
      INSERT INTO settings_v1 (
        id, company_name, company_address, company_phone, company_email, logo_url,
        default_labor_rate_per_hour, default_overhead_percent, default_profit_percent, default_tax_percent,
        default_labor_burden_percent, default_labor_overhead_percent,
        proposal_intro, proposal_terms, proposal_exclusions, proposal_clarifications, proposal_acceptance_label,
        intake_catalog_auto_apply_mode, intake_catalog_tier_a_min_score, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run('global', ...params);
  }

  return next;
}

/** Status row may lag run history: merge audit from latest `catalog_sync_runs_v1` when missing on `catalog_sync_status_v1`. */
function mergeSyncWarningsForStatusView(
  statusParsed: { warnings: string[]; audit?: CatalogSyncRunAuditSummary },
  latestRunParsed: { warnings: string[]; audit?: CatalogSyncRunAuditSummary }
): { warnings: string[]; audit?: CatalogSyncRunAuditSummary } {
  const audit = statusParsed.audit ?? latestRunParsed.audit;
  const ordered = [...statusParsed.warnings, ...latestRunParsed.warnings];
  const seen = new Set<string>();
  const warnings = ordered.filter((w) => {
    if (seen.has(w)) return false;
    seen.add(w);
    return true;
  });
  return { warnings, audit };
}

export function getCatalogSyncStatus(): CatalogSyncStatusRecord {
  const row = getEstimatorDb().prepare('SELECT * FROM catalog_sync_status_v1 WHERE id = ?').get('catalog') as CatalogSyncStatusDbRow;

  const parsed = parseCatalogSyncWarningsPayload(row.warnings_json);
  const serverConfigNow = buildCatalogSyncServerConfigNow();
  const latestRun = getEstimatorDb()
    .prepare(
      `
    SELECT id, run_context_json, warnings_json
    FROM catalog_sync_runs_v1
    ORDER BY attempted_at DESC
    LIMIT 1
  `
    )
    .get() as { id: string; run_context_json: string | null; warnings_json: string | null } | undefined;
  const historicalSyncRunContext = parseCatalogSyncRunContextJson(latestRun?.run_context_json);
  const workbook = historicalSyncRunContext
    ? toCatalogSyncWorkbookSnapshotFromRunContext(sliceCatalogSyncRunContextBody(historicalSyncRunContext))
    : buildCatalogSyncWorkbookSnapshot();

  const latestRunParsed = parseCatalogSyncWarningsPayload(latestRun?.warnings_json ?? null);
  const merged = mergeSyncWarningsForStatusView(parsed, latestRunParsed);

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
    warnings: merged.warnings,
    syncAudit: merged.audit,
    workbook,
    serverConfigNow,
    historicalSyncRunContext: historicalSyncRunContext ?? null,
    latestCatalogSyncRunId: latestRun?.id ?? null,
    lastAttemptSummary: buildCatalogSyncLastAttemptSummary(merged.audit),
  };
}

/** Row slice needed for `/catalog-sync-review-csv` (warnings_json + optional run_context_json). */
export function getCatalogSyncRunRowForCsv(runId?: string | null): CatalogSyncRunDbRow | undefined {
  const db = getEstimatorDb();
  if (runId?.trim()) {
    return db.prepare(`SELECT * FROM catalog_sync_runs_v1 WHERE id = ?`).get(runId.trim()) as CatalogSyncRunDbRow | undefined;
  }
  return db
    .prepare(
      `
    SELECT * FROM catalog_sync_runs_v1
    ORDER BY attempted_at DESC
    LIMIT 1
  `
    )
    .get() as CatalogSyncRunDbRow | undefined;
}

export function listCatalogSyncRuns(limit = 10): CatalogSyncRunHistoryRecord[] {
  const rows = getEstimatorDb().prepare(`
    SELECT *
    FROM catalog_sync_runs_v1
    ORDER BY attempted_at DESC
    LIMIT ?
  `).all(limit) as CatalogSyncRunDbRow[];

  const serverConfigNow = buildCatalogSyncServerConfigNow();
  const workbookFallback = buildCatalogSyncWorkbookSnapshot();
  return rows.map((row) => {
    const parsedWarnings = parseCatalogSyncWarningsPayload(row.warnings_json);
    const historicalSyncRunContext = parseCatalogSyncRunContextJson(row.run_context_json ?? null);
    const workbook = historicalSyncRunContext
      ? toCatalogSyncWorkbookSnapshotFromRunContext(sliceCatalogSyncRunContextBody(historicalSyncRunContext))
      : workbookFallback;
    return {
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
      warnings: parsedWarnings.warnings,
      syncAudit: parsedWarnings.audit,
      workbook,
      serverConfigNow,
      historicalSyncRunContext: historicalSyncRunContext ?? null,
      lastAttemptSummary: buildCatalogSyncLastAttemptSummary(parsedWarnings.audit),
    };
  });
}
