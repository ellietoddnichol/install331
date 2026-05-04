import type { CatalogItem } from '../../../types.ts';
import type { CatalogMatchCandidate, IntakeCatalogMatch, NormalizedIntakeItem } from '../../../shared/types/intake.ts';
import { intakeAsText, normalizeComparableText } from '../metadataExtractorService.ts';
import { prepareCatalogMatch } from '../intakeCatalogMatching.ts';
import { interpretTakeoffHeader, normalizeTakeoffHeader } from './headerInterpreter.ts';

/** Ranked alternatives returned per header — scoring still runs over the full catalog. */
export const MAX_CATALOG_MATCH_CANDIDATES = 30;

function clamp(value: number): number {
  return Number(Math.max(0, Math.min(1, value)).toFixed(2));
}

function normalizeCode(value: unknown): string {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function isModelFamilyMatch(parsedTokens: string[], item: CatalogItem): boolean {
  const itemModel = normalizeCode(item.model);
  const itemSku = normalizeCode(item.sku);
  return parsedTokens.some((token) => {
    const normalizedToken = normalizeCode(token);
    if (normalizedToken.length < 4) return false;
    return Boolean(
      (itemModel && (normalizedToken.startsWith(itemModel) || itemModel.startsWith(normalizedToken))) ||
      (itemSku && (normalizedToken.startsWith(itemSku) || itemSku.startsWith(normalizedToken)))
    );
  });
}

function tokenize(value: unknown): string[] {
  return normalizeComparableText(value).split(/\s+/).filter(Boolean);
}

function extractDimensionsFromCatalog(item: CatalogItem): number[] {
  const text = `${item.sku} ${item.description} ${item.model || ''} ${item.modelNumber || ''}`;
  const output: number[] = [];
  text.match(/\b\d{2}(?:x\d{2})?\b/gi)?.forEach((token) => {
    token.split('x').forEach((part) => {
      const value = Number(part);
      if (Number.isFinite(value)) output.push(value);
    });
  });
  return Array.from(new Set(output));
}

function extractCatalogFamilies(item: CatalogItem): string[] {
  const searchText = normalizeComparableText(buildSearchText(item));
  const families: string[] = [];
  const explicitFamily = normalizeComparableText(item.family || '');
  if (explicitFamily) families.push(explicitFamily);
  if (searchText.includes('grab bar')) families.push('grab bar');
  if (searchText.includes('coat hook')) families.push('coat hook');
  if (searchText.includes('sanitary napkin vendor')) families.push('sanitary napkin vendor');
  if (searchText.includes('sanitary napkin disposal')) families.push('sanitary napkin disposal');
  if (searchText.includes('toilet tissue dispenser')) families.push('toilet tissue dispenser');
  if (searchText.includes('soap dispenser')) families.push('soap dispenser');
  if (searchText.includes('hand dryer')) families.push('hand dryer');
  if (searchText.includes('shower curtain')) families.push('shower curtain');
  if (searchText.includes('shower curtain rod')) families.push('shower curtain rod');
  if (searchText.includes('shower curtain hook')) families.push('shower curtain hooks');
  if (searchText.includes('folding shower seat') || searchText.includes('fold down shower seat')) families.push('folding shower seat');
  if (searchText.includes('mirror')) families.push('mirror');
  if (searchText.includes('toilet partition') || searchText.includes('partition compartment')) families.push('toilet partition');
  if (searchText.includes('urinal screen')) families.push('urinal screen');
  if (searchText.includes('pilaster')) families.push('pilaster');
  if (searchText.includes('partition hardware')) families.push('partition hardware');
  if (searchText.includes('hdpe')) families.push('hdpe');
  if (searchText.includes('phenolic')) families.push('phenolic');
  if (searchText.includes('stainless steel') || /\bstainless\b/.test(searchText)) families.push('stainless');
  if (searchText.includes('powder coat')) families.push('powder coated');
  if (searchText.includes('overhead braced')) families.push('overhead braced');
  if (searchText.includes('floor mounted')) families.push('floor mounted');
  if (searchText.includes('ceiling hung')) families.push('ceiling hung');
  return Array.from(new Set(families));
}

function buildSearchText(item: CatalogItem): string {
  return [
    item.sku,
    item.description,
    item.category,
    item.subcategory,
    item.family,
    item.manufacturer,
    item.brand,
    item.model,
    item.modelNumber,
    item.series,
    item.notes,
    ...(item.tags || []),
  ].filter(Boolean).join(' ');
}

/** Matrix-style shorthand (GB 36, CH B212) — family gating applies. Long Excel descriptions use full-text scoring. */
function isNarrowMatrixShorthand(rawHeader: string): boolean {
  const t = intakeAsText(rawHeader);
  if (!t || t.length > 96) return false;
  const tokens = normalizeComparableText(t).split(/\s+/).filter(Boolean);
  return tokens.length <= 12;
}

/**
 * When the matrix-style scorer finds nothing, score every catalog row on lexical overlap + description containment.
 * Matches full spreadsheet lines against your full catalog (SKU, mfr, model, tags, etc. in buildSearchText).
 */
function lexicalCatalogCandidates(rawHeader: string, catalogItems: CatalogItem[]): CatalogMatchCandidate[] {
  const normalized = normalizeTakeoffHeader(rawHeader);
  if (normalized.length < 8) return [];
  const queryTokens = tokenize(normalized);
  if (queryTokens.length < 2) return [];

  const candidates: CatalogMatchCandidate[] = [];

  for (const item of catalogItems) {
    const itemTokens = tokenize(buildSearchText(item));
    const ov = overlap(queryTokens, itemTokens);
    const normDesc = normalizeComparableText(item.description).slice(0, 240);
    const sub =
      normalized.length >= 10 &&
      (normDesc.includes(normalized) ||
        normalized.includes(normDesc.slice(0, Math.min(140, normDesc.length))));

    let score = 0.1;
    if (sub) score += 0.52;
    score += 0.44 * Math.min(1, ov);
    if (score < 0.2) continue;

    const reasons: string[] = [];
    if (sub) reasons.push('Catalog description aligns with takeoff line text');
    if (ov > 0.12) reasons.push(`Token overlap with catalog fields (${Math.round(ov * 100)}%)`);

    candidates.push(
      toCandidate(
        item,
        Math.min(0.92, score),
        'fuzzy',
        reasons,
        {
          parsedFamily: null,
          parsedModelTokens: [],
          parsedDimensions: [],
          familyOnly: false,
          catalogCoverageGap: false,
        }
      )
    );
  }

  return candidates
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, MAX_CATALOG_MATCH_CANDIDATES);
}

