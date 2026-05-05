import { createHash, createPrivateKey, randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import { getEstimatorDb } from '../db/connection.ts';
import { getCatalogItemsWriteTableName, getCatalogModifiersReadTableName } from '../db/catalogTable.ts';
import type { DbExec } from '../db/query.ts';
import { dbCatalogGet, dbCatalogRun } from '../db/query.ts';
import { withCatalogSyncWriteTransaction } from './catalogSyncTransaction.ts';
import { TAKEOFF_CATALOG_SEED_ITEMS } from './intake/takeoffCatalogRegistry.ts';
import {
  inferItemType,
  manufacturerNormalizedKey,
  mapCategoryMain,
  normalizeSku,
  normalizeUnit,
} from './catalog/catalogNormalization.ts';
import {
  buildCatalogSyncWarningsPayload,
  preflightCatalogWorkbookSync,
} from './catalogSyncWorkbookValidation.ts';
import type { CatalogSyncRunAuditSummary, CatalogSyncRunContext } from '../../shared/types/catalogSyncAudit.ts';
import { CATALOG_SYNC_REVIEW_MAX_SAMPLES, CATALOG_SYNC_RUN_CONTEXT_SCHEMA_VERSION } from '../../shared/types/catalogSyncAudit.ts';
import { CATALOG_SYNC_PREFLIGHT_MAX_BLOCKING } from './catalogSyncWorkbookValidation.ts';

/** Repo root: …/src/server/services → ../../../ */
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

interface SyncCounts {
  itemsSynced: number;
  modifiersSynced: number;
  bundlesSynced: number;
  bundleItemsSynced: number;
  aliasesSynced: number;
  attributesSynced: number;
}

/** Partial row read before updating sync status (counts may be reused on failure paths). */
type CatalogSyncStatusDbRow = {
  items_synced?: number | null;
  modifiers_synced?: number | null;
  bundles_synced?: number | null;
  bundle_items_synced?: number | null;
  aliases_synced?: number | null;
  attributes_synced?: number | null;
};

export interface CatalogSyncResult extends SyncCounts {
  message: string;
  spreadsheetId: string;
  tabs: {
    items: string;
    modifiers: string;
    bundles: string;
    aliases: string;
    attributes: string;
  };
  /** When set, `GOOGLE_SHEETS_TAB_ITEMS` differed from the tab actually read for item upserts. */
  itemsTabConfigured?: string;
  /** When set, `GOOGLE_SHEETS_TAB_MODIFIERS` differed from the tab actually read for modifier upserts. */
  modifiersTabConfigured?: string;
  warnings: string[];
  /** Structured counters / tab rows — also embedded in `warnings_json` when enabled. */
  audit?: CatalogSyncRunAuditSummary;
  syncedAt: string;
}

export interface TakeoffRegistryBackfillResult {
  message: string;
  spreadsheetId: string;
  tabName: string;
  itemsBackfilled: number;
  warnings: string[];
  syncedAt: string;
}

interface SpreadsheetConfig {
  spreadsheetId: string;
  /** Value of GOOGLE_SHEETS_TAB_ITEMS (or default). May be `ITEMS` while reads use `itemsTab`. */
  itemsTabConfigured: string;
  /** Sheet tab range used for item upserts (may be CLEAN_ITEMS when configured tab is legacy ITEMS). */
  itemsTab: string;
  /** Value of GOOGLE_SHEETS_TAB_MODIFIERS (or default). May be `MODIFIERS` while reads use `modifiersTab`. */
  modifiersTabConfigured: string;
  /** Sheet tab used for modifier upserts (may be CLEAN_MODIFIERS when configured tab is legacy MODIFIERS). */
  modifiersTab: string;
  bundlesTab: string;
  aliasesTab: string;
  attributesTab: string;
}

function normalizeHeader(input: string): string {
  return String(input || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Default: merge mode — sheet upserts only touch rows present in the sheet; other DB rows stay as-is.
 * Bulk-imported items (ids not `sheet-item-*`) are never mass-deactivated.
 * Set CATALOG_SYNC_REPLACE_MODE=1 to restore legacy behavior: first matching sheet row deactivates the whole table, then sheet rows reactivate.
 */
function isReplaceCatalogSyncMode(): boolean {
  const v = String(process.env.CATALOG_SYNC_REPLACE_MODE || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function isEnvTruthy(v: string | undefined): boolean {
  const s = String(v ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes';
}

/**
 * Staging / planning tabs — require matching CATALOG_SYNC_IMPORT_* when referenced by GOOGLE_SHEETS_TAB_*.
 * Legacy ITEMS is handled separately via GOOGLE_SHEETS_TAB_CLEAN_ITEMS + CATALOG_SYNC_ALLOW_LEGACY_ITEMS_TAB.
 */
const STAGING_TAB_IMPORT_ENV: Record<string, string> = {
  RECOMMENDED_ITEMS: 'CATALOG_SYNC_IMPORT_RECOMMENDED_ITEMS',
  LEGACY_ITEMS: 'CATALOG_SYNC_IMPORT_LEGACY_ITEMS',
  RESEARCH_QUEUE: 'CATALOG_SYNC_IMPORT_RESEARCH_QUEUE',
  CATEGORY_PLAN: 'CATALOG_SYNC_IMPORT_CATEGORY_PLAN',
  META: 'CATALOG_SYNC_IMPORT_META',
  SYNC_README: 'CATALOG_SYNC_IMPORT_SYNC_README',
  DEFAULT_ITEMS: 'CATALOG_SYNC_IMPORT_DEFAULT_ITEMS',
};

function normalizeSheetTabKey(name: string): string {
  return name.trim().toUpperCase().replace(/\s+/g, '_');
}

function assertNotLegacyItemsAliasForOtherRoles(envVarName: string, tabName: string): void {
  if (normalizeSheetTabKey(tabName) === 'ITEMS' && envVarName !== 'GOOGLE_SHEETS_TAB_ITEMS') {
    throw new Error(
      `${envVarName} must not point at legacy tab ITEMS. Use MODIFIERS, BUNDLES, ALIASES, ATTRIBUTES, etc.`
    );
  }
}

function assertCuratedEnvTabAllowsStaging(envVarName: string, tabName: string): void {
  const key = normalizeSheetTabKey(tabName);
  const flag = STAGING_TAB_IMPORT_ENV[key];
  if (!flag) return;
  if (isEnvTruthy(process.env[flag])) return;
  throw new Error(
    `${envVarName}="${tabName}" is a staging-only tab. Set ${flag}=1 only if you intentionally publish from it; otherwise use curated tabs (CLEAN_ITEMS, MODIFIERS, BUNDLES, ALIASES, ATTRIBUTES).`
  );
}

/**
 * When operators leave GOOGLE_SHEETS_TAB_ITEMS=ITEMS but publish from CLEAN, read the clean tab unless legacy override is set.
 */
export function resolveConfiguredAndFetchItemsTabs(): { configured: string; fetch: string } {
  const configured = String(process.env.GOOGLE_SHEETS_TAB_ITEMS || 'CLEAN_ITEMS').trim();
  const cleanTab = String(process.env.GOOGLE_SHEETS_TAB_CLEAN_ITEMS || 'CLEAN_ITEMS').trim();
  const allowLegacy = isEnvTruthy(process.env.CATALOG_SYNC_ALLOW_LEGACY_ITEMS_TAB);
  if (normalizeSheetTabKey(configured) !== 'ITEMS') {
    return { configured, fetch: configured };
  }
  if (allowLegacy) {
    return { configured, fetch: configured };
  }
  return { configured, fetch: cleanTab };
}

/**
 * When operators leave GOOGLE_SHEETS_TAB_MODIFIERS=MODIFIERS but publish from CLEAN, read the clean tab unless legacy override is set.
 */
export function resolveConfiguredAndFetchModifiersTabs(): { configured: string; fetch: string } {
  const configured = String(process.env.GOOGLE_SHEETS_TAB_MODIFIERS || 'CLEAN_MODIFIERS').trim();
  const cleanTab = String(process.env.GOOGLE_SHEETS_TAB_CLEAN_MODIFIERS || 'CLEAN_MODIFIERS').trim();
  const allowLegacy = isEnvTruthy(process.env.CATALOG_SYNC_ALLOW_LEGACY_MODIFIERS_TAB);
  if (normalizeSheetTabKey(configured) !== 'MODIFIERS') {
    return { configured, fetch: configured };
  }
  if (allowLegacy) {
    return { configured, fetch: configured };
  }
  return { configured, fetch: cleanTab };
}

/** Env reads only (never throws); used so failed sync runs still persist tab/env context. */
function peekCatalogSyncSpreadsheetEnvForRunContext(): {
  spreadsheetId: string | null;
  spreadsheetIdConfigured: boolean;
  itemsTabConfigured: string;
  itemsTabFetch: string;
  modifiersTabConfigured: string;
  modifiersTabFetch: string;
  bundlesTab: string;
  aliasesTab: string;
  attributesTab: string;
  cleanItemsTabEnv: string;
  cleanModifiersTabEnv: string;
} {
  const spreadsheetIdRaw = String(process.env.GOOGLE_SHEETS_SPREADSHEET_ID || process.env.GOOGLE_SHEETS_ID || '').trim();
  const { configured: itemsConfigured, fetch: itemsFetch } = resolveConfiguredAndFetchItemsTabs();
  const { configured: modifiersConfigured, fetch: modifiersFetch } = resolveConfiguredAndFetchModifiersTabs();
  return {
    spreadsheetId: spreadsheetIdRaw ? spreadsheetIdRaw : null,
    spreadsheetIdConfigured: Boolean(spreadsheetIdRaw),
    itemsTabConfigured: itemsConfigured,
    itemsTabFetch: itemsFetch,
    modifiersTabConfigured: modifiersConfigured,
    modifiersTabFetch: modifiersFetch,
    bundlesTab: process.env.GOOGLE_SHEETS_TAB_BUNDLES || 'BUNDLES',
    aliasesTab: process.env.GOOGLE_SHEETS_TAB_ALIASES || 'ALIASES',
    attributesTab: process.env.GOOGLE_SHEETS_TAB_ATTRIBUTES || 'ATTRIBUTES',
    cleanItemsTabEnv: String(process.env.GOOGLE_SHEETS_TAB_CLEAN_ITEMS || 'CLEAN_ITEMS').trim(),
    cleanModifiersTabEnv: String(process.env.GOOGLE_SHEETS_TAB_CLEAN_MODIFIERS || 'CLEAN_MODIFIERS').trim(),
  };
}

/** Captures workbook + importer + validation knobs at execution time (`catalog_sync_runs_v1.run_context_json`). */
export function buildCatalogSyncRunContextRecord(runKind: CatalogSyncRunContext['runKind']): CatalogSyncRunContext {
  const env = peekCatalogSyncSpreadsheetEnvForRunContext();
  const itemsFetchOverridesConfiguredItemsTab =
    env.itemsTabConfigured.trim().toUpperCase() !== env.itemsTabFetch.trim().toUpperCase();
  const modifiersFetchOverridesConfiguredModifiersTab =
    env.modifiersTabConfigured.trim().toUpperCase() !== env.modifiersTabFetch.trim().toUpperCase();
  const stagingTabImportsByEnv: Record<string, boolean> = {};
  for (const flag of Object.values(STAGING_TAB_IMPORT_ENV)) {
    stagingTabImportsByEnv[flag] = isEnvTruthy(process.env[flag]);
  }
  return {
    schemaVersion: CATALOG_SYNC_RUN_CONTEXT_SCHEMA_VERSION,
    runKind,
    recordedAtIso: new Date().toISOString(),
    spreadsheetId: env.spreadsheetId,
    spreadsheetIdConfigured: env.spreadsheetIdConfigured,
    tabs: {
      itemsConfigured: env.itemsTabConfigured,
      itemsFetch: env.itemsTabFetch,
      cleanItemsTabEnv: env.cleanItemsTabEnv,
      modifiersConfigured: env.modifiersTabConfigured,
      modifiersFetch: env.modifiersTabFetch,
      cleanModifiersTabEnv: env.cleanModifiersTabEnv,
      bundles: env.bundlesTab,
      aliases: env.aliasesTab,
      attributes: env.attributesTab,
    },
    itemsFetchOverridesConfiguredItemsTab,
    modifiersFetchOverridesConfiguredModifiersTab,
    importEnv: {
      catalogSyncAllowLegacyItemsTab: isEnvTruthy(process.env.CATALOG_SYNC_ALLOW_LEGACY_ITEMS_TAB),
      catalogSyncAllowLegacyModifiersTab: isEnvTruthy(process.env.CATALOG_SYNC_ALLOW_LEGACY_MODIFIERS_TAB),
      catalogSyncReplaceMode: isReplaceCatalogSyncMode(),
      catalogSyncSkipStagingSheetImportRows: String(process.env.CATALOG_SYNC_SKIP_STAGING || '').trim() === '1',
      catalogSyncItemsSource: String(process.env.CATALOG_SYNC_ITEMS_SOURCE || '').trim(),
      stagingTabImportsByEnv,
    },
    validation: {
      publishBlockersAllowedCategoriesRaw: String(process.env.PUBLISH_BLOCKERS_ALLOWED_CATEGORIES || '').trim(),
      catalogSyncReviewMaxSamples: CATALOG_SYNC_REVIEW_MAX_SAMPLES,
      preflightMaxBlockingIssues: CATALOG_SYNC_PREFLIGHT_MAX_BLOCKING,
    },
  };
}

function parseBoolean(input: unknown, defaultValue = true): boolean {
  const value = String(input ?? '').trim().toLowerCase();
  if (!value) return defaultValue;
  if (['true', '1', 'yes', 'y', 'active', 'enabled'].includes(value)) return true;
  if (['false', '0', 'no', 'n', 'inactive', 'disabled'].includes(value)) return false;
  return defaultValue;
}

function parseNumber(input: unknown, defaultValue = 0): number {
  let s = String(input ?? '')
    .trim()
    .replace(/,/g, '')
    .replace(/^\s*[$€£]\s*/i, '')
    .replace(/\s*[$€£]\s*$/i, '')
    .trim();
  const parsed = Number(s);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function unitLaborCostFromMinutes(laborMinutes: number): number {
  const hourlyRate = Number(process.env.DEFAULT_LABOR_RATE_PER_HOUR || 30);
  if (!Number.isFinite(laborMinutes) || laborMinutes <= 0) return 0;
  if (!Number.isFinite(hourlyRate) || hourlyRate <= 0) return 0;
  return Number(((laborMinutes / 60) * hourlyRate).toFixed(2));
}

function splitList(input: unknown): string[] {
  const value = String(input ?? '').trim();
  if (!value) return [];
  return value
    .split(/[,;|\n]/g)
    .map((token) => token.trim())
    .filter(Boolean);
}

function normalizeSkuToken(input: unknown): string {
  return String(input ?? '').trim().toUpperCase().replace(/\s+/g, '');
}

function normalizeModifierToken(input: unknown): string {
  return String(input ?? '').trim().toUpperCase().replace(/\s+/g, '_');
}

function canonicalKey(input: unknown): string {
  return String(input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normalizeAliasType(input: unknown): string {
  return String(input ?? '').trim().toLowerCase().replace(/\s+/g, '_');
}

function normalizeAttributeType(input: unknown): string {
  return String(input ?? '').trim().toLowerCase();
}

function normalizeDeltaType(input: unknown): string | null {
  const t = String(input ?? '').trim().toLowerCase();
  if (!t) return null;
  if (t === 'absolute' || t === '$' || t === 'dollars' || t === 'usd') return 'absolute';
  if (t === 'percent' || t === '%' || t === 'pct') return 'percent';
  if (t === 'minutes' || t === 'min' || t === 'minute') return 'minutes';
  return t;
}

function columnIndex(headers: string[], aliases: string[]): number | null {
  for (let i = 0; i < headers.length; i += 1) {
    const header = headers[i];
    if (!header) continue;
    if (aliases.some((alias) => header === alias || header.includes(alias))) {
      return i;
    }
  }
  return null;
}

function getCell(row: string[], index: number | null): string {
  if (index === null) return '';
  return String(row[index] ?? '').trim();
}

function keyFromParts(...parts: string[]): string {
  const joined = parts.map((part) => part.trim().toLowerCase()).filter(Boolean).join('|');
  return createHash('sha1').update(joined || randomUUID()).digest('hex').slice(0, 20);
}

/** SKU / Item Key-stable segment for deterministic ids (collapse case-only workbook duplicates). */
function workbookCatalogStableSegment(params: {
  sku: string;
  itemKey: string;
  category: string;
  itemName: string;
  description: string;
}): string {
  const sku = params.sku.trim();
  const itemKey = params.itemKey.trim();
  if (sku) return sku.toLowerCase();
  if (itemKey) return itemKey.toLowerCase();
  return keyFromParts(params.category, params.itemName || params.description);
}

async function fetchTabOrNull(params: { sheets: ReturnType<typeof google.sheets>; spreadsheetId: string; tabName: string }): Promise<string[][] | null> {
  try {
    const res = await params.sheets.spreadsheets.values.get({ spreadsheetId: params.spreadsheetId, range: `${params.tabName}!A:ZZ` });
    const rows = (res.data.values || []) as string[][];
    return rows && rows.length > 0 ? validateSheetRows(rows, params.tabName) : null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Missing tab / invalid range is common; treat as optional.
    if (/Unable to parse range|Requested entity was not found|Invalid range|not found/i.test(msg)) return null;
    throw err;
  }
}

async function resolveCatalogItemIdFromCanonicalSku(
  ex: DbExec,
  writeTable: string,
  canonicalSku: string
): Promise<string | null> {
  const sku = canonicalSku.trim();
  if (!sku) return null;
  const row = await ex.get<{ id: string }>(
    `SELECT id
     FROM ${writeTable}
     WHERE lower(sku) = lower(?)
        OR lower(COALESCE(canonical_sku, '')) = lower(?)
     LIMIT 1`,
    [sku, sku]
  );
  return row?.id || null;
}

export async function upsertAliases(
  ex: DbExec,
  writeTable: string,
  rows: string[][],
  warnings: string[]
): Promise<{ aliasesSynced: number }> {
  if (!rows || rows.length < 2) return { aliasesSynced: 0 };
  const headersRaw = rows[0].map((v) => String(v ?? '').trim());
  const headers = headersRaw.map(normalizeHeader);

  const canonCol = columnIndex(headers, ['canonical_sku', 'canonical sku', 'sku']);
  const typeCol = columnIndex(headers, ['aliastype', 'alias type', 'type']);
  const valueCol = columnIndex(headers, ['aliasvalue', 'alias value', 'value']);
  const activeCol = columnIndex(headers, ['active', 'enabled', 'is active']);

  if (canonCol == null || typeCol == null || valueCol == null) {
    warnings.push('ALIASES tab missing required headers (Canonical_SKU, AliasType, AliasValue). Skipping aliases sync.');
    return { aliasesSynced: 0 };
  }

  const now = new Date().toISOString();

  let aliasesSynced = 0;
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const canonicalSku = String(row[canonCol] ?? '').trim();
    const aliasType = normalizeAliasType(row[typeCol]);
    const aliasValue = String(row[valueCol] ?? '').trim();
    const active = activeCol == null ? true : parseBoolean(row[activeCol], true);
    if (!canonicalSku || !aliasType || !aliasValue) continue;
    if (!active) continue; // non-destructive: skip inactive rows; do not delete existing DB rows.

    const catalogItemId = await resolveCatalogItemIdFromCanonicalSku(ex, writeTable, canonicalSku);
    if (!catalogItemId) {
      warnings.push(`ALIASES: could not resolve Canonical_SKU "${canonicalSku}" to a catalog item id; row skipped.`);
      continue;
    }

    const id = `sheet-alias-${keyFromParts(catalogItemId, aliasType, aliasValue)}`;
    await ex.run(
      `
    INSERT INTO catalog_item_aliases (id, catalog_item_id, alias_type, alias_value, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(catalog_item_id, alias_type, alias_value)
    DO UPDATE SET updated_at = excluded.updated_at
  `,
      [id, catalogItemId, aliasType, aliasValue, now, now]
    );
    aliasesSynced += 1;
  }

  return { aliasesSynced };
}

export async function upsertAttributes(
  ex: DbExec,
  writeTable: string,
  rows: string[][],
  warnings: string[]
): Promise<{ attributesSynced: number }> {
  if (!rows || rows.length < 2) return { attributesSynced: 0 };
  const headersRaw = rows[0].map((v) => String(v ?? '').trim());
  const headers = headersRaw.map(normalizeHeader);

  const canonCol = columnIndex(headers, ['canonical_sku', 'canonical sku', 'sku']);
  const typeCol = columnIndex(headers, ['attributetype', 'attribute type', 'type']);
  const valueCol = columnIndex(headers, ['attributevalue', 'attribute value', 'value']);
  const matTypeCol = columnIndex(headers, ['materialdeltatype', 'material delta type']);
  const matValCol = columnIndex(headers, ['materialdeltavalue', 'material delta value']);
  const laborTypeCol = columnIndex(headers, ['labordeltatype', 'labor delta type']);
  const laborValCol = columnIndex(headers, ['labordeltavalue', 'labor delta value']);
  const activeCol = columnIndex(headers, ['active', 'enabled', 'is active']);
  const sortCol = columnIndex(headers, ['sortorder', 'sort order', 'order']);

  if (canonCol == null || typeCol == null || valueCol == null) {
    warnings.push('ATTRIBUTES tab missing required headers (Canonical_SKU, AttributeType, AttributeValue). Skipping attributes sync.');
    return { attributesSynced: 0 };
  }

  const now = new Date().toISOString();

  let attributesSynced = 0;
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const canonicalSku = String(row[canonCol] ?? '').trim();
    const attributeType = normalizeAttributeType(row[typeCol]);
    const attributeValue = String(row[valueCol] ?? '').trim();
    if (!canonicalSku || !attributeType || !attributeValue) continue;

    const catalogItemId = await resolveCatalogItemIdFromCanonicalSku(ex, writeTable, canonicalSku);
    if (!catalogItemId) {
      warnings.push(`ATTRIBUTES: could not resolve Canonical_SKU "${canonicalSku}" to a catalog item id; row skipped.`);
      continue;
    }

    const materialDeltaType = matTypeCol == null ? null : normalizeDeltaType(row[matTypeCol]);
    let materialDeltaValue = matValCol == null ? null : parseNumber(row[matValCol], 0);
    const laborDeltaType = laborTypeCol == null ? null : normalizeDeltaType(row[laborTypeCol]);
    let laborDeltaValue = laborValCol == null ? null : parseNumber(row[laborValCol], 0);

    // Normalize percent ambiguity (back-compat): if sheet gives 0.1, treat as 10 percent points but warn.
    const normalizePercentPoints = (raw: number, label: string) => {
      if (!Number.isFinite(raw) || raw === 0) return raw;
      if (Math.abs(raw) > 0 && Math.abs(raw) < 1) {
        warnings.push(`ATTRIBUTES: ${label} percent value "${raw}" looked like a decimal; normalized to "${raw * 100}". Use percent points (10 = 10%).`);
        return raw * 100;
      }
      return raw;
    };
    if (materialDeltaType === 'percent' && materialDeltaValue != null) materialDeltaValue = normalizePercentPoints(materialDeltaValue, 'material');
    if (laborDeltaType === 'percent' && laborDeltaValue != null) laborDeltaValue = normalizePercentPoints(laborDeltaValue, 'labor');

    const active = activeCol == null ? 1 : parseBoolean(row[activeCol], true) ? 1 : 0;
    const sortOrder = sortCol == null ? 0 : Math.max(0, Math.floor(parseNumber(row[sortCol], 0)));

    const id = `sheet-attr-${keyFromParts(catalogItemId, attributeType, attributeValue)}`;
    await ex.run(
      `
    INSERT INTO catalog_item_attributes (
      id, catalog_item_id, attribute_type, attribute_value,
      material_delta_type, material_delta_value,
      labor_delta_type, labor_delta_value,
      active, sort_order, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(catalog_item_id, attribute_type, attribute_value)
    DO UPDATE SET
      material_delta_type = excluded.material_delta_type,
      material_delta_value = excluded.material_delta_value,
      labor_delta_type = excluded.labor_delta_type,
      labor_delta_value = excluded.labor_delta_value,
      active = excluded.active,
      sort_order = excluded.sort_order,
      updated_at = excluded.updated_at
  `,
      [
        id,
        catalogItemId,
        attributeType,
        attributeValue,
        materialDeltaType,
        materialDeltaType ? materialDeltaValue : null,
        laborDeltaType,
        laborDeltaType ? laborDeltaValue : null,
        active,
        sortOrder,
        now,
        now,
      ]
    );
    attributesSynced += 1;
  }

  return { attributesSynced };
}

async function readSyncStatusRow(ex: DbExec | undefined): Promise<CatalogSyncStatusDbRow | undefined> {
  if (ex) {
    return ex.get<CatalogSyncStatusDbRow>('SELECT * FROM catalog_sync_status_v1 WHERE id = ?', ['catalog']);
  }
  return dbCatalogGet<CatalogSyncStatusDbRow>('SELECT * FROM catalog_sync_status_v1 WHERE id = ?', ['catalog']);
}

async function updateSyncStatus(
  ex: DbExec | undefined,
  params: {
    status: 'running' | 'success' | 'failed';
    message: string | null;
    /** Omit on failure so snapshot counts stay aligned with last success; inserts into `catalog_sync_runs_v1` still carry per-attempt totals. */
    counts?: SyncCounts;
    warnings?: string[];
    audit?: CatalogSyncRunAuditSummary;
  }
) {
  const now = new Date().toISOString();
  const run = ex ? (sql: string, p: unknown[]) => ex.run(sql, p) : (sql: string, p: unknown[]) => dbCatalogRun(sql, p);
  const current = await readSyncStatusRow(ex);
  const counts = params.counts || {
    itemsSynced: current?.items_synced || 0,
    modifiersSynced: current?.modifiers_synced || 0,
    bundlesSynced: current?.bundles_synced || 0,
    bundleItemsSynced: current?.bundle_items_synced || 0,
    aliasesSynced: current?.aliases_synced || 0,
    attributesSynced: current?.attributes_synced || 0,
  };

  await run(
    `
    UPDATE catalog_sync_status_v1
    SET
      last_attempt_at = ?,
      last_success_at = CASE WHEN ? = 'success' THEN ? ELSE last_success_at END,
      status = ?,
      message = ?,
      items_synced = ?,
      modifiers_synced = ?,
      bundles_synced = ?,
      bundle_items_synced = ?,
      aliases_synced = ?,
      attributes_synced = ?,
      warnings_json = ?
    WHERE id = 'catalog'
  `,
    [
      now,
      params.status,
      now,
      params.status,
      params.message,
      counts.itemsSynced,
      counts.modifiersSynced,
      counts.bundlesSynced,
      counts.bundleItemsSynced,
      counts.aliasesSynced,
      counts.attributesSynced,
      buildCatalogSyncWarningsPayload(params.warnings || [], params.audit),
    ]
  );
}

async function insertSyncRun(
  ex: DbExec | undefined,
  params: {
    status: 'success' | 'failed';
    message: string | null;
    counts: SyncCounts;
    warnings: string[];
    audit?: CatalogSyncRunAuditSummary;
    runContext?: CatalogSyncRunContext | null;
  }
) {
  const run = ex ? (sql: string, p: unknown[]) => ex.run(sql, p) : (sql: string, p: unknown[]) => dbCatalogRun(sql, p);
  const runContextJson = params.runContext != null ? JSON.stringify(params.runContext) : null;
  await run(
    `
    INSERT INTO catalog_sync_runs_v1 (
      id, attempted_at, status, message, items_synced, modifiers_synced, bundles_synced, bundle_items_synced,
      aliases_synced, attributes_synced,
      warnings_json,
      run_context_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    [
      randomUUID(),
      new Date().toISOString(),
      params.status,
      params.message,
      params.counts.itemsSynced,
      params.counts.modifiersSynced,
      params.counts.bundlesSynced,
      params.counts.bundleItemsSynced,
      params.counts.aliasesSynced,
      params.counts.attributesSynced,
      buildCatalogSyncWarningsPayload(params.warnings || [], params.audit),
      runContextJson,
    ]
  );
}

/** Resolve a credential path: cwd, then project root (fixes Sync when the process cwd is not the repo root). */
function resolveGoogleCredentialFilePaths(rawPath: string): string[] {
  const trimmed = rawPath.trim();
  if (!trimmed) return [];
  const out: string[] = [];
  const push = (p: string) => {
    if (p && !out.includes(p)) out.push(p);
  };
  push(trimmed);
  if (!path.isAbsolute(trimmed)) {
    push(path.join(process.cwd(), trimmed));
    push(path.join(PROJECT_ROOT, trimmed.replace(/^\.\//, '')));
  }
  return out;
}

function readServiceAccountFromFile(filePath: string): Record<string, unknown> {
  let text: string;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Could not read Google credential file "${filePath}". ${msg}.`);
  }
  try {
    return parseServiceAccountEnvJson(text, `Credential file ${filePath}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Could not read Google credential file "${filePath}". ${msg} Use a service account JSON (type "service_account", client_email, private_key), not a Gemini API key file.`
    );
  }
}

/** Fix Cloud Run / env mangling: quoted values, BOM, \\n vs newlines, \\r, zero-width chars. */
function normalizePrivateKeyPem(raw: string): string {
  let key = String(raw || '').trim();
  key = key.replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '');
  if (key.charCodeAt(0) === 0xfeff) key = key.slice(1).trim();
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1).trim();
  }
  for (let i = 0; i < 4; i += 1) {
    const next = key.replace(/\\n/g, '\n');
    if (next === key) break;
    key = next;
  }
  key = key.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  return key;
}

/** Remove accidental ```json fences from copy/paste into Secret Manager. */
function stripMarkdownJsonFence(text: string): string {
  let t = text.trim().replace(/^\uFEFF/, '');
  if (!t.startsWith('```')) return t;
  return t
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

/**
 * Secret Manager sometimes stores the JSON as a JSON-encoded string (double quotes escaped).
 * Accept either raw object JSON or one outer string containing the JSON (unwrap up to 4 levels).
 */
function parseServiceAccountEnvJson(raw: string, label: string): Record<string, unknown> {
  let text = stripMarkdownJsonFence(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `${label} is not valid JSON (${msg}). Paste the service account key file exactly (starts with {"type":"service_account"). No markdown, no extra text.`
    );
  }
  for (let depth = 0; depth < 4 && typeof parsed === 'string'; depth += 1) {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      throw new Error(
        `${label} was stored as nested quoted JSON that failed to parse at depth ${depth + 1}. In Secret Manager, paste the raw .json file contents only (one object).`
      );
    }
  }
  if (typeof parsed === 'string') {
    throw new Error(
      `${label} is still a string after unwrapping — too many layers of JSON encoding. Paste the file from IAM once without extra quoting.`
    );
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} must be one JSON object with type, client_email, and private_key.`);
  }
  return parsed as Record<string, unknown>;
}

function assertPrivateKeyLooksLikePem(key: string, sourceLabel: string): void {
  const ok =
    /BEGIN (RSA )?PRIVATE KEY/.test(key) ||
    /BEGIN EC PRIVATE KEY/.test(key);
  if (!ok || key.length < 80) {
    throw new Error(
      `${sourceLabel}: private_key is not a valid PEM (expected "-----BEGIN PRIVATE KEY-----"). ` +
        `Cloud Run often breaks keys: recreate the variable from IAM → Service accounts → Keys → Add key → JSON, ` +
        `or use GOOGLE_SERVICE_ACCOUNT with the full JSON secret. If using GOOGLE_PRIVATE_KEY alone, paste the key with each line separated by the two characters backslash+n, or use a multiline secret; do not wrap the key in extra quotes.`
    );
  }
}

/** Catches corrupted PEM that still matches the BEGIN line regex (common when Secret Manager truncates). */
function assertPrivateKeyParsesWithNode(pem: string, sourceLabel: string): void {
  try {
    createPrivateKey(pem);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `${sourceLabel}: private_key cannot be loaded by Node/OpenSSL (${msg}). The key material is likely truncated or altered in the secret. Fix: IAM → Service accounts → Keys → Add key → JSON, paste the **entire** file into Secret Manager as a new version, redeploy.`
    );
  }
}

const GOOGLE_JWT_SIGNATURE_HINT =
  'Google returned invalid JWT signature: the assertion was signed with a key Google does not accept. ' +
  'Fix: (1) Secret value must be the **complete** service account JSON from IAM for **one** key (not the Gemini/API client file unless it is type service_account). ' +
  '(2) Do not mix GOOGLE_CLIENT_EMAIL from one JSON with GOOGLE_PRIVATE_KEY from another. ' +
  '(3) If the secret is base64, set GOOGLE_SERVICE_ACCOUNT_BASE64 or store raw JSON starting with {. ' +
  '(4) Create a new key in IAM, replace the secret, deploy a new revision.';

function enrichGoogleAuthErrorMessage(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes('invalid_grant') && lower.includes('jwt')) {
    return `${raw}\n\n${GOOGLE_JWT_SIGNATURE_HINT}`;
  }
  return raw;
}

function jwtFromServiceAccountJson(parsed: Record<string, unknown>, sourceLabel: string, scopes: string[]): JWT {
  if (parsed.type !== 'service_account') {
    throw new Error(
      `${sourceLabel}: expected Google Cloud "service_account" JSON (client_email + private_key). Gemini / API-key JSON files will not work for Sheets sync.`
    );
  }
  const email = String(parsed.client_email || '').trim();
  const key = normalizePrivateKeyPem(String(parsed.private_key || ''));
  if (!email || !key) {
    throw new Error(`${sourceLabel}: missing client_email or private_key in service account JSON.`);
  }
  assertPrivateKeyLooksLikePem(key, sourceLabel);
  assertPrivateKeyParsesWithNode(key, sourceLabel);
  return new JWT({
    email,
    key,
    scopes,
  });
}

function decodeServiceAccountBase64(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const json = Buffer.from(trimmed, 'base64').toString('utf8');
    return parseServiceAccountEnvJson(json, 'base64-decoded credentials');
  } catch {
    return null;
  }
}

const DEFAULT_GOOGLE_JWT_SCOPES = ['https://www.googleapis.com/auth/spreadsheets'] as const;

/**
 * Service-account JWT for Google APIs (Sheets, Cloud Natural Language, etc.).
 * Defaults to Sheets scope; pass e.g. `['https://www.googleapis.com/auth/cloud-platform']` for other APIs.
 */
export function buildGoogleServiceAccountJwt(scopes: string[] = [...DEFAULT_GOOGLE_JWT_SCOPES]): JWT {
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT?.trim();
  const serviceAccountBase64 = process.env.GOOGLE_SERVICE_ACCOUNT_BASE64?.trim();

  if (process.env.GOOGLE_SHEETS_AUTH_DEBUG === '1') {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT;
    console.warn('[GOOGLE_SHEETS_AUTH_DEBUG] GOOGLE_SERVICE_ACCOUNT', {
      defined: raw !== undefined,
      length: raw?.length ?? 0,
      firstCharCode: raw && raw.length > 0 ? raw.charCodeAt(0) : null,
      startsWithBrace: raw ? raw.trimStart().startsWith('{') : false,
    });
  }
  const fileFromEnv = process.env.GOOGLE_SERVICE_ACCOUNT_FILE?.trim();
  const fileFromAdc = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  const credentialFileHint = fileFromEnv || fileFromAdc;

  if (serviceAccountJson) {
    const trimmed = serviceAccountJson.trimStart();
    let parsed: Record<string, unknown>;
    if (trimmed.startsWith('{')) {
      parsed = parseServiceAccountEnvJson(serviceAccountJson, 'GOOGLE_SERVICE_ACCOUNT');
    } else {
      const fromB64 = decodeServiceAccountBase64(serviceAccountJson);
      if (!fromB64) {
        throw new Error(
          'GOOGLE_SERVICE_ACCOUNT does not start with "{" and is not valid base64 JSON. Paste the raw service-account .json contents, or use GOOGLE_SERVICE_ACCOUNT_BASE64 for a base64-encoded file.'
        );
      }
      parsed = fromB64;
    }
    return jwtFromServiceAccountJson(parsed, 'GOOGLE_SERVICE_ACCOUNT', scopes);
  }

  if (serviceAccountBase64) {
    const fromB64 = decodeServiceAccountBase64(serviceAccountBase64);
    if (!fromB64) {
      throw new Error(
        'GOOGLE_SERVICE_ACCOUNT_BASE64 is set but is not valid base64 or does not decode to JSON. Encode the entire service-account .json file (UTF-8) as one line of standard base64, with no PEM headers or data: prefix.'
      );
    }
    return jwtFromServiceAccountJson(fromB64, 'GOOGLE_SERVICE_ACCOUNT_BASE64', scopes);
  }

  if (credentialFileHint) {
    const candidates = resolveGoogleCredentialFilePaths(credentialFileHint);
    const found = candidates.find((p) => fs.existsSync(p));
    if (!found) {
      throw new Error(
        `Google credential file not found. Env: ${fileFromEnv ? 'GOOGLE_SERVICE_ACCOUNT_FILE' : 'GOOGLE_APPLICATION_CREDENTIALS'}="${credentialFileHint}". Tried:\n${candidates.map((p) => `  - ${path.resolve(p)}`).join('\n')}\nPlace the service account JSON in the repo root or set an absolute path. Share the spreadsheet with the service account email (Editor or Viewer).`
      );
    }
    const parsed = readServiceAccountFromFile(found);
    return jwtFromServiceAccountJson(parsed, `Credential file ${found}`, scopes);
  }

  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = normalizePrivateKeyPem(process.env.GOOGLE_PRIVATE_KEY || '');

  if (!clientEmail || !privateKey) {
    const diagnostics = [
      `GOOGLE_SERVICE_ACCOUNT=${serviceAccountJson ? 'set' : 'missing'}`,
      `GOOGLE_SERVICE_ACCOUNT_BASE64=${serviceAccountBase64 ? 'set' : 'missing'}`,
      `GOOGLE_SERVICE_ACCOUNT_FILE=${fileFromEnv ? `set (path="${fileFromEnv}")` : 'missing'}`,
      `GOOGLE_APPLICATION_CREDENTIALS=${fileFromAdc ? `set (path="${fileFromAdc}")` : 'missing'}`,
      `GOOGLE_SERVICE_ACCOUNT_EMAIL=${clientEmail ? 'set' : 'missing'}`,
      `GOOGLE_PRIVATE_KEY=${privateKey ? 'set' : 'missing'}`,
    ].join('\n');
    throw new Error(
      `Missing Google Sheets credentials. The server sees none of the supported variables (common on cloud: a local file path in .env does not exist inside the container).\n` +
        `Use one of:\n` +
        `  1) GOOGLE_SERVICE_ACCOUNT — paste full service account JSON (one line is OK)\n` +
        `  2) GOOGLE_SERVICE_ACCOUNT_BASE64 — same JSON file, base64-encoded (single line, no data: prefix)\n` +
        `  3) GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY — from the JSON; use \\n in the key for newlines\n` +
        `  4) GOOGLE_SERVICE_ACCOUNT_FILE or GOOGLE_APPLICATION_CREDENTIALS — absolute path to JSON **inside the running container** (e.g. a mounted secret file)\n` +
        `Current status:\n${diagnostics}`
    );
  }

  assertPrivateKeyLooksLikePem(privateKey, 'GOOGLE_PRIVATE_KEY');
  assertPrivateKeyParsesWithNode(privateKey, 'GOOGLE_PRIVATE_KEY');
  return new JWT({
    email: clientEmail,
    key: privateKey,
    scopes,
  });
}

function buildAuth(): JWT {
  return buildGoogleServiceAccountJwt();
}

function getSpreadsheetConfig(): SpreadsheetConfig {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || process.env.GOOGLE_SHEETS_ID || '1QWCGCssWtAQ8Pjx9_-7LDs4lraRbptURd8D04bNvnEg';
  const { configured: itemsConfigured, fetch: itemsFetch } = resolveConfiguredAndFetchItemsTabs();
  const { configured: modifiersConfigured, fetch: modifiersFetch } = resolveConfiguredAndFetchModifiersTabs();
  const bundlesTab = process.env.GOOGLE_SHEETS_TAB_BUNDLES || 'BUNDLES';
  const aliasesTab = process.env.GOOGLE_SHEETS_TAB_ALIASES || 'ALIASES';
  const attributesTab = process.env.GOOGLE_SHEETS_TAB_ATTRIBUTES || 'ATTRIBUTES';

  if (!spreadsheetId) {
    throw new Error('Missing spreadsheet ID. Set GOOGLE_SHEETS_SPREADSHEET_ID or GOOGLE_SHEETS_ID.');
  }

  assertNotLegacyItemsAliasForOtherRoles('GOOGLE_SHEETS_TAB_MODIFIERS', modifiersConfigured);
  assertNotLegacyItemsAliasForOtherRoles('GOOGLE_SHEETS_TAB_BUNDLES', bundlesTab);
  assertNotLegacyItemsAliasForOtherRoles('GOOGLE_SHEETS_TAB_ALIASES', aliasesTab);
  assertNotLegacyItemsAliasForOtherRoles('GOOGLE_SHEETS_TAB_ATTRIBUTES', attributesTab);

  assertCuratedEnvTabAllowsStaging('GOOGLE_SHEETS_TAB_MODIFIERS', modifiersConfigured);
  assertCuratedEnvTabAllowsStaging('GOOGLE_SHEETS_TAB_BUNDLES', bundlesTab);
  assertCuratedEnvTabAllowsStaging('GOOGLE_SHEETS_TAB_ALIASES', aliasesTab);
  assertCuratedEnvTabAllowsStaging('GOOGLE_SHEETS_TAB_ATTRIBUTES', attributesTab);
  assertCuratedEnvTabAllowsStaging('GOOGLE_SHEETS_TAB_ITEMS', itemsConfigured);

  return {
    spreadsheetId,
    itemsTabConfigured: itemsConfigured,
    itemsTab: itemsFetch,
    modifiersTabConfigured: modifiersConfigured,
    modifiersTab: modifiersFetch,
    bundlesTab,
    aliasesTab,
    attributesTab,
  };
}

function toA1Column(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

async function upsertRowInSheet(params: {
  spreadsheetId: string;
  tabName: string;
  keyAliases: string[];
  keyValue: string;
  setters: Array<{ aliases: string[]; value: string }>;
}): Promise<void> {
  const auth = buildAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: params.spreadsheetId,
    range: `${params.tabName}!A:ZZ`,
  });

  const values = validateSheetRows((response.data.values || []) as string[][], params.tabName);
  const headersRaw = values[0].map((value) => String(value ?? '').trim());
  const headers = headersRaw.map(normalizeHeader);
  const keyCol = columnIndex(headers, params.keyAliases.map(normalizeHeader));
  if (keyCol === null) {
    throw new Error(`${params.tabName} tab is missing key header for ${params.keyAliases.join(', ')}.`);
  }

  const targetRowIndex = values.findIndex((row, index) => {
    if (index === 0) return false;
    return String(row[keyCol] || '').trim().toLowerCase() === params.keyValue.trim().toLowerCase();
  });

  const baseRow = targetRowIndex > 0 ? values[targetRowIndex] : [];
  const output = headersRaw.map((_header, index) => String(baseRow[index] ?? ''));

  const setByAliases = (aliases: string[], value: string) => {
    const idx = columnIndex(headers, aliases.map(normalizeHeader));
    if (idx !== null) output[idx] = value;
  };

  setByAliases(params.keyAliases, params.keyValue);
  params.setters.forEach((setter) => setByAliases(setter.aliases, setter.value));

  if (targetRowIndex > 0) {
    const rowNumber = targetRowIndex + 1;
    const lastCol = toA1Column(Math.max(output.length - 1, 0));
    await sheets.spreadsheets.values.update({
      spreadsheetId: params.spreadsheetId,
      range: `${params.tabName}!A${rowNumber}:${lastCol}${rowNumber}`,
      valueInputOption: 'RAW',
      requestBody: { values: [output] },
    });
    return;
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: params.spreadsheetId,
    range: `${params.tabName}!A:ZZ`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [output] },
  });
}

export async function upsertItemInGoogleSheet(input: {
  sku: string;
  category: string;
  manufacturer?: string | null;
  brand?: string | null;
  model?: string | null;
  modelNumber?: string | null;
  series?: string | null;
  /** Product image URL (https or app path); optional. */
  imageUrl?: string | null;
  /** Short family / grouping label; also written to GenericItemName-style columns when present. */
  family?: string | null;
  subcategory?: string | null;
  /** Search / keyword tags (comma-separated on sheet). */
  tags?: string[] | null;
  description: string;
  unit: string;
  baseMaterialCost: number;
  baseLaborMinutes: number;
  active: boolean;
}): Promise<void> {
  const cfg = getSpreadsheetConfig();
  const key = input.sku || input.description;
  await upsertRowInSheet({
    spreadsheetId: cfg.spreadsheetId,
    tabName: cfg.itemsTab,
    keyAliases: ['SKU', 'Item SKU'],
    keyValue: key,
    setters: [
      { aliases: ['Category', 'Scope Category'], value: input.category || '' },
      { aliases: ['Family', 'Item Family'], value: input.family || '' },
      {
        aliases: ['Generic Item Name', 'GenericItemName', 'Generic Name'],
        value: input.family || '',
      },
      { aliases: ['Subcategory', 'Sub Category'], value: input.subcategory || '' },
      { aliases: ['Manufacturer', 'Mfr', 'Make'], value: input.manufacturer || '' },
      { aliases: ['Brand', 'Brand Line'], value: input.brand || '' },
      { aliases: ['Model', 'Item Model'], value: input.model || '' },
      { aliases: ['Model Number', 'Catalog Model', 'Part Number'], value: input.modelNumber || '' },
      { aliases: ['Series', 'Product Series', 'Collection'], value: input.series || '' },
      {
        aliases: ['Image', 'Image URL', 'Photo', 'Picture', 'Thumbnail', 'Product Image'],
        value: input.imageUrl || '',
      },
      { aliases: ['Description', 'Item Description'], value: input.description || '' },
      { aliases: ['Unit', 'UOM', 'Base Unit'], value: input.unit || 'EA' },
      {
        aliases: [
          'BaseMaterialCost',
          'Base Material Cost',
          'Material Cost',
          'Material Price',
          'Unit Price',
          'Item Price',
        ],
        value: String(input.baseMaterialCost || 0),
      },
      { aliases: ['BaseLaborMinutes', 'Base Labor Minutes', 'Labor Minutes'], value: String(input.baseLaborMinutes || 0) },
      { aliases: ['Image', 'Image URL', 'ImageURL', 'Photo', 'Picture', 'Product Image'], value: input.imageUrl || '' },
      { aliases: ['Active', 'Is Active', 'Enabled'], value: input.active ? 'TRUE' : 'FALSE' },
      { aliases: ['UpdatedAt', 'Updated At'], value: new Date().toISOString() },
      {
        aliases: ['Keywords', 'Tags', 'Search Terms'],
        value: (input.tags && input.tags.length ? input.tags.join(', ') : ''),
      },
    ],
  });
}

export async function backfillTakeoffRegistryToGoogleSheets(): Promise<TakeoffRegistryBackfillResult> {
  const runContextRecord = buildCatalogSyncRunContextRecord('takeoff_registry_backfill');
  const cfg = getSpreadsheetConfig();
  const warnings: string[] = [];

  await updateSyncStatus(undefined, {
    status: 'running',
    message: `Backfilling ${TAKEOFF_CATALOG_SEED_ITEMS.length} takeoff registry items to Google Sheets...`,
  });

  try {
    for (const item of TAKEOFF_CATALOG_SEED_ITEMS) {
      await upsertItemInGoogleSheet({
        sku: item.sku,
        category: item.category,
        manufacturer: item.manufacturer || null,
        model: item.model || null,
        family: item.family || null,
        subcategory: item.subcategory || null,
        tags: item.tags || [],
        imageUrl: item.imageUrl || null,
        description: item.description,
        unit: item.uom,
        baseMaterialCost: item.baseMaterialCost,
        baseLaborMinutes: item.baseLaborMinutes,
        active: item.active,
      });
    }

    const syncedAt = new Date().toISOString();
    const uniqueWarnings = Array.from(new Set(warnings));
    const message = `Takeoff registry backfill complete: ${TAKEOFF_CATALOG_SEED_ITEMS.length} items upserted to ${cfg.itemsTab}.`;
    const counts = {
      itemsSynced: TAKEOFF_CATALOG_SEED_ITEMS.length,
      modifiersSynced: 0,
      bundlesSynced: 0,
      bundleItemsSynced: 0,
      aliasesSynced: 0,
      attributesSynced: 0,
    };

    await updateSyncStatus(undefined, {
      status: 'success',
      message,
      counts,
      warnings: uniqueWarnings,
    });

    await insertSyncRun(undefined, {
      status: 'success',
      message,
      counts,
      warnings: uniqueWarnings,
      runContext: runContextRecord,
    });

    return {
      message,
      spreadsheetId: cfg.spreadsheetId,
      tabName: cfg.itemsTab,
      itemsBackfilled: TAKEOFF_CATALOG_SEED_ITEMS.length,
      warnings: uniqueWarnings,
      syncedAt,
    };
  } catch (error: unknown) {
    const failedCounts = {
      itemsSynced: 0,
      modifiersSynced: 0,
      bundlesSynced: 0,
      bundleItemsSynced: 0,
      aliasesSynced: 0,
      attributesSynced: 0,
    };

    const baseMsg = error instanceof Error ? error.message : String(error);
    const message = enrichGoogleAuthErrorMessage(
      baseMsg || 'Takeoff registry backfill failed.'
    );

    await updateSyncStatus(undefined, {
      status: 'failed',
      message,
      warnings,
    });

    await insertSyncRun(undefined, {
      status: 'failed',
      message,
      counts: failedCounts,
      warnings,
      runContext: runContextRecord,
    });
    console.error('[catalog] Takeoff registry backfill failed.', { message }, error);

    throw new Error(message, error instanceof Error ? { cause: error } : undefined);
  }
}

export async function upsertModifierInGoogleSheet(input: {
  modifierKey: string;
  name: string;
  description?: string | null;
  appliesToCategories: string[];
  addLaborMinutes: number;
  addMaterialCost: number;
  percentLabor: number;
  percentMaterial: number;
  active: boolean;
}): Promise<void> {
  const cfg = getSpreadsheetConfig();
  await upsertRowInSheet({
    spreadsheetId: cfg.spreadsheetId,
    tabName: cfg.modifiersTab,
    keyAliases: ['ModifierKey', 'Modifier Key', 'Key'],
    keyValue: input.modifierKey,
    setters: [
      { aliases: ['Name', 'Modifier Name', 'Modifier'], value: input.name || input.modifierKey },
      {
        aliases: ['Description', 'Notes', 'Help', 'Detail', 'Explanation', 'Modifier Description'],
        value: input.description || '',
      },
      { aliases: ['AppliesToCategories', 'Applies To Categories', 'Categories'], value: (input.appliesToCategories || []).join(', ') },
      { aliases: ['AddLaborMinutes', 'Add Labor Minutes', 'Labor Minutes'], value: String(input.addLaborMinutes || 0) },
      { aliases: ['AddMaterialCost', 'Add Material Cost', 'Material Cost'], value: String(input.addMaterialCost || 0) },
      { aliases: ['PercentLabor', 'Percent Labor', 'Labor Percent'], value: String(input.percentLabor || 0) },
      { aliases: ['PercentMaterial', 'Percent Material', 'Material Percent'], value: String(input.percentMaterial || 0) },
      { aliases: ['Active', 'Is Active', 'Enabled'], value: input.active ? 'TRUE' : 'FALSE' },
      { aliases: ['UpdatedAt', 'Updated At'], value: new Date().toISOString() },
    ],
  });
}

export async function upsertBundleInGoogleSheet(input: {
  bundleId: string;
  bundleName: string;
  category?: string | null;
  includedSkus?: string[];
  includedModifiers?: string[];
  active: boolean;
}): Promise<void> {
  const cfg = getSpreadsheetConfig();
  await upsertRowInSheet({
    spreadsheetId: cfg.spreadsheetId,
    tabName: cfg.bundlesTab,
    keyAliases: ['BundleID', 'Bundle ID', 'ID'],
    keyValue: input.bundleId,
    setters: [
      { aliases: ['BundleName', 'Bundle Name', 'Name'], value: input.bundleName || input.bundleId },
      { aliases: ['Category', 'Scope Category'], value: input.category || '' },
      { aliases: ['IncludedSKUs', 'Included SKUs', 'SKUs', 'Items'], value: (input.includedSkus || []).join(', ') },
      { aliases: ['IncludedModifiers', 'Included Modifiers', 'Modifiers'], value: (input.includedModifiers || []).join(', ') },
      { aliases: ['Active', 'Is Active', 'Enabled'], value: input.active ? 'TRUE' : 'FALSE' },
      { aliases: ['UpdatedAt', 'Updated At'], value: new Date().toISOString() },
    ],
  });
}

function validateSheetRows(values: string[][], tabName: string): string[][] {
  if (!values || values.length === 0) {
    throw new Error(`Sheet tab ${tabName} is empty or missing.`);
  }
  return values
    .map((row) => row.map((cell) => String(cell ?? '').trim()))
    .filter((row) => row.some((cell) => cell.length > 0));
}

/**
 * ITEMS tab: supports “Labor Estimator - Catalog cleaned” and common Excel exports (aliases in upsertItems).
 * Sync defaults to merge mode (see isReplaceCatalogSyncMode).
 * Writes always go to the physical `catalog_items` table (see `getCatalogItemsWriteTableName()`).
 */
export async function upsertItems(
  ex: DbExec,
  rows: string[][],
  warnings: string[],
  replaceMode: boolean,
  ctx: { batchId: string; itemsTab: string }
): Promise<number> {
  const writeTable = getCatalogItemsWriteTableName();
  const skipStaging = String(process.env.CATALOG_SYNC_SKIP_STAGING || '').trim() === '1';
  const headers = rows[0].map(normalizeHeader);
  const skuCol = columnIndex(headers, [
    'sku',
    'item sku',
    'item code',
    'product sku',
    'catalog sku',
    'vendor item',
    'vendor part',
    'vendor sku',
    'mfg item',
    'style number',
  ]);
  const itemKeyCol = columnIndex(headers, ['item id', 'itemid', 'item key', 'search key', 'search key', 'search_key', 'key']);
  const categoryCol = columnIndex(headers, ['scope category', 'category', 'product category', 'commodity']);
  const manufacturerCol = columnIndex(headers, ['manufacturer', 'mfr', 'make']);
  const brandCol = columnIndex(headers, ['brand', 'brand name', 'brand line']);
  const modelCol = columnIndex(headers, ['model', 'item model']);
  const modelNumberCol = columnIndex(headers, [
    'model number',
    'modelnumber',
    'catalog model',
    'mfg model',
    'part number',
    'catalog number',
    'mfg part',
    'mpn',
  ]);
  const seriesCol = columnIndex(headers, ['series', 'product series', 'collection', 'family line']);
  const imageUrlCol = columnIndex(headers, [
    'image',
    'image url',
    'imageurl',
    'photo',
    'picture',
    'thumbnail',
    'product image',
  ]);
  const descriptionCol = columnIndex(headers, [
    'description',
    'item description',
    'long description',
    'product description',
    'desc',
    'details',
    'specification',
    'spec',
  ]);
  const itemCol = columnIndex(headers, [
    'item',
    'item name',
    'itemname',
    'product name',
    'short description',
  ]);
  const uomCol = columnIndex(headers, ['unit', 'uom', 'base unit', 'um', 'measure']);
  // Order matters: avoid bare "material" — it matches "Material Type" etc. before "Material Price".
  const materialCol = columnIndex(headers, [
    'base material cost',
    'material cost',
    'base material',
    'basematerialcost',
    'material price',
    'unit price',
    'item price',
    'list price',
    'sell price',
    'net material',
    'mat cost',
    'price each',
    'each price',
    'material unit cost',
  ]);
  const laborCol = columnIndex(headers, [
    'baselaborminutes',
    'base labor minutes',
    'labor minutes',
    'labor mins',
    'install minutes',
    'install time',
  ]);
  const tagsCol = columnIndex(headers, ['keywords', 'tags', 'search terms', 'aliases']);
  const activeCol = columnIndex(headers, ['active', 'is active', 'isactive', 'enabled']);
  const notesCol = columnIndex(headers, ['notes', 'remarks']);
  const familyCol = columnIndex(headers, ['family', 'genericitemname', 'generic item name', 'item family']);
  const subcategoryCol = columnIndex(headers, ['subcategory', 'sub category']);
  const defaultModifiersCol = columnIndex(headers, [
    'default modifiers',
    'defaultmodifiers',
    'default modifier',
    'catalog modifiers',
  ]);

  if (descriptionCol === null && itemCol === null) {
    throw new Error('ITEMS tab is missing required headers. Expected Item, Name, Description, or similar columns.');
  }

  if (skuCol === null && itemKeyCol === null) warnings.push('ITEMS: neither SKU nor Item Key header found; using fallback key for some rows.');
  if (materialCol === null) {
    warnings.push(
      'ITEMS: no material price column found. Add a header such as Material Cost, Material Price, Unit Price, or Base Material Cost — otherwise prices import as 0.'
    );
  }

  /** Last row wins: duplicate SKUs / Item Keys / hash keys in one ITEMS sheet map to one upsert target. */
  const lastOccurrenceRowIndexByStableKey = new Map<string, number>();
  for (let j = 1; j < rows.length; j += 1) {
    const probe = rows[j];
    if (!probe || probe.length === 0) continue;
    const skuP = getCell(probe, skuCol);
    const itemKeyP = getCell(probe, itemKeyCol);
    const categoryP = getCell(probe, categoryCol);
    const itemNameP = getCell(probe, itemCol);
    const descriptionP = getCell(probe, descriptionCol) || itemNameP;
    if (!descriptionP) continue;
    const stableKeyP = workbookCatalogStableSegment({
      sku: skuP,
      itemKey: itemKeyP,
      category: categoryP,
      itemName: itemNameP,
      description: descriptionP,
    });
    lastOccurrenceRowIndexByStableKey.set(stableKeyP, j);
  }

  let replaceDeactivateDone = false;
  const syncedSheetItemIds: string[] = [];

  let synced = 0;

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    const sku = getCell(row, skuCol);
    const itemKey = getCell(row, itemKeyCol);
    const category = getCell(row, categoryCol);
    const itemName = getCell(row, itemCol);
    const description = getCell(row, descriptionCol) || itemName;

    if (!description) continue;

    const stableKey = workbookCatalogStableSegment({
      sku,
      itemKey,
      category,
      itemName,
      description,
    });

    if (!skipStaging) {
      const importId = `import-${ctx.batchId}-${i}`;
      await ex.run(
        `INSERT INTO catalog_sheet_import_rows (id, sync_batch_id, source_tab, sheet_row_number, raw_cells_json, imported_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [importId, ctx.batchId, ctx.itemsTab, i + 1, JSON.stringify(row), new Date().toISOString()]
      );
    }

    if (lastOccurrenceRowIndexByStableKey.get(stableKey) !== i) continue;

    if (replaceMode && !replaceDeactivateDone) {
      await ex.run(`UPDATE ${writeTable} SET active = 0`, []);
      replaceDeactivateDone = true;
    }

    const active = parseBoolean(getCell(row, activeCol), true);
    const sheetDerivedId = `sheet-item-${stableKey}`;

    let existingRow = sku
      ? await ex.get<{ id: string }>(`SELECT id FROM ${writeTable} WHERE lower(sku) = lower(?) LIMIT 1`, [sku])
      : await ex.get<{ id: string }>(
          `SELECT id FROM ${writeTable} WHERE id = ? OR (lower(description) = lower(?) AND lower(COALESCE(category, '')) = lower(?)) LIMIT 1`,
          [sheetDerivedId, description, category]
        );

    /**
     * If SKU/description lookup misses but `sheetDerivedId` already exists (e.g. SKU changed on sheet,
     * or Cloud DB has leftovers from older sync keys), we must UPDATE — never INSERT duplicate PK.
     * This fixes: UNIQUE constraint failed: catalog_items.id (SQLite PG uses same semantics).
     */
    if (!existingRow) {
      existingRow = await ex.get<{ id: string }>(`SELECT id FROM ${writeTable} WHERE id = ? LIMIT 1`, [sheetDerivedId]);
    }

    const id = existingRow?.id || sheetDerivedId;
    const tagTokens = splitList(getCell(row, tagsCol));
    const defaultModTokens = splitList(getCell(row, defaultModifiersCol));
    const tags = Array.from(new Set([...tagTokens, ...defaultModTokens]));

    const manufacturer = getCell(row, manufacturerCol) || null;
    const brand = getCell(row, brandCol) || null;
    const model = getCell(row, modelCol) || null;
    const modelNumber = getCell(row, modelNumberCol) || model || null;
    const series = getCell(row, seriesCol) || null;
    const imageUrl = getCell(row, imageUrlCol) || null;
    const uomEff = normalizeUnit(getCell(row, uomCol));
    const skuNorm = normalizeSku(sku);
    const mfrKey = manufacturerNormalizedKey(manufacturer);
    const catMain = mapCategoryMain(category);
    const itemType = inferItemType({
      sku: sku || '',
      category: category || '',
      description,
      tags: tagTokens,
    });
    const canonicalSku = sku || null;

    const insertParams: unknown[] = [
      id,
      sku || null,
      category || null,
      getCell(row, subcategoryCol) || null,
      getCell(row, familyCol) || null,
      description,
      manufacturer,
      brand,
      model,
      modelNumber,
      series,
      imageUrl,
      uomEff,
      parseNumber(getCell(row, materialCol), 0),
      parseNumber(getCell(row, laborCol), 0),
      null,
      1,
      0,
      JSON.stringify(tags),
      getCell(row, notesCol) || null,
      active ? 1 : 0,
      canonicalSku,
      1,
      0,
      'google_sheet',
      ctx.itemsTab,
      i + 1,
      ctx.batchId,
      skuNorm || null,
      mfrKey || null,
      catMain,
      itemType,
    ];

    /**
     * Single upsert: covers SKU-matched ids (e.g. c1), sheet-item-* rows, and any PK race where
     * pre-select missed an existing id (fixes UNIQUE constraint failed: catalog_items.id on SQLite/PG).
     */
    await ex.run(
      `
      INSERT INTO ${writeTable} (
        id, sku, category, subcategory, family, description, manufacturer, brand, model, model_number, series, image_url, uom,
        base_material_cost, base_labor_minutes, labor_unit_type, taxable, ada_flag, tags, notes, active,
        canonical_sku, is_canonical, deprecated,
        catalog_source, catalog_source_tab, catalog_source_row, catalog_sync_batch_id,
        sku_normalized, manufacturer_normalized, category_main, item_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        sku = excluded.sku,
        category = excluded.category,
        subcategory = excluded.subcategory,
        family = excluded.family,
        description = excluded.description,
        uom = excluded.uom,
        manufacturer = excluded.manufacturer,
        brand = excluded.brand,
        model = excluded.model,
        model_number = excluded.model_number,
        series = excluded.series,
        image_url = excluded.image_url,
        base_material_cost = excluded.base_material_cost,
        base_labor_minutes = excluded.base_labor_minutes,
        tags = excluded.tags,
        notes = excluded.notes,
        active = excluded.active,
        canonical_sku = COALESCE(excluded.canonical_sku, ${writeTable}.canonical_sku),
        catalog_source = excluded.catalog_source,
        catalog_source_tab = excluded.catalog_source_tab,
        catalog_source_row = excluded.catalog_source_row,
        catalog_sync_batch_id = excluded.catalog_sync_batch_id,
        sku_normalized = excluded.sku_normalized,
        manufacturer_normalized = excluded.manufacturer_normalized,
        category_main = excluded.category_main,
        item_type = excluded.item_type
    `,
      insertParams
    );

    syncedSheetItemIds.push(id);
    synced += 1;
  }

  if (!replaceMode) {
    const uniq = Array.from(new Set(syncedSheetItemIds));
    if (uniq.length > 0) {
      const placeholders = uniq.map(() => '?').join(',');
      await ex.run(`UPDATE ${writeTable} SET active = 0 WHERE id LIKE 'sheet-item-%' AND id NOT IN (${placeholders})`, uniq);
    }
  }

  return synced;
}

