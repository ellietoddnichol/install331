import type { CatalogItem, UOM } from '../../types';

const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'for',
  'per',
  'with',
  'from',
  'to',
  'of',
  'ea',
  'each',
  'qty',
  'inch',
  'inches',
  'x',
]);

function tokenize(text: string): string[] {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

function tokenOverlapScore(queryTokens: string[], itemDescription: string): number {
  const lower = itemDescription.toLowerCase();
  const itemTokens = new Set(tokenize(itemDescription));
  let score = 0;
  for (const t of queryTokens) {
    if (itemTokens.has(t) || lower.includes(t)) score += 1;
  }
  return score;
}

export type CatalogPeerPricingSuggestion = {
  peerCount: number;
  avgMaterialCost: number;
  avgLaborMinutes: number;
  /** Short phrase for UI, e.g. "soap dispenser surface" */
  keywordsLabel: string;
  /** True when averages use only items with the same UOM as the draft. */
  narrowedByUom: boolean;
};

/**
 * Find catalog items in the same category whose descriptions overlap the draft text,
 * then return mean material cost and labor minutes for peer pricing hints.
 */
export function computeCatalogPeerPricingSuggestion(
  catalog: CatalogItem[],
  params: { description: string; category: string; uom?: UOM }
): CatalogPeerPricingSuggestion | null {
  const cat = String(params.category || '').trim();
  const desc = String(params.description || '').trim();
  if (!cat || !desc) return null;

  const queryTokens = tokenize(desc);
  if (queryTokens.length === 0) return null;

  const minScore = Math.min(2, queryTokens.length);

  const pool = catalog.filter((item) => {
    if (item.active === false) return false;
    return String(item.category || '').trim() === cat;
  });

  const scored = pool
    .map((item) => ({
      item,
      score: tokenOverlapScore(queryTokens, item.description),
    }))
    .filter((row) => row.score >= minScore);

  if (scored.length === 0) return null;

  const uom = params.uom;
  const sameUom = uom ? scored.filter((row) => row.item.uom === uom) : [];
  const narrowedByUom = Boolean(uom && sameUom.length >= 2);
  const working = narrowedByUom ? sameUom : scored;

  working.sort((a, b) => b.score - a.score || b.item.description.length - a.item.description.length);
  const cap = 30;
  const peers = working.slice(0, cap).map((row) => row.item);

  const sumMaterial = peers.reduce((s, i) => s + (Number(i.baseMaterialCost) || 0), 0);
  const sumLabor = peers.reduce((s, i) => s + (Number(i.baseLaborMinutes) || 0), 0);
  const n = peers.length;

  const keywordHits = queryTokens.map((t) => ({
    t,
    hits: peers.filter((i) => i.description.toLowerCase().includes(t)).length,
  }));
  keywordHits.sort((a, b) => b.hits - a.hits || b.t.length - a.t.length);
  const threshold = Math.max(1, Math.ceil(n * 0.3));
  const labelParts = keywordHits.filter((k) => k.hits >= threshold).slice(0, 4).map((k) => k.t);
  const keywordsLabel = labelParts.length > 0 ? labelParts.join(' ') : 'similar items';

  return {
    peerCount: n,
    avgMaterialCost: Math.round((sumMaterial / n) * 100) / 100,
    avgLaborMinutes: Math.round((sumLabor / n) * 10) / 10,
    keywordsLabel,
    narrowedByUom,
  };
}
