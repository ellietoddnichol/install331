import { getEstimatorDb } from '../db/connection.ts';

export type CatalogAliasType = 'legacy_sku' | 'vendor_sku' | 'parser_phrase' | 'generic_name' | 'search_key';

export type CatalogItemAliasRow = {
  id: string;
  catalogItemId: string;
  aliasType: CatalogAliasType;
  aliasValue: string;
};

function mapRow(row: any): CatalogItemAliasRow {
  return {
    id: String(row.id),
    catalogItemId: String(row.catalog_item_id),
    aliasType: String(row.alias_type) as CatalogAliasType,
    aliasValue: String(row.alias_value),
  };
}

export function listCatalogAliasesForItem(catalogItemId: string): CatalogItemAliasRow[] {
  const rows = getEstimatorDb()
    .prepare(
      `SELECT id, catalog_item_id, alias_type, alias_value
       FROM catalog_item_aliases
       WHERE catalog_item_id = ?
       ORDER BY alias_type, alias_value`
    )
    .all(catalogItemId);
  return (rows as any[]).map(mapRow);
}

export function createCatalogAlias(input: {
  id: string;
  catalogItemId: string;
  aliasType: CatalogAliasType;
  aliasValue: string;
}): CatalogItemAliasRow {
  getEstimatorDb()
    .prepare(
      `INSERT INTO catalog_item_aliases (id, catalog_item_id, alias_type, alias_value, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.id,
      input.catalogItemId,
      input.aliasType,
      input.aliasValue,
      new Date().toISOString(),
      new Date().toISOString()
    );
  return {
    id: input.id,
    catalogItemId: input.catalogItemId,
    aliasType: input.aliasType,
    aliasValue: input.aliasValue,
  };
}

export function deleteCatalogAlias(aliasId: string): void {
  getEstimatorDb().prepare('DELETE FROM catalog_item_aliases WHERE id = ?').run(aliasId);
}

