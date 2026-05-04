import type { CatalogItem } from '../../types.ts';
import type { IntakeCatalogAutoApplyMode, ModifierRecord } from '../../shared/types/estimator.ts';
import type {
  IntakeAiLineClassification,
  IntakeAiSuggestions,
  IntakeCatalogMatch,
  IntakeEstimateDraft,
  IntakeLineEstimateSuggestion,
  IntakeMatchConfidence,
  IntakeReviewLine,
  IntakeScopeBucket,
} from '../../shared/types/intake.ts';
import {
  catalogMatchScoreToIntake,
  listCatalogMatchScores,
  type CatalogMatchInput,
  type CatalogMatchScore,
} from './intakeCatalogMatching.ts';
import { intakeAsText } from './metadataExtractorService.ts';
import { getEstimatorDb } from '../db/connection.ts';
import { getIntakeReviewOverridesForMatcherLines } from '../repos/intakeReviewOverridesRepo.ts';

const TOP_N = 3;
const MFR_BOOST = 0.04;
const CAT_BOOST = 0.022;

function normRoom(value: unknown): string {
  return intakeAsText(value) || 'General';
}

function tokenKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2)
    .join(' ')
    .trim();
}

function extractRoomConsistencySignals(
  lines: IntakeReviewLine[],
  catalogById: Map<string, CatalogItem>
): { manufacturerCounts: Map<string, Map<string, number>>; categoryCounts: Map<string, Map<string, number>> } {
  const manufacturerCounts = new Map<string, Map<string, number>>();
  const categoryCounts = new Map<string, Map<string, number>>();

  for (const line of lines) {
    const room = normRoom(line.roomName);
    const cm = line.catalogMatch;
    if (!cm || cm.confidence !== 'strong') continue;
    const item = catalogById.get(cm.catalogItemId);
    if (!item) continue;

    const mfr = tokenKey(item.manufacturer || '');
    if (mfr) {
      const map = manufacturerCounts.get(room) || new Map();
      map.set(mfr, (map.get(mfr) || 0) + 1);
      manufacturerCounts.set(room, map);
    }

    const cat = tokenKey(item.category || '');
    if (cat) {
      const map2 = categoryCounts.get(room) || new Map();
      map2.set(cat, (map2.get(cat) || 0) + 1);
      categoryCounts.set(room, map2);
    }
  }

  return { manufacturerCounts, categoryCounts };
}

function keysWithMinCount(countMap: Map<string, number>, min: number): Set<string> {
  return new Set([...countMap.entries()].filter(([, c]) => c >= min).map(([k]) => k));
}

