/** Structured catalog sync run summary (Google Sheets workbook-first; embedded in `warnings_json`). */

export const CATALOG_SYNC_REVIEW_MAX_SAMPLES = 40;

/** Truncated hints for in-app review (full detail remains in `warnings` / blocking messages). */
export type CatalogSyncReviewSummary = {
  duplicateSkuConflictCount: number;
  duplicateSkuConflictSampleKeys: string[];
  aliasMultiTargetCount: number;
  aliasMultiTargetSampleKeys: string[];
  laborOutlierCount: number;
  laborOutlierSampleLines: string[];
  orphanBundleSkuReferenceCount: number;
  orphanBundleSkuSample: string[];
  orphanBundleModifierReferenceCount: number;
  orphanBundleModifierSample: string[];
  orphanAttributeCanonicalCount: number;
  orphanAttributeCanonicalSample: string[];
  orphanAliasCanonicalCount: number;
  orphanAliasCanonicalSample: string[];
};

/** Env-resolved workbook tabs for the running server (not historical per run). */
export type CatalogSyncWorkbookSnapshot = {
  spreadsheetId: string | null;
  spreadsheetIdConfigured: boolean;
  tabs: {
    itemsConfigured: string;
    /** Tab used after workbook-first CLEAN_ITEMS vs legacy ITEMS resolution. */
    itemsFetch: string;
    /** Raw `GOOGLE_SHEETS_TAB_CLEAN_ITEMS` (defaults CLEAN_ITEMS when unset). */
    cleanItemsTabEnv: string;
    modifiersConfigured: string;
    /** Tab used after workbook-first CLEAN_MODIFIERS vs legacy MODIFIERS resolution. */
    modifiersFetch: string;
    /** Raw `GOOGLE_SHEETS_TAB_CLEAN_MODIFIERS` (defaults CLEAN_MODIFIERS when unset). */
    cleanModifiersTabEnv: string;
    bundles: string;
    aliases: string;
    attributes: string;
  };
};

/** Persisted alongside each `catalog_sync_runs_v1` row; versioned JSON. */
export const CATALOG_SYNC_RUN_CONTEXT_SCHEMA_VERSION = 1 as const;

/** Validation knobs that affect workbook preflight (mirrors scripts/publish-blockers-report + preflight.ts). */
export type CatalogSyncValidationSettingsSnapshot = {
  publishBlockersAllowedCategoriesRaw: string;
  catalogSyncReviewMaxSamples: number;
  preflightMaxBlockingIssues: number;
};

/** `CATALOG_SYNC_IMPORT_*` + related flags sampled at sync start (truthy strings: 1/true/yes). */
export type CatalogSyncImportEnvSnapshot = {
  catalogSyncAllowLegacyItemsTab: boolean;
  catalogSyncAllowLegacyModifiersTab: boolean;
  catalogSyncReplaceMode: boolean;
  catalogSyncSkipStagingSheetImportRows: boolean;
  /** Raw env string (typically `clean` / empty). */
  catalogSyncItemsSource: string;
  /** Per-flag env booleans keyed by env var name (e.g. CATALOG_SYNC_IMPORT_META). */
  stagingTabImportsByEnv: Record<string, boolean>;
};

export type CatalogSyncRunContext = {
  schemaVersion: typeof CATALOG_SYNC_RUN_CONTEXT_SCHEMA_VERSION;
  runKind: 'catalog_full_sync' | 'takeoff_registry_backfill';
  recordedAtIso: string;
  spreadsheetId: string | null;
  spreadsheetIdConfigured: boolean;
  tabs: CatalogSyncWorkbookSnapshot['tabs'];
  /** True when configured items tab name differs from the tab sheet rows were read from. */
  itemsFetchOverridesConfiguredItemsTab: boolean;
  /** True when configured modifiers tab name differs from the tab sheet rows were read from. */
  modifiersFetchOverridesConfiguredModifiersTab: boolean;
  importEnv: CatalogSyncImportEnvSnapshot;
  validation: CatalogSyncValidationSettingsSnapshot;
};

/** Snapshot of catalog sync-related env excluding run identity (`runKind`, `recordedAtIso`, `schemaVersion`). */
export type CatalogSyncServerConfigNow = Omit<CatalogSyncRunContext, 'schemaVersion' | 'runKind' | 'recordedAtIso'>;

