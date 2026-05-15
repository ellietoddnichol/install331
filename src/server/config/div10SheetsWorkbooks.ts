/**
 * Div 10 estimator workbook routing (vendor intake ≠ WIP/job-cost).
 * All spreadsheet IDs come from environment variables — never embed workbook IDs in business logic.
 *
 * | Env | Workbook |
 * |-----|----------|
 * | `PROJECT_SETUP_ESTIMATE_PROPOSAL_SPREADSHEET_ID` | Projects, modifiers, estimate lines, proposal tabs |
 * | `VENDOR_INTAKE_BACKEND_SPREADSHEET_ID` | SourceQuotes, StagedQuoteRows, intake review |
 * | `CATALOG_LABOR_BACKEND_SPREADSHEET_ID` | Catalog, labor fallbacks, bundles, modifiers |
 *
 * Legacy compatibility (prefer canonical names above):
 * - Catalog/labor: `GOOGLE_CATALOG_SPREADSHEET_ID`, then `GOOGLE_SHEETS_SPREADSHEET_ID` / `GOOGLE_SHEETS_ID` if canonical unset.
 * - Project workbook: `GOOGLE_PROJECTS_SPREADSHEET_ID` if `PROJECT_SETUP_ESTIMATE_PROPOSAL_SPREADSHEET_ID` unset.
 * - There is **no** generic `GOOGLE_*` alias for the vendor intake workbook — use `VENDOR_INTAKE_BACKEND_SPREADSHEET_ID` only.
 */

import type { Div10LogicalWorkbookKey } from '../../shared/sheets/div10LogicalWorkbooks.ts';
import {
  TAB_BUNDLES_DEFAULT,
  TAB_CATALOG_ALIASES_DEFAULT,
  TAB_CATALOG_ITEMS_DEFAULT,
  TAB_ESTIMATE_LINES_DEFAULT,
  TAB_MODIFIERS_DEFAULT,
  TAB_PROJECTS_DEFAULT,
  TAB_SETTINGS_DEFAULT,
  TAB_STAGED_QUOTE_ROWS_DEFAULT,
  TAB_VENDOR_ALIASES_DEFAULT,
  TAB_VENDOR_PARSING_RULES_DEFAULT,
  TAB_DIV10_ADD_INS_DEFAULT,
  TAB_BUNDLE_ITEMS_DEFAULT,
} from '../../shared/sheets/div10SheetTabs.ts';

export type { Div10LogicalWorkbookKey };
export { DIV10_LOGICAL_WORKBOOK_KEYS } from '../../shared/sheets/div10LogicalWorkbooks.ts';

/** Catalog + labor + bundles workbook (preferred Div 10 split). */
export function getCatalogLaborSpreadsheetId(): string {
  const id = String(
    process.env.CATALOG_LABOR_BACKEND_SPREADSHEET_ID ||
      process.env.GOOGLE_CATALOG_SPREADSHEET_ID ||
      process.env.GOOGLE_SHEETS_SPREADSHEET_ID ||
      process.env.GOOGLE_SHEETS_ID ||
      ''
  ).trim();
  if (!id) {
    throw new Error(
      'Missing catalog/labor workbook id. Set CATALOG_LABOR_BACKEND_SPREADSHEET_ID (canonical), or legacy GOOGLE_CATALOG_SPREADSHEET_ID / GOOGLE_SHEETS_SPREADSHEET_ID / GOOGLE_SHEETS_ID.'
    );
  }
  return id;
}

/** Non-throwing id for diagnostics / run context (null if unset). */
export function peekCatalogLaborSpreadsheetId(): string | null {
  const id = String(
    process.env.CATALOG_LABOR_BACKEND_SPREADSHEET_ID ||
      process.env.GOOGLE_CATALOG_SPREADSHEET_ID ||
      process.env.GOOGLE_SHEETS_SPREADSHEET_ID ||
      process.env.GOOGLE_SHEETS_ID ||
      ''
  ).trim();
  return id || null;
}

