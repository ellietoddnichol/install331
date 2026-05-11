import { dbCatalogAll, dbCatalogGet, dbCatalogRun } from '../db/query.ts';
import type { CatalogItem } from '../../types.ts';
import type { CatalogCategoryImageGapRow, CatalogPostCutoverHealthRecord, CatalogSyncStatusRecord } from '../../shared/types/estimator.ts';
import { ensureTakeoffCatalogSeeded } from '../services/intake/takeoffCatalogRegistry.ts';
import {
  getCatalogAliasValueColumnSql,
  getCatalogItemAliasesReadTableName,
  getCatalogItemAttributesReadTableName,
  getCatalogItemsTableName,
  getCatalogItemsWriteTableName,
} from '../db/catalogTable.ts';

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

    catalogSource: row.catalog_source ?? null,
    catalogSourceTab: row.catalog_source_tab ?? null,
    catalogSourceRow: row.catalog_source_row == null ? null : Number(row.catalog_source_row),
    catalogSyncBatchId: row.catalog_sync_batch_id ?? null,
    skuNormalized: row.sku_normalized ?? null,
    manufacturerNormalized: row.manufacturer_normalized ?? null,
    categoryMain: row.category_main ?? null,
    itemType: row.item_type ?? null,
  };
}

export async function listActiveCatalogItems(): Promise<CatalogItem[]> {
  await ensureTakeoffCatalogSeeded();
  const table = getCatalogItemsTableName();
  const rows = await dbCatalogAll(`SELECT * FROM ${table} WHERE active = 1 ORDER BY category, description`);
  return rows.map(mapCatalogRow);
}

/** API / workspace: active-only for matching; admin Catalog can load every row. */
export async function listCatalogItemsForApi(includeInactive: boolean): Promise<CatalogItem[]> {
  await ensureTakeoffCatalogSeeded();
  const table = getCatalogItemsTableName();
  const sql = includeInactive
    ? `SELECT * FROM ${table} ORDER BY category, description`
    : `SELECT * FROM ${table} WHERE active = 1 ORDER BY category, description`;
  const rows = await dbCatalogAll(sql);
  return rows.map(mapCatalogRow);
}

export async function getCatalogInventoryCounts(): Promise<{ total: number; active: number; inactive: number }> {
  await ensureTakeoffCatalogSeeded();
  const table = getCatalogItemsTableName();
  const row = await dbCatalogGet(
    `SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN active = 0 THEN 1 ELSE 0 END) AS inactive
    FROM ${table}`
  );
  const r = row as { total: number; active: number | null; inactive: number | null } | undefined;
  return {
    total: Number(r?.total ?? 0),
    active: Number(r?.active ?? 0),
    inactive: Number(r?.inactive ?? 0),
  };
}

const forwardFacingSql = `active = 1 AND COALESCE(deprecated, 0) = 0 AND is_canonical = 1`;

/**
 * Summarizes forward-facing catalog rows in SQLite for post-cutover checks (sync vs sheet audit, image gaps).
 * Forward-facing = active + canonical + not deprecated (typical estimator-facing set).
 */
