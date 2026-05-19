/**
 * Default Google **tab names** for the three Div 10 estimator workbooks.
 * Override with env vars on the server (see `div10SheetsWorkbooks.ts`); never hard-code spreadsheet IDs here.
 */

/** `PROJECT_SETUP_ESTIMATE_PROPOSAL_SPREADSHEET_ID` */
export const TAB_PROJECTS_DEFAULT = 'Projects';
export const TAB_PROJECT_MODIFIERS_DEFAULT = 'ProjectModifiers';
export const TAB_ESTIMATE_LINES_DEFAULT = 'EstimateLines';
export const TAB_PROPOSAL_SECTIONS_DEFAULT = 'ProposalSections';
export const TAB_PROPOSAL_LINE_OVERRIDES_DEFAULT = 'ProposalLineOverrides';
export const TAB_PROJECT_ALTERNATES_DEFAULT = 'ProjectAlternates';
export const TAB_PROJECT_ALLOWANCES_DEFAULT = 'ProjectAllowances';
export const TAB_PROJECT_CLARIFICATIONS_DEFAULT = 'ProjectClarifications';
export const TAB_PROJECT_EXCLUSIONS_DEFAULT = 'ProjectExclusions';
export const TAB_PROJECT_TERMS_DEFAULT = 'ProjectTerms';
export const TAB_SETTINGS_DEFAULT = 'Settings';

/** `VENDOR_INTAKE_BACKEND_SPREADSHEET_ID` */
export const TAB_SOURCE_QUOTES_DEFAULT = 'SourceQuotes';
export const TAB_PROJECT_FILES_DEFAULT = 'ProjectFiles';
export const TAB_STAGED_QUOTE_ROWS_DEFAULT = 'StagedQuoteRows';
export const TAB_QUOTE_ADJUSTMENTS_DEFAULT = 'QuoteAdjustments';
export const TAB_QUOTE_TERMS_DEFAULT = 'QuoteTerms';
export const TAB_PARSER_PROFILES_DEFAULT = 'ParserProfiles';
export const TAB_VENDOR_ALIASES_DEFAULT = 'VendorAliases';
/** @deprecated Legacy tab name; prefer VendorAliases */
export const TAB_VENDOR_PARSING_RULES_DEFAULT = 'VendorParsingRules';
export const TAB_INTAKE_REVIEW_STATUS_DEFAULT = 'IntakeReviewStatus';

/** `CATALOG_LABOR_BACKEND_SPREADSHEET_ID` */
export const TAB_CATALOG_ITEMS_DEFAULT = 'CatalogItems';
export const TAB_CATALOG_ALIASES_DEFAULT = 'CatalogAliases';
export const TAB_MANUFACTURER_ALIASES_DEFAULT = 'ManufacturerAliases';
export const TAB_LABOR_FALLBACK_RULES_DEFAULT = 'LaborFallbackRules';
export const TAB_INSTALL_LABOR_FAMILIES_DEFAULT = 'InstallLaborFamilies';
export const TAB_CATEGORY_DEFAULTS_DEFAULT = 'CategoryDefaults';
export const TAB_DIV10_ADD_INS_DEFAULT = 'AddIns';
export const TAB_BUNDLES_DEFAULT = 'Bundles';
export const TAB_BUNDLE_ITEMS_DEFAULT = 'BundleItems';
export const TAB_MODIFIERS_DEFAULT = 'Modifiers';
/** Same tab name on the catalog/labor workbook as on the project workbook. */
export const TAB_CATALOG_SETTINGS_DEFAULT = 'Settings';
