import {
  getBundlesReadTableNames,
  getCatalogItemAliasesReadLayout,
  getCatalogItemAliasesReadTableName,
  getCatalogItemAliasesWriteTableName,
  getCatalogItemsTableName,
  getCatalogModifiersReadTableName,
} from '../db/catalogTable.ts';
import { getTakeoffLinesTableName } from '../db/workspaceTable.ts';
import { isCatalogSheetsWorkbookPushEnabled } from './catalogSheetsSyncPolicy.ts';
import { isPgDriver } from '../db/driver.ts';
import { isSheetsDataBackend } from '../repos/dataBackend.ts';
import { peekResolvedCatalogItemsSheetTab } from '../repos/sheetsCatalogRepo.ts';

/**
 * Non-secret integration readiness flags for Settings / diagnostics.
 * Never include API keys or tokens in responses.
 */
export type IntegrationHealthSnapshot = {
  dbDriver: string;
  gemini: boolean;
  googleSheets: boolean;
  /** When true, POST /sync-catalog may pull a workbook into Postgres (`CATALOG_SHEETS_SYNC_ENABLED`). */
  catalogSheetsSyncEnabled: boolean;
  supabaseAnon: boolean;
  supabaseServiceRole: boolean;
  pdfProvider: string;
  googleDocumentAi: boolean;
  passwordLogin: boolean;
  authRequired: boolean;
  div10BrainAdmin: boolean;
  /** Resolved Postgres workspace / catalog relation names (empty when not `DB_DRIVER=pg`). */
  workspaceTakeoffLinesTable: string;
  catalogAliasesReadTable: string;
  catalogAliasesWriteTable: string;
  /** `sheet` = `alias_value` on `catalog_item_aliases`; `brain` = `alias_text` on `catalog_aliases`. */
  catalogAliasesLayout: 'sheet' | 'brain';
  catalogBundlesReadTable: string;
  catalogBundleItemsReadTable: string;
  /** Resolved items read relation (Postgres only); helps verify `CATALOG_ITEMS_TABLE` / migrations. */
  catalogItemsReadTable: string;
  /** Resolved modifiers read relation (Postgres only). */
  catalogModifiersReadTable: string;
  /** When `DATA_BACKEND=sheets`, catalog items are read from the labor workbook tab. */
  catalogDataSource: 'sheets' | 'postgres' | 'sqlite';
};

export function getIntegrationHealthSnapshot(): IntegrationHealthSnapshot {
  const sheets =
    Boolean(String(process.env.GOOGLE_SERVICE_ACCOUNT || '').trim()) ||
    Boolean(String(process.env.GOOGLE_SERVICE_ACCOUNT_FILE || '').trim()) ||
    Boolean(String(process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim()) ||
    (Boolean(String(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_CLIENT_EMAIL || '').trim()) &&
      Boolean(String(process.env.GOOGLE_PRIVATE_KEY || process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').trim()));
  const pg = isPgDriver();
  const sheetsBackend = isSheetsDataBackend();
  const bundleReads = pg ? getBundlesReadTableNames() : { bundlesTable: '', bundleItemsTable: '' };
  const catalogItemsReadTable = sheetsBackend
    ? `GOOGLE_SHEETS:${peekResolvedCatalogItemsSheetTab()}`
    : pg
      ? getCatalogItemsTableName()
      : '';
  return {
    dbDriver: String(process.env.DB_DRIVER || 'sqlite').trim() || 'sqlite',
    gemini: Boolean(
      String(process.env.GEMINI_API_KEY || '').trim() || String(process.env.GOOGLE_GEMINI_API_KEY || '').trim()
    ),
    googleSheets: sheets,
    catalogSheetsSyncEnabled: isCatalogSheetsWorkbookPushEnabled(),
    supabaseAnon: Boolean(String(process.env.SUPABASE_URL || '').trim() && String(process.env.SUPABASE_ANON_KEY || '').trim()),
    supabaseServiceRole: Boolean(String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()),
    pdfProvider: String(process.env.UPLOAD_PDF_PROVIDER || 'fallback-text').trim() || 'fallback-text',
    googleDocumentAi: Boolean(
      String(process.env.GOOGLE_CLOUD_PROJECT_ID || '').trim() && String(process.env.DOCUMENT_AI_PROCESSOR_ID || '').trim()
    ),
    passwordLogin: Boolean(String(process.env.AUTH_LOGIN_PASSWORD || '').trim()),
    authRequired: ['1', 'true', 'yes'].includes(String(process.env.AUTH_REQUIRED || '').trim().toLowerCase()),
    div10BrainAdmin: Boolean(String(process.env.DIV10_BRAIN_ADMIN_SECRET || '').trim()),
    workspaceTakeoffLinesTable: pg ? getTakeoffLinesTableName() : '',
    catalogAliasesReadTable: pg ? getCatalogItemAliasesReadTableName() : '',
    catalogAliasesWriteTable: pg ? getCatalogItemAliasesWriteTableName() : '',
    catalogAliasesLayout: pg ? getCatalogItemAliasesReadLayout() : 'sheet',
    catalogBundlesReadTable: pg ? bundleReads.bundlesTable : '',
    catalogBundleItemsReadTable: pg ? bundleReads.bundleItemsTable : '',
    catalogItemsReadTable,
    catalogModifiersReadTable: pg ? getCatalogModifiersReadTableName() : '',
    catalogDataSource: sheetsBackend ? 'sheets' : pg ? 'postgres' : 'sqlite',
  };
}
