/** Logical Div 10 Google Sheets workbooks (IDs come only from env on the server). */
export const DIV10_LOGICAL_WORKBOOK_KEYS = [
  'projectSetupEstimateProposal',
  'vendorIntakeBackend',
  'catalogLaborBackend',
] as const;

export type Div10LogicalWorkbookKey = (typeof DIV10_LOGICAL_WORKBOOK_KEYS)[number];