/** Safe parse for `run_context_json` column; rejects unknown schema versions and malformed JSON. */
export function parseCatalogSyncRunContextJson(raw: string | null | undefined): CatalogSyncRunContext | null {
  if (!raw || !raw.trim()) return null;
  try {
    const v = JSON.parse(raw) as CatalogSyncRunContext;
    if (!v || typeof v !== 'object') return null;
    if (Number(v.schemaVersion) !== CATALOG_SYNC_RUN_CONTEXT_SCHEMA_VERSION) return null;
    if (v.runKind !== 'catalog_full_sync' && v.runKind !== 'takeoff_registry_backfill') return null;
    if (typeof v.recordedAtIso !== 'string' || !v.recordedAtIso) return null;
    if (
      typeof v.spreadsheetId !== 'string' &&
      v.spreadsheetId !== null
    )
      return null;
    if (!v.tabs || typeof v.tabs.itemsConfigured !== 'string' || typeof v.tabs.itemsFetch !== 'string') return null;
    const tr = v.tabs as Record<string, unknown>;
    const legacyModifiersOnly = typeof tr.modifiers === 'string' ? tr.modifiers : null;
    const modifiersFetch =
      typeof tr.modifiersFetch === 'string' ? tr.modifiersFetch : legacyModifiersOnly;
    if (!modifiersFetch || typeof tr.bundles !== 'string' || typeof tr.aliases !== 'string' || typeof tr.attributes !== 'string') {
      return null;
    }
    const modifiersConfigured =
      typeof tr.modifiersConfigured === 'string' ? tr.modifiersConfigured : modifiersFetch;
    const cleanItemsTabEnv = typeof tr.cleanItemsTabEnv === 'string' ? tr.cleanItemsTabEnv : '';
    const cleanModifiersTabEnv = typeof tr.cleanModifiersTabEnv === 'string' ? tr.cleanModifiersTabEnv : 'CLEAN_MODIFIERS';
    const itemsFetchOverridesConfiguredItemsTab =
      typeof v.itemsFetchOverridesConfiguredItemsTab === 'boolean' ? v.itemsFetchOverridesConfiguredItemsTab : false;
    const modifiersFetchOverridesConfiguredModifiersTab =
      typeof v.modifiersFetchOverridesConfiguredModifiersTab === 'boolean'
        ? v.modifiersFetchOverridesConfiguredModifiersTab
        : false;
    if (!v.importEnv || !v.validation) return null;
    if (typeof v.importEnv.stagingTabImportsByEnv !== 'object' || v.importEnv.stagingTabImportsByEnv === null) return null;
    const ie = v.importEnv as Record<string, unknown>;
    const catalogSyncAllowLegacyModifiersTab =
      typeof ie.catalogSyncAllowLegacyModifiersTab === 'boolean' ? ie.catalogSyncAllowLegacyModifiersTab : false;
    const vmax = v.validation as Record<string, unknown>;
    if (
      typeof vmax.catalogSyncReviewMaxSamples !== 'number' ||
      typeof vmax.preflightMaxBlockingIssues !== 'number' ||
      typeof vmax.publishBlockersAllowedCategoriesRaw !== 'string'
    )
      return null;
    const normalizedTabs = {
      itemsConfigured: v.tabs.itemsConfigured,
      itemsFetch: v.tabs.itemsFetch,
      cleanItemsTabEnv,
      modifiersConfigured,
      modifiersFetch,
      cleanModifiersTabEnv,
      bundles: tr.bundles as string,
      aliases: tr.aliases as string,
      attributes: tr.attributes as string,
    };
    const normalizedImportEnv = {
      ...v.importEnv,
      catalogSyncAllowLegacyModifiersTab,
    };
    const out = {
      ...v,
      itemsFetchOverridesConfiguredItemsTab,
      modifiersFetchOverridesConfiguredModifiersTab,
      tabs: normalizedTabs,
      importEnv: normalizedImportEnv,
    } as CatalogSyncRunContext;
    return out;
  } catch {
    return null;
  }
}

export function toCatalogSyncWorkbookSnapshotFromRunContext(ctx: CatalogSyncServerConfigNow): CatalogSyncWorkbookSnapshot {
  return {
    spreadsheetId: ctx.spreadsheetId,
    spreadsheetIdConfigured: ctx.spreadsheetIdConfigured,
    tabs: ctx.tabs,
  };
}

/** Strip versioning fields — workbook + env snapshot for display. */
export function sliceCatalogSyncRunContextBody(ctx: CatalogSyncRunContext): CatalogSyncServerConfigNow {
  const { schemaVersion: _schemaVersion, runKind: _runKind, recordedAtIso: _recordedAtIso, ...rest } = ctx;
  return rest;
}

export type CatalogSyncCountsSnapshot = {
  itemsSynced: number;
  modifiersSynced: number;
  bundlesSynced: number;
  bundleItemsSynced: number;
  aliasesSynced: number;
  attributesSynced: number;
};

/** Derivable from `syncAudit` for clients that only want counters. */
export type CatalogSyncLastAttemptSummary = {
  tabRows?: { items: number; modifiers: number; bundles: number; aliases: number; attributes: number };
  skippedDuplicateItemRows?: number;
  failedValidationRows?: number;
  bundleUnknownSkuReferences?: number;
  bundleUnknownModifierReferences?: number;
  blockingIssueCount?: number;
  warningLineCount?: number;
  preflightDuplicateSkuGroups?: number;
  persistedSyncCounts?: CatalogSyncCountsSnapshot | null;
};

export type CatalogSyncRunAuditSummary = {
  tabRows: { items: number; modifiers: number; bundles: number; aliases: number; attributes: number };
  itemsSkippedDuplicateRow?: number;
  rowsFailedValidation?: number;
  bundleUnknownSku?: number;
  bundleUnknownModifier?: number;
  blockingIssues?: number;
  warningsEmitted?: number;
  preflightDuplicatesResolved?: number;
  syncCounts?: CatalogSyncCountsSnapshot;
  catalogReview?: CatalogSyncReviewSummary;
};

export function buildCatalogSyncLastAttemptSummary(audit?: CatalogSyncRunAuditSummary): CatalogSyncLastAttemptSummary | undefined {
  if (!audit) return undefined;
  return {
    tabRows: audit.tabRows,
    skippedDuplicateItemRows: audit.itemsSkippedDuplicateRow,
    failedValidationRows: audit.rowsFailedValidation,
    bundleUnknownSkuReferences: audit.bundleUnknownSku,
    bundleUnknownModifierReferences: audit.bundleUnknownModifier,
    blockingIssueCount: audit.blockingIssues,
    warningLineCount: audit.warningsEmitted,
    preflightDuplicateSkuGroups: audit.preflightDuplicatesResolved,
    persistedSyncCounts: audit.syncCounts ?? null,
  };
}