function overlap(left: string[], right: string[]): number {
  if (!left.length || !right.length) return 0;
  const rightSet = new Set(right);
  const shared = left.filter((token) => rightSet.has(token)).length;
  return shared ? shared / Math.max(left.length, right.length) : 0;
}

function toCandidate(
  item: CatalogItem,
  confidence: number,
  matchMethod: CatalogMatchCandidate['matchMethod'],
  reasons: string[],
  metadata: {
    parsedFamily: string | null;
    parsedModelTokens: string[];
    parsedDimensions: number[];
    familyOnly: boolean;
    catalogCoverageGap: boolean;
  }
): CatalogMatchCandidate {
  return {
    catalogItemId: item.id,
    matchedName: item.description,
    description: item.description,
    sku: item.sku,
    category: item.category,
    unit: item.uom,
    manufacturer: item.manufacturer || null,
    model: item.model || null,
    materialCost: item.baseMaterialCost,
    laborMinutes: item.baseLaborMinutes,
    matchMethod,
    confidence: clamp(confidence),
    reasons,
    parsedFamily: metadata.parsedFamily,
    parsedModelTokens: metadata.parsedModelTokens,
    parsedDimensions: metadata.parsedDimensions,
    familyOnly: metadata.familyOnly,
    catalogCoverageGap: metadata.catalogCoverageGap,
  };
}

