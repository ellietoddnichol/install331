/**
 * Expected tab names (defaults) and required row-1 headers per logical Div 10 workbook.
 * Vendor tab **titles** are resolved on the server via `div10SheetsWorkbooks.ts` (`vendorIntakeTab*`);
 * this file lists required headers in that same order.
 */
import type { Div10LogicalWorkbookKey } from './div10LogicalWorkbooks.ts';
import * as tabs from './div10SheetTabs.ts';
import * as hdr from './estimatorWorkbookHeaders.ts';

export type Div10WorkbookTabValidationSpec = {
  /** Resolved tab title expected in Google Sheets (exact match). */
  tabName: string;
  requiredHeaders: readonly string[];
};

/** Vendor intake workbook: required headers per tab, in the same order as `resolveVendorIntakeTabValidationSpecs()`. */
export const DIV10_VENDOR_INTAKE_VALIDATION_HEADER_ROWS: readonly { requiredHeaders: readonly string[] }[] = [
  { requiredHeaders: hdr.SOURCE_QUOTES_SHEET_HEADERS },
  { requiredHeaders: hdr.PROJECT_FILES_SHEET_HEADERS },
  { requiredHeaders: hdr.STAGED_QUOTE_ROWS_SHEET_HEADERS },
  { requiredHeaders: hdr.QUOTE_ADJUSTMENTS_SHEET_HEADERS },
  { requiredHeaders: hdr.QUOTE_TERMS_SHEET_HEADERS },
  { requiredHeaders: hdr.PARSER_PROFILES_SHEET_HEADERS },
  { requiredHeaders: hdr.VENDOR_ALIASES_SHEET_HEADERS },
];

const PROJECT_SPECS: readonly Div10WorkbookTabValidationSpec[] = [
  { tabName: tabs.TAB_PROJECTS_DEFAULT, requiredHeaders: hdr.PROJECTS_SHEET_HEADERS },
  { tabName: tabs.TAB_PROJECT_MODIFIERS_DEFAULT, requiredHeaders: hdr.PROJECT_MODIFIERS_SHEET_HEADERS },
  { tabName: tabs.TAB_ESTIMATE_LINES_DEFAULT, requiredHeaders: hdr.ESTIMATE_LINES_SHEET_HEADERS },
  { tabName: tabs.TAB_PROPOSAL_SECTIONS_DEFAULT, requiredHeaders: hdr.PROPOSAL_SECTIONS_SHEET_HEADERS },
  { tabName: tabs.TAB_PROJECT_ALTERNATES_DEFAULT, requiredHeaders: hdr.PROJECT_ALTERNATES_SHEET_HEADERS },
  { tabName: tabs.TAB_PROJECT_ALLOWANCES_DEFAULT, requiredHeaders: hdr.PROJECT_ALLOWANCES_SHEET_HEADERS },
  { tabName: tabs.TAB_PROJECT_CLARIFICATIONS_DEFAULT, requiredHeaders: hdr.PROJECT_CLARIFICATIONS_SHEET_HEADERS },
  { tabName: tabs.TAB_PROJECT_EXCLUSIONS_DEFAULT, requiredHeaders: hdr.PROJECT_EXCLUSIONS_SHEET_HEADERS },
  { tabName: tabs.TAB_SETTINGS_DEFAULT, requiredHeaders: hdr.SETTINGS_SHEET_HEADERS },
];

const CATALOG_SPECS: readonly Div10WorkbookTabValidationSpec[] = [
  { tabName: tabs.TAB_CATALOG_ITEMS_DEFAULT, requiredHeaders: hdr.CATALOG_ITEMS_SHEET_HEADERS },
  { tabName: tabs.TAB_CATALOG_ALIASES_DEFAULT, requiredHeaders: hdr.CATALOG_ALIASES_SHEET_HEADERS },
  { tabName: tabs.TAB_MANUFACTURER_ALIASES_DEFAULT, requiredHeaders: hdr.MANUFACTURER_ALIASES_SHEET_HEADERS },
  { tabName: tabs.TAB_LABOR_FALLBACK_RULES_DEFAULT, requiredHeaders: hdr.LABOR_FALLBACK_RULES_SHEET_HEADERS },
  { tabName: tabs.TAB_INSTALL_LABOR_FAMILIES_DEFAULT, requiredHeaders: hdr.INSTALL_LABOR_FAMILIES_SHEET_HEADERS },
  { tabName: tabs.TAB_CATEGORY_DEFAULTS_DEFAULT, requiredHeaders: hdr.CATEGORY_DEFAULTS_SHEET_HEADERS },
  { tabName: tabs.TAB_DIV10_ADD_INS_DEFAULT, requiredHeaders: hdr.DIV10_ADD_INS_SHEET_HEADERS },
  { tabName: tabs.TAB_BUNDLES_DEFAULT, requiredHeaders: hdr.BUNDLES_SHEET_HEADERS },
  { tabName: tabs.TAB_BUNDLE_ITEMS_DEFAULT, requiredHeaders: hdr.BUNDLE_ITEMS_SHEET_HEADERS },
  { tabName: tabs.TAB_MODIFIERS_DEFAULT, requiredHeaders: hdr.CATALOG_MODIFIERS_SHEET_HEADERS },
];

const SPECS_BY_KEY: Record<
  Exclude<Div10LogicalWorkbookKey, 'vendorIntakeBackend'>,
  readonly Div10WorkbookTabValidationSpec[]
> = {
  projectSetupEstimateProposal: PROJECT_SPECS,
  catalogLaborBackend: CATALOG_SPECS,
};

export function div10WorkbookTabValidationSpecs(
  key: Div10LogicalWorkbookKey
): readonly Div10WorkbookTabValidationSpec[] | null {
  if (key === 'vendorIntakeBackend') return null;
  return SPECS_BY_KEY[key];
}
