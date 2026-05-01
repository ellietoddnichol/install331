import { dbAll, dbGet, dbRun } from '../db/query.ts';
import type { CatalogItem } from '../../types.ts';
import type { CatalogCategoryImageGapRow, CatalogPostCutoverHealthRecord, CatalogSyncStatusRecord } from '../../shared/types/estimator.ts';
import { ensureTakeoffCatalogSeeded } from '../services/intake/takeoffCatalogRegistry.ts';
import { getCatalogItemsTableName, getCatalogItemsWriteTableName } from '../db/catalogTable.ts';

function mapCatalogRow(row: any): CatalogItem {
  return {
    id: row.id,
    sku: row.sku || '',
    category: row.category || '',
    subcategory: row.subcategory || undefined,
    family: row.family || undefined,
    description: row.description || '',
    manufacturer: row.manufacturer || undefined,
    brand: row.brand || undefined,
    model: row.model || undefined,
    modelNumber: row.model_number || undefined,
    series: row.series || undefined,
    imageUrl: row.image_url || undefined,
    uom: row.uom || 'EA',
    baseMaterialCost: Number(row.base_material_cost || 0),
    baseLaborMinutes: Number(row.base_labor_minutes || 0),
    laborUnitType: row.labor_unit_type || undefined,
    taxable: !!row.taxable,
    adaFlag: !!row.ada_flag,
    tags: row.tags ? JSON.parse(row.tags) : [],
    notes: row.notes || undefined,
    active: !!row.active,
    installLaborFamily: row.install_labor_family || null,
    canonicalSku: row.canonical_sku || null,
    isCanonical: row.is_canonical == null ? undefined : !!row.is_canonical,
    aliasOf: row.alias_of || null,
    laborBasis: row.labor_basis || null,
    defaultMountingType: row.default_mounting_type || null,
    finishGroup: row.finish_group || null,
    attributeGroup: row.attribute_group || null,
    duplicateGroupKey: row.duplicate_group_key || null,
    deprecated: row.deprecated == null ? undefined : !!row.deprecated,
    deprecatedReason: row.deprecated_reason || null,

    recordGranularity: row.record_granularity || null,
    materialFamily: row.material_family || null,
    systemSeries: row.system_series || null,
    privacyLevel: row.privacy_level || null,
    manufacturerConfiguredItem: row.manufacturer_configured_item == null ? undefined : !!row.manufacturer_configured_item,
    canonicalMatchAnchor: row.canonical_match_anchor == null ? undefined : !!row.canonical_match_anchor,
    exactComponentSku: row.exact_component_sku == null ? undefined : !!row.exact_component_sku,
    requiresProjectConfiguration: row.requires_project_configuration == null ? undefined : !!row.requires_project_configuration,
    defaultUnit: row.default_unit || null,
    estimatorNotes: row.estimator_notes || null,
  };
}

export async function listActiveCatalogItems(): Promise<CatalogItem[]> {
  await ensureTakeoffCatalogSeeded();
  const table = getCatalogItemsTableName();
  const rows = await dbAll(`SELECT * FROM ${table} WHERE active = 1 ORDER BY category, description`);
  return rows.map(mapCatalogRow);
}

/** API / workspace: active-only for matching; admin Catalog can load every row. */
export async function listCatalogItemsForApi(includeInactive: boolean): Promise<CatalogItem[]> {
  await ensureTakeoffCatalogSeeded();
  const table = getCatalogItemsTableName();
  const sql = includeInactive
    ? `SELECT * FROM ${table} ORDER BY category, description`
    : `SELECT * FROM ${table} WHERE active = 1 ORDER BY category, description`;
  const rows = await dbAll(sql);
  return rows.map(mapCatalogRow);
}

export async function getCatalogInventoryCounts(): Promise<{ total: number; active: number; inactive: number }> {
  await ensureTakeoffCatalogSeeded();
  const table = getCatalogItemsTableName();
  const row = (await dbGet(
    `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN active = 0 THEN 1 ELSE 0 END) AS inactive
      FROM ${table}`
  )) as { total: number; active: number | null; inactive: number | null } | undefined;
  if (!row) {
    return { total: 0, active: 0, inactive: 0 };
  }
  return {
    total: Number(row.total ?? 0),
    active: Number(row.active ?? 0),
    inactive: Number(row.inactive ?? 0),
  };
}

