import { isPgCatalogBackend } from './catalogBackend.ts';

const ALLOWED_TABLES = new Set(['catalog_items', 'catalog_items_clean']);

/** Physical base ↔ Postgres `_clean` view pairs — identifiers must stay whitelist-safe for interpolated reads only. */
const MODIFIERS_V1_READ = new Set(['modifiers_v1', 'modifiers_v1_clean']);
const BUNDLES_V1_READ = new Set(['bundles_v1', 'bundles_v1_clean']);
const BUNDLE_ITEMS_V1_READ = new Set(['bundle_items_v1', 'bundle_items_v1_clean']);
const CATALOG_ITEM_ALIASES_READ = new Set(['catalog_item_aliases', 'catalog_item_aliases_clean']);
const CATALOG_ITEM_ATTRIBUTES_READ = new Set(['catalog_item_attributes', 'catalog_item_attributes_clean']);
const ESTIMATOR_PARAMETRIC_MODIFIERS_READ = new Set(['estimator_parametric_modifiers', 'estimator_parametric_modifiers_clean']);
const ESTIMATOR_SKU_ALIASES_READ = new Set(['estimator_sku_aliases', 'estimator_sku_aliases_clean']);
const ESTIMATOR_CATALOG_ITEM_ATTRIBUTES_READ = new Set([
  'estimator_catalog_item_attributes',
  'estimator_catalog_item_attributes_clean',
]);

function resolveSupportingReadTable(params: {
  envVarName: string;
  sqliteDefault: string;
  pgDefaultClean: string;
  allowed: ReadonlySet<string>;
}): string {
  const raw = String(process.env[params.envVarName] || '').trim();
  if (raw && params.allowed.has(raw)) return raw;
  return isPgCatalogBackend() ? params.pgDefaultClean : params.sqliteDefault;
}

/** Intent flag for operators — see `docs/catalog-sync-architecture.md`. */
export type CatalogSourceMode = 'supabase' | 'sqlite' | 'sheet_staging';

/**
 * Returns the catalog items **relation** name for **reads** (table or view).
 *
 * - **Postgres catalog backend (DB_DRIVER=pg, default mapping):** `catalog_items_clean` — the compatibility VIEW over
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

  if (isPgCatalogBackend()) return 'catalog_items_clean';
  return 'catalog_items';
}

/** Same as {@link getCatalogItemsTableName} — explicit name for workbook-first published read surface (see docs). */
export function getCatalogItemsReadTableName(): 'catalog_items' | 'catalog_items_clean' {
  return getCatalogItemsTableName();
}

/**
 * All catalog **writes** (sheet sync, admin edits, seeds that insert rows) target the
 * physical **`catalog_items`** table. Never INSERT/UPDATE a read-only view.
 */
export function getCatalogItemsWriteTableName(): 'catalog_items' {
  return 'catalog_items';
}

/** Reads for modifiers catalog defs (`modifiers_v1`). Postgres default: `modifiers_v1_clean` VIEW. */
export function getCatalogModifiersReadTableName(): 'modifiers_v1' | 'modifiers_v1_clean' {
  return resolveSupportingReadTable({
    envVarName: 'CATALOG_MODIFIERS_READ_TABLE',
    sqliteDefault: 'modifiers_v1',
    pgDefaultClean: 'modifiers_v1_clean',
    allowed: MODIFIERS_V1_READ,
  }) as 'modifiers_v1' | 'modifiers_v1_clean';
}

/**
 * Reads for bundle headers + lines.
 * Override independently via `CATALOG_BUNDLES_READ_TABLE` / `CATALOG_BUNDLE_ITEMS_READ_TABLE`.
 */
export function getBundlesReadTableNames(): {
  bundlesTable: 'bundles_v1' | 'bundles_v1_clean';
  bundleItemsTable: 'bundle_items_v1' | 'bundle_items_v1_clean';
} {
  return {
    bundlesTable: resolveSupportingReadTable({
      envVarName: 'CATALOG_BUNDLES_READ_TABLE',
      sqliteDefault: 'bundles_v1',
      pgDefaultClean: 'bundles_v1_clean',
      allowed: BUNDLES_V1_READ,
    }) as 'bundles_v1' | 'bundles_v1_clean',
    bundleItemsTable: resolveSupportingReadTable({
      envVarName: 'CATALOG_BUNDLE_ITEMS_READ_TABLE',
      sqliteDefault: 'bundle_items_v1',
      pgDefaultClean: 'bundle_items_v1_clean',
      allowed: BUNDLE_ITEMS_V1_READ,
    }) as 'bundle_items_v1' | 'bundle_items_v1_clean',
  };
}

