import { sqlCatalogActiveEqualsOne } from '../db/catalogSql.ts';
import { dbCatalogAll, dbCatalogGet } from '../db/query.ts';
import type {
  EstimatorCatalogItemAttribute,
  EstimatorParametricModifier,
  EstimatorSkuAlias,
} from '../../shared/types/estimatorCatalogNorm.ts';
import {
  getCatalogItemsTableName,
  getEstimatorCatalogItemAttributesReadTableName,
  getEstimatorParametricModifiersReadTableName,
  getEstimatorSkuAliasesReadTableName,
} from '../db/catalogTable.ts';

function mapParametric(row: any): EstimatorParametricModifier {
  let applies: string[] = [];
  try {
    applies = JSON.parse(row.applies_to_categories_json || '[]');
  } catch {
    applies = [];
  }
  if (!Array.isArray(applies)) applies = [];
  return {
    id: row.id,
    modifierKey: row.modifier_key,
    name: row.name,
    description: String(row.description ?? ''),
    appliesToCategories: applies.map(String),
    addLaborMinutes: Number(row.add_labor_minutes),
    addMaterialCost: Number(row.add_material_cost),
    percentLabor: Number(row.percent_labor),
    percentMaterial: Number(row.percent_material),
    laborCostMultiplier: Number(row.labor_cost_multiplier ?? 1) || 1,
    active: !!row.active,
    updatedAt: String(row.updated_at),
  };
}

function mapItemAttr(row: any): EstimatorCatalogItemAttribute {
  return {
    id: row.id,
    catalogItemId: row.catalog_item_id,
    attributeId: row.attribute_id,
    value: String(row.value),
    createdAt: String(row.created_at),
  };
}

function mapAlias(row: any): EstimatorSkuAlias {
  return {
    id: row.id,
    aliasText: String(row.alias_text),
    aliasKind: String(row.alias_kind),
    targetCatalogItemId: String(row.target_catalog_item_id),
    notes: row.notes != null ? String(row.notes) : null,
    active: !!row.active,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function listParametricModifiers(includeInactive = false): Promise<EstimatorParametricModifier[]> {
  const rel = getEstimatorParametricModifiersReadTableName();
  const act = sqlCatalogActiveEqualsOne('active');
  const sql = includeInactive ? `SELECT * FROM ${rel} ORDER BY modifier_key` : `SELECT * FROM ${rel} WHERE ${act} ORDER BY modifier_key`;
  const rows = await dbCatalogAll(sql);
  return rows.map(mapParametric);
}

export async function getParametricModifierByKey(key: string): Promise<EstimatorParametricModifier | null> {
  const k = String(key || '').trim();
  if (!k) return null;
  const row = await dbCatalogGet(
    `SELECT * FROM ${getEstimatorParametricModifiersReadTableName()} WHERE modifier_key = ? AND ${sqlCatalogActiveEqualsOne('active')}`,
    [k]
  );
  return row ? mapParametric(row) : null;
}

export async function listSkuAliases(): Promise<EstimatorSkuAlias[]> {
  const rel = getEstimatorSkuAliasesReadTableName();
  const rows = await dbCatalogAll(`SELECT * FROM ${rel} WHERE ${sqlCatalogActiveEqualsOne('active')} ORDER BY lower(alias_text)`);
  return rows.map(mapAlias);
}

/**
 * Resolves a catalog row id: active SKU on `catalog_items` first, then `estimator_sku_aliases` (case-insensitive trim).
 * Does not apply attributes/modifiers; callers keep using existing estimate paths on `catalog_items` only.
 */
export async function resolveTargetCatalogItemIdBySkuOrAlias(raw: string): Promise<string | null> {
  const t = String(raw || '').trim();
  if (!t) return null;

  const table = getCatalogItemsTableName();
  const bySku = await dbCatalogGet<{ id: string }>(
    `SELECT id FROM ${table} WHERE ${sqlCatalogActiveEqualsOne('active')} AND upper(trim(sku)) = upper(?)`,
    [t]
  );
  if (bySku) return bySku.id;

  const aliasRel = getEstimatorSkuAliasesReadTableName();
  const byAlias = await dbCatalogGet<{ target_catalog_item_id: string }>(
    `SELECT target_catalog_item_id FROM ${aliasRel} WHERE ${sqlCatalogActiveEqualsOne('active')} AND lower(trim(alias_text)) = lower(?)`,
    [t]
  );
  if (byAlias) return byAlias.target_catalog_item_id;

  return null;
}

export async function listItemAttributesForCatalogItem(catalogItemId: string): Promise<EstimatorCatalogItemAttribute[]> {
  const rel = getEstimatorCatalogItemAttributesReadTableName();
  const rows = await dbCatalogAll(`SELECT * FROM ${rel} WHERE catalog_item_id = ? ORDER BY created_at, id`, [catalogItemId]);
  return rows.map(mapItemAttr);
}
