import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../../');
const RULES_JSON = path.join(REPO_ROOT, 'data', 'div10-bid-reasoning', 'div10_crew_suggestion_rules.json');

export interface Div10CrewSizingInput {
  identityLower: string;
  /** First resolved install_family from labor map (display + primary key). */
  primaryInstallFamily?: string;
  /** All install_family values from object + semantic hits. */
  allInstallFamilies: string[];
  installObjectIds: string[];
  normalizedIntents: string[];
  /** crew_bump_signals from labor map only (not document disclaimer labels). */
  laborMapCrewSignals: string[];
}

export interface Div10CrewSizingResult {
  install_family?: string;
  install_family_display_name?: string;
  default_crew: number;
  recommended_crew: number;
  crew_bump_factor_ids: string[];
  /** Human-readable bump labels (unique). */
  crew_bump_factor_labels: string[];
  reasoning: string;
}

interface FamilyRow {
  display_name?: string;
  default_crew?: number;
  rationale?: string;
}

interface TriggerRow {
  id?: string;
  crew_delta?: number;
  label?: string;
  line_patterns?: string[];
}

interface LineFamilyInference {
  install_family?: string;
  patterns?: string[];
}

interface ComboWhen {
  /** Every id must appear in merged install line ids (object_id + normalized_intent). */
  all_install_ids?: string[];
  any_normalized_intent?: string[];
  any_line_patterns?: string[];
  all_install_families?: string[];
}

interface ComboTrigger {
  id?: string;
  crew_delta?: number;
  label?: string;
  when?: ComboWhen;
}

interface CrewSuggestionRulesFile {
  schema_version?: string;
  max_recommended_crew?: number;
  families?: Record<string, FamilyRow>;
  triggers?: TriggerRow[];
  line_family_inference?: LineFamilyInference[];
  combo_triggers?: ComboTrigger[];
  signal_to_trigger?: Record<string, string>;
}

let cached: CrewSuggestionRulesFile | null = null;

function readRules(): CrewSuggestionRulesFile | null {
  if (cached) return cached;
  try {
    if (!fs.existsSync(RULES_JSON)) return null;
    cached = JSON.parse(fs.readFileSync(RULES_JSON, 'utf8')) as CrewSuggestionRulesFile;
    return cached;
  } catch {
    return null;
  }
}

function uniq<T>(xs: T[]): T[] {
  return Array.from(new Set(xs.filter(Boolean)));
}

function matchAnyPattern(haystack: string, patterns: string[] | undefined): boolean {
  if (!patterns?.length) return false;
  for (const p of patterns) {
    if (!p) continue;
    try {
      const re = new RegExp(p, 'i');
      if (re.test(haystack)) return true;
    } catch {
      if (haystack.includes(p.toLowerCase())) return true;
    }
  }
  return false;
}

function inferFamiliesFromLine(rules: CrewSuggestionRulesFile, identityLower: string): string[] {
  const out: string[] = [];
  for (const row of rules.line_family_inference || []) {
    const fam = String(row.install_family || '').trim();
    if (!fam) continue;
    if (matchAnyPattern(identityLower, row.patterns)) out.push(fam);
  }
  return uniq(out);
}

function collectLineTriggerIds(rules: CrewSuggestionRulesFile, identityLower: string): string[] {
  const ids: string[] = [];
  for (const t of rules.triggers || []) {
    const id = String(t.id || '').trim();
    if (!id || !matchAnyPattern(identityLower, t.line_patterns)) continue;
    ids.push(id);
  }
  return ids;
}

function mapSignalsToTriggers(rules: CrewSuggestionRulesFile, signals: string[]): string[] {
  const map = rules.signal_to_trigger || {};
  const ids: string[] = [];
  for (const s of signals) {
    const key = String(s || '').trim();
    if (!key) continue;
    const tid = map[key];
    if (tid) ids.push(tid);
  }
  return ids;
}

function comboFires(
  combo: ComboTrigger,
  ctx: {
    identityLower: string;
    installObjectIds: string[];
    normalizedIntents: string[];
    allInstallFamilies: Set<string>;
  }
): boolean {
  const w = combo.when;
  if (!w) return false;

  if (w.all_install_ids?.length) {
    for (const id of w.all_install_ids) {
      if (!ctx.installObjectIds.includes(id)) return false;
    }
  }

  const needsIntent = Boolean(w.any_normalized_intent?.length);
  const needsLine = Boolean(w.any_line_patterns?.length);
  if (needsIntent || needsLine) {
    const intentOk = needsIntent
      ? w.any_normalized_intent!.some((i) => ctx.normalizedIntents.includes(i))
      : false;
    const lineOk = needsLine ? matchAnyPattern(ctx.identityLower, w.any_line_patterns) : false;
    if (needsIntent && needsLine) {
      if (!intentOk && !lineOk) return false;
    } else if (needsIntent && !intentOk) return false;
    else if (needsLine && !lineOk) return false;
  }

  if (w.all_install_families?.length) {
    for (const f of w.all_install_families) {
      if (!ctx.allInstallFamilies.has(f)) return false;
    }
  }
  return true;
}

