/** Div 10 Install Intelligence workbook — row shapes (header-based IO). */

export interface CategoryProfileRow {
  categoryKey: string;
  categoryLabel: string;
  matchKeywords: string;
  defaultLaborFamily: string;
  installable: boolean;
  active: boolean;
}

export interface LaborFamilyRow {
  laborFamilyKey: string;
  laborFamilyName: string;
  defaultUnit: string;
  baseMinutesEach: number;
  minMinutes: number;
  active: boolean;
}

export interface QuestionBankRow {
  questionKey: string;
  prompt: string;
  fieldKey: string;
  inputType: string;
  required: boolean;
  active: boolean;
}

export interface CategoryQuestionRow {
  categoryKey: string;
  laborFamily: string;
  questionKey: string;
  active: boolean;
}

export interface DefaultAssumptionRow {
  categoryKey: string;
  laborFamily: string;
  assumptionKey: string;
  defaultValue: string;
  active: boolean;
}

export interface InstallModifierRow {
  modifierKey: string;
  matchCategoryKeys: string;
  matchLaborFamilies: string;
  matchAssumptionKey: string;
  matchAssumptionValue: string;
  matchDescriptionRegex: string;
  laborMinutesAdd: number;
  laborMultiplier: number;
  reviewFlag: string;
  active: boolean;
}

export interface ReviewRuleRow {
  ruleKey: string;
  matchCategoryKeys: string;
  matchLaborFamilies: string;
  requiredAssumptionKey: string;
  blockWhenMissingOrValues: string;
  blockAutoPriceLabor: boolean;
  needsReview: boolean;
  reviewFlag: string;
  active: boolean;
}

export interface ProposalClauseRow {
  clauseKey: string;
  triggerCategoryKeys: string;
  triggerLaborFamilies: string;
  triggerAssumptionKey: string;
  triggerAssumptionValue: string;
  triggerReviewFlag: string;
  clientText: string;
  internalOnly: boolean;
  active: boolean;
}

export interface VendorAliasRow {
  alias: string;
  canonicalVendor: string;
  active: boolean;
}

export interface VendorParserProfileRow {
  vendorPattern: string;
  profileKey: string;
  notes: string;
  active: boolean;
}

export interface InstallIntelligenceWorkbook {
  categoryProfiles: CategoryProfileRow[];
  laborFamilies: LaborFamilyRow[];
  questionBank: QuestionBankRow[];
  categoryQuestions: CategoryQuestionRow[];
  defaultAssumptions: DefaultAssumptionRow[];
  installModifiers: InstallModifierRow[];
  reviewRules: ReviewRuleRow[];
  proposalClauses: ProposalClauseRow[];
  vendorAliases: VendorAliasRow[];
  vendorParserProfiles: VendorParserProfileRow[];
  engineFlow: Record<string, string>[];
  loadedFrom: 'sheets' | 'fallback';
  spreadsheetId?: string;
}

export interface LineFacts {
  description: string;
  category: string | null;
  categoryKey: string;
  laborFamily: string | null;
  unit: string;
  qty: number;
  vendorName?: string | null;
  sku?: string | null;
  rowType?: string;
  sourceType?: string;
  catalogLaborMinutes?: number;
  assumptions: Record<string, string>;
}

export interface ProjectAssumptions {
  wallSubstrate?: string;
  [key: string]: string | undefined;
}

export interface RequiredInstallQuestion {
  questionKey: string;
  prompt: string;
  fieldKey: string;
  required: boolean;
}

export interface TriggeredProposalClause {
  clauseKey: string;
  clientText: string;
  internalOnly: boolean;
}

export interface InstallIntelligenceLineResult {
  categoryKey: string;
  laborFamily: string | null;
  laborMinutes: number;
  laborOrigin: 'source' | 'catalog' | 'install_family' | null;
  generatedLaborMinutes: number | null;
  blockAutoPriceLabor: boolean;
  needsReview: boolean;
  reviewFlags: string[];
  requiredQuestions: RequiredInstallQuestion[];
  internalNotes: string[];
  proposalClauses: TriggeredProposalClause[];
  vendorCanonical: string | null;
  vendorParserProfileKey: string | null;
}
