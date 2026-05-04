import { getEstimatorDb } from '../db/connection.ts';

export type CatalogAttributeType = 'finish' | 'coating' | 'grip' | 'mounting' | 'assembly';
export type CatalogDeltaType = 'absolute' | 'percent' | 'minutes';

export type CatalogItemAttributeRow = {
  id: string;
  catalogItemId: string;
  attributeType: CatalogAttributeType;
  attributeValue: string;
  materialDeltaType: CatalogDeltaType | null;
  materialDeltaValue: number | null;
  laborDeltaType: CatalogDeltaType | null;
  laborDeltaValue: number | null;
  active: boolean;
  sortOrder: number;
};

function mapRow(row: any): CatalogItemAttributeRow {
  return {
    id: String(row.id),
    catalogItemId: String(row.catalog_item_id),
    attributeType: String(row.attribute_type) as CatalogAttributeType,
    attributeValue: String(row.attribute_value),
    materialDeltaType: row.material_delta_type ? (String(row.material_delta_type) as CatalogDeltaType) : null,
    materialDeltaValue: row.material_delta_value == null ? null : Number(row.material_delta_value),
    laborDeltaType: row.labor_delta_type ? (String(row.labor_delta_type) as CatalogDeltaType) : null,
    laborDeltaValue: row.labor_delta_value == null ? null : Number(row.labor_delta_value),
    active: row.active == null ? true : !!row.active,
    sortOrder: Number(row.sort_order || 0),
  };
}

export function listCatalogAttributesForItem(catalogItemId: string, options?: { includeInactive?: boolean }): CatalogItemAttributeRow[] {
  const includeInactive = options?.includeInactive === true;
  const rows = getEstimatorDb()
    .prepare(
      `SELECT id, catalog_item_id, attribute_type, attribute_value, material_delta_type, material_delta_value,
              labor_delta_type, labor_delta_value, active, sort_order
       FROM catalog_item_attributes
       WHERE catalog_item_id = ?
         AND (${includeInactive ? '1=1' : 'active = 1'})
       ORDER BY sort_order ASC, attribute_type ASC, attribute_value ASC`
    )
    .all(catalogItemId);
  return (rows as any[]).map(mapRow);
}

export function createCatalogAttribute(input: {
  id: string;
  catalogItemId: string;
  attributeType: CatalogAttributeType;
  attributeValue: string;
  materialDeltaType?: CatalogDeltaType | null;
  materialDeltaValue?: number | null;
  laborDeltaType?: CatalogDeltaType | null;
  laborDeltaValue?: number | null;
  sortOrder?: number;
}): CatalogItemAttributeRow {
  const now = new Date().toISOString();
  getEstimatorDb()
    .prepare(
      `INSERT INTO catalog_item_attributes (
        id, catalog_item_id, attribute_type, attribute_value,
        material_delta_type, material_delta_value, labor_delta_type, labor_delta_value,
        active, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`
    )
    .run(
      input.id,
      input.catalogItemId,
      input.attributeType,
      input.attributeValue,
      input.materialDeltaType ?? null,
      input.materialDeltaValue ?? null,
      input.laborDeltaType ?? null,
      input.laborDeltaValue ?? null,
      Number(input.sortOrder || 0),
      now,
      now
    );

  return {
    id: input.id,
    catalogItemId: input.catalogItemId,
    attributeType: input.attributeType,
    attributeValue: input.attributeValue,
    materialDeltaType: input.materialDeltaType ?? null,
    materialDeltaValue: input.materialDeltaValue ?? null,
    laborDeltaType: input.laborDeltaType ?? null,
    laborDeltaValue: input.laborDeltaValue ?? null,
    active: true,
    sortOrder: Number(input.sortOrder || 0),
  };
}

export function deactivateCatalogAttribute(attributeId: string): void {
  getEstimatorDb()
    .prepare(`UPDATE catalog_item_attributes SET active = 0, updated_at = ? WHERE id = ?`)
    .run(new Date().toISOString(), attributeId);
}