/** Vendor quote staging workbook (SourceQuotes, StagedQuoteRows, …). Requires `VENDOR_INTAKE_BACKEND_SPREADSHEET_ID`. */
export function getVendorIntakeSpreadsheetId(): string {
  const id = String(process.env.VENDOR_INTAKE_BACKEND_SPREADSHEET_ID || '').trim();
  if (!id) {
    throw new Error(
      'Set VENDOR_INTAKE_BACKEND_SPREADSHEET_ID for vendor quotes (SourceQuotes, StagedQuoteRows, parser profiles). There is no legacy GOOGLE_* alias for this workbook. Use DATA_BACKEND=sheets with this id for vendor intake persistence.'
    );
  }
  return id;
}

/** Project / estimate / proposal workbook. */
export function getProjectSetupSpreadsheetId(): string {
  const id = String(
    process.env.PROJECT_SETUP_ESTIMATE_PROPOSAL_SPREADSHEET_ID || process.env.GOOGLE_PROJECTS_SPREADSHEET_ID || ''
  ).trim();
  if (!id) {
    throw new Error(
      'Set PROJECT_SETUP_ESTIMATE_PROPOSAL_SPREADSHEET_ID for Projects, EstimateLines, proposal sections, modifiers, and related tabs (legacy alias: GOOGLE_PROJECTS_SPREADSHEET_ID).'
    );
  }
  return id;
}

export function peekProjectSetupSpreadsheetId(): string | null {
  const id = String(
    process.env.PROJECT_SETUP_ESTIMATE_PROPOSAL_SPREADSHEET_ID || process.env.GOOGLE_PROJECTS_SPREADSHEET_ID || ''
  ).trim();
  return id || null;
}

/** Non-throwing id for vendor intake workbook diagnostics. */
export function peekVendorIntakeSpreadsheetId(): string | null {
  const id = String(process.env.VENDOR_INTAKE_BACKEND_SPREADSHEET_ID || '').trim();
  return id || null;
}

/** Primary env var name(s) for each logical workbook (catalog allows legacy fallbacks in peek/get). */
export function primarySpreadsheetEnvVarForWorkbook(key: Div10LogicalWorkbookKey): string {
  switch (key) {
    case 'projectSetupEstimateProposal':
      return 'PROJECT_SETUP_ESTIMATE_PROPOSAL_SPREADSHEET_ID';
    case 'vendorIntakeBackend':
      return 'VENDOR_INTAKE_BACKEND_SPREADSHEET_ID';
    case 'catalogLaborBackend':
      return 'CATALOG_LABOR_BACKEND_SPREADSHEET_ID';
    default: {
      const _exhaustive: never = key;
      return _exhaustive;
    }
  }
}

export function peekSpreadsheetIdForDiv10Workbook(key: Div10LogicalWorkbookKey): string | null {
  switch (key) {
    case 'projectSetupEstimateProposal':
      return peekProjectSetupSpreadsheetId();
    case 'vendorIntakeBackend':
      return peekVendorIntakeSpreadsheetId();
    case 'catalogLaborBackend':
      return peekCatalogLaborSpreadsheetId();
    default: {
      const _exhaustive: never = key;
      return _exhaustive;
    }
  }
}

// --- Tab name resolvers (defaults + GOOGLE_SHEETS_TAB_* where already used) ---

export function vendorIntakeTabSourceQuotes(): string {
  return String(process.env.GOOGLE_SHEETS_TAB_SOURCE_QUOTES || 'SourceQuotes').trim() || 'SourceQuotes';
}

export function vendorIntakeTabStagedQuoteRows(): string {
  return String(process.env.GOOGLE_SHEETS_TAB_STAGED_QUOTE_ROWS || TAB_STAGED_QUOTE_ROWS_DEFAULT).trim() || TAB_STAGED_QUOTE_ROWS_DEFAULT;
}

export function vendorIntakeTabQuoteAdjustments(): string {
  return String(process.env.GOOGLE_SHEETS_TAB_QUOTE_ADJUSTMENTS || 'QuoteAdjustments').trim() || 'QuoteAdjustments';
}

export function vendorIntakeTabQuoteTerms(): string {
  return String(process.env.GOOGLE_SHEETS_TAB_QUOTE_TERMS || 'QuoteTerms').trim() || 'QuoteTerms';
}

export function vendorIntakeTabParserProfiles(): string {
  return String(process.env.GOOGLE_SHEETS_TAB_PARSER_PROFILES || 'ParserProfiles').trim() || 'ParserProfiles';
}

