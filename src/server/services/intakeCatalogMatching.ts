import type { CatalogItem } from '../../types.ts';
import type { IntakeCatalogMatch, IntakeMatchConfidence } from '../../shared/types/intake.ts';

export interface CatalogMatchInput {
  itemCode?: string;
  itemName?: string;
  description?: string;
  category?: string;
  notes?: string;
  unit?: string;
}

export interface CatalogMatchScore {
  item: CatalogItem;
  score: number;
  confidence: IntakeMatchConfidence;
  reason: string;
}

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .map((token) => {
      if (!token) return '';
      if (/^[a-z]+$/.test(token)) {
        if (token.length > 4 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
        if (token.length > 4 && /(ses|xes|zes|ches|shes|oes)$/.test(token)) return token.slice(0, -2);
        if (token.length > 3 && token.endsWith('s') && !/(ss|us|is)$/.test(token)) return token.slice(0, -1);
      }
      return token;
    })
    .filter(Boolean)
    .join(' ')
    .trim();
}

function normalizeCode(value: unknown): string {
  return String(value ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .trim();
}

function extractCodeFamily(value: unknown): string {
  const normalized = String(value ?? '').toUpperCase().trim();
  const matched = normalized.match(/^[A-Z]{1,6}/);
  return matched ? matched[0] : '';
}

function tokenize(value: unknown): string[] {
  const synonyms: Record<string, string[]> = {
    partition: ['compartment', 'stall'],
    compartment: ['partition', 'stall'],
    stall: ['partition', 'compartment'],
    mirror: ['glass'],
    dispenser: ['dispense'],
  };

  const output = new Set<string>();
  normalizeText(value)
    .split(/\s+/)
    .filter((token) => token.length > 1)
    .forEach((token) => {
      output.add(token);
      (synonyms[token] || []).forEach((alias) => output.add(alias));
    });

  return Array.from(output);
}

function overlapScore(left: string[], right: string[]): number {
  if (!left.length || !right.length) return 0;
  const rightSet = new Set(right);
  const shared = left.reduce((count, token) => count + (rightSet.has(token) ? 1 : 0), 0);
  if (!shared) return 0;
  return shared / Math.max(left.length, right.length);
}

function buildCatalogSearchText(item: CatalogItem): string {
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
  ]
    .filter(Boolean)
    .join(' ');
}

function buildReason(parts: string[]): string {
  const filtered = parts.filter(Boolean);
  return filtered.length ? filtered.join('; ') : 'No strong semantic overlap.';
}

export function catalogMatchScoreToIntake(score: CatalogMatchScore): IntakeCatalogMatch {
  return {
    catalogItemId: score.item.id,
    sku: score.item.sku,
    description: score.item.description,
    category: score.item.category,
    unit: score.item.uom,
    materialCost: score.item.baseMaterialCost,
    laborMinutes: score.item.baseLaborMinutes,
    score: Number(score.score.toFixed(3)),
    confidence: score.confidence,
    reason: score.reason,
  };
}