export async function upsertModifiers(ex: DbExec, rows: string[][], warnings: string[], replaceMode: boolean): Promise<number> {
  const headers = rows[0].map(normalizeHeader);
  const keyCol = columnIndex(headers, ['modifier key', 'modifierkey', 'key', 'modifier']);
  const nameCol = columnIndex(headers, ['name', 'modifier name', 'modifiername', 'title', 'label']);
  const descCol = columnIndex(headers, [
    'description',
    'notes',
    'help',
    'detail',
    'explanation',
    'what it means',
    'modifier description',
  ]);
  const appliesCol = columnIndex(headers, ['applies to categories', 'appliestocategories', 'categories', 'scope category']);
  const addLaborCol = columnIndex(headers, ['add labor minutes', 'addlaborminutes', 'labor minutes', 'laborminutes', 'labor adjustment']);
  const addMaterialCol = columnIndex(headers, ['add material cost', 'addmaterialcost', 'material cost', 'materialcost', 'material adjustment']);
  const percentLaborCol = columnIndex(headers, ['percent labor', 'percentlabor', 'labor percent']);
  const percentMaterialCol = columnIndex(headers, ['percent material', 'percentmaterial', 'material percent']);
  const activeCol = columnIndex(headers, ['active', 'is active', 'isactive', 'enabled']);

  if (nameCol === null && keyCol === null) {
    throw new Error('MODIFIERS tab is missing required headers. Expected Name, Modifier, or Modifier Key.');
  }

  let replaceDeactivateDone = false;
  const syncedSheetModifierIds: string[] = [];

  let synced = 0;

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    const name = getCell(row, nameCol) || getCell(row, keyCol);
    if (!name) continue;

    if (replaceMode && !replaceDeactivateDone) {
      await ex.run('UPDATE modifiers_v1 SET active = 0', []);
      replaceDeactivateDone = true;
    }

    const modifierKey = (getCell(row, keyCol) || keyFromParts(name)).toUpperCase().replace(/\s+/g, '_');
    const existing = await ex.get<{ id: string }>('SELECT id FROM modifiers_v1 WHERE modifier_key = ? LIMIT 1', [modifierKey]);
    const id = existing?.id || `sheet-mod-${keyFromParts(modifierKey)}`;

    const applies = splitList(getCell(row, appliesCol));
    if (!applies.length) warnings.push(`MODIFIERS: ${name} has no applies-to categories.`);

    const description = descCol !== null ? getCell(row, descCol) || '' : '';

    if (existing) {
      await ex.run(
        `
        UPDATE modifiers_v1
        SET name = ?, description = ?, applies_to_categories = ?, add_labor_minutes = ?, add_material_cost = ?,
            percent_labor = ?, percent_material = ?, active = ?, updated_at = ?
        WHERE id = ?
      `,
        [
          name,
          description,
          JSON.stringify(applies),
          parseNumber(getCell(row, addLaborCol), 0),
          parseNumber(getCell(row, addMaterialCol), 0),
          parseNumber(getCell(row, percentLaborCol), 0),
          parseNumber(getCell(row, percentMaterialCol), 0),
          parseBoolean(getCell(row, activeCol), true) ? 1 : 0,
          new Date().toISOString(),
          id,
        ]
      );
    } else {
      await ex.run(
        `
        INSERT INTO modifiers_v1 (
          id, name, modifier_key, description, applies_to_categories, add_labor_minutes, add_material_cost,
          percent_labor, percent_material, active, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          id,
          name,
          modifierKey,
          description,
          JSON.stringify(applies),
          parseNumber(getCell(row, addLaborCol), 0),
          parseNumber(getCell(row, addMaterialCol), 0),
          parseNumber(getCell(row, percentLaborCol), 0),
          parseNumber(getCell(row, percentMaterialCol), 0),
          parseBoolean(getCell(row, activeCol), true) ? 1 : 0,
          new Date().toISOString(),
        ]
      );
    }

    syncedSheetModifierIds.push(id);
    synced += 1;
  }

  if (!replaceMode) {
    const uniq = Array.from(new Set(syncedSheetModifierIds));
    if (uniq.length > 0) {
      const placeholders = uniq.map(() => '?').join(',');
      await ex.run(`UPDATE modifiers_v1 SET active = 0 WHERE id LIKE 'sheet-mod-%' AND id NOT IN (${placeholders})`, uniq);
    }
  }

  return synced;
}

export async function upsertBundles(
  ex: DbExec,
  writeTable: string,
  rows: string[][],
  warnings: string[],
  replaceMode: boolean
): Promise<{ bundlesSynced: number; bundleItemsSynced: number }> {
  const headers = rows[0].map(normalizeHeader);
  const idCol = columnIndex(headers, ['bundle id', 'id']);
  const nameCol = columnIndex(headers, ['bundle name', 'name']);
  const categoryCol = columnIndex(headers, ['category', 'scope category']);
  const skuListCol = columnIndex(headers, ['included skus', 'included sku', 'skus', 'items', 'included items']);
  const modifierListCol = columnIndex(headers, ['included modifiers', 'modifiers']);
  const activeCol = columnIndex(headers, ['active', 'is active', 'enabled']);

  if (nameCol === null) {
    throw new Error('BUNDLES tab is missing required Bundle Name header.');
  }

  let replaceDeactivateDone = false;
  const syncedSheetBundleIds: string[] = [];

  const catalogSkuRows = await ex.all<{
    id: string;
    sku: string;
    description: string;
    base_material_cost: number;
    base_labor_minutes: number;
  }>(
    `
    SELECT id, sku, description, base_material_cost, base_labor_minutes
    FROM ${writeTable}
    WHERE sku IS NOT NULL AND trim(sku) <> ''
  `,
    []
  );

  const catalogBySku = new Map<string, {
    id: string;
    sku: string;
    description: string;
    baseMaterialCost: number;
    baseLaborMinutes: number;
  }>();

  catalogSkuRows.forEach((row) => {
    const normalized = normalizeSkuToken(row.sku);
    if (!normalized || catalogBySku.has(normalized)) return;
    catalogBySku.set(normalized, {
      id: row.id,
      sku: row.sku,
      description: row.description,
      baseMaterialCost: Number(row.base_material_cost || 0),
      baseLaborMinutes: Number(row.base_labor_minutes || 0),
    });
  });

  const modifierRows = await ex.all<{ modifier_key: string }>(
    `SELECT modifier_key FROM ${getCatalogModifiersReadTableName()}`,
    []
  );
  const modifierByCanonicalKey = new Map<string, string>();
  modifierRows.forEach((row) => {
    const key = normalizeModifierToken(row.modifier_key);
    const canonical = canonicalKey(key);
    if (!canonical || modifierByCanonicalKey.has(canonical)) return;
    modifierByCanonicalKey.set(canonical, key);
  });

  let bundlesSynced = 0;
  let bundleItemsSynced = 0;

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    const bundleName = getCell(row, nameCol);
    if (!bundleName) continue;

    const bundleId = getCell(row, idCol) || `sheet-bundle-${keyFromParts(bundleName)}`;
    const existing = await ex.get<{ id: string }>('SELECT id FROM bundles_v1 WHERE id = ? LIMIT 1', [bundleId]);
    const active = parseBoolean(getCell(row, activeCol), true) ? 1 : 0;

    if (existing) {
      await ex.run('UPDATE bundles_v1 SET bundle_name = ?, category = ?, active = ?, updated_at = ? WHERE id = ?', [
        bundleName,
        getCell(row, categoryCol) || null,
        active,
        new Date().toISOString(),
        bundleId,
      ]);
    } else {
      await ex.run('INSERT INTO bundles_v1 (id, bundle_name, category, active, updated_at) VALUES (?, ?, ?, ?, ?)', [
        bundleId,
        bundleName,
        getCell(row, categoryCol) || null,
        active,
        new Date().toISOString(),
      ]);
    }

    await ex.run('DELETE FROM bundle_items_v1 WHERE bundle_id = ?', [bundleId]);

    const includedSkus = Array.from(
      new Set(splitList(getCell(row, skuListCol)).map((token) => token.trim()).filter(Boolean))
    );

    const normalizedModifiers = splitList(getCell(row, modifierListCol)).map((token) => token.trim()).filter(Boolean);
    const validModifierKeys: string[] = [];

    normalizedModifiers.forEach((modifierToken) => {
      const canonical = canonicalKey(modifierToken);
      const matchedKey = canonical ? modifierByCanonicalKey.get(canonical) : null;
      if (!matchedKey) {
        warnings.push(`BUNDLES row ${i + 1} (${bundleName}): unknown modifier key "${modifierToken}".`);
        return;
      }
      validModifierKeys.push(matchedKey);
    });

    for (let index = 0; index < includedSkus.length; index += 1) {
      const skuToken = includedSkus[index];
      const normalizedSku = normalizeSkuToken(skuToken);
      const catalog = normalizedSku ? catalogBySku.get(normalizedSku) : null;
      if (!catalog) {
        warnings.push(`BUNDLES row ${i + 1} (${bundleName}): unknown SKU "${skuToken}".`);
        continue;
      }

      const notes = validModifierKeys.length ? `Included Modifiers: ${validModifierKeys.join(', ')}` : null;
      await ex.run(
        `
        INSERT INTO bundle_items_v1 (
          id, bundle_id, catalog_item_id, sku, description, qty, material_cost, labor_minutes, labor_cost, sort_order, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          `${bundleId}-item-${index + 1}`,
          bundleId,
          catalog.id,
          catalog.sku,
          catalog.description || skuToken,
          1,
          catalog.baseMaterialCost,
          catalog.baseLaborMinutes,
          unitLaborCostFromMinutes(catalog.baseLaborMinutes),
          index,
          notes,
        ]
      );
      bundleItemsSynced += 1;
    }

    if (!includedSkus.length) {
      warnings.push(`BUNDLES row ${i + 1} (${bundleName}): no included SKUs provided.`);
    }

    syncedSheetBundleIds.push(bundleId);
    bundlesSynced += 1;
  }

  if (!replaceMode) {
    const uniq = Array.from(new Set(syncedSheetBundleIds));
    if (uniq.length > 0) {
      const placeholders = uniq.map(() => '?').join(',');
      await ex.run(`UPDATE bundles_v1 SET active = 0 WHERE id LIKE 'sheet-bundle-%' AND id NOT IN (${placeholders})`, uniq);
    }
  }

  return { bundlesSynced, bundleItemsSynced };
}