export async function getCatalogPostCutoverHealth(params: {
  itemsSourceTab: string;
  lastCatalogSync: CatalogSyncStatusRecord;
}): Promise<CatalogPostCutoverHealthRecord> {
  await ensureTakeoffCatalogSeeded();
  const readTable = getCatalogItemsTableName();

  const forward = (await dbCatalogGet(`SELECT COUNT(*) AS n FROM ${readTable} WHERE ${forwardFacingSql}`)) as { n: number };
  const missingImg = (await dbCatalogGet(
    `SELECT COUNT(*) AS n FROM ${readTable} WHERE ${forwardFacingSql}
       AND (image_url IS NULL OR TRIM(image_url) = '')`
  )) as { n: number };
  const mfrBackedMiss = (await dbCatalogGet(
    `SELECT COUNT(*) AS n FROM ${readTable} WHERE ${forwardFacingSql}
       AND (image_url IS NULL OR TRIM(image_url) = '')
       AND TRIM(COALESCE(manufacturer, '')) != ''
       AND (TRIM(COALESCE(model, '')) != '' OR TRIM(COALESCE(series, '')) != '')`
  )) as { n: number };

  const attrTable = getCatalogItemAttributesReadTableName();
  const attrDistinct = (await dbCatalogGet(
    `SELECT COUNT(DISTINCT catalog_item_id) AS n
       FROM ${attrTable}
       WHERE active = 1`
  )) as { n: number };

  const topRows = (await dbCatalogAll(
    `SELECT
        COALESCE(NULLIF(TRIM(category), ''), '(Uncategorized)') AS category,
        SUM(CASE WHEN (image_url IS NULL OR TRIM(image_url) = '') THEN 1 ELSE 0 END) AS missing_image,
        COUNT(*) AS fwd
       FROM ${readTable}
       WHERE ${forwardFacingSql}
       GROUP BY category
       HAVING SUM(CASE WHEN (image_url IS NULL OR TRIM(image_url) = '') THEN 1 ELSE 0 END) > 0
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
      count: Number(forward.n),
      missingImageUrl: Number(missingImg.n),
      missingImageManufacturerBacked: Number(mfrBackedMiss.n),
      distinctItemsWithAttributes: Number(attrDistinct.n),
    },
    topCategoriesByMissingImage,
    validationNotes: notes,
    lastCatalogSync: params.lastCatalogSync,
  };
}

/** Use after bulk DB import or when Sheet sync left most rows inactive. */
export async function reactivateAllCatalogItems(): Promise<number> {
  await ensureTakeoffCatalogSeeded();
  const wt = getCatalogItemsWriteTableName();
  const result = await dbCatalogRun(`UPDATE ${wt} SET active = 1`, []);
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
  const readTable = getCatalogItemsTableName();
  const aliasesReadTable = getCatalogItemAliasesReadTableName();
  const aliasValCol = getCatalogAliasValueColumnSql();
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
  const args: any[] = [];

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
    OR lower(COALESCE(a.${aliasValCol},'')) LIKE ?
  )`);
  args.push(like, like, like, like, like, like, like, like, like, like);

  const matchCase = `(
        CASE
          WHEN lower(c.sku) = ? THEN 0
          WHEN lower(COALESCE(a.${aliasValCol},'')) = ? THEN 1
          WHEN lower(COALESCE(c.canonical_sku,'')) = ? THEN 2
          WHEN lower(c.sku) LIKE ? THEN 3
          WHEN lower(COALESCE(a.${aliasValCol},'')) LIKE ? THEN 4
          ELSE 10
        END)`;

  const rankParams = [qEffective, qEffective, qEffective, `${qEffective}%`, `${qEffective}%`];

  const sql = `
    SELECT * FROM (
      SELECT c.*,
        ${matchCase} AS match_rank,
        ROW_NUMBER() OVER (
          PARTITION BY c.id
          ORDER BY ${matchCase} ASC, c.category ASC, c.description ASC
        ) AS _rn
      FROM ${readTable} c
      LEFT JOIN ${aliasesReadTable} a ON a.catalog_item_id = c.id
      WHERE ${where.join(' AND ')}
    ) ranked
    WHERE ranked._rn = 1
    ORDER BY ranked.match_rank ASC, ranked.category ASC, ranked.description ASC
    LIMIT ${limit}
  `;

  const rows = await dbCatalogAll(sql, [...args, ...rankParams, ...rankParams]);
  return rows.map((row: Record<string, unknown>) => {
    const { match_rank: _mr, _rn: _rn2, ...rest } = row;
    return mapCatalogRow(rest);
  });
}

/** Strip LIKE metacharacters from user text (simple guard; no ESCAPE clause needed). */
function sanitizeLikeUserQuery(raw: string): string {
  return raw.replace(/%/g, '').replace(/_/g, '').trim();
}

function buildCatalogPageWhere(params: {
  activeFilter: 'all' | 'active' | 'inactive';
  category?: string | null;
  q?: string | null;
  typeFilter?: string | null;
  sourceTabFilter?: string | null;
  imageSprintOnly?: boolean;
}): { whereSql: string; args: unknown[] } {
  const where: string[] = ['1=1'];
  const args: unknown[] = [];
  if (params.activeFilter === 'active') where.push('c.active = 1');
  else if (params.activeFilter === 'inactive') where.push('c.active = 0');

  const cat = String(params.category || '').trim();
  if (cat && cat !== 'all') {
    where.push('c.category = ?');
    args.push(cat);
  }

  const q = sanitizeLikeUserQuery(String(params.q || ''));
  if (q) {
    const like = `%${q.toLowerCase()}%`;
    where.push(
      `(lower(c.description) LIKE ? OR lower(c.sku) LIKE ? OR lower(coalesce(c.canonical_sku,'')) LIKE ? OR lower(coalesce(c.manufacturer,'')) LIKE ? OR lower(coalesce(c.brand,'')) LIKE ? OR lower(coalesce(c.family,'')) LIKE ? OR lower(coalesce(c.subcategory,'')) LIKE ? OR lower(coalesce(c.catalog_source_tab,'')) LIKE ? OR lower(coalesce(c.catalog_source,'')) LIKE ?)`
    );
    args.push(like, like, like, like, like, like, like, like, like);
  }

  const typeF = String(params.typeFilter || '').trim();
  if (typeF && typeF !== 'all') {
    where.push(
      `(coalesce(nullif(trim(c.item_type),''), nullif(trim(c.family),''), nullif(trim(c.subcategory),''), 'Standard') = ?)`
    );
    args.push(typeF);
  }

  const sheet = String(params.sourceTabFilter || '').trim();
  if (sheet && sheet !== 'all') {
    if (sheet === '__none__') {
      where.push(
        `(nullif(trim(coalesce(c.catalog_source_tab,'')),'') is null and nullif(trim(coalesce(c.catalog_source,'')),'') is null)`
      );
    } else {
      where.push(`(coalesce(nullif(trim(c.catalog_source_tab),''), nullif(trim(c.catalog_source),'')) = ?)`);
      args.push(sheet);
    }
  }

  if (params.imageSprintOnly) {
    where.push(
      `(c.active = 1 AND (c.deprecated IS NULL OR c.deprecated = 0) AND nullif(trim(coalesce(c.manufacturer,'')),'') is not null AND (nullif(trim(coalesce(c.model,'')),'') is not null OR nullif(trim(coalesce(c.series,'')),'') is not null) AND (c.image_url IS NULL OR trim(c.image_url) = ''))`
    );
  }

  return { whereSql: where.join(' AND '), args };
}

function catalogPageOrderBy(sortBy: string): string {
  switch (sortBy) {
    case 'sku-desc':
      return 'c.sku DESC';
    case 'name-asc':
      return 'c.description ASC';
    case 'name-desc':
      return 'c.description DESC';
    case 'category-asc':
      return 'c.category ASC, c.description ASC';
    case 'material-desc':
      return 'c.base_material_cost DESC';
    case 'labor-desc':
      return 'c.base_labor_minutes DESC';
    case 'sku-asc':
    default:
      return 'c.sku ASC';
  }
}

export type CatalogItemsPageParams = {
  offset: number;
  limit: number;
  activeFilter: 'all' | 'active' | 'inactive';
  category?: string | null;
  q?: string | null;
  typeFilter?: string | null;
  sourceTabFilter?: string | null;
  imageSprintOnly?: boolean;
  sortBy: string;
};

export async function listCatalogItemsPage(params: CatalogItemsPageParams): Promise<{
  rows: CatalogItem[];
  total: number;
}> {
  await ensureTakeoffCatalogSeeded();
  const readTable = getCatalogItemsTableName();
  const limit = Math.max(1, Math.min(200, Math.floor(params.limit || 50)));
  const offset = Math.max(0, Math.floor(params.offset || 0));
  const { whereSql, args } = buildCatalogPageWhere({
    activeFilter: params.activeFilter,
    category: params.category,
    q: params.q,
    typeFilter: params.typeFilter,
    sourceTabFilter: params.sourceTabFilter,
    imageSprintOnly: params.imageSprintOnly,
  });
  const orderBy = catalogPageOrderBy(params.sortBy || 'sku-asc');

  const countRow = (await dbCatalogGet(`SELECT COUNT(*) AS n FROM ${readTable} c WHERE ${whereSql}`, args)) as
    | { n: string | number }
    | undefined;
  const total = Number(countRow?.n ?? 0);

  const rows = await dbCatalogAll(
    `SELECT c.* FROM ${readTable} c WHERE ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    [...args, limit, offset]
  );
  return { rows: rows.map((r) => mapCatalogRow(r)), total };
}

export async function listDistinctCatalogCategories(): Promise<string[]> {
  await ensureTakeoffCatalogSeeded();
  const readTable = getCatalogItemsTableName();
  const rows = await dbCatalogAll<{ c: string }>(
    `SELECT DISTINCT TRIM(c.category) AS c FROM ${readTable} c WHERE TRIM(COALESCE(c.category,'')) != '' ORDER BY c`
  );
  return rows.map((r) => String(r.c || '').trim()).filter(Boolean);
}

export async function listCatalogItemFacets(): Promise<{
  categories: string[];
  itemTypes: string[];
  sourceTabs: string[];
  hasUntaggedSource: boolean;
}> {
  await ensureTakeoffCatalogSeeded();
  const readTable = getCatalogItemsTableName();
  const [categories, itemTypes, tabRows, noneRow] = await Promise.all([
    listDistinctCatalogCategories(),
    dbCatalogAll<{ t: string }>(
      `SELECT DISTINCT COALESCE(NULLIF(TRIM(c.item_type),''), NULLIF(TRIM(c.family),''), NULLIF(TRIM(c.subcategory),''), 'Standard') AS t
       FROM ${readTable} c
       ORDER BY t`
    ),
    dbCatalogAll<{ tab: string | null }>(
      `SELECT DISTINCT
         CASE
           WHEN TRIM(COALESCE(c.catalog_source_tab,'')) != '' THEN TRIM(c.catalog_source_tab)
           WHEN TRIM(COALESCE(c.catalog_source,'')) != '' THEN TRIM(c.catalog_source)
           ELSE NULL
         END AS tab
       FROM ${readTable} c`
    ),
    dbCatalogGet<{ n: number }>(
      `SELECT COUNT(*) AS n FROM ${readTable} c
       WHERE nullif(trim(coalesce(c.catalog_source_tab,'')),'') is null
         AND nullif(trim(coalesce(c.catalog_source,'')),'') is null`
    ),
  ]);
  const sourceTabs = tabRows
    .map((r) => (r.tab == null ? null : String(r.tab).trim()) || null)
    .filter((t): t is string => Boolean(t && t.length));
  return {
    categories,
    itemTypes: itemTypes.map((r) => String(r.t || '').trim()).filter(Boolean),
    sourceTabs: [...new Set(sourceTabs)].sort((a, b) => a.localeCompare(b)),
    hasUntaggedSource: Number((noneRow as { n?: number } | undefined)?.n ?? 0) > 0,
  };
}

const ID_TOKEN = /^[a-zA-Z0-9_-]{1,128}$/;

export async function getCatalogItemById(id: string): Promise<CatalogItem | null> {
  const tid = String(id || '').trim();
  if (!ID_TOKEN.test(tid)) return null;
  await ensureTakeoffCatalogSeeded();
  const readTable = getCatalogItemsTableName();
  const row = await dbCatalogGet(`SELECT * FROM ${readTable} WHERE id = ? LIMIT 1`, [tid]);
  return row ? mapCatalogRow(row) : null;
}

export async function listCatalogItemsByIds(ids: string[]): Promise<CatalogItem[]> {
  const unique = [...new Set(ids.map((x) => String(x || '').trim()).filter((x) => ID_TOKEN.test(x)))];
  if (unique.length === 0) return [];
  const cap = 400;
  const slice = unique.slice(0, cap);
  await ensureTakeoffCatalogSeeded();
  const readTable = getCatalogItemsTableName();
  const ph = slice.map(() => '?').join(',');
  const rows = await dbCatalogAll(`SELECT * FROM ${readTable} WHERE id IN (${ph})`, slice);
  return rows.map((r) => mapCatalogRow(r));
}