import { isPgCatalogBackend } from './catalogBackend.ts';

/** Whitelist for catalog item **read** relation (table or view), including optional `public.` schema. */
const ALLOWED_CATALOG_ITEMS_READ = new Set([
  'catalog_items',
  'catalog_items_clean',
  'public.catalog_items',
  'public.catalog_items_clean',
]);

/** Physical base ↔ Postgres `_clean` view pairs — identifiers must stay whitelist-safe for interpolated reads only. */
const MODIFIERS_V1_READ = new Set([
  'modifiers_v1',
  'modifiers_v1_clean',
  'public.modifiers_v1',
  'public.modifiers_v1_clean',
  /** Native Supabase estimator catalog (short name). */
  'modifiers',
  'public.modifiers',
]);
const BUNDLES_V1_READ = new Set([
  'bundles_v1',
  'bundles_v1_clean',
  'bundles',
  'public.bundles_v1',
  'public.bundles_v1_clean',
  'public.bundles',
]);
const BUNDLE_ITEMS_V1_READ = new Set([
  'bundle_items_v1',
  'bundle_items_v1_clean',
  'bundle_items',
  'public.bundle_items_v1',
  'public.bundle_items_v1_clean',
  'public.bundle_items',
]);
const CATALOG_ITEM_ALIASES_READ = new Set([
  'catalog_item_aliases',
  'catalog_item_aliases_clean',
  'public.catalog_item_aliases',
  'public.catalog_item_aliases_clean',
  /** Div 10 Brain synonym table (`alias_text` instead of `alias_value`). */
  'catalog_aliases',
  'public.catalog_aliases',
]);
const CATALOG_ITEM_ALIASES_WRITE = new Set([
  'catalog_item_aliases',
  'public.catalog_item_aliases',
  'catalog_aliases',
  'public.catalog_aliases',
]);
const CATALOG_ITEM_ATTRIBUTES_READ = new Set([
  'catalog_item_attributes',
  'catalog_item_attributes_clean',
  'public.catalog_item_attributes',
  'public.catalog_item_attributes_clean',
  /** See `scripts/supabase-bridge-native-to-install331-views.sql` — maps `attribute_def_id` + typed values to sheet-style columns. */
  'catalog_item_attributes_compat',
  'public.catalog_item_attributes_compat',
]);
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
 * - **Postgres catalog backend (DB_DRIVER=pg, default mapping):** `catalog_items` — works without a Supabase VIEW.
 *   Deployments that create `catalog_items_clean` (migration `20260430130000_catalog_items_clean_view.sql`) can set
 *   `CATALOG_ITEMS_TABLE=catalog_items_clean` for the CLEAN_ITEMS read surface.
 * - **SQLite (default):** `catalog_items` — local seed/tests.
 * - **Override:** `CATALOG_ITEMS_TABLE=catalog_items` | `catalog_items_clean` (plus optional `public.` prefix; whitelist only).
 *
 * Safety: only allows a small whitelist of identifiers to avoid SQL injection.
 */
export function getCatalogItemsTableName(): string {
  const raw = String(process.env.CATALOG_ITEMS_TABLE || '').trim();
  if (raw && ALLOWED_CATALOG_ITEMS_READ.has(raw)) return raw;

  if (isPgCatalogBackend()) return 'catalog_items';
  return 'catalog_items';
}

/** Same as {@link getCatalogItemsTableName} — explicit name for workbook-first published read surface (see docs). */
export function getCatalogItemsReadTableName(): string {
  return getCatalogItemsTableName();
}

/**
 * All catalog **writes** (sheet sync, admin edits, seeds that insert rows) target the
 * physical **`catalog_items`** table. Never INSERT/UPDATE a read-only view.
 */
export function getCatalogItemsWriteTableName(): 'catalog_items' {
  return 'catalog_items';
}

/** Reads for modifiers catalog defs. Postgres default: native `modifiers` or install331 `modifiers_v1` (set `CATALOG_MODIFIERS_READ_TABLE` if you use only `_v1`). */
export function getCatalogModifiersReadTableName(): string {
  return resolveSupportingReadTable({
    envVarName: 'CATALOG_MODIFIERS_READ_TABLE',
    sqliteDefault: 'modifiers_v1',
    pgDefaultClean: 'modifiers',
    allowed: MODIFIERS_V1_READ,
  });
}

