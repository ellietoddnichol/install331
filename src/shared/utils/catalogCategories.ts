import type { CatalogItem } from '../../types';

/** Distinct scope categories defined by current catalog items (source of truth). */
export function uniqueSortedCatalogCategories(catalog: { category?: string | null }[]): string[] {
  return Array.from(new Set(catalog.map((i) => String(i.category || '').trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  );
}

/**
 * Tokens that appear inside many real scope names but must not map a vague import
 * (e.g. section title "Specialties") onto a specific catalog category like "Fire Specialties".
 */
const VAGUE_CATEGORY_TOKENS = new Set([
  'specialties',
  'accessories',
  'equipment',
  'fixtures',
  'systems',
  'misc',
  'miscellaneous',
  'general',
  'other',
  'division',
  'scope',
  'work',
]);

function isOnlyVagueCategoryTokens(text: string): boolean {
  const parts = text
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 0 && !/^\d+(?:[./-]\d+)?$/.test(p));
  if (parts.length === 0) return false;
  return parts.every((p) => VAGUE_CATEGORY_TOKENS.has(p));
}

/**
 * Map imported / fuzzy text to a catalog category, or null if no safe match.
 */
export function resolveImportedCategory(raw: string | null | undefined, allowed: string[]): string | null {
  const t = String(raw || '').trim();
  if (!t || !allowed.length) return null;
  if (allowed.includes(t)) return t;
  const lower = t.toLowerCase();
  for (const a of allowed) {
    if (a.toLowerCase() === lower) return a;
  }
  if (isOnlyVagueCategoryTokens(t)) return null;

  for (const a of allowed) {
    const al = a.toLowerCase();
    if (al.length >= 3 && lower.includes(al)) return a;
  }
  /** Require a longer needle so "fire" alone does not snap to "Fire Specialties". */
  const minSubstringLen = 5;
  for (const a of allowed) {
    const al = a.toLowerCase();
    if (al.length >= 3 && lower.length >= minSubstringLen && al.includes(lower)) return a;
  }
  return null;
}

export function mergeDetectedScopeCategories(
  existing: string[] | undefined,
  additions: Array<string | null | undefined>,
  allowed: string[]
): string[] {
  const resolved = [
    ...(existing || []).map((e) => resolveImportedCategory(e, allowed)).filter(Boolean) as string[],
    ...additions.map((e) => resolveImportedCategory(e, allowed)).filter(Boolean) as string[],
  ];
  return Array.from(new Set(resolved)).sort();
}

export type LineSuggestionLike = {
  category: string | null;
  catalogItemId?: string | null;
  sku?: string | null;
};

/** Clamp line categories to the catalog allow-list; use catalog item when matched. */
export function clampSuggestionCategories<T extends LineSuggestionLike>(lines: T[], catalog: CatalogItem[]): T[] {
  const allowed = uniqueSortedCatalogCategories(catalog);
  if (!allowed.length) return lines;
  return lines.map((line) => {
    const r = resolveImportedCategory(line.category, allowed);
    if (r) return { ...line, category: r };
    const byId = line.catalogItemId ? catalog.find((i) => i.id === line.catalogItemId) : null;
    if (byId?.category && allowed.includes(byId.category)) return { ...line, category: byId.category };
    const sku = line.sku ? String(line.sku).trim() : '';
    if (sku) {
      const bySku = catalog.find((i) => i.sku && i.sku.toLowerCase() === sku.toLowerCase());
      if (bySku?.category && allowed.includes(bySku.category)) return { ...line, category: bySku.category };
    }
    return { ...line, category: null };
  });
}