function mergePrepareCatalogMatch(
  rawHeader: string,
  interpretation: ReturnType<typeof interpretTakeoffHeader>,
  merged: CatalogMatchCandidate[],
  catalogItems: CatalogItem[]
): CatalogMatchCandidate[] {
  if (!catalogItems.length) return merged;
  const prep = prepareCatalogMatch(
    {
      description: rawHeader,
      itemName: rawHeader,
      category: interpretation.categoryHint || '',
      notes: '',
    },
    catalogItems
  );
  const prepMatch = prep.catalogMatch || prep.suggestedMatch;
  if (!prepMatch?.catalogItemId) return merged;

  const byId = new Map<string, CatalogMatchCandidate>();
  for (const c of merged) {
    if (c.catalogItemId) byId.set(c.catalogItemId, c);
  }

  const base = typeof prepMatch.score === 'number' ? prepMatch.score : 0.45;
  const tierBoost = prepMatch.confidence === 'strong' ? 0.06 : prepMatch.confidence === 'possible' ? 0.03 : 0;
  const pc: CatalogMatchCandidate = {
    catalogItemId: prepMatch.catalogItemId,
    matchedName: prepMatch.description,
    description: prepMatch.description,
    sku: prepMatch.sku,
    category: prepMatch.category,
    unit: prepMatch.unit,
    manufacturer: null,
    model: null,
    materialCost: prepMatch.materialCost,
    laborMinutes: prepMatch.laborMinutes,
    matchMethod: 'fuzzy',
    confidence: clamp(Math.min(0.9, base + tierBoost)),
    reasons: [`Intake catalog match: ${prepMatch.reason}`],
    parsedFamily: interpretation.parsedFamily,
    parsedModelTokens: interpretation.modelTokens,
    parsedDimensions: interpretation.dimensions.inches || [],
    familyOnly: false,
    catalogCoverageGap: false,
  };

  const prev = byId.get(pc.catalogItemId);
  if (!prev || pc.confidence > prev.confidence) {
    byId.set(pc.catalogItemId, pc);
  }

  return Array.from(byId.values())
    .sort((left, right) => right.confidence - left.confidence || Number(Boolean(right.catalogCoverageGap)) - Number(Boolean(left.catalogCoverageGap)))
    .slice(0, MAX_CATALOG_MATCH_CANDIDATES);
}

function buildCoverageGapCandidate(rawHeader: string, input: {
  parsedFamily: string | null;
  parsedModelTokens: string[];
  parsedDimensions: number[];
  familyOnly?: boolean;
  reason: string;
}): CatalogMatchCandidate {
  return {
    matchMethod: 'unmatched',
    confidence: 0,
    reasons: [input.reason],
    parsedFamily: input.parsedFamily,
    parsedModelTokens: input.parsedModelTokens,
    parsedDimensions: input.parsedDimensions,
    familyOnly: Boolean(input.familyOnly),
    catalogCoverageGap: true,
  };
}