function scoreItemAgainstInput(
  item: CatalogItem,
  input: {
    itemCode: string;
    itemCodeCompact: string;
    itemCodeFamily: string;
    itemName: string;
    description: string;
    category: string;
    notes: string;
    unit: string;
    queryTokens: string[];
    itemNameText: string;
    itemNameTokens: string[];
    descriptionText: string;
    descriptionInputTokens: string[];
  }
): CatalogMatchScore | null {
  const itemSku = normalizeText(item.sku);
  const itemSkuCompact = normalizeCode(item.sku);
  const itemSkuFamily = extractCodeFamily(item.sku);
  const itemDescription = normalizeText(item.description);
  const itemAliases = tokenize(`${(item.tags || []).join(' ')} ${item.notes || ''} ${item.family || ''} ${item.subcategory || ''}`);
  const inputDescription = normalizeText(input.description || input.itemName);
  const descriptionTokens = tokenize(item.description);
  const categoryTokens = tokenize(`${item.category} ${item.subcategory || ''} ${item.family || ''}`);
  const searchTokens = tokenize(buildCatalogSearchText(item));
  const aliasExact = input.itemCode && itemAliases.includes(input.itemCode) ? 1 : 0;
  const unitCompatible = !input.unit || !item.uom ? 1 : Number(input.unit === normalizeText(item.uom));

  const skuExact = input.itemCodeCompact && itemSkuCompact ? Number(input.itemCodeCompact === itemSkuCompact) : 0;
  const skuContained = input.itemCodeCompact && itemSkuCompact && input.itemCodeCompact !== itemSkuCompact
    ? Number(input.itemCodeCompact.includes(itemSkuCompact) || itemSkuCompact.includes(input.itemCodeCompact))
    : 0;
  const skuFamilyMatch = input.itemCodeFamily && itemSkuFamily ? Number(input.itemCodeFamily === itemSkuFamily) : 0;
  const itemNameOverlap = overlapScore(input.itemNameTokens, descriptionTokens);
  const itemNameContains = input.itemNameText && itemDescription
    ? Number(input.itemNameText.includes(itemDescription) || itemDescription.includes(input.itemNameText))
    : 0;
  const descriptionOverlap = overlapScore(input.queryTokens, descriptionTokens);
  const descriptionContains = inputDescription && itemDescription
    ? Number(inputDescription.includes(itemDescription) || itemDescription.includes(inputDescription))
    : 0;
  const descriptionFieldOverlap = overlapScore(input.descriptionInputTokens, descriptionTokens);
  const descriptionFieldContains = input.descriptionText && itemDescription
    ? Number(input.descriptionText.includes(itemDescription) || itemDescription.includes(input.descriptionText))
    : 0;
  const categoryOverlap = overlapScore(tokenize(input.category), categoryTokens);
  const searchOverlap = overlapScore(input.queryTokens, searchTokens);
  const manufacturerModelOverlap = overlapScore(tokenize(input.notes), tokenize(`${item.manufacturer || ''} ${item.model || ''}`));

  const score = Math.min(
    1,
    (skuExact * 0.72) +
      (aliasExact * 0.3) +
      (skuContained * 0.12) +
      (skuFamilyMatch * 0.14) +
      (itemNameOverlap * 0.42) +
      (itemNameContains * 0.22) +
      (descriptionOverlap * 0.48) +
      (descriptionContains * 0.16) +
      (descriptionFieldOverlap * 0.2) +
      (descriptionFieldContains * 0.08) +
      (categoryOverlap * 0.14) +
      (searchOverlap * 0.22) +
      (manufacturerModelOverlap * 0.08) +
      (unitCompatible * 0.06)
  );

  if (score <= 0) return null;

  const confidence: IntakeMatchConfidence = score >= 0.8 || ((skuExact > 0 || aliasExact > 0) && score >= 0.72)
    ? 'strong'
    : score >= 0.5
      ? 'possible'
      : 'none';

  const reasons: string[] = [];
  if (skuExact) reasons.push('Exact item code / SKU match');
  else if (aliasExact) reasons.push('Exact alias / search-key match');
  else if (skuContained) reasons.push('Partial item code / SKU overlap');
  else if (skuFamilyMatch) reasons.push('Item code family aligns with catalog SKU');
  if (itemNameContains) reasons.push('Item name closely matches catalog description');
  else if (itemNameOverlap >= 0.55) reasons.push('Item name strongly overlaps catalog description');
  else if (itemNameOverlap >= 0.3) reasons.push('Item name partially overlaps catalog description');
  if (descriptionContains) reasons.push('Description text closely contains catalog language');
  if (descriptionOverlap >= 0.55) reasons.push('Description tokens strongly overlap');
  else if (descriptionOverlap >= 0.3) reasons.push('Description tokens partially overlap');
  if (categoryOverlap >= 0.45) reasons.push('Category alignment detected');
  if (searchOverlap >= 0.2) reasons.push('Catalog search fields overlap takeoff tokens');
  if (!unitCompatible) reasons.push('Unit differs from catalog item');
  if (manufacturerModelOverlap >= 0.4) reasons.push('Manufacturer / model tokens overlap');
  if (confidence === 'none') {
    if (searchOverlap >= 0.12 && !reasons.some((r) => r.includes('search fields'))) {
      reasons.push('Catalog fields share tokens with takeoff line');
    }
    if (descriptionOverlap >= 0.18) reasons.push('Description tokens weakly overlap catalog');
  }

  return {
    item,
    score,
    confidence,
    reason: buildReason(reasons),
  };
}