function triggerDeltaMap(rules: CrewSuggestionRulesFile): Map<string, { delta: number; label: string }> {
  const m = new Map<string, { delta: number; label: string }>();
  for (const t of rules.triggers || []) {
    const id = String(t.id || '').trim();
    if (!id) continue;
    m.set(id, { delta: Math.max(0, Number(t.crew_delta) || 0), label: String(t.label || id) });
  }
  for (const c of rules.combo_triggers || []) {
    const id = String(c.id || '').trim();
    if (!id) continue;
    m.set(id, { delta: Math.max(0, Number(c.crew_delta) || 0), label: String(c.label || id) });
  }
  return m;
}

/**
 * Crew sizing from install family defaults + line patterns + labor-map signals + combo rules.
 * Quantity is intentionally ignored.
 */
export function computeDiv10CrewSizing(input: Div10CrewSizingInput): Div10CrewSizingResult | null {
  const rules = readRules();
  if (!rules?.families || !rules.triggers) return null;

  const identityLower = String(input.identityLower || '').toLowerCase();
  const families = rules.families;
  const maxCrew = Math.min(8, Math.max(1, Number(rules.max_recommended_crew) || 4));

  let familySet = new Set(input.allInstallFamilies.filter(Boolean));
  const inferred = inferFamiliesFromLine(rules, identityLower);
  if (!familySet.size && inferred.length) {
    familySet = new Set(inferred);
  }

  const primary = String(input.primaryInstallFamily || '').trim();
  if (primary && !familySet.size) familySet.add(primary);
  if (primary && !familySet.has(primary)) familySet.add(primary);

  let defaultCrew = 1;
  let displayName: string | undefined;
  const familyRationales: string[] = [];

  if (familySet.size) {
    let maxDef = 1;
    for (const f of familySet) {
      const row = families[f];
      const d = Math.max(1, Math.min(4, Number(row?.default_crew) || 1));
      if (d > maxDef) maxDef = d;
      if (row?.display_name) displayName = row.display_name;
      if (row?.rationale) familyRationales.push(row.rationale);
    }
    defaultCrew = maxDef;
    if (primary) {
      const prow = families[primary];
      if (prow?.display_name) displayName = prow.display_name;
    }
  }

  const deltaById = triggerDeltaMap(rules);

  const firedIds = new Set<string>();
  for (const id of collectLineTriggerIds(rules, identityLower)) firedIds.add(id);
  for (const id of mapSignalsToTriggers(rules, input.laborMapCrewSignals)) firedIds.add(id);

  const ctxCombo = {
    identityLower,
    installObjectIds: input.installObjectIds,
    normalizedIntents: input.normalizedIntents,
    allInstallFamilies: familySet,
  };

  for (const combo of rules.combo_triggers || []) {
    const id = String(combo.id || '').trim();
    if (!id || !comboFires(combo, ctxCombo)) continue;
    firedIds.add(id);
  }

  let bumpSum = 0;
  const labels: string[] = [];
  for (const id of firedIds) {
    const meta = deltaById.get(id);
    if (!meta || meta.delta <= 0) continue;
    bumpSum += meta.delta;
    labels.push(meta.label);
  }

  const recommended = Math.min(maxCrew, Math.max(1, defaultCrew + bumpSum));

  const reasoningParts: string[] = [];
  if (displayName) {
    reasoningParts.push(`${displayName}: default ${defaultCrew} installer(s).`);
  } else {
    reasoningParts.push(`Default ${defaultCrew} installer(s) (no mapped install family).`);
  }
  if (labels.length) {
    reasoningParts.push(`Bumps (+${bumpSum}): ${uniq(labels).join('; ')}.`);
  } else {
    reasoningParts.push('No crew bump triggers fired on this line text or labor signals.');
  }
  reasoningParts.push(`Recommended crew: ${recommended} (capped at ${maxCrew}; not quantity-driven).`);

  return {
    install_family: primary || (familySet.size === 1 ? [...familySet][0] : undefined),
    install_family_display_name: displayName,
    default_crew: defaultCrew,
    recommended_crew: recommended,
    crew_bump_factor_ids: [...firedIds],
    crew_bump_factor_labels: uniq(labels),
    reasoning: reasoningParts.join(' '),
  };
}
