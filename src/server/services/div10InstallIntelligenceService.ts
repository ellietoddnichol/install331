import { readRowsOrEmpty } from '../integrations/googleSheets.ts';
import {
  INSTALL_INTELLIGENCE_TABS,
  getInstallIntelligenceSpreadsheetId,
  peekInstallIntelligenceSpreadsheetId,
} from '../config/div10InstallIntelligenceWorkbook.ts';
import { buildFallbackInstallIntelligenceWorkbook } from './div10InstallIntelligenceFallback.ts';
import type {
  CategoryProfileRow,
  CategoryQuestionRow,
  DefaultAssumptionRow,
  InstallIntelligenceLineResult,
  InstallIntelligenceWorkbook,
  InstallModifierRow,
  LaborFamilyRow,
  LineFacts,
  ProjectAssumptions,
  ProposalClauseRow,
  QuestionBankRow,
  RequiredInstallQuestion,
  ReviewRuleRow,
  TriggeredProposalClause,
  VendorAliasRow,
  VendorParserProfileRow,
} from '../../shared/types/div10InstallIntelligence.ts';

export type {
  InstallIntelligenceWorkbook,
  LineFacts,
  ProjectAssumptions,
  InstallIntelligenceLineResult,
} from '../../shared/types/div10InstallIntelligence.ts';

let cachedWorkbook: InstallIntelligenceWorkbook | null = null;
let cacheLoadedAt = 0;
let activeWorkbook: InstallIntelligenceWorkbook = buildFallbackInstallIntelligenceWorkbook();
const CACHE_TTL_MS = 5 * 60 * 1000;

function rowPick(row: Record<string, string>, keys: string[]): string {
  for (const key of keys) {
    const direct = row[key];
    if (direct != null && String(direct).trim()) return String(direct).trim();
  }
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const wanted = new Set(keys.map(norm));
  for (const [header, value] of Object.entries(row)) {
    if (wanted.has(norm(header)) && String(value).trim()) return String(value).trim();
  }
  return '';
}

function parseBool(value: string): boolean {
  const v = String(value || '').trim().toLowerCase();
  return v === 'true' || v === 'yes' || v === '1' || v === 'y';
}

