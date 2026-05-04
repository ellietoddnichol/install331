/**
 * Semantic classification for intake lines: modifiers vs scope items, field assembly cues, etc.
 * Used by spreadsheet/PDF deterministic paths, validator re-classification, and Gemini post-processing.
 */
import type { NormalizedIntakeItem } from '../../../shared/types/intake.ts';
import { normalizeComparableText } from '../metadataExtractorService.ts';

export type ParsedLineKind = 'item' | 'modifier' | 'bundle';

export interface IntakeLineSemantics {
  kind: ParsedLineKind;
  semanticTags: string[];
  /** When kind === 'modifier', text fragments to store on the line */
  modifierPhrases: string[];
  parserNotes: string[];
}

/** Product / scope nouns — assembly phrases on these lines describe install, not a separate "modifier" SKU row. */
const PRODUCT_SCOPE_RE =
  /\b(lockers?|bench(?:es)?|partition|partitions|shelving|storage|cabinet|cabinets|wardrobe|cart|carts|cubicle|toilet|urinal|lav|sink|fountain|mirror|grab\s*bar|dispenser|dryer|mat|blinds?|signs?|display|boards?|rack|cooler|hood|lockset|door|frames?|hand\s*dryer|paper\s*towel|soap|shower|bathtub|locker\s*room)\b/i;

const ASSEMBLY_LABOR_CUE =
  /\b(assembled|assembly|assemble|field\s*assembl|knock[-\s]?down|\bkd\b|\brta\b|ship(?:ped)?\s+knock|requires?\s+assembly|need(?:s)?\s+assembled|to\s+be\s+assembled|some\s+assembly|assembly\s+required|install\s+only|installer\s+assemble)\b/i;

const BUNDLE_CUE = /\b(bundle|package|set\s+of\s+accessories|accessory\s+package)\b/i;

/** Strong standalone modifier / adder lines (finish, deduct, extra labor, etc.) */
const MODIFIER_FINISH_ADD =
  /\b(finish\s+add|powder\s*coat|add\s+.*\s*finish|wet\s*spray|plated\s+finish|pvd|ano(dized)?)\b/i;
const MODIFIER_SCOPE_ADDER =
  /\b(security\s*screws|tamper\s*screws|add\s*on|adder|upgrade\s+kit|anchor\s+kit|hardware\s+kit|bracket\s+kit|extra\s+labor|extra\s+material|per\s+opening\s+add|per\s+door\s+add|per\s+unit\s+add)\b/i;
const MODIFIER_ALT_DEDUCT =
  /\b(deduct\s+alternate|add\s+alternate|alternate\s+add|no\s+deduct|credit\s+for|omit\s+|delete\s+from\s+scope)\b/i;

/**
 * True when the line should be treated as a catalog modifier row (adder / finish / deduct),
 * not when assembly language is tied to a product scope line.
 */
export function shouldTreatAsStandaloneModifier(text: string, notes?: string): boolean {
  const s = analyzeIntakeLineSemantics(text, { notes });
  return s.kind === 'modifier';
}

/**
 * Validator hook: legacy regex expanded — respects field-assembly product lines.
 */
export function looksLikeModifierLine(description: string): boolean {
  return shouldTreatAsStandaloneModifier(description);
}

function kindFromBundle(text: string): boolean {
  return BUNDLE_CUE.test(normalizeComparableText(text) || text);
}

/**
 * Full semantic analysis for one line (description + optional notes from spreadsheet).
 */