const forwardFacingSql = `active = 1 AND COALESCE(deprecated, 0) = 0 AND is_canonical = 1`;

/** Per-row missing-image flag for aggregates (Postgres-safe HAVING without SELECT aliases). */
const rowMissingImageFlag = `(CASE WHEN (image_url IS NULL OR TRIM(image_url) = '') THEN 1 ELSE 0 END)`;

/**
 * Summarizes forward-facing catalog rows in SQLite for post-cutover checks (sync vs sheet audit, image gaps).
 * Forward-facing = active + canonical + not deprecated (typical estimator-facing set).
 */
export async function getCatalogPostCutoverHealth(params: {
  itemsSourceTab: string;
  lastCatalogSync: CatalogSyncStatusRecord;
}): Promise<CatalogPostCutoverHealthRecord> {
  await ensureTakeoffCatalogSeeded();
  const table = getCatalogItemsTableName();

  const forward = (await dbGet(`SELECT COUNT(*) AS n FROM ${table} WHERE ${forwardFacingSql}`)) as { n: number } | undefined;
  const missingImg = (await dbGet(
    `SELECT COUNT(*) AS n FROM ${table} WHERE ${forwardFacingSql}
       AND (image_url IS NULL OR TRIM(image_url) = '')`
  )) as { n: number } | undefined;
  const mfrBackedMiss = (await dbGet(
    `SELECT COUNT(*) AS n FROM ${table} WHERE ${forwardFacingSql}
       AND (image_url IS NULL OR TRIM(image_url) = '')
       AND TRIM(COALESCE(manufacturer, '')) != ''
       AND (TRIM(COALESCE(model, '')) != '' OR TRIM(COALESCE(series, '')) != '')`
  )) as { n: number } | undefined;

  const attrDistinct = (await dbGet(
    `SELECT COUNT(DISTINCT catalog_item_id) AS n
       FROM catalog_item_attributes
       WHERE active = 1`
  )) as { n: number } | undefined;

  const topRows = (await dbAll(
    `SELECT
        COALESCE(NULLIF(TRIM(category), ''), '(Uncategorized)') AS category,
        SUM(${rowMissingImageFlag}) AS missing_image,
        COUNT(*) AS fwd
       FROM ${table}
       WHERE ${forwardFacingSql}
       GROUP BY category
       HAVING SUM(${rowMissingImageFlag}) > 0
       ORDER BY missing_image DESC, fwd DESC
       LIMIT 12`
  )) as Array<{ category: string; missing_image: number; fwd: number }>;

  const topCategoriesByMissingImage: CatalogCategoryImageGapRow[] = topRows.map((row) => ({
    category: row.category,
    forwardFacingActive: row.fwd,
    missingImageUrl: row.missing_image,
    pctMissingImage: row.fwd > 0 ? Math.round((row.missing_image / row.fwd) * 100) : 0,
  }));

  const notes: string[] = [];
  notes.push(
    'Items synced counts every sheet row with a description (including inactive rows). Compare to CLEAN_ITEMS “Active rows” only when you expect inactive sheet rows.'
  );
  notes.push('Forward-facing rows here: active + canonical + not deprecated — use Catalog filters to match.');

  return {
    itemsSourceTab: params.itemsSourceTab,
    inventory: await getCatalogInventoryCounts(),
    forwardFacing: {
      count: Number(forward?.n ?? 0),
      missingImageUrl: Number(missingImg?.n ?? 0),
      missingImageManufacturerBacked: Number(mfrBackedMiss?.n ?? 0),
      distinctItemsWithAttributes: Number(attrDistinct?.n ?? 0),
    },
    topCategoriesByMissingImage,
    validationNotes: notes,
    lastCatalogSync: params.lastCatalogSync,
  };
}

