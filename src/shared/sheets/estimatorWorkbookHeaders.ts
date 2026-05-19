/**
 * Canonical column **labels** for estimator workbook tabs (Brighten Builders / Div 10 workflow).
 * Reads/writes match by header text (normalized for lookup); append order follows these arrays.
 * Default tab names for each Div 10 workbook are listed in `src/shared/sheets/div10SheetTabs.ts`.
 * Tab **names** on the server may be overridden via `GOOGLE_SHEETS_TAB_*` env vars (see `div10SheetsWorkbooks.ts`).
 */

export const DEFAULT_TAB_PROJECTS = 'Projects';
export const DEFAULT_TAB_SOURCE_QUOTES = 'SourceQuotes';
export const DEFAULT_TAB_STAGED_QUOTE_ROWS = 'StagedQuoteRows';
export const DEFAULT_TAB_ESTIMATE_LINES = 'EstimateLines';
export const DEFAULT_TAB_LABOR_FALLBACK_RULES = 'LaborFallbackRules';
export const DEFAULT_TAB_SETTINGS = 'Settings';

/** Row 1 headers for the `Projects` tab (human-editable; do not rely on column index in code). */
export const PROJECTS_SHEET_HEADERS: string[] = [
  'ProjectID',
  'ProjectName',
  'CustomerName',
  'ProjectAddress',
  'City',
  'State',
  'Zip',
  'Status',
  'BidDueDate',
  'StartDate',
  'ProjectType',
  'ScopeNotes',
  'TaxEnabled',
  'TaxRate',
  'OverheadPct',
  'ProfitPct',
  'BondPct',
  'LaborRate',
  'UnionMultiplier',
  'NightWorkMultiplier',
  'OvertimeMultiplier',
  'TravelMultiplier',
  'HeightAccessMultiplier',
  'MasonryMultiplier',
  'DemoMultiplier',
  'OccupiedBuildingMultiplier',
  'SmallJobMultiplier',
  'CustomLaborMultiplier',
  'ProposalShowRooms',
  'ProposalShowUnitPrices',
  'ProposalIncludeAlternates',
  'Clarifications',
  'Exclusions',
  'Terms',
  'CreatedAt',
  'UpdatedAt',
];

/** Row 1 headers for the `SourceQuotes` tab. */
export const SOURCE_QUOTES_SHEET_HEADERS: string[] = [
  'SourceQuoteID',
  'ProjectID',
  'VendorName',
  'FileName',
  'QuoteDate',
  'QuoteNumber',
  'DetectedSubtotal',
  'DetectedTax',
  'DetectedFreight',
  'DetectedTotal',
  'ParsingStatus',
  'ParserNotes',
  'CreatedAt',
  'UpdatedAt',
];

/** Row 1 headers for the `ProjectFiles` tab (vendor intake workbook; GCS blob metadata). */
export const PROJECT_FILES_SHEET_HEADERS: string[] = [
  'FileID',
  'ProjectID',
  'SourceQuoteID',
  'Filename',
  'MimeType',
  'SizeBytes',
  'StorageProvider',
  'GcsBucket',
  'GcsObject',
  'UploadedAt',
  'UploadedBy',
  'FileType',
  'Notes',
  'Status',
  'DeletedAt',
];

/** Row 1 headers for the `StagedQuoteRows` tab. */
export const STAGED_QUOTE_ROWS_SHEET_HEADERS: string[] = [
  'StagedRowID',
  'SourceQuoteID',
  'ProjectID',
  'RowIndex',
  'RawText',
  'DetectedSKU',
  'DetectedManufacturer',
  'DetectedDescription',
  'DetectedCategory',
  'DetectedQty',
  'DetectedUnit',
  'DetectedUnitCost',
  'DetectedExtendedCost',
  'RowType',
  'ScopeBucket',
  'MatchedCatalogItemID',
  'MatchConfidence',
  'UseMaterialFrom',
  'UseLaborFrom',
  'FallbackLaborFamily',
  'BaseLaborMinutes',
  'LaborMultiplierApplied',
  'CalculatedLaborCost',
  'CalculatedMaterialCost',
  'CalculatedTotalCost',
  'ReviewRequired',
  'ReviewNotes',
  'AcceptedStatus',
  'CreatedAt',
  'UpdatedAt',
];

/** Row 1 headers for `LaborFallbackRules` (Sheets-first labor when catalog misses). */
export const LABOR_FALLBACK_RULES_SHEET_HEADERS: string[] = [
  'FallbackLaborFamily',
  'Category',
  'KeywordIncludes',
  'Unit',
  'DefaultLaborMinutesPerUnit',
  'MinLaborMinutes',
  'Notes',
  'Active',
];

/** Row 4 headers for `Settings` (key/value store on the project workbook). */
export const SETTINGS_SHEET_HEADERS: string[] = [
  'setting_key',
  'setting_value',
  'setting_type',
  'description',
  'updated_at',
];