export async function syncCatalogFromGoogleSheets(): Promise<CatalogSyncResult> {
  /** Captured early so inserts on failure paths still describe the env that was in effect. */
  const runContextRecord = buildCatalogSyncRunContextRecord('catalog_full_sync');
  const cfg = getSpreadsheetConfig();
  const writeTable = getCatalogItemsWriteTableName();

  const warnings: string[] = [];
  let lastPassedPreflightAudit: CatalogSyncRunAuditSummary | undefined;
  let catalogSyncFailureAlreadyRecorded = false;
  await updateSyncStatus(undefined, { status: 'running', message: 'Catalog sync in progress...' });

  try {
    const auth = buildAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    for (const t of ['RECOMMENDED_ITEMS', 'LEGACY_ITEMS', 'RESEARCH_QUEUE', 'CATEGORY_PLAN', 'META', 'SYNC_README', 'DEFAULT_ITEMS']) {
      console.info(`[catalog-sync] skipped tab ${t} (staging)`);
    }
    if (
      normalizeSheetTabKey(cfg.itemsTabConfigured) === 'ITEMS' &&
      normalizeSheetTabKey(cfg.itemsTab) !== 'ITEMS'
    ) {
      console.info(
        `[catalog-sync] skipped tab ITEMS (staging for item upserts — using ${cfg.itemsTab} instead; set CATALOG_SYNC_ALLOW_LEGACY_ITEMS_TAB=1 to ingest legacy ITEMS).`
      );
    }
    if (
      normalizeSheetTabKey(cfg.modifiersTabConfigured) === 'MODIFIERS' &&
      normalizeSheetTabKey(cfg.modifiersTab) !== 'MODIFIERS'
    ) {
      console.info(
        `[catalog-sync] skipped tab MODIFIERS (read ${cfg.modifiersTab} instead; set CATALOG_SYNC_ALLOW_LEGACY_MODIFIERS_TAB=1 to ingest legacy MODIFIERS).`
      );
    }

    const [itemRows, modifierRows, bundleRows, aliasRows, attributeRows] = await Promise.all([
      fetchTabOrNull({ sheets, spreadsheetId: cfg.spreadsheetId, tabName: cfg.itemsTab }),
      fetchTabOrNull({ sheets, spreadsheetId: cfg.spreadsheetId, tabName: cfg.modifiersTab }),
      fetchTabOrNull({ sheets, spreadsheetId: cfg.spreadsheetId, tabName: cfg.bundlesTab }),
      fetchTabOrNull({ sheets, spreadsheetId: cfg.spreadsheetId, tabName: cfg.aliasesTab }),
      fetchTabOrNull({ sheets, spreadsheetId: cfg.spreadsheetId, tabName: cfg.attributesTab }),
    ]);

    if (!itemRows) throw new Error(`Missing required tab "${cfg.itemsTab}".`);
    if (!modifierRows) throw new Error(`Missing required tab "${cfg.modifiersTab}".`);
    if (!bundleRows) throw new Error(`Missing required tab "${cfg.bundlesTab}".`);

    const sourceLower = String(process.env.CATALOG_SYNC_ITEMS_SOURCE || '').trim().toLowerCase();
    if (
      (sourceLower === 'clean' || sourceLower === 'clean_only') &&
      normalizeSheetTabKey(cfg.itemsTabConfigured) === 'ITEMS'
    ) {
      warnings.push(
        'CATALOG_SYNC_ITEMS_SOURCE marks the clean workbook as authoritative; item upserts use GOOGLE_SHEETS_TAB_CLEAN_ITEMS while GOOGLE_SHEETS_TAB_ITEMS still names ITEMS.'
      );
    }

    if (cfg.itemsTabConfigured !== cfg.itemsTab) {
      warnings.push(
        `Item rows are read from "${cfg.itemsTab}" because GOOGLE_SHEETS_TAB_ITEMS names legacy tab "${cfg.itemsTabConfigured}" and CATALOG_SYNC_ALLOW_LEGACY_ITEMS_TAB is unset — set it to 1 only if you must ingest the raw ITEMS tab.`
      );
    } else if (cfg.itemsTab.trim().toUpperCase() === 'ITEMS' && isEnvTruthy(process.env.CATALOG_SYNC_ALLOW_LEGACY_ITEMS_TAB)) {
      warnings.push(
        'Using legacy ITEMS tab for item upserts (CATALOG_SYNC_ALLOW_LEGACY_ITEMS_TAB=1). Prefer pointing GOOGLE_SHEETS_TAB_ITEMS at CLEAN_ITEMS for production.'
      );
    }

    if (cfg.modifiersTabConfigured !== cfg.modifiersTab) {
      warnings.push(
        `Modifier rows are read from "${cfg.modifiersTab}" because GOOGLE_SHEETS_TAB_MODIFIERS names legacy tab "${cfg.modifiersTabConfigured}" and CATALOG_SYNC_ALLOW_LEGACY_MODIFIERS_TAB is unset — set it to 1 only if you must ingest the raw MODIFIERS tab.`
      );
    } else if (cfg.modifiersTab.trim().toUpperCase() === 'MODIFIERS' && isEnvTruthy(process.env.CATALOG_SYNC_ALLOW_LEGACY_MODIFIERS_TAB)) {
      warnings.push(
        'Using legacy MODIFIERS tab for modifier upserts (CATALOG_SYNC_ALLOW_LEGACY_MODIFIERS_TAB=1). Prefer pointing GOOGLE_SHEETS_TAB_MODIFIERS at CLEAN_MODIFIERS for production.'
      );
    }

    const replaceMode = isReplaceCatalogSyncMode();

    if (!aliasRows) warnings.push(`ALIASES tab "${cfg.aliasesTab}" not found; skipping alias sync.`);
    if (!attributeRows) warnings.push(`ATTRIBUTES tab "${cfg.attributesTab}" not found; skipping attributes sync.`);

    const preflight = await preflightCatalogWorkbookSync({
      itemRows,
      modifierRows,
      bundleRows,
      aliasRows,
      attributeRows,
    });
    if (preflight.blocking.length) {
      warnings.push(...preflight.warnings);
      const uniquePreflightWarn = Array.from(new Set(warnings));
      const preflightBlockedMessage =
        enrichGoogleAuthErrorMessage(`Catalog sync blocked (preflight validation):\n${preflight.blocking.join('\n')}`);
      await updateSyncStatus(undefined, {
        status: 'failed',
        message: preflightBlockedMessage,
        warnings: uniquePreflightWarn,
        audit: preflight.audit,
      });
      await insertSyncRun(undefined, {
        status: 'failed',
        message: preflightBlockedMessage,
        counts: {
          itemsSynced: 0,
          modifiersSynced: 0,
          bundlesSynced: 0,
          bundleItemsSynced: 0,
          aliasesSynced: 0,
          attributesSynced: 0,
        },
        warnings: uniquePreflightWarn,
        audit: preflight.audit,
        runContext: runContextRecord,
      });
      catalogSyncFailureAlreadyRecorded = true;
      throw new Error(preflightBlockedMessage);
    }
    lastPassedPreflightAudit = preflight.audit;
    warnings.push(...preflight.warnings);

    const batchId = randomUUID();
    const counts = await withCatalogSyncWriteTransaction(async (ex) => {
      const itemsSynced = await upsertItems(ex, itemRows, warnings, replaceMode, {
        batchId,
        itemsTab: cfg.itemsTab,
      });
      const modifiersSynced = await upsertModifiers(ex, modifierRows, warnings, replaceMode);
      const bundleData = await upsertBundles(ex, writeTable, bundleRows, warnings, replaceMode);
      const aliasData = aliasRows
        ? await upsertAliases(ex, writeTable, aliasRows, warnings)
        : { aliasesSynced: 0 };
      const attributeData = attributeRows
        ? await upsertAttributes(ex, writeTable, attributeRows, warnings)
        : { attributesSynced: 0 };

      return {
        itemsSynced,
        modifiersSynced,
        bundlesSynced: bundleData.bundlesSynced,
        bundleItemsSynced: bundleData.bundleItemsSynced,
        aliasesSynced: aliasData.aliasesSynced,
        attributesSynced: attributeData.attributesSynced,
      };
    });
    const uniqueWarnings = Array.from(new Set(warnings));
    const syncedAt = new Date().toISOString();
    const message =
      `Catalog sync complete: ${counts.itemsSynced} items, ${counts.modifiersSynced} modifiers, ${counts.bundlesSynced} bundles, ` +
      `${counts.aliasesSynced} aliases, ${counts.attributesSynced} attributes.`;

    const audit: CatalogSyncRunAuditSummary = {
      ...preflight.audit,
      syncCounts: { ...counts },
    };

    await updateSyncStatus(undefined, {
      status: 'success',
      message,
      counts,
      warnings: uniqueWarnings,
      audit,
    });

    await insertSyncRun(undefined, {
      status: 'success',
      message,
      counts,
      warnings: uniqueWarnings,
      audit,
      runContext: runContextRecord,
    });

    return {
      ...counts,
      message,
      spreadsheetId: cfg.spreadsheetId,
      tabs: {
        items: cfg.itemsTab,
        modifiers: cfg.modifiersTab,
        bundles: cfg.bundlesTab,
        aliases: cfg.aliasesTab,
        attributes: cfg.attributesTab,
      },
      itemsTabConfigured: cfg.itemsTabConfigured !== cfg.itemsTab ? cfg.itemsTabConfigured : undefined,
      modifiersTabConfigured: cfg.modifiersTabConfigured !== cfg.modifiersTab ? cfg.modifiersTabConfigured : undefined,
      warnings: uniqueWarnings,
      audit,
      syncedAt,
    };
  } catch (error: unknown) {
    const failedCounts = {
      itemsSynced: 0,
      modifiersSynced: 0,
      bundlesSynced: 0,
      bundleItemsSynced: 0,
      aliasesSynced: 0,
      attributesSynced: 0,
    };

    const baseMsg = error instanceof Error ? error.message : String(error);
    const message = enrichGoogleAuthErrorMessage(baseMsg);

    // Do not pass `counts`: failed attempts apply 0 rows (transaction rolled back), but the status
    // row is the operator snapshot — zeroing counters made the UI imply "no catalog in DB" while
    // `catalog_sync_runs_v1` still records this attempt with zeros.
    if (!catalogSyncFailureAlreadyRecorded) {
      await updateSyncStatus(undefined, {
        status: 'failed',
        message,
        warnings,
        audit: lastPassedPreflightAudit,
      });

      await insertSyncRun(undefined, {
        status: 'failed',
        message,
        counts: failedCounts,
        warnings,
        audit: lastPassedPreflightAudit,
        runContext: runContextRecord,
      });
    }
    console.error('[catalog-sync] Failed (no DB writes from this attempt).', { message }, error);

    const wrapped = new Error(message, error instanceof Error ? { cause: error } : undefined);
    throw wrapped;
  }
}