/**
 * Reads for bundle headers + lines.
 * Override independently via `CATALOG_BUNDLES_READ_TABLE` / `CATALOG_BUNDLE_ITEMS_READ_TABLE`.
 */
export function getBundlesReadTableNames(): { bundlesTable: string; bundleItemsTable: string } {
  return {
    bundlesTable: resolveSupportingReadTable({
      envVarName: 'CATALOG_BUNDLES_READ_TABLE',
      sqliteDefault: 'bundles_v1',
      /** Prefer bridge / physical names; `*_clean` views require extra migrations. */
      pgDefaultClean: 'bundles_v1',
      allowed: BUNDLES_V1_READ,
    }),
    bundleItemsTable: resolveSupportingReadTable({
      envVarName: 'CATALOG_BUNDLE_ITEMS_READ_TABLE',
      sqliteDefault: 'bundle_items_v1',
      pgDefaultClean: 'bundle_items_v1',
      allowed: BUNDLE_ITEMS_V1_READ,
    }),
  };
}

/** True when the relation is Div 10 Brain `catalog_aliases` (text in `alias_text`, no `updated_at`). */
export function isCatalogAliasesBrainTableName(rel: string): boolean {
  const t = rel.replace(/^public\./, '');
  return t === 'catalog_aliases';
}

/** Reads for sheet-sync aliases (`catalog_item_aliases`) or Brain synonyms (`catalog_aliases`). */
export function getCatalogItemAliasesReadTableName(): string {
  return resolveSupportingReadTable({
    envVarName: 'CATALOG_ITEM_ALIASES_READ_TABLE',
    sqliteDefault: 'catalog_item_aliases',
    pgDefaultClean: 'catalog_item_aliases',
    allowed: CATALOG_ITEM_ALIASES_READ,
  });
}

export function getCatalogItemAliasesReadLayout(): 'sheet' | 'brain' {
  return isCatalogAliasesBrainTableName(getCatalogItemAliasesReadTableName()) ? 'brain' : 'sheet';
}

/** SQL identifier for the column holding synonym / search text for the configured aliases read relation. */
export function getCatalogAliasValueColumnSql(): 'alias_value' | 'alias_text' {
  return getCatalogItemAliasesReadLayout() === 'brain' ? 'alias_text' : 'alias_value';
}

/**
 * Physical table for alias INSERT/DELETE from the app or workbook import.
 * Defaults to `catalog_item_aliases`; when reads target `catalog_aliases`, defaults the write target to the same relation unless overridden.
 */
export function getCatalogItemAliasesWriteTableName(): string {
  if (!isPgCatalogBackend()) return 'catalog_item_aliases';
  const raw = String(process.env.CATALOG_ITEM_ALIASES_WRITE_TABLE || '').trim();
  if (raw && CATALOG_ITEM_ALIASES_WRITE.has(raw)) return raw;

  const readRel = getCatalogItemAliasesReadTableName();
  if (isCatalogAliasesBrainTableName(readRel)) return readRel;

  return 'catalog_item_aliases';
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
    pgDefaultClean: 'estimator_parametric_modifiers',
    allowed: ESTIMATOR_PARAMETRIC_MODIFIERS_READ,
  }) as 'estimator_parametric_modifiers' | 'estimator_parametric_modifiers_clean';
}

/** Reads for estimator SKU aliases (`estimator_sku_aliases`). */
export function getEstimatorSkuAliasesReadTableName(): 'estimator_sku_aliases' | 'estimator_sku_aliases_clean' {
  return resolveSupportingReadTable({
    envVarName: 'CATALOG_ESTIMATOR_SKU_ALIASES_READ_TABLE',
    sqliteDefault: 'estimator_sku_aliases',
    pgDefaultClean: 'estimator_sku_aliases',
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
    pgDefaultClean: 'estimator_catalog_item_attributes',
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
  if (!isPgCatalogBackend()) return false;
  const t = getCatalogItemsTableName();
  return t === 'catalog_items_clean' || t === 'public.catalog_items_clean';
}