/** Use after bulk DB import or when Sheet sync left most rows inactive. */
export async function reactivateAllCatalogItems(): Promise<number> {
  const table = getCatalogItemsWriteTableName();
  const result = await dbRun(`UPDATE ${table} SET active = 1`);
  return result.changes;
}

export async function searchCatalogItemsForApi(input: {
  query: string;
  category?: string | null;
  includeInactive?: boolean;
  includeDeprecated?: boolean;
  includeNonCanonical?: boolean;
  limit?: number;
}): Promise<CatalogItem[]> {
  await ensureTakeoffCatalogSeeded();
  const qRaw = input.query.trim().toLowerCase();
  if (!qRaw) return [];

  // Strip common variant terms so searches like "grab bar matte black" resolve to the canonical row,
  // with attributes inferred elsewhere (selection flow).
  const q = qRaw
    .replace(/\bmatte\s+black\b/g, ' ')
    .replace(/\bantimicrobial\b/g, ' ')
    .replace(/\bpeened\b/g, ' ')
    .replace(/\bsemi[-\s]?recess(ed|ed)?\b/g, ' ')
    .replace(/\brecess(ed|ed)?\b/g, ' ')
    .replace(/\bsurface\b/g, ' ')
    .replace(/\bknock[-\s]?down\b/g, ' ')
    .replace(/\bkd\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const qEffective = q || qRaw;

  const includeInactive = input.includeInactive === true;
  const includeDeprecated = input.includeDeprecated === true;
  const includeNonCanonical = input.includeNonCanonical === true;
  const limit = Math.max(1, Math.min(200, input.limit || 50));

  const like = `%${qEffective}%`;
  const category = (input.category || '').trim();

  const where: string[] = [];
  const args: unknown[] = [];

  if (!includeInactive) where.push('c.active = 1');
  if (!includeDeprecated) where.push('(c.deprecated IS NULL OR c.deprecated = 0)');
  if (!includeNonCanonical) where.push('(c.is_canonical IS NULL OR c.is_canonical = 1)');
  if (category) {
    where.push('c.category = ?');
    args.push(category);
  }

  // Search targets: sku, canonical_sku, description, manufacturer/brand/model, alias_value.
  where.push(`(
    lower(c.sku) LIKE ?
    OR lower(COALESCE(c.canonical_sku,'')) LIKE ?
    OR lower(c.description) LIKE ?
    OR lower(COALESCE(c.category,'')) LIKE ?
    OR lower(COALESCE(c.family,'')) LIKE ?
    OR lower(COALESCE(c.subcategory,'')) LIKE ?
    OR lower(COALESCE(c.manufacturer,'')) LIKE ?
    OR lower(COALESCE(c.brand,'')) LIKE ?
    OR lower(COALESCE(c.model,'')) LIKE ?
    OR lower(COALESCE(a.alias_value,'')) LIKE ?
  )`);
  args.push(like, like, like, like, like, like, like, like, like, like);

  const table = getCatalogItemsTableName();
  // Postgres: grouping by `c.id` while selecting `c.*` is valid when `id` is the PRIMARY KEY
  // (functional dependency). Ensure migrations define PK on `catalog_items` / `catalog_items_clean`.
  const sql = `
    SELECT c.*,
      MIN(
        CASE
          WHEN lower(c.sku) = ? THEN 0
          WHEN lower(COALESCE(a.alias_value,'')) = ? THEN 1
          WHEN lower(COALESCE(c.canonical_sku,'')) = ? THEN 2
          WHEN lower(c.sku) LIKE ? THEN 3
          WHEN lower(COALESCE(a.alias_value,'')) LIKE ? THEN 4
          ELSE 10
        END
      ) AS match_rank
    FROM ${table} c
    LEFT JOIN catalog_item_aliases a ON a.catalog_item_id = c.id
    WHERE ${where.join(' AND ')}
    GROUP BY c.id
    ORDER BY match_rank ASC, c.category ASC, c.description ASC
    LIMIT ${limit}
  `;
  const rows = await dbAll(sql, [...args, qEffective, qEffective, qEffective, `${qEffective}%`, `${qEffective}%`]);
  return rows.map(mapCatalogRow);
}