export function vendorIntakeTabVendorAliases(): string {
  return String(process.env.GOOGLE_SHEETS_TAB_VENDOR_ALIASES || TAB_VENDOR_ALIASES_DEFAULT).trim() || TAB_VENDOR_ALIASES_DEFAULT;
}

/** @deprecated Prefer `vendorIntakeTabVendorAliases` (Div 10 tab `VendorAliases`). */
export function vendorIntakeTabVendorParsingRules(): string {
  const aliases = vendorIntakeTabVendorAliases();
  const legacy = String(process.env.GOOGLE_SHEETS_TAB_VENDOR_PARSING_RULES || TAB_VENDOR_PARSING_RULES_DEFAULT).trim();
  return legacy || aliases;
}

export function catalogLaborTabAddIns(): string {
  return String(process.env.GOOGLE_SHEETS_TAB_ADD_INS || TAB_DIV10_ADD_INS_DEFAULT).trim() || TAB_DIV10_ADD_INS_DEFAULT;
}

export function catalogLaborTabBundleItems(): string {
  return String(process.env.GOOGLE_SHEETS_TAB_BUNDLE_ITEMS || TAB_BUNDLE_ITEMS_DEFAULT).trim() || TAB_BUNDLE_ITEMS_DEFAULT;
}

export function vendorIntakeTabIntakeReviewStatus(): string {
  return String(process.env.GOOGLE_SHEETS_TAB_INTAKE_REVIEW_STATUS || 'IntakeReviewStatus').trim() || 'IntakeReviewStatus';
}

/** `CATALOG_LABOR_BACKEND_SPREADSHEET_ID` — Div 10 default tab is `CatalogItems` (not legacy `CATALOG_ITEMS`). */
export function catalogLaborTabCatalogItems(): string {
  return String(process.env.GOOGLE_SHEETS_TAB_CATALOG_ITEMS || TAB_CATALOG_ITEMS_DEFAULT).trim() || TAB_CATALOG_ITEMS_DEFAULT;
}

export function catalogLaborTabCatalogAliases(): string {
  return String(process.env.GOOGLE_SHEETS_TAB_CATALOG_ALIASES || TAB_CATALOG_ALIASES_DEFAULT).trim() || TAB_CATALOG_ALIASES_DEFAULT;
}

/** Optional legacy tabs; not in the Div 10 catalog workbook validation spec. */
export function catalogLaborTabCatalogVendorPrices(): string {
  return String(process.env.GOOGLE_SHEETS_TAB_CATALOG_VENDOR_PRICES || 'CATALOG_VENDOR_PRICES').trim() || 'CATALOG_VENDOR_PRICES';
}

export function catalogLaborTabCatalogAttributes(): string {
  return String(process.env.GOOGLE_SHEETS_TAB_CATALOG_ATTRIBUTES || 'CATALOG_ATTRIBUTES').trim() || 'CATALOG_ATTRIBUTES';
}

export function projectSetupTabProjects(): string {
  return String(process.env.GOOGLE_SHEETS_TAB_PROJECTS || TAB_PROJECTS_DEFAULT).trim() || TAB_PROJECTS_DEFAULT;
}

export function projectSetupTabEstimateLines(): string {
  return String(process.env.GOOGLE_SHEETS_TAB_ESTIMATE_LINES || TAB_ESTIMATE_LINES_DEFAULT).trim() || TAB_ESTIMATE_LINES_DEFAULT;
}

/** Company defaults on the project workbook (`Settings` tab, Key/Value rows). */
export function projectSetupTabSettings(): string {
  return String(process.env.GOOGLE_SHEETS_TAB_SETTINGS || TAB_SETTINGS_DEFAULT).trim() || TAB_SETTINGS_DEFAULT;
}

export function catalogLaborTabModifiers(): string {
  return String(process.env.GOOGLE_SHEETS_TAB_MODIFIERS || TAB_MODIFIERS_DEFAULT).trim() || TAB_MODIFIERS_DEFAULT;
}

export function catalogLaborTabBundles(): string {
  return String(process.env.GOOGLE_SHEETS_TAB_BUNDLES || TAB_BUNDLES_DEFAULT).trim() || TAB_BUNDLES_DEFAULT;
}