export function matchMatrixHeaderToCatalog(rawHeader: string, catalogItems: CatalogItem[]): CatalogMatchCandidate[] {
  const interpretation = interpretTakeoffHeader(rawHeader);
  const narrowShorthand = isNarrowMatrixShorthand(rawHeader);
  const minScoreToInclude =
    interpretation.normalizedSearchText.length > 72 ? 0.18 : narrowShorthand ? 0.28 : 0.22;
  const rawCode = normalizeCode(rawHeader);
  const expandedTokens = interpretation.expandedTokens;
  const rawTokens = tokenize(rawHeader);
  const requestedDimensions = interpretation.dimensions.inches || [];
  const parsedFamily = interpretation.parsedFamily;
  const parsedModelTokens = interpretation.modelTokens;
  const candidates: CatalogMatchCandidate[] = [];
  const familyCandidates: CatalogItem[] = parsedFamily
    ? catalogItems.filter((item) => extractCatalogFamilies(item).includes(parsedFamily))
    : [];
  const exactModelInFamily = familyCandidates.some((item) => {
    const normalizedModel = normalizeCode(item.model);
    const normalizedSku = normalizeCode(item.sku);
    const normalizedModelNum = normalizeCode(item.modelNumber);
    return parsedModelTokens.some((token) => {
      const normalizedToken = normalizeCode(token);
      return (
        Boolean(normalizedToken) &&
        (normalizedToken === normalizedModel ||
          normalizedToken === normalizedSku ||
          Boolean(normalizedModelNum && normalizedToken === normalizedModelNum))
      );
    });
  });

  catalogItems.forEach((item) => {
    const reasons: string[] = [];
    const itemSearchText = buildSearchText(item);
    const normalizedItemSearchText = normalizeComparableText(itemSearchText);
    const itemTokens = tokenize(itemSearchText);
    const itemModel = normalizeCode(item.model);
    const itemSku = normalizeCode(item.sku);
    const itemModelNumber = normalizeCode(item.modelNumber);
    const itemFamilies = extractCatalogFamilies(item);
    const modelExact = rawCode && (rawCode === itemModel || rawCode === itemSku || (itemModelNumber && rawCode === itemModelNumber));
    const modelTokenMatch = interpretation.modelTokens.some((token) => {
      const normalized = normalizeCode(token);
      return (
        Boolean(normalized) &&
        (normalized === itemModel || normalized === itemSku || Boolean(itemModelNumber && normalized === itemModelNumber))
      );
    });
    const modelFamilyMatch = isModelFamilyMatch(parsedModelTokens, item) && !modelTokenMatch;
    const tokenOverlap = overlap(expandedTokens, itemTokens);
    const rawOverlap = overlap(rawTokens, itemTokens);
    const categoryMatch = interpretation.categoryHint && normalizeComparableText(item.category).includes(normalizeComparableText(interpretation.categoryHint)) ? 1 : 0;
    const familyAliasMatch = parsedFamily ? Number(itemFamilies.includes(parsedFamily)) : 0;
    const itemDimensions = extractDimensionsFromCatalog(item);
    const dimensionMatches = requestedDimensions.filter((dimension) => itemDimensions.includes(dimension));
    const dimensionScore = requestedDimensions.length ? dimensionMatches.length / requestedDimensions.length : 0;
    const exactPhrase = normalizeComparableText(item.description).includes(interpretation.normalizedSearchText) || interpretation.normalizedSearchText.includes(normalizeComparableText(item.description));
    const twoWallGrabBarHint = interpretation.normalizedSearchText.includes('two wall')
      && interpretation.expandedTokens.includes('grab')
      && interpretation.expandedTokens.includes('bar')
      && normalizedItemSearchText.includes('two wall')
      && normalizedItemSearchText.includes('grab bar');
    const accessoryMatch = interpretation.accessoryTokens.some((token) => normalizedItemSearchText.includes(normalizeComparableText(token)));
    const familyOnly = Boolean(familyAliasMatch || modelFamilyMatch) && !modelExact && !modelTokenMatch;
    const coverageGapPenalty = familyOnly && parsedModelTokens.length > 0 && !exactModelInFamily ? 0.1 : 0;
    const unrelatedFamilyPenalty =
      narrowShorthand && parsedFamily && !familyAliasMatch && !modelFamilyMatch && !categoryMatch ? 0.32 : 0;

    let score = 0;
    if (modelExact) {
      score += 0.64;
      reasons.push('Exact model or SKU match');
    } else if (modelTokenMatch) {
      score += 0.44;
      reasons.push('Model token aligned with catalog item');
    }
    if (modelFamilyMatch) {
      score += 0.18;
      reasons.push('Manufacturer/model family aligned with the catalog item');
    }
    if (familyAliasMatch) {
      score += 0.28;
      reasons.push('Takeoff family alias matched catalog item family');
    }
    if (categoryMatch) {
      score += 0.12;
      reasons.push('Category inferred from shorthand');
    }
    if (dimensionScore > 0) {
      score += 0.18 * dimensionScore;
      reasons.push(`Dimension match (${dimensionMatches.join(', ')} inch)`);
    }
    if (exactPhrase) {
      score += 0.18;
      reasons.push('Exact phrase overlap with catalog text');
    }
    if (twoWallGrabBarHint) {
      score += 0.24;
      reasons.push('Two-wall grab bar shorthand matched catalog phrasing');
    }
    if (accessoryMatch) {
      score += 0.14;
      reasons.push('Accessory or modifier clue matched catalog text');
    }
    if (tokenOverlap > 0) {
      score += 0.32 * tokenOverlap;
      reasons.push('Alias and token overlap with catalog text');
    }
    if (rawOverlap > 0) {
      score += 0.12 * rawOverlap;
    }
    if (coverageGapPenalty > 0) {
      score -= coverageGapPenalty;
      reasons.push('Catalog family exists, but the exact takeoff model appears missing from coverage');
    }
    if (unrelatedFamilyPenalty > 0) {
      score -= unrelatedFamilyPenalty;
    }

    score = Math.max(0, score);

    const method: CatalogMatchCandidate['matchMethod'] = modelExact
      ? 'exact'
      : modelTokenMatch
        ? 'model'
        : familyOnly
          ? 'alias'
        : dimensionScore > 0.99 && tokenOverlap > 0.25
          ? 'dimension'
          : tokenOverlap > 0.4
            ? 'alias'
            : score >= 0.3
              ? 'fuzzy'
              : 'unmatched';

    if (score >= minScoreToInclude || familyOnly) {
      const boundedScore = familyOnly && !modelExact && !modelTokenMatch
        ? Math.min(Math.max(score, 0.46), 0.74)
        : score;
      if (narrowShorthand && parsedFamily && boundedScore < 0.28 && !familyOnly) {
        return;
      }
      candidates.push(toCandidate(item, boundedScore, method, reasons, {
        parsedFamily,
        parsedModelTokens,
        parsedDimensions: requestedDimensions,
        familyOnly,
        catalogCoverageGap: familyOnly && parsedModelTokens.length > 0 && !exactModelInFamily,
      }));
    }
  });

  if (!candidates.length) {
    const lexical = lexicalCatalogCandidates(rawHeader, catalogItems);
    if (lexical.length) {
      return mergePrepareCatalogMatch(rawHeader, interpretation, lexical, catalogItems);
    }
    if (parsedFamily) {
      return mergePrepareCatalogMatch(rawHeader, interpretation, [buildCoverageGapCandidate(rawHeader, {
        parsedFamily,
        parsedModelTokens,
        parsedDimensions: requestedDimensions,
        reason: parsedModelTokens.length > 0
          ? `No catalog candidate found for ${parsedFamily} with model ${parsedModelTokens.join(', ')}. Catalog coverage may be missing.`
          : `No catalog candidate found for inferred family ${parsedFamily}. Catalog coverage may be missing.`,
      })], catalogItems);
    }
    return mergePrepareCatalogMatch(rawHeader, interpretation, [buildCoverageGapCandidate(rawHeader, {
      parsedFamily: null,
      parsedModelTokens,
      parsedDimensions: requestedDimensions,
      reason: `No catalog candidate found for header "${rawHeader}".`,
    })], catalogItems);
  }

  let merged = candidates
    .sort((left, right) => right.confidence - left.confidence || Number(Boolean(right.catalogCoverageGap)) - Number(Boolean(left.catalogCoverageGap)))
    .slice(0, MAX_CATALOG_MATCH_CANDIDATES);

  const bestConf = merged[0]?.confidence ?? 0;
  if (bestConf < 0.42 && catalogItems.length > 0) {
    const lexical = lexicalCatalogCandidates(rawHeader, catalogItems);
    const byId = new Map<string, CatalogMatchCandidate>();
    for (const c of merged) {
      if (c.catalogItemId) byId.set(c.catalogItemId, c);
    }
    for (const c of lexical) {
      if (!c.catalogItemId) continue;
      const prev = byId.get(c.catalogItemId);
      if (!prev || c.confidence > prev.confidence) {
        byId.set(c.catalogItemId, c);
      }
    }
    merged = Array.from(byId.values())
      .sort((left, right) => right.confidence - left.confidence || Number(Boolean(right.catalogCoverageGap)) - Number(Boolean(left.catalogCoverageGap)))
      .slice(0, MAX_CATALOG_MATCH_CANDIDATES);
  }

  merged = mergePrepareCatalogMatch(rawHeader, interpretation, merged, catalogItems);
  return merged;
}

