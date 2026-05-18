/**
 * Div 10 Install Intelligence workbook (separate from catalog/labor backend).
 * Canonical: DIV10_INSTALL_INTELLIGENCE_SPREADSHEET_ID
 * Optional fallback: CATALOG_INSTALL_INTELLIGENCE_SPREADSHEET_ID
 */

export const INSTALL_INTELLIGENCE_TABS = {
  categoryProfiles: 'CategoryProfiles',
  laborFamilies: 'LaborFamilies',
  questionBank: 'QuestionBank',
  categoryQuestions: 'CategoryQuestions',
  defaultAssumptions: 'DefaultAssumptions',
  installModifiers: 'InstallModifiers',
  reviewRules: 'ReviewRules',
  catalogInstallOverrides: 'CatalogInstallOverrides',
  proposalClauses: 'ProposalClauses',
  dropdownValues: 'DropdownValues',
  vendorParserProfiles: 'VendorParserProfiles',
  vendorAliases: 'VendorAliases',
  engineFlow: 'EngineFlow',
} as const;

export function getInstallIntelligenceSpreadsheetId(): string {
  const id = String(
    process.env.DIV10_INSTALL_INTELLIGENCE_SPREADSHEET_ID ||
      process.env.CATALOG_INSTALL_INTELLIGENCE_SPREADSHEET_ID ||
      '',
  ).trim();
  if (!id) {
    throw new Error(
      'Missing Install Intelligence workbook id. Set DIV10_INSTALL_INTELLIGENCE_SPREADSHEET_ID (optional fallback: CATALOG_INSTALL_INTELLIGENCE_SPREADSHEET_ID).',
    );
  }
  return id;
}

export function peekInstallIntelligenceSpreadsheetId(): string | null {
  const id = String(
    process.env.DIV10_INSTALL_INTELLIGENCE_SPREADSHEET_ID ||
      process.env.CATALOG_INSTALL_INTELLIGENCE_SPREADSHEET_ID ||
      '',
  ).trim();
  return id || null;
}

export function installIntelligenceTabName(key: keyof typeof INSTALL_INTELLIGENCE_TABS): string {
  return INSTALL_INTELLIGENCE_TABS[key];
}
