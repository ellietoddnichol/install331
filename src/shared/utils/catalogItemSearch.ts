import type { CatalogItem } from '../../types';

/**
 * Whether a catalog row matches a free-text query. Empty query matches all rows.
 * Multi-word queries require every token to appear somewhere in the searchable fields
 * (SKU, description, category, family, mfr/model, tags, …).
 */
export function catalogItemMatchesQuery(item: CatalogItem, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;

  const hay = [
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
    .join(' ')
    .toLowerCase();

  const tokens = q.split(/\s+/).filter(Boolean);
  return tokens.every((t) => hay.includes(t));
}