/** Reads for sheet-sync style aliases (`catalog_item_aliases`). */
export function getCatalogItemAliasesReadTableName(): 'catalog_item_aliases' | 'catalog_item_aliases_clean' {
  return resolveSupportingReadTable({
    envVarName: 'CATALOG_ITEM_ALIASES_READ_TABLE',
    sqliteDefault: 'catalog_item_aliases',
    pgDefaultClean: 'catalog_item_aliases_clean',
    allowed: CATALOG_ITEM_ALIASES_READ,
  }) as 'catalog_item_aliases' | 'catalog_item_aliases_clean';
}

/** Reads for sheet-sync style item attributes (`catalog_item_attributes`). */
export function getCatalogItemAttributesReadTableName(): 'catalog_item_attributes' | 'catalog_item_attributes_clean' {
  return resolveSupportingReadTable({
    envVarName: 'CATALOG_ITEM_ATTRIBUTES_READ_TABLE',
    sqliteDefault: 'catalog_item_attributes',
    pgDefaultClean: 'catalog_item_attributes_clean',
    allowed: CATALOG_ITEM_ATTRIBUTES_READ,
  }) as 'catalog_item_attributes' | 'catalog_item_attributes_clean';
}

/** Reads for estimator parametric modifiers (`estimator_parametric_modifiers`). */
export function getEstimatorParametricModifiersReadTableName():
  | 'estimator_parametric_modifiers'
  | 'estimator_parametric_modifiers_clean' {
  return resolveSupportingReadTable({
    envVarName: 'CATALOG_ESTIMATOR_PARAMETRIC_MODIFIERS_READ_TABLE',
    sqliteDefault: 'estimator_parametric_modifiers',
    pgDefaultClean: 'estimator_parametric_modifiers_clean',
    allowed: ESTIMATOR_PARAMETRIC_MODIFIERS_READ,
  }) as 'estimator_parametric_modifiers' | 'estimator_parametric_modifiers_clean';
}

/** Reads for estimator SKU aliases (`estimator_sku_aliases`). */
export function getEstimatorSkuAliasesReadTableName(): 'estimator_sku_aliases' | 'estimator_sku_aliases_clean' {
  return resolveSupportingReadTable({
    envVarName: 'CATALOG_ESTIMATOR_SKU_ALIASES_READ_TABLE',
    sqliteDefault: 'estimator_sku_aliases',
    pgDefaultClean: 'estimator_sku_aliases_clean',
    allowed: ESTIMATOR_SKU_ALIASES_READ,
  }) as 'estimator_sku_aliases' | 'estimator_sku_aliases_clean';
}

/** Reads for estimator catalog item attributes (`estimator_catalog_item_attributes`). */
export function getEstimatorCatalogItemAttributesReadTableName():
  | 'estimator_catalog_item_attributes'
  | 'estimator_catalog_item_attributes_clean' {
  return resolveSupportingReadTable({
    envVarName: 'CATALOG_ESTIMATOR_ITEM_ATTRIBUTES_READ_TABLE',
    sqliteDefault: 'estimator_catalog_item_attributes',
    pgDefaultClean: 'estimator_catalog_item_attributes_clean',
    allowed: ESTIMATOR_CATALOG_ITEM_ATTRIBUTES_READ,
  }) as 'estimator_catalog_item_attributes' | 'estimator_catalog_item_attributes_clean';
}

export function getCatalogSourceMode(): CatalogSourceMode {
  const v = String(process.env.CATALOG_SOURCE || '').trim().toLowerCase();
  if (v === 'supabase' || v === 'sqlite' || v === 'sheet_staging') return v;
  return isPgCatalogBackend() ? 'supabase' : 'sqlite';
}

/**
 * True when the configured catalog table is the clean source-of-truth.
 * Useful for guarding code paths that should never write in production.
 */
export function isUsingCleanCatalogSource(): boolean {
  return isPgCatalogBackend() && getCatalogItemsTableName() === 'catalog_items_clean';
}