/** Item / description text only (no room) — used to drop OCR fragments like "nd" from priced review. */
function primaryScopeTextCore(line: IntakeReviewLine): string {
  const parts = [line.itemCode, line.itemName, line.description]
    .map((s) => String(s || '').trim())
    .filter(Boolean);
  if (parts.length === 0) return '';
  const lowerKeys = parts.map((p) => p.toLowerCase());
  if (new Set(lowerKeys).size === 1) {
    return parts[0];
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/** True when item code alone looks like a real SKU/model token (not a 1–2 char OCR scrap). */
function looksLikeStructuredItemCode(code: string): boolean {
  const c = String(code || '').trim();
  if (c.length >= 4) return true;
  return /^[A-Za-z]{1,3}-?\d{2,}/.test(c) || /\d{3,}/.test(c);
}

function findLineClassification(
  line: IntakeReviewLine,
  lineIndex: number,
  ai?: IntakeAiSuggestions | null
): IntakeAiLineClassification | undefined {
  const list = ai?.lineClassifications;
  if (!list?.length) return undefined;
  const exact = list.find((c) => c.lineIndex === lineIndex);
  if (exact) return exact;
  const d = (line.description || line.itemName || '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!d) return undefined;
  let best: IntakeAiLineClassification | undefined;
  let bestLen = 0;
  for (const c of list) {
    const p = c.descriptionPreview.replace(/\s+/g, ' ').trim().toLowerCase();
    if (!p) continue;
    const head = Math.min(24, p.length, d.length);
    if (head < 4) continue;
    if (d.includes(p.slice(0, head)) || p.includes(d.slice(0, head))) {
      if (p.length > bestLen) {
        bestLen = p.length;
        best = c;
      }
    }
  }
  return best;
}

function mapScopeBucket(cls: IntakeAiLineClassification | undefined, line: IntakeReviewLine): IntakeScopeBucket {
  const text = `${line.description} ${line.notes}`.toLowerCase();
  const blob = `${line.itemCode} ${line.itemName} ${line.description} ${line.notes} ${line.sourceReference}`.toLowerCase();

  // OCR / cell splits often yield 1–2 character "lines" that still fuzzy-match catalog items; keep them out of
  // priced review (and avoid ignore-persistence churn when room vs. field assignment changes the content key).
  const core = primaryScopeTextCore(line);
  if (core.length > 0 && core.length < 3 && !looksLikeStructuredItemCode(String(line.itemCode || ''))) {
    return 'informational_only';
  }

  const looksLikeAdminOrMetadata =
    /\b(addendum|addenda|addendums?)\b/.test(blob) ||
    (/\b(quantity|qty)\b/.test(blob) && /\b(material|labor|unit|uom|description|price)\b/.test(blob)) ||
    /\b(source reference|source:|document:|doc:|page\s*\d+|chunk\s*\d+|sheet\s*\d+|row\s*\d+)\b/.test(blob) ||
    /^\s*(addend(a|um|ums)|addendum|addenda)\s*[:\-]/i.test(String(line.description || line.itemName || '')) ||
    /^\s*(quantity|qty)\s*[:\-]/i.test(String(line.description || line.itemName || ''));
  if (looksLikeAdminOrMetadata && !/\b(grab bar|partition|locker|cabinet|mirror|dispenser|rail|door)\b/.test(blob)) {
    return 'informational_only';
  }
  if (line.semanticTags?.some((t) => /excluded|by.?others|ofci|\bnic\b/i.test(String(t).toLowerCase()))) {
    return 'excluded_by_others';
  }
  if (/\b(alt\.?|alternate|deduct|credit)\b/i.test(text)) return 'deduction_alternate';
  if (/\b(exclude|excluded|by others|b\/o|nic|ofci)\b/i.test(text)) return 'excluded_by_others';
  if (/\ballowance\b/i.test(text)) return 'allowance';

  if (cls) {
    const blob = `${cls.documentLineKind} ${cls.pricingRole} ${cls.scopeTarget} ${cls.costDriver}`.toLowerCase();
    if (/\b(excluded|by others|ofci|nic|informational|note only|header)\b/.test(blob) && !/\b(bid|price|qty)\b/.test(blob)) {
      return 'informational_only';
    }
    if (/\b(alternate|deduct|credit)\b/.test(blob)) return 'deduction_alternate';
    if (/\b(exclude|by others)\b/.test(blob)) return 'excluded_by_others';
    if (/\ballowance\b/.test(blob)) return 'allowance';
    if (/\b(modifier|line condition|field condition|finish)\b/.test(blob)) return 'line_condition';
    if (/\b(project|mobil|site[- ]wide|global)\b/.test(blob)) return 'project_condition';
    if (/\b(base|fixture|material|labor|unit)\b/.test(blob)) return 'priced_base_scope';
  }

  if (line.matchStatus !== 'needs_match') return 'priced_base_scope';
  return 'unknown';
}

function matchModifierIds(haystack: string, modifiers: ModifierRecord[]): string[] {
  const t = tokenKey(haystack);
  if (!t) return [];
  return modifiers
    .filter((m) => {
      const n = tokenKey(m.name);
      const k = tokenKey(m.modifierKey || '');
      return (n.length > 2 && t.includes(n)) || (k.length > 2 && t.includes(k));
    })
    .map((m) => m.id);
}

function matchProjectModifierIdsFromHints(hints: { phrase: string }[], modifiers: ModifierRecord[]): string[] {
  const ids = new Set<string>();
  for (const h of hints) {
    for (const id of matchModifierIds(h.phrase, modifiers)) ids.add(id);
  }
  return [...ids];
}

function confidenceFromScore(score: number): IntakeMatchConfidence {
  if (score >= 0.8) return 'strong';
  if (score >= 0.5) return 'possible';
  return 'none';
}

function normalizeComparable(value: unknown): string {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function extractSkuLikeTokens(text: string): string[] {
  const raw = String(text || '');
  const out = new Set<string>();
  raw
    .split(/[\s,;|/()]+/g)
    .map((t) => t.trim())
    .filter(Boolean)
    .forEach((t) => {
      const cleaned = t.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
      if (!cleaned) return;
      const hasDigit = /\d/.test(cleaned);
      if (hasDigit && cleaned.length >= 4 && cleaned.length <= 24) out.add(cleaned);
    });
  return Array.from(out);
}

function findStrongAliasCatalogItemId(input: CatalogMatchInput): { catalogItemId: string; aliasType: string; aliasValue: string } | null {
  const text = normalizeComparable([input.itemCode, input.itemName, input.description, input.notes].filter(Boolean).join(' '));
  const skuTokens = extractSkuLikeTokens([input.itemCode, input.description].filter(Boolean).join(' '));

  const db = getEstimatorDb();

  for (const token of skuTokens) {
    const row = db
      .prepare(
        `SELECT catalog_item_id, alias_type, alias_value
         FROM catalog_item_aliases
         WHERE lower(alias_value) = lower(?)
           AND alias_type IN ('legacy_sku', 'vendor_sku')
         LIMIT 1`
      )
      .get(token) as { catalog_item_id: string; alias_type: string; alias_value: string } | undefined;
    if (row?.catalog_item_id) return { catalogItemId: row.catalog_item_id, aliasType: row.alias_type, aliasValue: row.alias_value };
  }

  if (text.length >= 8) {
    const phraseRows = db
      .prepare(
        `SELECT catalog_item_id, alias_type, alias_value
         FROM catalog_item_aliases
         WHERE alias_type IN ('parser_phrase', 'search_key', 'generic_name')
           AND length(trim(alias_value)) >= 6
         LIMIT 5000`
      )
      .all() as Array<{ catalog_item_id: string; alias_type: string; alias_value: string }>;
    for (const r of phraseRows) {
      const phrase = normalizeComparable(r.alias_value);
      if (!phrase) continue;
      if (text.includes(phrase)) return { catalogItemId: r.catalog_item_id, aliasType: r.alias_type, aliasValue: r.alias_value };
    }
  }

  return null;
}

function inferExplicitAttributesForItem(params: {
  catalogItemId: string;
  lineText: string;
}): Array<{ attributeType: 'finish' | 'coating' | 'grip' | 'mounting' | 'assembly'; attributeValue: string; reason: string }> | null {
  const t = String(params.lineText || '').toLowerCase();
  const wanted: Array<{ attributeType: any; attributeValue: string; reason: string }> = [];
  const push = (attributeType: any, attributeValue: string, reason: string) => wanted.push({ attributeType, attributeValue, reason });

  if (t.includes('matte black')) push('finish', 'MATTE_BLACK', 'Explicit phrase: matte black');
  else if (/\bblack\b/.test(t)) push('finish', 'MATTE_BLACK', 'Explicit phrase: black');
  if (t.includes('antimicrobial') || t.includes('anti-microbial')) push('coating', 'ANTIMICROBIAL', 'Explicit phrase: antimicrobial');
  if (t.includes('peened') || /\bpeen(ed)?\b/.test(t)) push('grip', 'PEENED', 'Explicit phrase: peened');
  if (t.includes('semi-recess')) push('mounting', 'SEMI_RECESSED', 'Explicit phrase: semi-recessed');
  else if (t.includes('recessed')) push('mounting', 'RECESSED', 'Explicit phrase: recessed');
  if (t.includes('surface mount') || /\bsurface\b/.test(t)) push('mounting', 'SURFACE', 'Explicit phrase: surface');
  if (/\bkd\b/.test(t) || t.includes('knock down') || t.includes('knock-down')) push('assembly', 'KD', 'Explicit phrase: KD/knock down');

  if (wanted.length === 0) return null;

  const active = getEstimatorDb()
    .prepare(
      `SELECT attribute_type, attribute_value
       FROM catalog_item_attributes
       WHERE catalog_item_id = ? AND active = 1`
    )
    .all(params.catalogItemId) as Array<{ attribute_type: string; attribute_value: string }>;
  const allow = new Set(active.map((r) => `${String(r.attribute_type)}:${String(r.attribute_value)}`));

  const out = wanted.filter((w) => allow.has(`${w.attributeType}:${w.attributeValue}`));
  return out.length ? (out as any) : null;
}

function applyCrossLineBoost(
  ranked: CatalogMatchScore[],
  room: string,
  manufacturerCounts: Map<string, Map<string, number>>,
  categoryCounts: Map<string, Map<string, number>>
): CatalogMatchScore[] {
  const mfrConsistent = keysWithMinCount(manufacturerCounts.get(room) || new Map(), 2);
  const catConsistent = keysWithMinCount(categoryCounts.get(room) || new Map(), 2);

  return ranked.map((s) => {
    let delta = 0;
    const signals: string[] = [];
    const mfrK = tokenKey(s.item.manufacturer || '');
    if (mfrK && mfrConsistent.has(mfrK)) {
      delta += MFR_BOOST;
      signals.push('room_manufacturer_consistency');
    }
    const catK = tokenKey(s.item.category || '');
    if (catK && catConsistent.has(catK)) {
      delta += CAT_BOOST;
      signals.push('room_category_consistency');
    }
    if (delta <= 0) return s;
    const newScore = Math.min(1, s.score + delta);
    const confidence = confidenceFromScore(newScore);
    const reason = `${s.reason}; Cross-line consistency (+${delta.toFixed(3)})`;
    return { ...s, score: newScore, confidence, reason };
  });
}

export function buildIntakeEstimateDraft(params: {
  reviewLines: IntakeReviewLine[];
  catalog: CatalogItem[];
  modifiers: ModifierRecord[];
  aiSuggestions?: IntakeAiSuggestions | null;
  intakeAutomation?: { mode: IntakeCatalogAutoApplyMode; tierAMinScore: number };
}): IntakeEstimateDraft | undefined {
  const { reviewLines, catalog, modifiers, aiSuggestions, intakeAutomation } = params;
  const autoMode = intakeAutomation?.mode ?? 'off';
  if (!catalog.length) return undefined;

  const catalogById = new Map(catalog.map((c) => [c.id, c]));
  const { manufacturerCounts, categoryCounts } = extractRoomConsistencySignals(reviewLines, catalogById);
  const projectModIds = matchProjectModifierIdsFromHints(aiSuggestions?.suggestedProjectModifierHints ?? [], modifiers);

  const rawLineSuggestions: IntakeLineEstimateSuggestion[] = reviewLines.map((line, lineIndex) => {
    const room = normRoom(line.roomName);
    const input: CatalogMatchInput = {
      itemCode: line.itemCode,
      itemName: line.itemName,
      description: line.description,
      category: line.category,
      notes: line.notes,
      unit: line.unit,
    };

    const rankedBase = listCatalogMatchScores(input, catalog, { minScore: 0.28 });
    const boosted = applyCrossLineBoost(rankedBase, room, manufacturerCounts, categoryCounts).sort((a, b) => b.score - a.score);
    let topCatalogMatches: IntakeCatalogMatch[] = boosted.slice(0, TOP_N).map(catalogMatchScoreToIntake);

    const aliasHit = findStrongAliasCatalogItemId(input);
    if (aliasHit) {
      const item = catalogById.get(aliasHit.catalogItemId);
      if (item) {
        const strong: IntakeCatalogMatch = {
          catalogItemId: item.id,
          sku: item.sku,
          description: item.description,
          category: item.category,
          unit: item.uom,
          materialCost: item.baseMaterialCost,
          laborMinutes: item.baseLaborMinutes,
          score: 1,
          confidence: 'strong' as const,
          reason: `Alias match (${aliasHit.aliasType}: ${aliasHit.aliasValue})`,
        };
        topCatalogMatches = [strong, ...topCatalogMatches.filter((c) => c.catalogItemId !== strong.catalogItemId)].slice(0, TOP_N);
      }
    }

    const cls = findLineClassification(line, lineIndex, aiSuggestions);
    const scopeBucket = mapScopeBucket(cls, line);

    const lineText = `${line.description} ${line.notes} ${line.itemName}`;
    const lineModIds = matchModifierIds(lineText, modifiers);

    const suggestedCatalogItemId =
      line.catalogMatch?.catalogItemId ?? line.suggestedMatch?.catalogItemId ?? topCatalogMatches[0]?.catalogItemId ?? null;

    if (
      suggestedCatalogItemId &&
      !topCatalogMatches.some((c) => c.catalogItemId === suggestedCatalogItemId)
    ) {
      const primary =
        line.catalogMatch?.catalogItemId === suggestedCatalogItemId
          ? line.catalogMatch
          : line.suggestedMatch?.catalogItemId === suggestedCatalogItemId
            ? line.suggestedMatch
            : null;
      if (primary) {
        topCatalogMatches = [primary, ...topCatalogMatches.filter((c) => c.catalogItemId !== primary.catalogItemId)].slice(
          0,
          TOP_N
        );
      } else {
        const item = catalogById.get(suggestedCatalogItemId);
        if (item) {
          topCatalogMatches = [
            {
              catalogItemId: item.id,
              sku: item.sku,
              description: item.description,
              category: item.category,
              unit: item.uom,
              materialCost: item.baseMaterialCost,
              laborMinutes: item.baseLaborMinutes,
              score: 1,
              confidence: 'strong' as const,
              reason: 'Primary pick from intake line match',
            },
            ...topCatalogMatches,
          ].slice(0, TOP_N);
        }
      }
    }

    const tier = line.catalogAutoApplyTier;
    const preAcceptedTierA =
      (autoMode === 'preselect_only' || autoMode === 'auto_link_tier_a') && tier === 'A' && Boolean(line.catalogMatch);

    let pricingPreview: IntakeLineEstimateSuggestion['pricingPreview'] = null;
    let laborOrigin: IntakeLineEstimateSuggestion['laborOrigin'] = null;
    if (scopeBucket === 'priced_base_scope' && suggestedCatalogItemId) {
      const item = catalogById.get(suggestedCatalogItemId);
      if (item) {
        const catalogLabor = item.baseLaborMinutes ?? 0;
        const fallback = line.installFamilyFallback;
        const useFallback = (!catalogLabor || catalogLabor <= 0) && line.isInstallableScope && fallback;
        pricingPreview = {
          materialEach: item.baseMaterialCost,
          laborMinutesEach: useFallback ? fallback!.minutes : catalogLabor,
          qty: line.quantity,
          laborFromInstallFamily: Boolean(useFallback),
          installFamilyKey: useFallback ? fallback!.key : item.installLaborFamily ?? null,
          materialOrigin: 'catalog',
        };
        laborOrigin = useFallback ? 'install_family' : catalogLabor > 0 ? 'catalog' : null;
      }
    } else if (
      line.isInstallableScope &&
      line.installFamilyFallback &&
      scopeBucket !== 'excluded_by_others' &&
      scopeBucket !== 'informational_only'
    ) {
      // Even if the row isn't classified as `priced_base_scope` (e.g. no catalog match yet and
      // no AI classifier signal), an installable-scope line with a fallback family should still
      // surface generated labor minutes so the review UI and finalize path see them.
      pricingPreview = {
        materialEach: 0,
        laborMinutesEach: line.installFamilyFallback.minutes,
        qty: line.quantity,
        laborFromInstallFamily: true,
        installFamilyKey: line.installFamilyFallback.key,
        materialOrigin: null,
      };
      laborOrigin = 'install_family';
    }

    const marketingNotes: string[] = [];
    if (scopeBucket === 'excluded_by_others') marketingNotes.push('Excluded / by-others bucket — confirm before pricing.');
    if (scopeBucket === 'deduction_alternate') marketingNotes.push('Alternate or deduction — confirm bid basis.');
    if (scopeBucket === 'allowance') marketingNotes.push('Allowance line — verify against contract allowance.');
    if (scopeBucket === 'informational_only') marketingNotes.push('Informational / non-priced — verify scope.');

    const matcherSignals: string[] = [];
    if (boosted[0]?.reason.includes('Cross-line consistency')) {
      matcherSignals.push('cross_line_top_candidate');
    }
    if (aliasHit && topCatalogMatches[0]?.catalogItemId === aliasHit.catalogItemId) {
      matcherSignals.push(`alias_match:${aliasHit.aliasType}`);
    }

    const inferredAttrsRaw =
      suggestedCatalogItemId
        ? inferExplicitAttributesForItem({
            catalogItemId: suggestedCatalogItemId,
            lineText: `${line.itemCode || ''} ${line.itemName || ''} ${line.description || ''} ${line.notes || ''}`,
          })
        : null;
    const inferredCatalogAttributeSnapshot =
      inferredAttrsRaw && inferredAttrsRaw.length
        ? inferredAttrsRaw.map((a) => ({ attributeType: a.attributeType, attributeValue: a.attributeValue, source: 'inferred' as const, reason: a.reason }))
        : null;
    if (inferredCatalogAttributeSnapshot && inferredCatalogAttributeSnapshot.length) {
      matcherSignals.push('explicit_attribute_inference');
    }

    const baseStatus =
      scopeBucket === 'informational_only'
        ? ('ignored' as const)
        : preAcceptedTierA
          ? ('accepted' as const)
          : ('suggested' as const);

    return {
      reviewLineFingerprint: line.reviewLineFingerprint,
      reviewLineContentKey: line.reviewLineContentKey,
      lineId: line.lineId,
      scopeBucket,
      applicationStatus: baseStatus,
      catalogAutoApplyTier: tier,
      topCatalogCandidates: topCatalogMatches,
      suggestedCatalogItemId,
      suggestedLineModifierIds: lineModIds,
      suggestedProjectModifierIds: projectModIds,
      matcherSignals,
      marketingNotes,
      pricingPreview,
      laborOrigin,
      sourceManufacturer: line.sourceManufacturer ?? null,
      sourceBidBucket: line.sourceBidBucket ?? null,
      sourceSectionHeader: line.sourceSectionHeader ?? null,
      isInstallableScope: line.isInstallableScope ?? null,
      installScopeType: line.installScopeType ?? null,
      inferredCatalogAttributeSnapshot,
    };
  });

  const overrideMap = getIntakeReviewOverridesForMatcherLines(
    rawLineSuggestions.map((s) => ({
      reviewLineFingerprint: s.reviewLineFingerprint,
      reviewLineContentKey: s.reviewLineContentKey,
    }))
  );
  const lineSuggestions = rawLineSuggestions.map((s) => {
    const ov = overrideMap.get(s.reviewLineFingerprint);
    if (!ov || ov.status !== 'ignored') return s;
    return {
      ...s,
      applicationStatus: 'ignored' as const,
      suggestedCatalogItemId: null,
      topCatalogCandidates: [],
      matcherSignals: Array.from(new Set([...(s.matcherSignals || []), 'review_override:ignored'])),
      marketingNotes: Array.from(
        new Set([...(s.marketingNotes || []), 'Ignored by estimator — kept suppressed unless the line materially changes.'])
      ),
      pricingPreview: null,
      laborOrigin: null,
    };
  });

  const suggestedJobConditionsPatch = (aiSuggestions?.suggestedProjectModifierHints ?? []).map((h, index) => ({
    id: `jc-ai-${index}`,
    label: h.phrase,
    suggestedState: true,
    reason: h.rationale || undefined,
    applicationStatus: 'suggested' as const,
  }));

  return {
    version: 1,
    readonly: true,
    generatedAt: new Date().toISOString(),
    lineSuggestions,
    projectSuggestion: {
      applicationStatus: 'suggested',
      suggestedProjectModifierIds: projectModIds,
      marketingNotes: [],
      suggestedJobConditionsPatch,
    },
  };
}