function parseNumber(value: string, fallback = 0): number {
  const n = Number(String(value || '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : fallback;
}

function tokenList(csv: string): string[] {
  return String(csv || '')
    .split(/[|,;]+/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

function matchesTokenList(hay: string, csv: string): boolean {
  const tokens = tokenList(csv);
  if (tokens.length === 0) return true;
  const lower = hay.toLowerCase();
  return tokens.some((t) => lower === t || lower.includes(t));
}

function mapCategoryProfile(row: Record<string, string>): CategoryProfileRow {
  return {
    categoryKey: rowPick(row, ['category_key', 'categoryKey']),
    categoryLabel: rowPick(row, ['category_label', 'categoryLabel', 'category']),
    matchKeywords: rowPick(row, ['match_keywords', 'matchKeywords', 'keywords']),
    defaultLaborFamily: rowPick(row, ['default_labor_family', 'defaultLaborFamily', 'labor_family_key']),
    installable: parseBool(rowPick(row, ['installable', 'active']) || 'true'),
    active: parseBool(rowPick(row, ['active']) || 'true'),
  };
}

function mapLaborFamily(row: Record<string, string>): LaborFamilyRow {
  return {
    laborFamilyKey: rowPick(row, ['labor_family_key', 'laborFamilyKey']),
    laborFamilyName: rowPick(row, ['labor_family_name', 'laborFamilyName']),
    defaultUnit: rowPick(row, ['default_unit', 'defaultUnit']) || 'EA',
    baseMinutesEach: parseNumber(rowPick(row, ['base_minutes_each', 'baseMinutesEach', 'base_minutes'])),
    minMinutes: parseNumber(rowPick(row, ['min_minutes', 'minMinutes'])),
    active: parseBool(rowPick(row, ['active']) || 'true'),
  };
}

function mapQuestion(row: Record<string, string>): QuestionBankRow {
  return {
    questionKey: rowPick(row, ['question_key', 'questionKey']),
    prompt: rowPick(row, ['prompt', 'question', 'label']),
    fieldKey: rowPick(row, ['field_key', 'fieldKey', 'assumption_key']),
    inputType: rowPick(row, ['input_type', 'inputType']) || 'text',
    required: parseBool(rowPick(row, ['required']) || 'false'),
    active: parseBool(rowPick(row, ['active']) || 'true'),
  };
}

function mapCategoryQuestion(row: Record<string, string>): CategoryQuestionRow {
  return {
    categoryKey: rowPick(row, ['category_key', 'categoryKey']),
    laborFamily: rowPick(row, ['labor_family', 'laborFamily', 'labor_family_key']),
    questionKey: rowPick(row, ['question_key', 'questionKey']),
    active: parseBool(rowPick(row, ['active']) || 'true'),
  };
}

function mapDefaultAssumption(row: Record<string, string>): DefaultAssumptionRow {
  return {
    categoryKey: rowPick(row, ['category_key', 'categoryKey']),
    laborFamily: rowPick(row, ['labor_family', 'laborFamily']),
    assumptionKey: rowPick(row, ['assumption_key', 'assumptionKey', 'field_key']),
    defaultValue: rowPick(row, ['default_value', 'defaultValue']),
    active: parseBool(rowPick(row, ['active']) || 'true'),
  };
}

function mapInstallModifier(row: Record<string, string>): InstallModifierRow {
  return {
    modifierKey: rowPick(row, ['modifier_key', 'modifierKey']),
    matchCategoryKeys: rowPick(row, ['match_category_keys', 'matchCategoryKeys', 'category_keys']),
    matchLaborFamilies: rowPick(row, ['match_labor_families', 'matchLaborFamilies']),
    matchAssumptionKey: rowPick(row, ['match_assumption_key', 'matchAssumptionKey', 'when_assumption']),
    matchAssumptionValue: rowPick(row, ['match_assumption_value', 'matchAssumptionValue', 'when_value']),
    matchDescriptionRegex: rowPick(row, ['match_description_regex', 'matchDescriptionRegex']),
    laborMinutesAdd: parseNumber(rowPick(row, ['labor_minutes_add', 'laborMinutesAdd', 'add_minutes'])),
    laborMultiplier: parseNumber(rowPick(row, ['labor_multiplier', 'laborMultiplier', 'multiplier']), 1) || 1,
    reviewFlag: rowPick(row, ['review_flag', 'reviewFlag']),
    active: parseBool(rowPick(row, ['active']) || 'true'),
  };
}

function mapReviewRule(row: Record<string, string>): ReviewRuleRow {
  return {
    ruleKey: rowPick(row, ['rule_key', 'ruleKey']),
    matchCategoryKeys: rowPick(row, ['match_category_keys', 'matchCategoryKeys', 'category_keys']),
    matchLaborFamilies: rowPick(row, ['match_labor_families', 'matchLaborFamilies']),
    requiredAssumptionKey: rowPick(row, ['required_assumption_key', 'requiredAssumptionKey', 'assumption_key']),
    blockWhenMissingOrValues: rowPick(row, ['block_when_missing_or_values', 'blockWhenMissingOrValues', 'block_values']),
    blockAutoPriceLabor: parseBool(rowPick(row, ['block_auto_price_labor', 'blockAutoPriceLabor']) || 'false'),
    needsReview: parseBool(rowPick(row, ['needs_review', 'needsReview']) || 'true'),
    reviewFlag: rowPick(row, ['review_flag', 'reviewFlag']),
    active: parseBool(rowPick(row, ['active']) || 'true'),
  };
}

function mapProposalClause(row: Record<string, string>): ProposalClauseRow {
  return {
    clauseKey: rowPick(row, ['clause_key', 'clauseKey']),
    triggerCategoryKeys: rowPick(row, ['trigger_category_keys', 'triggerCategoryKeys']),
    triggerLaborFamilies: rowPick(row, ['trigger_labor_families', 'triggerLaborFamilies']),
    triggerAssumptionKey: rowPick(row, ['trigger_assumption_key', 'triggerAssumptionKey']),
    triggerAssumptionValue: rowPick(row, ['trigger_assumption_value', 'triggerAssumptionValue']),
    triggerReviewFlag: rowPick(row, ['trigger_review_flag', 'triggerReviewFlag']),
    clientText: rowPick(row, ['client_text', 'clientText', 'clause_text']),
    internalOnly: parseBool(rowPick(row, ['internal_only', 'internalOnly']) || 'false'),
    active: parseBool(rowPick(row, ['active']) || 'true'),
  };
}

function mapVendorAlias(row: Record<string, string>): VendorAliasRow {
  return {
    alias: rowPick(row, ['alias', 'vendor_alias', 'pattern']),
    canonicalVendor: rowPick(row, ['canonical_vendor', 'canonicalVendor', 'vendor_name']),
    active: parseBool(rowPick(row, ['active']) || 'true'),
  };
}

function mapVendorParserProfile(row: Record<string, string>): VendorParserProfileRow {
  return {
    vendorPattern: rowPick(row, ['vendor_pattern', 'vendorPattern', 'pattern']),
    profileKey: rowPick(row, ['profile_key', 'profileKey']),
    notes: rowPick(row, ['notes']),
    active: parseBool(rowPick(row, ['active']) || 'true'),
  };
}

async function readTab(spreadsheetId: string, tab: string): Promise<Record<string, string>[]> {
  return readRowsOrEmpty(tab, spreadsheetId);
}

export function clearInstallIntelligenceCache(): void {
  cachedWorkbook = null;
  cacheLoadedAt = 0;
  activeWorkbook = buildFallbackInstallIntelligenceWorkbook();
}

export async function loadInstallIntelligenceWorkbook(force = false): Promise<InstallIntelligenceWorkbook> {
  const now = Date.now();
  if (!force && cachedWorkbook && now - cacheLoadedAt < CACHE_TTL_MS) {
    activeWorkbook = cachedWorkbook;
    return cachedWorkbook;
  }

  const spreadsheetId = peekInstallIntelligenceSpreadsheetId();
  if (!spreadsheetId) {
    cachedWorkbook = buildFallbackInstallIntelligenceWorkbook();
    cacheLoadedAt = now;
    activeWorkbook = cachedWorkbook;
    return cachedWorkbook;
  }

  try {
    const id = getInstallIntelligenceSpreadsheetId();
    const [
      categoryProfiles,
      laborFamilies,
      questionBank,
      categoryQuestions,
      defaultAssumptions,
      installModifiers,
      reviewRules,
      proposalClauses,
      vendorAliases,
      vendorParserProfiles,
      engineFlow,
    ] = await Promise.all([
      readTab(id, INSTALL_INTELLIGENCE_TABS.categoryProfiles),
      readTab(id, INSTALL_INTELLIGENCE_TABS.laborFamilies),
      readTab(id, INSTALL_INTELLIGENCE_TABS.questionBank),
      readTab(id, INSTALL_INTELLIGENCE_TABS.categoryQuestions),
      readTab(id, INSTALL_INTELLIGENCE_TABS.defaultAssumptions),
      readTab(id, INSTALL_INTELLIGENCE_TABS.installModifiers),
      readTab(id, INSTALL_INTELLIGENCE_TABS.reviewRules),
      readTab(id, INSTALL_INTELLIGENCE_TABS.proposalClauses),
      readTab(id, INSTALL_INTELLIGENCE_TABS.vendorAliases),
      readTab(id, INSTALL_INTELLIGENCE_TABS.vendorParserProfiles),
      readTab(id, INSTALL_INTELLIGENCE_TABS.engineFlow),
    ]);

    const wb: InstallIntelligenceWorkbook = {
      loadedFrom: 'sheets',
      spreadsheetId: id,
      categoryProfiles: categoryProfiles.map(mapCategoryProfile).filter((r) => r.categoryKey && r.active),
      laborFamilies: laborFamilies.map(mapLaborFamily).filter((r) => r.laborFamilyKey && r.active),
      questionBank: questionBank.map(mapQuestion).filter((r) => r.questionKey && r.active),
      categoryQuestions: categoryQuestions.map(mapCategoryQuestion).filter((r) => r.categoryKey && r.questionKey && r.active),
      defaultAssumptions: defaultAssumptions.map(mapDefaultAssumption).filter((r) => r.assumptionKey && r.active),
      installModifiers: installModifiers.map(mapInstallModifier).filter((r) => r.modifierKey && r.active),
      reviewRules: reviewRules.map(mapReviewRule).filter((r) => r.ruleKey && r.active),
      proposalClauses: proposalClauses.map(mapProposalClause).filter((r) => r.clauseKey && r.active),
      vendorAliases: vendorAliases.map(mapVendorAlias).filter((r) => r.alias && r.canonicalVendor && r.active),
      vendorParserProfiles: vendorParserProfiles.map(mapVendorParserProfile).filter((r) => r.vendorPattern && r.profileKey && r.active),
      engineFlow,
    };

    const hasUsableLaborFamilies = wb.laborFamilies.some(
      (family) => family.active && Number(family.baseMinutesEach) > 0,
    );
    if (wb.categoryProfiles.length === 0 && wb.laborFamilies.length === 0) {
      cachedWorkbook = buildFallbackInstallIntelligenceWorkbook();
    } else if (!hasUsableLaborFamilies) {
      const fallback = buildFallbackInstallIntelligenceWorkbook();
      console.warn(
        '[install-intelligence] LaborFamilies tab missing usable rows; merging bundled labor families.',
      );
      cachedWorkbook = {
        ...wb,
        laborFamilies: fallback.laborFamilies,
        categoryProfiles: wb.categoryProfiles.length > 0 ? wb.categoryProfiles : fallback.categoryProfiles,
        reviewRules: wb.reviewRules.length > 0 ? wb.reviewRules : fallback.reviewRules,
        categoryQuestions:
          wb.categoryQuestions.length > 0 ? wb.categoryQuestions : fallback.categoryQuestions,
        defaultAssumptions:
          wb.defaultAssumptions.length > 0 ? wb.defaultAssumptions : fallback.defaultAssumptions,
      };
    } else {
      cachedWorkbook = wb;
    }
    cacheLoadedAt = now;
    activeWorkbook = cachedWorkbook;
    return cachedWorkbook;
  } catch (err) {
    console.warn('[install-intelligence] Sheets load failed; using bundled fallback', err);
    cachedWorkbook = buildFallbackInstallIntelligenceWorkbook();
    cacheLoadedAt = now;
    activeWorkbook = cachedWorkbook;
    return cachedWorkbook;
  }
}

function workbookOrFallback(): InstallIntelligenceWorkbook {
  return cachedWorkbook ?? buildFallbackInstallIntelligenceWorkbook();
}

export async function getInstallIntelligenceWorkbook(): Promise<InstallIntelligenceWorkbook> {
  return loadInstallIntelligenceWorkbook();
}

export function inferCategoryKey(input: {
  description: string;
  category?: string | null;
  workbook?: InstallIntelligenceWorkbook;
}): string {
  const wb = input.workbook ?? workbookOrFallback();
  const hay = `${input.category || ''} ${input.description || ''}`.toLowerCase();
  for (const profile of wb.categoryProfiles) {
    if (!profile.active) continue;
    const keys = tokenList(profile.matchKeywords);
    if (keys.some((k) => hay.includes(k))) return profile.categoryKey;
  }
  if (/grab\s*bar/.test(hay) || /\bb-?6806\b/.test(hay)) return 'grab_bar';
  if (/baby changing|changing station/.test(hay)) return 'baby_changing';
  if (/partition|stall|compartment/.test(hay)) return 'partition';
  if (/locker/.test(hay)) return 'locker';
  if (/recessed|semi-recessed/.test(hay)) return 'recessed_accessory';
  if (/wall protection|crash rail|corner guard/.test(hay)) return 'wall_protection';
  if (/mirror/.test(hay)) return 'mirror';
  return 'general';
}

export function getCategoryProfile(
  categoryKey: string,
  workbook?: InstallIntelligenceWorkbook,
): CategoryProfileRow | null {
  const wb = workbook ?? workbookOrFallback();
  return wb.categoryProfiles.find((p) => p.categoryKey === categoryKey) ?? null;
}

export function getLaborFamily(
  laborFamily: string,
  workbook?: InstallIntelligenceWorkbook,
): LaborFamilyRow | null {
  const wb = workbook ?? workbookOrFallback();
  return wb.laborFamilies.find((f) => f.laborFamilyKey === laborFamily) ?? null;
}

export function resolveVendorAlias(
  vendorName: string | null | undefined,
  workbook?: InstallIntelligenceWorkbook,
): string | null {
  const raw = String(vendorName || '').trim();
  if (!raw) return null;
  const wb = workbook ?? workbookOrFallback();
  const lower = raw.toLowerCase();
  for (const row of wb.vendorAliases) {
    if (!row.active) continue;
    if (lower === row.alias.toLowerCase() || lower.includes(row.alias.toLowerCase())) {
      return row.canonicalVendor;
    }
  }
  return raw;
}

export function getVendorParserProfile(
  vendorName: string | null | undefined,
  workbook?: InstallIntelligenceWorkbook,
): VendorParserProfileRow | null {
  const canonical = resolveVendorAlias(vendorName, workbook) ?? String(vendorName || '');
  const hay = canonical.toLowerCase();
  if (!hay) return null;
  const wb = workbook ?? workbookOrFallback();
  for (const profile of wb.vendorParserProfiles) {
    if (!profile.active) continue;
    const parts = profile.vendorPattern.split(/[|,;]+/).map((p) => p.trim()).filter(Boolean);
    if (parts.some((p) => hay.includes(p.toLowerCase()))) return profile;
  }
  return null;
}

export function getDefaultAssumptions(
  categoryKey: string,
  laborFamily: string | null | undefined,
  workbook?: InstallIntelligenceWorkbook,
): Record<string, string> {
  const wb = workbook ?? workbookOrFallback();
  const lf = String(laborFamily || '').trim();
  const out: Record<string, string> = {};
  for (const row of wb.defaultAssumptions) {
    if (!row.active) continue;
    if (row.categoryKey && row.categoryKey !== categoryKey) continue;
    if (row.laborFamily && row.laborFamily !== lf) continue;
    if (row.defaultValue) out[row.assumptionKey] = row.defaultValue;
  }
  return out;
}

export function getQuestionsForLine(
  categoryKey: string,
  laborFamily: string | null | undefined,
  workbook?: InstallIntelligenceWorkbook,
): RequiredInstallQuestion[] {
  const wb = workbook ?? workbookOrFallback();
  const lf = String(laborFamily || '').trim();
  const links = wb.categoryQuestions.filter((q) => {
    if (!q.active || q.categoryKey !== categoryKey) return false;
    if (q.laborFamily && q.laborFamily !== lf) return false;
    return true;
  });
  const out: RequiredInstallQuestion[] = [];
  for (const link of links) {
    const def = wb.questionBank.find((q) => q.questionKey === link.questionKey && q.active);
    if (!def) continue;
    out.push({
      questionKey: def.questionKey,
      prompt: def.prompt,
      fieldKey: def.fieldKey,
      required: def.required,
    });
  }
  return out;
}

function mergeAssumptions(
  line: LineFacts,
  project: ProjectAssumptions | undefined,
  defaults: Record<string, string>,
): Record<string, string> {
  const merged: Record<string, string> = { ...defaults };
  if (project?.wallSubstrate) merged.wall_substrate = project.wallSubstrate;
  for (const [k, v] of Object.entries(project || {})) {
    if (k === 'wallSubstrate') continue;
    if (v != null && String(v).trim()) merged[k] = String(v).trim();
  }
  for (const [k, v] of Object.entries(line.assumptions)) {
    if (v != null && String(v).trim()) merged[k] = String(v).trim();
  }
  return merged;
}

export function applyInstallModifiers(
  lineFacts: LineFacts,
  projectAssumptions: ProjectAssumptions | undefined,
  baseMinutes: number,
  workbook?: InstallIntelligenceWorkbook,
): { minutes: number; reviewFlags: string[] } {
  const wb = workbook ?? workbookOrFallback();
  const assumptions = mergeAssumptions(lineFacts, projectAssumptions, {});
  let minutes = baseMinutes;
  const reviewFlags: string[] = [];
  const hay = `${lineFacts.categoryKey} ${lineFacts.laborFamily || ''} ${lineFacts.description}`;

  for (const mod of wb.installModifiers) {
    if (!mod.active) continue;
    if (mod.matchCategoryKeys && !matchesTokenList(lineFacts.categoryKey, mod.matchCategoryKeys)) continue;
    if (mod.matchLaborFamilies && lineFacts.laborFamily && !matchesTokenList(lineFacts.laborFamily, mod.matchLaborFamilies)) {
      continue;
    }
    if (mod.matchAssumptionKey) {
      const val = assumptions[mod.matchAssumptionKey] || '';
      if (mod.matchAssumptionValue) {
        const allowed = tokenList(mod.matchAssumptionValue);
        if (!allowed.some((a) => val.toLowerCase() === a || val.toLowerCase().includes(a))) continue;
      } else if (!val) continue;
    }
    if (mod.matchDescriptionRegex) {
      try {
        if (!new RegExp(mod.matchDescriptionRegex, 'i').test(lineFacts.description)) continue;
      } catch {
        continue;
      }
    }
    if (mod.laborMinutesAdd) minutes += mod.laborMinutesAdd;
    if (mod.laborMultiplier && mod.laborMultiplier !== 1) minutes *= mod.laborMultiplier;
    if (mod.reviewFlag) reviewFlags.push(mod.reviewFlag);
  }

  if (/recessed|semi-recessed/i.test(hay) && !reviewFlags.includes('recessed_install_review')) {
    // description-based recessed detection when sheet row uses regex elsewhere
  }

  return { minutes: Number(minutes.toFixed(2)), reviewFlags: Array.from(new Set(reviewFlags)) };
}

function assumptionTriggersRule(value: string, blockWhen: string): boolean {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return true;
  const blocked = tokenList(blockWhen);
  if (blocked.length === 0) return false;
  return blocked.some((b) => v === b || v.includes(b));
}

export function runReviewRules(
  lineFacts: LineFacts,
  projectAssumptions: ProjectAssumptions | undefined,
  workbook?: InstallIntelligenceWorkbook,
): {
  needsReview: boolean;
  blockAutoPriceLabor: boolean;
  reviewFlags: string[];
  requiredQuestions: RequiredInstallQuestion[];
} {
  const wb = workbook ?? workbookOrFallback();
  const defaults = getDefaultAssumptions(lineFacts.categoryKey, lineFacts.laborFamily, wb);
  const assumptions = mergeAssumptions(lineFacts, projectAssumptions, defaults);
  const reviewFlags: string[] = [];
  let needsReview = false;
  let blockAutoPriceLabor = false;
  const requiredQuestions = getQuestionsForLine(lineFacts.categoryKey, lineFacts.laborFamily, wb);

  for (const rule of wb.reviewRules) {
    if (!rule.active) continue;
    if (rule.matchCategoryKeys && !matchesTokenList(lineFacts.categoryKey, rule.matchCategoryKeys)) continue;
    if (rule.matchLaborFamilies && lineFacts.laborFamily && !matchesTokenList(lineFacts.laborFamily, rule.matchLaborFamilies)) {
      continue;
    }
    const val = assumptions[rule.requiredAssumptionKey] || '';
    if (!assumptionTriggersRule(val, rule.blockWhenMissingOrValues)) continue;
    if (rule.reviewFlag) reviewFlags.push(rule.reviewFlag);
    if (rule.needsReview) needsReview = true;
    if (rule.blockAutoPriceLabor) blockAutoPriceLabor = true;
  }

  for (const q of requiredQuestions) {
    if (!q.required) continue;
    const val = assumptions[q.fieldKey] || '';
    if (!val || val.toLowerCase() === 'unknown') {
      needsReview = true;
      if (q.fieldKey === 'blocking_status') reviewFlags.push('blocking_unknown');
    }
  }

  return {
    needsReview,
    blockAutoPriceLabor,
    reviewFlags: Array.from(new Set(reviewFlags)),
    requiredQuestions,
  };
}

export function getProposalClauses(
  lineFacts: LineFacts,
  projectAssumptions: ProjectAssumptions | undefined,
  reviewFlags: string[],
  workbook?: InstallIntelligenceWorkbook,
): TriggeredProposalClause[] {
  const wb = workbook ?? workbookOrFallback();
  const defaults = getDefaultAssumptions(lineFacts.categoryKey, lineFacts.laborFamily, wb);
  const assumptions = mergeAssumptions(lineFacts, projectAssumptions, defaults);
  const out: TriggeredProposalClause[] = [];

  for (const clause of wb.proposalClauses) {
    if (!clause.active || !clause.clientText) continue;
    if (clause.internalOnly) continue;
    if (clause.triggerCategoryKeys && !matchesTokenList(lineFacts.categoryKey, clause.triggerCategoryKeys)) continue;
    if (clause.triggerLaborFamilies && lineFacts.laborFamily && !matchesTokenList(lineFacts.laborFamily, clause.triggerLaborFamilies)) {
      continue;
    }
    if (clause.triggerAssumptionKey) {
      const val = assumptions[clause.triggerAssumptionKey] || '';
      if (clause.triggerAssumptionValue) {
        const allowed = tokenList(clause.triggerAssumptionValue);
        if (!allowed.some((a) => val.toLowerCase() === a || val.toLowerCase().includes(a))) continue;
      } else if (!val) continue;
    }
    if (clause.triggerReviewFlag && !reviewFlags.includes(clause.triggerReviewFlag)) continue;
    out.push({
      clauseKey: clause.clauseKey,
      clientText: clause.clientText,
      internalOnly: clause.internalOnly,
    });
  }
  return out;
}

export function setActiveInstallIntelligenceWorkbookForTests(wb: InstallIntelligenceWorkbook): void {
  activeWorkbook = wb;
}

export function getActiveInstallIntelligenceWorkbook(): InstallIntelligenceWorkbook {
  return activeWorkbook;
}

/** Preload workbook from Sheets (call once per import batch). */
export async function warmInstallIntelligenceWorkbook(force = false): Promise<InstallIntelligenceWorkbook> {
  activeWorkbook = await loadInstallIntelligenceWorkbook(force);
  return activeWorkbook;
}

/** Full estimator pass for a parsed quote/scope line (sync; uses provided workbook). */
export function resolveInstallIntelligenceFromWorkbook(
  workbook: InstallIntelligenceWorkbook,
  input: {
    lineFacts: LineFacts;
    projectAssumptions?: ProjectAssumptions;
    suppressBrightenLaborForVendorService?: boolean;
  },
): InstallIntelligenceLineResult {
  const wb = workbook;
  const line = input.lineFacts;
  const vendorCanonical = resolveVendorAlias(line.vendorName, wb);
  const vendorParserProfile = getVendorParserProfile(line.vendorName, wb);
  const categoryKey = line.categoryKey || inferCategoryKey({ description: line.description, category: line.category, workbook: wb });
  const profile = getCategoryProfile(categoryKey, wb);
  let laborFamily = line.laborFamily || profile?.defaultLaborFamily || null;
  const defaults = getDefaultAssumptions(categoryKey, laborFamily, wb);
  const assumptions = mergeAssumptions(line, input.projectAssumptions, defaults);

  const vendorServiceRow = line.rowType === 'installation' || line.rowType === 'service';
  const freightRow = line.rowType === 'freight';
  const suppressService = input.suppressBrightenLaborForVendorService ?? true;

  let laborMinutes = 0;
  let laborOrigin: InstallIntelligenceLineResult['laborOrigin'] = null;
  let generatedLaborMinutes: number | null = null;

  const catalogMinutes = Number(line.catalogLaborMinutes || 0);
  const familyRow = laborFamily ? getLaborFamily(laborFamily, wb) : null;
  const familyBase = Number(familyRow?.baseMinutesEach || 0);

  if (freightRow || (vendorServiceRow && suppressService)) {
    laborMinutes = 0;
    laborOrigin = 'source';
  } else if (catalogMinutes > 0) {
    laborMinutes = catalogMinutes;
    laborOrigin = 'catalog';
  } else if (familyBase > 0) {
    laborMinutes = familyBase;
    generatedLaborMinutes = familyBase;
    laborOrigin = 'install_family';
  }

  const modApplied = applyInstallModifiers(
    { ...line, categoryKey, laborFamily, assumptions },
    input.projectAssumptions,
    laborMinutes,
    wb,
  );
  laborMinutes = modApplied.minutes;

  const review = runReviewRules(
    { ...line, categoryKey, laborFamily, assumptions },
    input.projectAssumptions,
    wb,
  );

  const reviewFlags = Array.from(new Set([...modApplied.reviewFlags, ...review.reviewFlags]));
  let needsReview = review.needsReview;
  let blockAutoPrice = review.blockAutoPriceLabor;

  if (needsReview || blockAutoPrice) {
    laborMinutes = 0;
    generatedLaborMinutes = null;
    laborOrigin = laborOrigin === 'catalog' ? null : laborOrigin;
  }

  const proposalClauses = getProposalClauses(
    { ...line, categoryKey, laborFamily, assumptions },
    input.projectAssumptions,
    reviewFlags,
    wb,
  );

  const internalNotes: string[] = [];
  if (vendorCanonical && vendorCanonical !== line.vendorName) {
    internalNotes.push(`Vendor normalized: ${vendorCanonical}`);
  }
  if (vendorParserProfile) {
    internalNotes.push(`Vendor parser profile: ${vendorParserProfile.profileKey}`);
  }
  if (reviewFlags.length) {
    internalNotes.push(`Install review: ${reviewFlags.join(', ')}`);
  }
  for (const clause of wb.proposalClauses) {
    if (!clause.active || !clause.internalOnly) continue;
    if (clause.triggerReviewFlag && reviewFlags.includes(clause.triggerReviewFlag)) {
      internalNotes.push(`Internal clause [${clause.clauseKey}]`);
    }
  }

  return {
    categoryKey,
    laborFamily,
    laborMinutes,
    laborOrigin,
    generatedLaborMinutes,
    blockAutoPriceLabor: blockAutoPrice,
    needsReview,
    reviewFlags,
    requiredQuestions: review.requiredQuestions,
    internalNotes,
    proposalClauses,
    vendorCanonical,
    vendorParserProfileKey: vendorParserProfile?.profileKey ?? null,
  };
}

export async function resolveInstallIntelligenceForLine(input: {
  lineFacts: LineFacts;
  projectAssumptions?: ProjectAssumptions;
  suppressBrightenLaborForVendorService?: boolean;
}): Promise<InstallIntelligenceLineResult> {
  const wb = await loadInstallIntelligenceWorkbook();
  activeWorkbook = wb;
  return resolveInstallIntelligenceFromWorkbook(wb, input);
}