export function analyzeIntakeLineSemantics(text: string, hints?: { category?: string | null; notes?: string }): IntakeLineSemantics {
  const combined = [text, hints?.notes || '', hints?.category || ''].filter(Boolean).join(' \n ');
  const normalized = normalizeComparableText(combined) || combined;
  const lower = combined.toLowerCase();

  const tags: string[] = [];
  const parserNotes: string[] = [];
  const modifierPhrases: string[] = [];

  if (kindFromBundle(combined)) {
    return { kind: 'bundle', semanticTags: ['bundle'], modifierPhrases: [], parserNotes: [] };
  }

  const productHit = PRODUCT_SCOPE_RE.test(combined);
  const assemblyHit = ASSEMBLY_LABOR_CUE.test(combined);

  if (productHit && assemblyHit) {
    tags.push('field_assembly');
    parserNotes.push(
      'Parser: field assembly / on-site assembly called out — verify labor minutes vs catalog baseline (KD/RTA often needs extra time).'
    );
    return {
      kind: 'item',
      semanticTags: tags,
      modifierPhrases: [],
      parserNotes,
    };
  }

  const modifierFinish = MODIFIER_FINISH_ADD.test(lower);
  const modifierAdder = MODIFIER_SCOPE_ADDER.test(lower);
  const modifierAlt = MODIFIER_ALT_DEDUCT.test(lower);
  const startsAsScopeAdder = /^(add|deduct|credit|omit|delete|alternate|alt\.)\b/i.test(combined.trim());
  const compactLen = combined.replace(/\s+/g, ' ').trim().length;

  if (modifierFinish || modifierAdder || modifierAlt) {
    const treatAsModifier =
      !productHit ||
      startsAsScopeAdder ||
      (compactLen < 72 && !assemblyHit);

    if (treatAsModifier) {
      if (modifierFinish) tags.push('finish_modifier');
      if (modifierAdder) tags.push('scope_adder');
      if (modifierAlt) tags.push('alternate_or_deduct');
      const phrase = text.trim();
      if (phrase) modifierPhrases.push(phrase);
      parserNotes.push('Parser: classified as scope modifier / adder (review if this should roll into a parent line).');
      return {
        kind: 'modifier',
        semanticTags: tags,
        modifierPhrases,
        parserNotes,
      };
    }
  }

  /** "Add upgrade for ..." / "Deduct alt" — not "Add 6 EA ..." quantity lines */
  const startsScopeInstruction =
    /^(add|deduct|credit|omit|delete|alternate|alt\.)\b/i.test(combined.trim()) && !/^add\s+\d/i.test(combined.trim());
  if (
    startsScopeInstruction &&
    compactLen < 220 &&
    /(upgrade|finish|powder|coat|deduct|alternate|security|extra\s+labor|extra\s+material|stainless|chrome|plated|ano(dized)?)/i.test(combined)
  ) {
    modifierPhrases.push(text.trim());
    return {
      kind: 'modifier',
      semanticTags: ['scope_add_instruction'],
      modifierPhrases,
      parserNotes: ['Parser: add/deduct line with finish or upgrade language — treated as modifier / alternate scope.'],
    };
  }

  // Legacy narrow patterns (backward compatible)
  if (/(finish add|powder coat|add .* finish|security screws|add on|adder|upgrade)/.test(normalized) && !productHit) {
    modifierPhrases.push(text.trim());
    return {
      kind: 'modifier',
      semanticTags: ['legacy_modifier_pattern'],
      modifierPhrases,
      parserNotes: ['Parser: modifier keyword match (no product scope noun).'],
    };
  }

  if (productHit && /(upgrade|finish)\b/i.test(combined) && !assemblyHit) {
    tags.push('possible_finish_upgrade');
    parserNotes.push('Parser: possible finish or upgrade variant — confirm whether labor/material should differ from base catalog item.');
  }

  return {
    kind: 'item',
    semanticTags: tags,
    modifierPhrases: [],
    parserNotes,
  };
}

/** Map semantic kind to legacy itemType string used in NormalizedIntakeItem */
export function itemTypeFromSemantics(kind: ParsedLineKind): string {
  if (kind === 'modifier') return 'modifier';
  if (kind === 'bundle') return 'bundle';
  return 'item';
}

/**
 * Apply semantic classification to a normalized upload row (spreadsheet/PDF router).
 */
export function applyIntakeSemanticsToItem(item: NormalizedIntakeItem): void {
  const sem = analyzeIntakeLineSemantics(item.description, {
    category: item.category,
    notes: item.notes.join(' '),
  });
  item.itemType = itemTypeFromSemantics(sem.kind);
  if (sem.semanticTags.length) {
    item.semanticTags = Array.from(new Set([...(item.semanticTags || []), ...sem.semanticTags]));
  }
  for (const n of sem.parserNotes) {
    if (!item.notes.includes(n)) item.notes.push(n);
  }
  if (sem.kind === 'modifier') {
    const phrases = sem.modifierPhrases.length ? sem.modifierPhrases : [item.description.trim()].filter(Boolean);
    item.modifiers = Array.from(new Set([...(item.modifiers || []), ...phrases]));
  }
}

/** Enrich Gemini / pipeline lines (string notes) with the same semantics. */
export function enrichIntakeServiceLineNotes(input: {
  description: string;
  itemName: string;
  category: string;
  notes: string;
  fieldAssemblyHint?: boolean;
}): { semanticTags: string[]; notes: string } {
  const sem = analyzeIntakeLineSemantics(`${input.itemName} ${input.description}`, {
    notes: input.notes,
    category: input.category,
  });
  const tags = new Set(sem.semanticTags);
  if (input.fieldAssemblyHint) tags.add('field_assembly');
  const noteParts = [input.notes, ...sem.parserNotes].filter(Boolean);
  return {
    semanticTags: Array.from(tags),
    notes: noteParts.join(' | '),
  };
}
