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