/**
 * Workspace data routing when `DATA_BACKEND=sheets` vs default DB-backed mode.
 *
 * **Canonical Div 10 workbook env vars** (operators should set these):
 * - `PROJECT_SETUP_ESTIMATE_PROPOSAL_SPREADSHEET_ID` — projects, estimate/proposal tabs, Settings tab in the same workbook
 * - `VENDOR_INTAKE_BACKEND_SPREADSHEET_ID` — vendor source quotes, staged rows, parser profiles (no `GOOGLE_*` alias)
 * - `CATALOG_LABOR_BACKEND_SPREADSHEET_ID` — catalog, aliases, labor fallbacks, bundles, modifiers, etc.
 *
 * **Legacy / compatibility aliases** (deprecated — migrate to canonical names):
 * - `GOOGLE_PROJECTS_SPREADSHEET_ID` → same physical workbook as `PROJECT_SETUP_ESTIMATE_PROPOSAL_SPREADSHEET_ID` when canonical unset
 * - `GOOGLE_SETTINGS_SPREADSHEET_ID` → Settings tab workbook when co-located with projects (used only by `getSettingsSpreadsheetId` resolution chain)
 * - `GOOGLE_CATALOG_SPREADSHEET_ID`, `GOOGLE_SHEETS_SPREADSHEET_ID`, `GOOGLE_SHEETS_ID` → catalog/labor workbook when `CATALOG_LABOR_BACKEND_SPREADSHEET_ID` unset
 *
 * Resolution for project vs settings: canonical `PROJECT_SETUP_*` wins over any legacy value when both are set.
 */
import {
  getCatalogLaborSpreadsheetId,
  getProjectSetupSpreadsheetId,
  getVendorIntakeSpreadsheetId,
} from '../config/div10SheetsWorkbooks.ts';

export type DataBackendMode = 'db' | 'sheets';

export function getDataBackendMode(): DataBackendMode {
  const raw = String(process.env.DATA_BACKEND || '').trim().toLowerCase();
  return raw === 'sheets' ? 'sheets' : 'db';
}

export function isSheetsDataBackend(): boolean {
  return getDataBackendMode() === 'sheets';
}

/** Catalog / labor / bundles workbook (canonical + legacy resolution in `div10SheetsWorkbooks.ts`). */
export function getCatalogSpreadsheetId(): string {
  return getCatalogLaborSpreadsheetId();
}

/** Project + estimate + proposal workbook (canonical + `GOOGLE_PROJECTS_SPREADSHEET_ID` legacy). */
export function getProjectsSpreadsheetId(): string {
  return getProjectSetupSpreadsheetId();
}

/**
 * Workbook id for the Settings tab. In Div 10, Settings lives in the **project** workbook.
 * Canonical: `PROJECT_SETUP_ESTIMATE_PROPOSAL_SPREADSHEET_ID`.
 * Legacy: `GOOGLE_SETTINGS_SPREADSHEET_ID` or `GOOGLE_PROJECTS_SPREADSHEET_ID` when canonical unset.
 */
export function getSettingsSpreadsheetId(): string {
  const id = String(
    process.env.PROJECT_SETUP_ESTIMATE_PROPOSAL_SPREADSHEET_ID ||
      process.env.GOOGLE_SETTINGS_SPREADSHEET_ID ||
      process.env.GOOGLE_PROJECTS_SPREADSHEET_ID ||
      ''
  ).trim();
  if (!id) {
    throw new Error(
      'Missing project workbook id for Settings. Set PROJECT_SETUP_ESTIMATE_PROPOSAL_SPREADSHEET_ID (Settings tab is in the project workbook), or legacy GOOGLE_SETTINGS_SPREADSHEET_ID / GOOGLE_PROJECTS_SPREADSHEET_ID.'
    );
  }
  return id;
}

/** Vendor intake workbook — canonical env only (see `div10SheetsWorkbooks.getVendorIntakeSpreadsheetId`). */
export function getVendorIntakeSpreadsheetIdForWorkspace(): string {
  return getVendorIntakeSpreadsheetId();
}

export function assertSheetsWorkbookId(id: string, label: string): string {
  const value = String(id || '').trim();
  if (!value) {
    throw new Error(`Missing ${label}. Configure the spreadsheet id env var for Sheets mode.`);
  }
  return value;
}