export function candidateToIntakeCatalogMatch(candidate: CatalogMatchCandidate | null | undefined): IntakeCatalogMatch | null {
  if (!candidate.catalogItemId || !candidate.sku || !candidate.description || !candidate.category || !candidate.unit) return null;
  return {
    catalogItemId: candidate.catalogItemId,
    sku: candidate.sku,
    description: candidate.description,
    category: candidate.category,
    unit: candidate.unit,
    materialCost: Number(candidate.materialCost || 0),
    laborMinutes: Number(candidate.laborMinutes || 0),
    score: candidate.confidence,
    confidence: candidate.confidence >= 0.75 ? 'strong' : candidate.confidence >= 0.4 ? 'possible' : 'none',
    reason: candidate.reasons.join('; '),
  };
}

export function enrichItemsWithCatalogMatches(items: NormalizedIntakeItem[], catalogItems: CatalogItem[]): NormalizedIntakeItem[] {
  return items.map((item) => {
    const rawHeader = item.rawHeader || item.description;
    if (!rawHeader) return item;

    const interpretation = interpretTakeoffHeader(rawHeader);
    const catalogMatchCandidates = matchMatrixHeaderToCatalog(rawHeader, catalogItems);
    const bestCandidate = catalogMatchCandidates[0];
    const reviewRequired = !bestCandidate || bestCandidate.matchMethod === 'unmatched' || bestCandidate.confidence < 0.75 || Boolean(bestCandidate.familyOnly);
    const confidenceAdjustment = !bestCandidate || bestCandidate.matchMethod === 'unmatched'
      ? -0.1
      : bestCandidate.confidence >= 0.85
        ? 0.12
        : bestCandidate.confidence >= 0.65
          ? 0.05
          : -0.02;

    return {
      ...item,
      category: item.category || bestCandidate?.category || interpretation.categoryHint || null,
      unit: item.unit || bestCandidate?.unit || null,
      manufacturer: item.manufacturer || bestCandidate?.manufacturer || null,
      model: item.model || bestCandidate?.model || item.model || null,
      confidence: clamp(item.confidence + confidenceAdjustment),
      rawHeader,
      normalizedSearchText: interpretation.normalizedSearchText,
      parsedTokens: interpretation.parsedTokens,
      catalogMatchCandidates,
      reviewRequired,
    };
  });
}