import { isPgDriver } from '../db/driver.ts';
import { getCatalogItemsTableName } from '../db/catalogTable.ts';

export type CatalogSourcePayload = {
  dbDriver: 'sqlite' | 'pg';
  catalogItemsTable: ReturnType<typeof getCatalogItemsTableName>;
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

  const dbDriver: CatalogSourcePayload['dbDriver'] = isPgDriver() ? 'pg' : 'sqlite';
  const catalogItemsTable = getCatalogItemsTableName();

  const spreadsheetId = String(process.env.GOOGLE_SHEETS_SPREADSHEET_ID || process.env.GOOGLE_SHEETS_ID || '').trim();
  const spreadsheetIdConfigured = Boolean(spreadsheetId);

  const sheetsItemsTab = process.env.GOOGLE_SHEETS_TAB_ITEMS || 'CLEAN_ITEMS';
  const sheetsModifiersTab = process.env.GOOGLE_SHEETS_TAB_MODIFIERS || 'MODIFIERS';
  const sheetsBundlesTab = process.env.GOOGLE_SHEETS_TAB_BUNDLES || 'BUNDLES';
  const sheetsAliasesTab = process.env.GOOGLE_SHEETS_TAB_ALIASES || 'ALIASES';
  const sheetsAttributesTab = process.env.GOOGLE_SHEETS_TAB_ATTRIBUTES || 'ATTRIBUTES';

  if (!spreadsheetIdConfigured) {
    notes.push('Google Sheets spreadsheet id is not configured (GOOGLE_SHEETS_SPREADSHEET_ID / GOOGLE_SHEETS_ID). Catalog sync will fail until set.');
  }

  if (catalogItemsTable === 'catalog_items_clean') {
    notes.push(
      'Reads use CATALOG_ITEMS_TABLE=catalog_items_clean. In Supabase this is typically provided as a VIEW over catalog_items so CLEAN_ITEMS sync and estimator reads stay aligned.'
    );
  }

  return {
    dbDriver,
    catalogItemsTable,
    sheetsItemsTab,
    sheetsModifiersTab,
    sheetsBundlesTab,
    sheetsAliasesTab,
    sheetsAttributesTab,
    spreadsheetIdConfigured,
    notes,
  };
}
