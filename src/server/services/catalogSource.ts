import { isPgCatalogBackend } from '../db/catalogBackend.ts';
import { getCatalogItemsTableName, getCatalogSourceMode, type CatalogSourceMode } from '../db/catalogTable.ts';
import {
  resolveConfiguredAndFetchItemsTabs,
  resolveConfiguredAndFetchModifiersTabs,
  buildCatalogSyncRunContextRecord,
} from './googleSheetsCatalogSync.ts';
import type {
  CatalogSyncWorkbookSnapshot,
  CatalogSyncServerConfigNow,
} from '../../shared/types/catalogSyncAudit.ts';
import { toCatalogSyncWorkbookSnapshotFromRunContext } from '../../shared/types/catalogSyncAudit.ts';

export type CatalogSourcePayload = {
  dbDriver: 'sqlite' | 'pg';
  catalogItemsTable: ReturnType<typeof getCatalogItemsTableName>;
  catalogSource: CatalogSourceMode;
  sheetsItemsTab: string;
  sheetsModifiersTab: string;
  sheetsBundlesTab: string;
  sheetsAliasesTab: string;
  sheetsAttributesTab: string;
  spreadsheetIdConfigured: boolean;
  notes: string[];
};

/**
 * Single source of truth for “what catalog surface is this deployment actually using?”
 * (sheet tabs vs relational table selection vs DB backend).
 */
export function buildCatalogSourcePayload(): CatalogSourcePayload {
  const notes: string[] = [];

  const dbDriver: CatalogSourcePayload['dbDriver'] = isPgCatalogBackend() ? 'pg' : 'sqlite';
  const catalogItemsTable = getCatalogItemsTableName();
  const catalogSource = getCatalogSourceMode();

  const spreadsheetId = String(process.env.GOOGLE_SHEETS_SPREADSHEET_ID || process.env.GOOGLE_SHEETS_ID || '').trim();
  const spreadsheetIdConfigured = Boolean(spreadsheetId);

  const { configured: sheetsItemsTab, fetch: sheetsItemsFetchTab } = resolveConfiguredAndFetchItemsTabs();
  const { configured: sheetsModifiersTab, fetch: sheetsModifiersFetchTab } = resolveConfiguredAndFetchModifiersTabs();
  const sheetsBundlesTab = process.env.GOOGLE_SHEETS_TAB_BUNDLES || 'BUNDLES';
  const sheetsAliasesTab = process.env.GOOGLE_SHEETS_TAB_ALIASES || 'ALIASES';
  const sheetsAttributesTab = process.env.GOOGLE_SHEETS_TAB_ATTRIBUTES || 'ATTRIBUTES';

  if (!spreadsheetIdConfigured) {
    notes.push('Google Sheets spreadsheet id is not configured (GOOGLE_SHEETS_SPREADSHEET_ID / GOOGLE_SHEETS_ID). Catalog sync will fail until set.');
  }

  if (sheetsItemsTab !== sheetsItemsFetchTab) {
    notes.push(
      `Google Sheets item upserts read tab "${sheetsItemsFetchTab}" while GOOGLE_SHEETS_TAB_ITEMS="${sheetsItemsTab}" (workbook-first guard; set CATALOG_SYNC_ALLOW_LEGACY_ITEMS_TAB=1 to ingest ITEMS).`
    );
  }

  if (sheetsModifiersTab !== sheetsModifiersFetchTab) {
    notes.push(
      `Google Sheets modifier upserts read tab "${sheetsModifiersFetchTab}" while GOOGLE_SHEETS_TAB_MODIFIERS="${sheetsModifiersTab}" (workbook-first guard; set CATALOG_SYNC_ALLOW_LEGACY_MODIFIERS_TAB=1 to ingest MODIFIERS).`
    );
  }

  if (catalogItemsTable === 'catalog_items_clean') {
    notes.push(
      'Reads use CATALOG_ITEMS_TABLE=catalog_items_clean. In Supabase this is typically provided as a VIEW over catalog_items so CLEAN_ITEMS sync and estimator reads stay aligned.'
    );
  }

  return {
    dbDriver,
    catalogItemsTable,
    catalogSource,
    sheetsItemsTab,
    sheetsModifiersTab: sheetsModifiersFetchTab,
    sheetsBundlesTab,
    sheetsAliasesTab,
    sheetsAttributesTab,
    spreadsheetIdConfigured,
    notes,
  };
}

/** Live env snapshot excluding run identity (`runKind`/`recordedAtIso`/`schemaVersion`); used by settings API UI. */
export function buildCatalogSyncServerConfigNow(): CatalogSyncServerConfigNow {
  const ctx = buildCatalogSyncRunContextRecord('catalog_full_sync');
  const { schemaVersion: _schemaVersion, runKind: _runKind, recordedAtIso: _recordedAtIso, ...rest } = ctx;
  return rest;
}

/** Snapshot of spreadsheet id + resolved tab names (for sync review API). */
export function buildCatalogSyncWorkbookSnapshot(): CatalogSyncWorkbookSnapshot {
  return toCatalogSyncWorkbookSnapshotFromRunContext(buildCatalogSyncServerConfigNow());
}