import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type {
  IntakeExtractionBucket,
  IntakeParserBlockType,
  IntakeProjectAssumption,
  IntakeProposalScopeTypeHint,
  IntakeReasoningConfidenceAdjustments,
  IntakeReasoningEnvelope,
} from '../../../shared/types/intake.ts';
import {
  looksLikeIntakeContactOrNonScopeLine,
  looksLikeIntakePricingSummaryOrDisclaimerLine,
  looksLikeIntakeSectionHeaderOrTitleLine,
} from '../../../shared/utils/intakeTextGuards.ts';
import { computeDiv10CrewSizing } from './div10CrewSuggestionRules.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../../');
const DATA_DIR = path.join(REPO_ROOT, 'data', 'div10-bid-reasoning');
const KNOWLEDGE_JSON = path.join(DATA_DIR, 'div10_bid_reasoning_knowledge.json');
const LABOR_MAP_JSON = path.join(DATA_DIR, 'div10_labor_recipe_map.json');
const CREW_LOGIC_JSON = path.join(DATA_DIR, 'div10_crew_logic.json');
const HIDDEN_RULES_JSON = path.join(DATA_DIR, 'div10_hidden_scope_rules.json');

const PARSER_BLOCK_TYPES = new Set<string>([
  'company_header',
  'proposal_metadata',
  'scope_header',
  'scope_item',
  'scope_option',
  'subtotal',
  'commercial_term',
  'inclusion_note',
  'unknown',
]);

interface Div10BlockType {
  type?: string;
  description?: string;
  parser_action?: string;
}

interface Div10ConstructionSemantic {
  phrase_family?: string;
  normalized_intent?: string;
  meaning?: string;
  implied_operations?: string[];
  risk_flags?: string[];
}

interface Div10Knowledge {
  schema_version?: string;
  document_understanding?: {
    block_types?: Div10BlockType[];
    hard_ignore_patterns?: string[];
    commercial_term_patterns?: string[];
    reasoning_rules?: string[];
  };
  commercial_reasoning?: {
    term_meanings?: Array<{ term?: string; meaning?: string; app_behavior?: string }>;
  };
  self_questions_for_reasoning_engine?: string[];
  construction_semantics?: Div10ConstructionSemantic[];
  install_objects?: Array<{
    object_id?: string;
    category?: string;
    trigger_terms?: string[];
    general_knowledge?: string[];
    hidden_scope?: string[];
    proposal_assumptions_default?: string[];
  }>;
}

interface LaborMapFile {
  by_install_object_id?: Record<
    string,
    { install_family?: string; labor_recipe_ids?: string[]; crew_bump_signals?: string[] }
  >;
  by_normalized_intent?: Record<
    string,
    { install_family?: string; labor_recipe_ids?: string[]; crew_bump_signals?: string[] }
  >;
}

interface CrewLogicFile {
  defaults_by_install_family?: Record<
    string,
    { suggested_crew_size?: number; reasoning?: string }
  >;
  document_bump_factors?: Record<
    string,
    {
      hidden_scope_risk_points?: number;
      line_confidence_penalty?: number;
      scope_completeness_penalty?: number;
      needs_spec_crosscheck?: boolean;
      label?: string;
    }
  >;
}

interface HiddenRulesFile {
  rules?: Array<{
    rule_id?: string;
    trigger_phrases?: string[];
    hidden_scope_tags?: string[];
    assumption_if_not_priced?: string;
  }>;
}

let cachedKnowledge: Div10Knowledge | null = null;
let cachedCommercialPhrases: string[] | null = null;
let cachedLaborMap: LaborMapFile | null = null;
let cachedCrewLogic: CrewLogicFile | null = null;
let cachedHiddenRules: HiddenRulesFile | null = null;