function collectCatalogMatchScores(input: CatalogMatchInput, catalog: CatalogItem[]): CatalogMatchScore[] {
  const itemCode = normalizeText(input.itemCode);
  const itemCodeCompact = normalizeCode(input.itemCode);
  const itemCodeFamily = extractCodeFamily(input.itemCode);
  const itemName = String(input.itemName || '').trim();
  const description = String(input.description || '').trim();
  const category = String(input.category || '').trim();
  const notes = String(input.notes || '').trim();
  const unit = normalizeText(input.unit);
  const queryTokens = tokenize(`${itemCode} ${itemName} ${description} ${category} ${notes}`);
  const itemNameText = normalizeText(itemName);
  const itemNameTokens = tokenize(itemName);
  const descriptionText = normalizeText(description);
  const descriptionInputTokens = tokenize(description);

  if (!queryTokens.length && !itemCode) {
    return [];
  }

  const ctx = {
    itemCode,
    itemCodeCompact,
    itemCodeFamily,
    itemName,
    description,
    category,
    notes,
    unit,
    queryTokens,
    itemNameText,
    itemNameTokens,
    descriptionText,
    descriptionInputTokens,
  };

  const out: CatalogMatchScore[] = [];
  for (const item of catalog) {
    const scored = scoreItemAgainstInput(item, ctx);
    if (scored) out.push(scored);
  }
  return out;
}

/** All catalog rows scored above `minScore`, highest first. */
export function listCatalogMatchScores(
  input: CatalogMatchInput,
  catalog: CatalogItem[],
  options?: { minScore?: number }
): CatalogMatchScore[] {
  const minScore = options?.minScore ?? 0.28;
  return collectCatalogMatchScores(input, catalog)
    .filter((s) => s.score >= minScore)
    .sort((a, b) => b.score - a.score);
}

export function prepareCatalogMatch(
  input: CatalogMatchInput,
  catalog: CatalogItem[],
  options?: { memoryCatalogItemId?: string | null }
): {
  catalogMatch: IntakeCatalogMatch | null;
  suggestedMatch: IntakeCatalogMatch | null;
} {
  let ranked = listCatalogMatchScores(input, catalog, { minScore: 0.28 });
  const memId = options?.memoryCatalogItemId?.trim() || null;
  if (memId && catalog.some((c) => c.id === memId)) {
    ranked = ranked
      .map((s) => {
        if (s.item.id !== memId) return s;
        const newScore = Math.min(1, s.score + 0.12);
        const confidence: IntakeMatchConfidence =
          newScore >= 0.8 ? 'strong' : newScore >= 0.5 ? 'possible' : s.confidence;
        return {
          ...s,
          score: newScore,
          confidence,
          reason: `${s.reason}; Prior estimator choice`,
        };
      })
      .sort((a, b) => b.score - a.score);
  }
  const best = ranked[0] || null;

  if (!best) {
    return { catalogMatch: null, suggestedMatch: null };
  }

  const catalogMatch = best.confidence === 'strong' ? catalogMatchScoreToIntake(best) : null;
  let suggestedMatch: IntakeCatalogMatch | null = null;
  if (best.confidence === 'strong') {
    suggestedMatch = null;
  } else if (best.confidence === 'possible') {
    suggestedMatch = catalogMatchScoreToIntake(best);
  } else if (best.confidence === 'none' && best.score >= 0.28) {
    suggestedMatch = catalogMatchScoreToIntake({
      ...best,
      confidence: 'possible',
      reason: best.reason.toLowerCase().includes('weak')
        ? best.reason
        : `${best.reason} (weak text match)`,
    });
  }

  return { catalogMatch, suggestedMatch };
}