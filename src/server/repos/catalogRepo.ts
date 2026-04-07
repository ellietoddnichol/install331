import { getEstimatorDb } from '../db/connection.ts';
import type { CatalogItem } from '../../types.ts';
import { ensureTakeoffCatalogSeeded } from '../services/intake/takeoffCatalogRegistry.ts';

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
  };
}

export function listActiveCatalogItems(): CatalogItem[] {
  ensureTakeoffCatalogSeeded();
  const rows = getEstimatorDb()
    .prepare('SELECT * FROM catalog_items WHERE active = 1 ORDER BY category, description')
    .all();
  return rows.map(mapCatalogRow);
}

/** API / workspace: active-only for matching; admin Catalog can load every row. */
export function listCatalogItemsForApi(includeInactive: boolean): CatalogItem[] {
  ensureTakeoffCatalogSeeded();
  const sql = includeInactive
    ? 'SELECT * FROM catalog_items ORDER BY category, description'
    : 'SELECT * FROM catalog_items WHERE active = 1 ORDER BY category, description';
  const rows = getEstimatorDb().prepare(sql).all();
  return rows.map(mapCatalogRow);
}

export function getCatalogInventoryCounts(): { total: number; active: number; inactive: number } {
  ensureTakeoffCatalogSeeded();
  const row = getEstimatorDb()
    .prepare(
      `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN active = 0 THEN 1 ELSE 0 END) AS inactive
      FROM catalog_items`
    )
    .get() as { total: number; active: number | null; inactive: number | null };
  return {
    total: row.total,
    active: Number(row.active ?? 0),
    inactive: Number(row.inactive ?? 0),
  };
}

/** Use after bulk DB import or when Sheet sync left most rows inactive. */
export function reactivateAllCatalogItems(): number {
  const result = getEstimatorDb().prepare('UPDATE catalog_items SET active = 1').run();
  return result.changes;
}