function readJson<T>(file: string): T | null {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

function loadKnowledge(): Div10Knowledge | null {
  if (cachedKnowledge) return cachedKnowledge;
  cachedKnowledge = readJson<Div10Knowledge>(KNOWLEDGE_JSON);
  return cachedKnowledge;
}

function loadLaborMap(): LaborMapFile | null {
  if (cachedLaborMap !== null) return cachedLaborMap;
  cachedLaborMap = readJson<LaborMapFile>(LABOR_MAP_JSON);
  return cachedLaborMap;
}

function loadCrewLogic(): CrewLogicFile | null {
  if (cachedCrewLogic !== null) return cachedCrewLogic;
  cachedCrewLogic = readJson<CrewLogicFile>(CREW_LOGIC_JSON);
  return cachedCrewLogic;
}

function loadHiddenRules(): HiddenRulesFile | null {
  if (cachedHiddenRules !== null) return cachedHiddenRules;
  cachedHiddenRules = readJson<HiddenRulesFile>(HIDDEN_RULES_JSON);
  return cachedHiddenRules;
}

function foldLine(text: string): string {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function buildCommercialPhraseList(doc: Div10Knowledge): string[] {
  const out = new Set<string>();
  const du = doc.document_understanding;
  for (const p of du?.commercial_term_patterns || []) {
    const t = String(p).trim().toUpperCase();
    if (t.length >= 3) out.add(t);
  }
  for (const row of doc.commercial_reasoning?.term_meanings || []) {
    const term = String(row.term || '').trim();
    if (!term) continue;
    const parts = term.split(/\s*\/\s*/);
    for (const part of parts) {
      const u = part.trim().toUpperCase();
      if (u.length >= 3) out.add(u);
    }
  }
  return Array.from(out).sort((a, b) => b.length - a.length);
}

export function getDiv10CommercialPhrasesForMatching(): string[] {
  const doc = loadKnowledge();
  if (!doc) return [];
  if (cachedCommercialPhrases) return cachedCommercialPhrases;
  cachedCommercialPhrases = buildCommercialPhraseList(doc);
  return cachedCommercialPhrases;
}

export function matchesDiv10CommercialOrMetadataLine(text: string): boolean {
  const folded = foldLine(text);
  if (!folded) return false;

  for (const phrase of getDiv10CommercialPhrasesForMatching()) {
    if (folded.includes(phrase)) return true;
  }

  const doc = loadKnowledge();
  const hard = doc?.document_understanding?.hard_ignore_patterns || [];
  if (folded.length <= 140) {
    for (const p of hard) {
      const needle = String(p).trim().toUpperCase();
      if (needle.length >= 2 && folded.includes(needle)) return true;
    }
  }

  return false;
}

export function normalizeGeminiParserBlockType(raw: string | undefined | null): IntakeParserBlockType | undefined {
  const s = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  if (!s) return undefined;
  const snake = s.replace(/([a-z])-([a-z])/g, '$1_$2');
  if (PARSER_BLOCK_TYPES.has(snake)) return snake as IntakeParserBlockType;
  const compact = snake.replace(/_/g, '');
  const alias: Record<string, IntakeParserBlockType> = {
    companyheader: 'company_header',
    proposalmetadata: 'proposal_metadata',
    scopeheader: 'scope_header',
    scopeitem: 'scope_item',
    scopeoption: 'scope_option',
    commercialterm: 'commercial_term',
    inclusionnote: 'inclusion_note',
  };
  if (alias[compact]) return alias[compact];
  return undefined;
}

const SCOPE_HEADER_CUE =
  /\b(bobrick|bradley|hadrian|activar|scranton|asico|gamco|larsen|partition\s+stall|toilet\s+acc|fire\s+ext)/i;
const PROPOSAL_META_CUE = /^(project|proposal\s+date|plans\s+dated|addendum|bid\s+date)\s*:/i;
const QTY_LEAD = /^\d+(?:\.\d+)?\s*(?:ea|lf|sf|set|lot|pr|pair|each)\b/i;
const PRODUCT_CUE =
  /\b(grab\s*bar|locker|partition|mirror|dispenser|cabinet|extinguisher|sign|bench|hook|station|stall|bracket)\b/i;

/**
 * Heuristic parser block type for debugging and for when the model omits parserBlockType.
 */
export function classifyDiv10ParserBlockType(text: string): IntakeParserBlockType {
  const t = String(text || '').trim();
  if (!t) return 'unknown';
  // Div10 commercial/metadata phrases (labor-call-for-quote, site visit, unload, bond, tax, …)
  // overlap generic "call for quote" disclaimers — classify as commercial_term first for debugging.
  if (matchesDiv10CommercialOrMetadataLine(t)) return 'commercial_term';
  if (looksLikeIntakePricingSummaryOrDisclaimerLine(t)) return 'subtotal';
  if (looksLikeIntakeContactOrNonScopeLine(t)) return 'company_header';
  if (PROPOSAL_META_CUE.test(t) || (t.length < 120 && /^project\s*:/i.test(t))) return 'proposal_metadata';
  if (/\b(powder\s*coated|HDPE|solid\s+plastic|alternate)\b/i.test(t) && /\$\s*[\d,]+/.test(t)) return 'scope_option';
  if (looksLikeIntakeSectionHeaderOrTitleLine(t) || (SCOPE_HEADER_CUE.test(t) && !QTY_LEAD.test(t) && t.length < 96)) {
    return 'scope_header';
  }
  if (t.length < 72 && /\b(standard\s+colors|hardware\s*&\s*brackets|included|non\s*rated)\b/i.test(t)) {
    return 'inclusion_note';
  }
  if (QTY_LEAD.test(t) || (PRODUCT_CUE.test(t) && /^\d/.test(t))) return 'scope_item';
  if (PRODUCT_CUE.test(t)) return 'scope_item';
  return 'unknown';
}

const EXTRACTION_BUCKETS = new Set<IntakeExtractionBucket>([
  'scope',
  'commercial_term',
  'alternate',
  'assumption_signal',
  'exclusion',
  'hidden_scope_signal',
  'unknown',
]);

function normalizeExtractionBucket(raw: string | null | undefined): IntakeExtractionBucket | undefined {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return undefined;
  return EXTRACTION_BUCKETS.has(s as IntakeExtractionBucket) ? (s as IntakeExtractionBucket) : undefined;
}

function extractionBucketForParserBlock(bt: IntakeParserBlockType): IntakeExtractionBucket {
  switch (bt) {
    case 'commercial_term':
    case 'subtotal':
      return 'commercial_term';
    case 'scope_option':
      return 'alternate';
    case 'company_header':
    case 'proposal_metadata':
      return 'assumption_signal';
    case 'inclusion_note':
      return 'hidden_scope_signal';
    case 'scope_header':
    case 'scope_item':
      return 'scope';
    default:
      return 'unknown';
  }
}

export function inferDiv10NonScopeMeaning(text: string): IntakeReasoningEnvelope['non_scope_meaning'] | undefined {
  const u = String(text || '').toUpperCase();
  const logistics_flags: string[] = [];
  const commercial_flags: string[] = [];
  let proposal_scope_type: IntakeProposalScopeTypeHint | undefined;

  if (/\bIF\s+LABOR\s+IS\s+NEEDED\b/.test(u) && /\b(?:CALL|QUOTE|PRICE)\b/.test(u)) {
    proposal_scope_type = 'material_only';
    commercial_flags.push('labor_quoted_separately');
  }
  if (/\bJOB\s+SITE\s+VISIT\s*:?\s*NO\b/.test(u) || /\bNO\s+SITE\s+VISIT\b/.test(u)) {
    commercial_flags.push('site_visit_excluded');
  }
  if (/\bCUSTOMER\s+TO\s+(?:RECEIVE|UNLOAD)\b/.test(u) || /\bRECEIVE\s*\/\s*UNLOAD\b/.test(u)) {
    logistics_flags.push('customer_receive_unload');
  }
  if (/\bADD\s+FOR\s+SALES\s+TAX\b/.test(u) || /\bSALES\s+TAX\b/.test(u)) {
    commercial_flags.push('sales_tax_called_out');
  }
  if (/\bBOND\s*:/.test(u) || /\bPERFORMANCE\s+BOND\b/.test(u)) {
    commercial_flags.push('bond_language');
  }
  if (/\bSINGLE\s+SHIPMENT\b/.test(u)) {
    logistics_flags.push('single_shipment_constraint');
  }
  if (/\bBASE\s+BID\s+PER\s+SPECS\b/.test(u)) {
    commercial_flags.push('base_bid_per_specs');
  }

  if (!logistics_flags.length && !commercial_flags.length && !proposal_scope_type) return undefined;
  return { proposal_scope_type, logistics_flags, commercial_flags };
}

export function findDiv10InstallObjectHints(description: string): Array<{
  objectId: string;
  category: string;
  hiddenScope: string[];
  assumptions: string[];
}> {
  const doc = loadKnowledge();
  if (!doc?.install_objects?.length) return [];
  const lower = String(description || '').toLowerCase();
  const hits: Array<{ objectId: string; category: string; hiddenScope: string[]; assumptions: string[] }> = [];
  for (const obj of doc.install_objects) {
    const terms = (obj.trigger_terms || []).map((t) => String(t).toLowerCase());
    if (!terms.some((term) => term && lower.includes(term))) continue;
    hits.push({
      objectId: String(obj.object_id || 'unknown'),
      category: String(obj.category || ''),
      hiddenScope: (obj.hidden_scope || []).map(String),
      assumptions: (obj.proposal_assumptions_default || []).map(String),
    });
  }
  return hits;
}

export function findDiv10ConstructionSemanticsMatches(description: string): Div10ConstructionSemantic[] {
  const doc = loadKnowledge();
  if (!doc?.construction_semantics?.length) return [];
  const lower = String(description || '').toLowerCase();
  const out: Div10ConstructionSemantic[] = [];
  for (const row of doc.construction_semantics) {
    const family = String(row.phrase_family || '').toLowerCase().replace(/\s*\/\s*/g, ' ').trim();
    if (!family) continue;
    if (family.length >= 10 && lower.includes(family)) {
      out.push(row);
      continue;
    }
    const sig = family.split(/\s+/).filter((w) => w.length > 3);
    const matched = sig.filter((w) => lower.includes(w)).length;
    const hit = sig.length >= 2 ? matched >= 2 : sig.length === 1 && matched >= 1;
    if (hit) out.push(row);
  }
  return out;
}

function matchHiddenScopeRules(text: string): string[] {
  const lower = String(text || '').toLowerCase();
  const file = loadHiddenRules();
  const tags = new Set<string>();
  for (const rule of file?.rules || []) {
    const phrases = (rule.trigger_phrases || []).map((p) => p.toLowerCase());
    if (!phrases.some((p) => p && lower.includes(p))) continue;
    for (const t of rule.hidden_scope_tags || []) tags.add(String(t));
  }
  return Array.from(tags);
}

function uniq<T>(xs: T[]): T[] {
  return Array.from(new Set(xs.filter(Boolean)));
}

function computeConfidenceAdjustments(
  identity: string,
  parser_block_type: IntakeParserBlockType
): IntakeReasoningConfidenceAdjustments {
  const u = identity.toUpperCase();
  const crewFile = loadCrewLogic();
  const bumps = crewFile?.document_bump_factors || {};

  let lineConfidencePenalty = 0;
  let scopeCompletenessPenalty = 0;
  let hiddenScopeRiskScore = 0;
  let needsSpecCrosscheck = false;
  const document_bump_labels: string[] = [];

  if (/\bJOB\s+SITE\s+VISIT\s*:?\s*NO\b/.test(u) || /\bNO\s+SITE\s+VISIT\b/.test(u)) {
    const b = bumps.no_site_visit;
    lineConfidencePenalty += b?.line_confidence_penalty ?? 0.08;
    hiddenScopeRiskScore += b?.hidden_scope_risk_points ?? 12;
    document_bump_labels.push(b?.label || 'no_site_visit');
  }
  if (/\bIF\s+LABOR\s+IS\s+NEEDED\b/.test(u) && /\b(?:CALL|QUOTE|PRICE)\b/.test(u)) {
    const b = bumps.labor_call_for_quote;
    lineConfidencePenalty += b?.line_confidence_penalty ?? 0.05;
    scopeCompletenessPenalty += b?.scope_completeness_penalty ?? 0.18;
    document_bump_labels.push(b?.label || 'labor_call_for_quote');
  }
  if (/\bBASE\s+BID\s+PER\s+SPECS\b/.test(u) && identity.trim().length < 48) {
    const b = bumps.base_bid_specs_only_short_line;
    lineConfidencePenalty += b?.line_confidence_penalty ?? 0.05;
    needsSpecCrosscheck = Boolean(b?.needs_spec_crosscheck ?? true);
    document_bump_labels.push(b?.label || 'spec_crosscheck');
  }

  if (parser_block_type === 'scope_item' || parser_block_type === 'unknown') {
    if (/\bsemi[-\s]?recessed\b|\brecessed\s+cabinet\b/i.test(identity) && !/\b(wall|stud|framing|rough|opening)\b/i.test(identity)) {
      const b = bumps.semi_recessed_without_wall_cue;
      hiddenScopeRiskScore += b?.hidden_scope_risk_points ?? 15;
      document_bump_labels.push(b?.label || 'recess_wall_scope_unclear');
    }
  }

  hiddenScopeRiskScore = Math.min(100, hiddenScopeRiskScore);
  return {
    lineConfidencePenalty: Math.min(0.45, lineConfidencePenalty),
    scopeCompletenessPenalty: Math.min(0.5, scopeCompletenessPenalty),
    hiddenScopeRiskScore,
    needsSpecCrosscheck,
    document_bump_labels: document_bump_labels.length ? document_bump_labels : undefined,
  };
}

function buildCrewRecommendationEnvelope(input: {
  identity: string;
  primaryFamily: string | undefined;
  allInstallFamilies: string[];
  installObjectIds: string[];
  normalizedIntents: string[];
  laborMapCrewSignals: string[];
  mergedBumps: string[];
}): IntakeReasoningEnvelope['crew_recommendation'] | undefined {
  const crew = loadCrewLogic();
  const sizing = computeDiv10CrewSizing({
    identityLower: input.identity.toLowerCase(),
    primaryInstallFamily: input.primaryFamily,
    allInstallFamilies: input.allInstallFamilies,
    installObjectIds: input.installObjectIds,
    normalizedIntents: input.normalizedIntents,
    laborMapCrewSignals: input.laborMapCrewSignals,
  });

  const fallback = input.primaryFamily ? crew?.defaults_by_install_family?.[input.primaryFamily] : undefined;
  const bump_factors = uniq([...(sizing?.crew_bump_factor_labels || []), ...input.mergedBumps]);

  if (!sizing && !input.mergedBumps.length && !input.primaryFamily) return undefined;

  const recommended =
    sizing?.recommended_crew ?? sizing?.default_crew ?? fallback?.suggested_crew_size ?? undefined;
  const defaultCrew = sizing?.default_crew ?? fallback?.suggested_crew_size ?? undefined;

  return {
    install_family: sizing?.install_family ?? input.primaryFamily,
    install_family_display_name: sizing?.install_family_display_name,
    default_crew: defaultCrew,
    recommended_crew: recommended,
    suggested_crew_size: recommended,
    bump_factors: bump_factors.length ? bump_factors : undefined,
    crew_bump_factor_ids: sizing?.crew_bump_factor_ids?.length ? sizing.crew_bump_factor_ids : undefined,
    reasoning:
      sizing?.reasoning ||
      fallback?.reasoning ||
      (input.mergedBumps.length
        ? 'Document or labor-map signals present; expand div10_crew_suggestion_rules.json for full sizing.'
        : undefined),
  };
}

export interface BuildIntakeReasoningEnvelopeInput {
  description: string;
  itemName?: string;
  category?: string;
  notes?: string;
  geminiParserBlockType?: string | null;
  geminiExtractionBucket?: string | null;
  geminiRationale?: string | null;
}

export function buildIntakeReasoningEnvelopeForLine(input: BuildIntakeReasoningEnvelopeInput): IntakeReasoningEnvelope {
  const identity = [input.itemName, input.description, input.notes].filter(Boolean).join(' ').trim();
  const localType = classifyDiv10ParserBlockType(identity);
  const geminiNorm = normalizeGeminiParserBlockType(input.geminiParserBlockType || undefined);
  const parser_block_type: IntakeParserBlockType =
    geminiNorm && geminiNorm !== 'unknown' ? geminiNorm : localType;

  const extraction_bucket =
    normalizeExtractionBucket(input.geminiExtractionBucket || undefined) ?? extractionBucketForParserBlock(parser_block_type);

  const installHits = findDiv10InstallObjectHints(identity);
  const semantics = findDiv10ConstructionSemanticsMatches(identity);
  const install_object_ids = uniq([
    ...installHits.map((h) => h.objectId),
    ...semantics.map((s) => String(s.normalized_intent || '').trim()).filter(Boolean),
  ]);

  const install_intelligence_tags = uniq([
    ...semantics.map((s) => String(s.normalized_intent || '').trim()).filter(Boolean),
    ...semantics.flatMap((s) => (s.implied_operations || []).slice(0, 3).map(String)),
  ]);

  const hidden_scope_tags = uniq([
    ...installHits.flatMap((h) => h.hiddenScope),
    ...semantics.flatMap((s) => (s.risk_flags || []).map(String)),
    ...matchHiddenScopeRules(identity),
  ]);

  const laborMap = loadLaborMap();
  const labor_recipe_candidates: string[] = [];
  const laborMapCrewSignals: string[] = [];
  const allInstallFamilies: string[] = [];
  let primaryFamily: string | undefined;
  const normalizedIntents = semantics.map((s) => String(s.normalized_intent || '').trim()).filter(Boolean);

  for (const id of installHits.map((h) => h.objectId)) {
    const row = laborMap?.by_install_object_id?.[id];
    if (row?.labor_recipe_ids) labor_recipe_candidates.push(...row.labor_recipe_ids);
    if (row?.crew_bump_signals) laborMapCrewSignals.push(...row.crew_bump_signals);
    if (row?.install_family) {
      allInstallFamilies.push(row.install_family);
      primaryFamily = primaryFamily || row.install_family;
    }
  }
  for (const sem of semantics) {
    const intent = String(sem.normalized_intent || '').trim();
    if (!intent) continue;
    const row = laborMap?.by_normalized_intent?.[intent];
    if (row?.labor_recipe_ids) labor_recipe_candidates.push(...row.labor_recipe_ids);
    if (row?.crew_bump_signals) laborMapCrewSignals.push(...row.crew_bump_signals);
    if (row?.install_family) {
      allInstallFamilies.push(row.install_family);
      primaryFamily = primaryFamily || row.install_family;
    }
  }

  const doc = loadKnowledge();
  const recommended_questions_internal = (doc?.self_questions_for_reasoning_engine || []).slice(0, 6);

  const inferredNonScope = inferDiv10NonScopeMeaning(identity);
  const non_scope_meaning =
    parser_block_type === 'scope_item' &&
    !inferredNonScope?.proposal_scope_type &&
    !(inferredNonScope?.commercial_flags?.length || inferredNonScope?.logistics_flags?.length)
      ? undefined
      : inferredNonScope;

  const confidence_adjustments = computeConfidenceAdjustments(identity, parser_block_type);
  const mergedBumps = uniq([...laborMapCrewSignals, ...(confidence_adjustments.document_bump_labels || [])]);
  const crew_recommendation = buildCrewRecommendationEnvelope({
    identity,
    primaryFamily,
    allInstallFamilies: uniq(allInstallFamilies),
    installObjectIds: install_object_ids,
    normalizedIntents: uniq(normalizedIntents),
    laborMapCrewSignals: uniq(laborMapCrewSignals),
    mergedBumps,
  });

  const baseConf = 0.92;
  const reasoning_confidence = Math.max(
    0.08,
    Math.min(1, baseConf - confidence_adjustments.lineConfidencePenalty - confidence_adjustments.scopeCompletenessPenalty * 0.25)
  );

  const envelope: IntakeReasoningEnvelope = {
    parser_block_type,
    extraction_bucket,
    install_object_ids: install_object_ids.length ? install_object_ids : undefined,
    install_intelligence_tags: install_intelligence_tags.length ? uniq(install_intelligence_tags) : undefined,
    hidden_scope_tags: hidden_scope_tags.length ? uniq(hidden_scope_tags) : undefined,
    labor_recipe_candidates: labor_recipe_candidates.length ? uniq(labor_recipe_candidates) : undefined,
    recommended_questions_internal: recommended_questions_internal.length ? recommended_questions_internal : undefined,
    crew_bump_signals: mergedBumps.length ? mergedBumps : undefined,
    crew_recommendation,
    reasoning_confidence,
    non_scope_meaning,
    confidence_adjustments,
    classification_rationale: input.geminiRationale?.trim() || undefined,
  };

  return envelope;
}

/** Human-readable note derived from structured envelope (all matching install objects). */
export function formatDiv10ReasoningNote(envelope: IntakeReasoningEnvelope): string | null {
  const parts: string[] = [];
  if (envelope.parser_block_type && envelope.parser_block_type !== 'scope_item') {
    parts.push(`block=${envelope.parser_block_type}`);
  }
  if (envelope.install_object_ids?.length) {
    parts.push(`objects=${envelope.install_object_ids.slice(0, 6).join('+')}`);
  }
  if (envelope.hidden_scope_tags?.length) {
    parts.push(`hidden=${envelope.hidden_scope_tags.slice(0, 4).join('; ')}`);
  }
  if (envelope.labor_recipe_candidates?.length) {
    parts.push(`recipes=${envelope.labor_recipe_candidates.slice(0, 3).join(', ')}`);
  }
  const rec = envelope.crew_recommendation?.recommended_crew ?? envelope.crew_recommendation?.suggested_crew_size;
  if (rec != null) {
    parts.push(`crew=${rec}`);
  }
  if (!parts.length) return null;
  return `Bid reasoning: ${parts.join(' · ')}`;
}

export function appendDiv10InstallHintsToLineNotes(
  description: string,
  notes: string,
  semanticTags: string[]
): { notes: string; semanticTags: string[] } {
  const envelope = buildIntakeReasoningEnvelopeForLine({ description, notes });
  const extra = formatDiv10ReasoningNote(envelope);
  if (!extra) return { notes, semanticTags };
  const nextTags = semanticTags.includes('div10_install_intel') ? semanticTags : [...semanticTags, 'div10_install_intel'];
  return { notes: [notes, extra].filter(Boolean).join(' | '), semanticTags: nextTags };
}

function pushAssumption(
  out: IntakeProjectAssumption[],
  seen: Set<string>,
  kind: IntakeProjectAssumption['kind'],
  text: string,
  confidence: number
) {
  const key = `${kind}:${text.toLowerCase()}`;
  if (seen.has(key)) return;
  seen.add(key);
  out.push({ kind, text, confidence });
}

export function inferBidReasoningAssumptionsFromDocumentText(fullText: string): IntakeProjectAssumption[] {
  const text = String(fullText || '');
  if (!text.trim()) return [];
  const u = text.toUpperCase();
  const out: IntakeProjectAssumption[] = [];
  const seen = new Set<string>();

  if (/\bIF\s+LABOR\s+IS\s+NEEDED\b/.test(u) && /\b(?:CALL|QUOTE|PRICE)\b/.test(u)) {
    pushAssumption(
      out,
      seen,
      'pricing_basis',
      'Document indicates labor may be quoted separately (e.g. call for labor quote); treat as material-forward or verify labor scope.',
      0.72
    );
  }
  if (/\bJOB\s+SITE\s+VISIT\s*:?\s*NO\b/.test(u) || /\bNO\s+SITE\s+VISIT\b/.test(u)) {
    pushAssumption(
      out,
      seen,
      'site_visit',
      'Job site visit excluded or declined; field-verify dimensions, substrate, and layout where risk exists.',
      0.78
    );
  }
  if (/\bCUSTOMER\s+TO\s+(?:RECEIVE|UNLOAD)\b/.test(u) || /\bRECEIVE\s*\/\s*UNLOAD\b/.test(u)) {
    pushAssumption(out, seen, 'delivery', 'Customer responsible for receive/unload; do not assume unload labor unless scope states otherwise.', 0.75);
  }
  if (/\bADD\s+FOR\s+SALES\s+TAX\b/.test(u) || /\bSALES\s+TAX\b/.test(u)) {
    pushAssumption(out, seen, 'tax', 'Sales tax called out; confirm tax handling vs bid total.', 0.65);
  }
  if (/\bBOND\s*:\s*(?:NO|N|YES|Y)\b/.test(u) || /\bPERFORMANCE\s+BOND\b/.test(u) || /\bBID\s+BOND\b/.test(u)) {
    pushAssumption(out, seen, 'bond', 'Bond or bonding language present; confirm allowance and surety requirements.', 0.7);
  }
  if (/\bSINGLE\s+SHIPMENT\b/.test(u) || /\bONE\s+SHIPMENT\b/.test(u)) {
    pushAssumption(out, seen, 'shipment', 'Shipment logistics constraint noted; confirm freight and partial delivery assumptions.', 0.62);
  }
  if (/\bBASE\s+BID\s+PER\s+SPECS\b/.test(u)) {
    pushAssumption(out, seen, 'clarification', 'Base bid per plans/specs language present; scope ties to contract documents—confirm alternates and exclusions.', 0.55);
  }

  return out;
}

export function getDiv10BidReasoningGeminiPromptAddendum(maxChars = 7500): string {
  const doc = loadKnowledge();
  if (!doc?.document_understanding) return '';

  const lines: string[] = [
    '',
    '--- Division 10 bid reasoning (packaged knowledge) ---',
    'For EACH parsedLines row, set parserBlockType to one of: company_header, proposal_metadata, scope_header, scope_item, scope_option, subtotal, commercial_term, inclusion_note, unknown.',
    'Also set extractionBucket per row: scope | commercial_term | alternate | assumption_signal | exclusion | hidden_scope_signal | unknown.',
    'Rows with extractionBucket commercial_term or assumption_signal must NOT appear in parsedLines — instead move meaning to assumptions, exclusions, or proposalAssist; only scope / alternate / hidden_scope_signal product lines belong in parsedLines.',
    'Block types (reference):',
  ];

  for (const bt of doc.document_understanding.block_types || []) {
    const t = String(bt.type || '').trim();
    const a = String(bt.parser_action || '').trim();
    if (t && a) lines.push(`- ${t}: ${a}`);
  }

  lines.push('', 'Reasoning rules:');
  for (const r of doc.document_understanding.reasoning_rules || []) {
    lines.push(`- ${r}`);
  }

  lines.push('', 'Self-check questions:');
  for (const q of doc.self_questions_for_reasoning_engine || []) {
    lines.push(`- ${q}`);
  }

  lines.push('', 'Commercial / non-scope phrases (never parsedLines; use assumptions or metadata):');
  for (const p of getDiv10CommercialPhrasesForMatching().slice(0, 40)) {
    lines.push(`- ${p}`);
  }

  lines.push(
    '',
    'Provide brief rationale per scope line when lineConfidence or hidden-scope risk is material.',
    'Install context: enrich with backing, mounting, recess vs surface, locker bases/fillers — do not invent labor minutes; use structured fields, not only description prose.'
  );

  let body = lines.join('\n');
  if (body.length > maxChars) {
    body = `${body.slice(0, maxChars)}\n…(truncated)`;
  }
  return body;
}