export const PROJECT_MODIFIERS_SHEET_HEADERS: string[] = [
  'ModifierID',
  'ProjectID',
  'ModifierName',
  'AppliesTo',
  'Multiplier',
  'FlatAmount',
  'Enabled',
  'Notes',
];

export const ESTIMATE_LINES_SHEET_HEADERS: string[] = [
  'EstimateLineID',
  'ProjectID',
  'SectionID',
  'SortOrder',
  'SKU',
  'Description',
  'Manufacturer',
  'Category',
  'Unit',
  'Qty',
  'UnitMaterialCost',
  'UnitLaborCost',
  'ExtendedTotal',
  'Room',
  'Notes',
  'Active',
  'CreatedAt',
  'UpdatedAt',
];

export const PROPOSAL_SECTIONS_SHEET_HEADERS: string[] = [
  'SectionID',
  'ProjectID',
  'Title',
  'SortOrder',
  'CreatedAt',
  'UpdatedAt',
];

export const PROPOSAL_LINE_OVERRIDES_SHEET_HEADERS: string[] = [
  'OverrideID',
  'ProjectID',
  'EstimateLineID',
  'Field',
  'Value',
  'CreatedAt',
];

export const PROJECT_ALTERNATES_SHEET_HEADERS: string[] = [
  'AlternateID',
  'ProjectID',
  'Title',
  'Description',
  'Amount',
  'CreatedAt',
];

export const PROJECT_ALLOWANCES_SHEET_HEADERS: string[] = [
  'AllowanceID',
  'ProjectID',
  'Title',
  'Amount',
  'Notes',
];

export const PROJECT_CLARIFICATIONS_SHEET_HEADERS: string[] = [
  'ClarificationID',
  'ProjectID',
  'Text',
  'SortOrder',
];

export const PROJECT_EXCLUSIONS_SHEET_HEADERS: string[] = [
  'ExclusionID',
  'ProjectID',
  'Text',
  'SortOrder',
];

export const PROJECT_TERMS_SHEET_HEADERS: string[] = ['TermID', 'ProjectID', 'Text', 'SortOrder'];

export const QUOTE_ADJUSTMENTS_SHEET_HEADERS: string[] = [
  'AdjustmentID',
  'SourceQuoteID',
  'Description',
  'Amount',
  'CreatedAt',
];

export const QUOTE_TERMS_SHEET_HEADERS: string[] = ['TermID', 'SourceQuoteID', 'Text', 'SortOrder'];

export const PARSER_PROFILES_SHEET_HEADERS: string[] = [
  'ProfileID',
  'ProfileName',
  'VendorPattern',
  'Active',
  'Notes',
];

export const VENDOR_PARSING_RULES_SHEET_HEADERS: string[] = [
  'RuleID',
  'ProfileID',
  'Pattern',
  'RowTypeHint',
  'Priority',
  'Active',
];

/** Row 4 headers for `VendorAliases` on the vendor intake workbook. */
export const VENDOR_ALIASES_SHEET_HEADERS: string[] = [
  'alias',
  'canonical_vendor_name',
  'manufacturer_name',
  'active',
  'notes',
];

export const BUNDLE_ITEMS_SHEET_HEADERS: string[] = [
  'bundle_id',
  'child_catalog_item_id',
  'child_sku',
  'qty',
  'unit',
  'notes',
];

export const LISTS_SHEET_HEADERS: string[] = ['list_name', 'option_value', 'option_label', 'sort_order', 'active'];

export const CATALOG_ITEMS_SHEET_HEADERS: string[] = [
  'catalog_item_id',
  'active',
  'category',
  'subcategory',
  'manufacturer',
  'sku',
  'model',
  'description',
  'unit',
  'material_unit_cost',
  'labor_minutes_each',
  'labor_family_key',
  'default_proposal_group',
  'image_url',
  'source_url',
  'notes',
  'updated_at',
];

export const CATALOG_ALIASES_SHEET_HEADERS: string[] = ['AliasID', 'CatalogItemID', 'AliasValue', 'Active'];

export const MANUFACTURER_ALIASES_SHEET_HEADERS: string[] = [
  'AliasID',
  'ManufacturerKey',
  'AliasValue',
  'Active',
];

export const INSTALL_LABOR_FAMILIES_SHEET_HEADERS: string[] = [
  'FamilyID',
  'FamilyKey',
  'DisplayName',
  'DefaultMinutes',
  'Active',
];

export const CATEGORY_DEFAULTS_SHEET_HEADERS: string[] = [
  'CategoryKey',
  'DefaultLaborFamily',
  'Notes',
  'Active',
];

export const DIV10_ADD_INS_SHEET_HEADERS: string[] = ['AddInID', 'Name', 'Description', 'Active'];

export const BUNDLES_SHEET_HEADERS: string[] = ['BundleID', 'Name', 'Description', 'Active'];

export const CATALOG_MODIFIERS_SHEET_HEADERS: string[] = ['ModifierID', 'Name', 'Active', 'SortOrder'];
