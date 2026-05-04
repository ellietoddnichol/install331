import { isPgDriver } from './driver.ts';

const ALLOWED_TABLES = new Set(['catalog_items', 'catalog_items_clean']);

/** Intent flag for operators — see `docs/catalog-sync-architecture.md`. */
export type CatalogSourceMode = 'supabase' | 'sqlite' | 'sheet_staging';

/**
 * Returns the catalog items **relation** name for **reads** (table or view).
 *
 * - **Postgres (default):** `catalog_items_clean` — the compatibility VIEW over
 *   `catalog_items` (`20260430130000_catalog_items_clean_view.sql`), matching the
 *   CLEAN_ITEMS mental model without duplicating storage.
 * - **SQLite (default):** `catalog_items` — local seed/tests.
 * - **Override:** `CATALOG_ITEMS_TABLE=catalog_items` | `catalog_items_clean`.
 *
 * Safety: only allows a small whitelist of identifiers to avoid SQL injection.
 */
export function getCatalogItemsTableName(): 'catalog_items' | 'catalog_items_clean' {
  const raw = String(process.env.CATALOG_ITEMS_TABLE || '').trim();
  if (raw && ALLOWED_TABLES.has(raw)) return raw as 'catalog_items' | 'catalog_items_clean';

  if (isPgDriver()) return 'catalog_items_clean';
  return 'catalog_items';
}

/**
 * All catalog **writes** (sheet sync, admin edits, seeds that insert rows) target the
 * physical **`catalog_items`** table. Never INSERT/UPDATE a read-only view.
 */
export function getCatalogItemsWriteTableName(): 'catalog_items' {
  return 'catalog_items';
}

export function getCatalogSourceMode(): CatalogSourceMode {
  const v = String(process.env.CATALOG_SOURCE || '').trim().toLowerCase();
  if (v === 'supabase' || v === 'sqlite' || v === 'sheet_staging') return v;
  return isPgDriver() ? 'supabase' : 'sqlite';
}

/**
 * True when the configured catalog table is the clean source-of-truth.
 * Useful for guarding code paths that should never write in production.
 */
export function isUsingCleanCatalogSource(): boolean {
  return isPgDriver() && getCatalogItemsTableName() === 'catalog_items_clean';
}

