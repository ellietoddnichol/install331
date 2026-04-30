import { isPgDriver } from './driver.ts';

const ALLOWED_TABLES = new Set(['catalog_items', 'catalog_items_clean']);

/**
 * Returns the catalog items table name to use for reads.
 *
 * - Local/dev defaults to `catalog_items` (SQLite seed data, tests).
 * - Production can set `CATALOG_ITEMS_TABLE=catalog_items_clean` to point
 *   the estimator at the cleaned source-of-truth table.
 *
 * Safety: only allows a small whitelist of identifiers to avoid SQL injection
 * when used in string-interpolated SQL.
 */
export function getCatalogItemsTableName(): 'catalog_items' | 'catalog_items_clean' {
  const raw = String(process.env.CATALOG_ITEMS_TABLE || '').trim();
  if (raw && ALLOWED_TABLES.has(raw)) return raw as 'catalog_items' | 'catalog_items_clean';

  // Default remains backwards compatible for local dev/tests.
  // We deliberately do NOT auto-switch to *_clean just because we're on PG,
  // since some environments may not have that table yet.
  return 'catalog_items';
}

/**
 * True when the configured catalog table is the clean source-of-truth.
 * Useful for guarding code paths that should never write in production.
 */
export function isUsingCleanCatalogSource(): boolean {
  return isPgDriver() && getCatalogItemsTableName() === 'catalog_items_clean';
}

