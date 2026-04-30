import { dbAll, dbRun } from '../db/query.ts';

export type CatalogAliasType = 'legacy_sku' | 'vendor_sku' | 'parser_phrase' | 'generic_name' | 'search_key';

export type CatalogItemAliasRow = {
  id: string;
  catalogItemId: string;
  aliasType: CatalogAliasType;
  aliasValue: string;
};

function mapRow(row: unknown): CatalogItemAliasRow {
  const r = row as Record<string, unknown>;
  return {
    id: String(r.id),
    catalogItemId: String(r.catalog_item_id),
    aliasType: String(r.alias_type) as CatalogAliasType,
    aliasValue: String(r.alias_value),
  };
}

export async function listCatalogAliasesForItem(catalogItemId: string): Promise<CatalogItemAliasRow[]> {
  const rows = await dbAll(
    `SELECT id, catalog_item_id, alias_type, alias_value
       FROM catalog_item_aliases
       WHERE catalog_item_id = ?
       ORDER BY alias_type, alias_value`,
    [catalogItemId]
  );
  return rows.map(mapRow);
}

export async function createCatalogAlias(input: {
  id: string;
  catalogItemId: string;
  aliasType: CatalogAliasType;
  aliasValue: string;
}): Promise<CatalogItemAliasRow> {
  const now = new Date().toISOString();
  await dbRun(
    `INSERT INTO catalog_item_aliases (id, catalog_item_id, alias_type, alias_value, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    [input.id, input.catalogItemId, input.aliasType, input.aliasValue, now, now]
  );
  return {
    id: input.id,
    catalogItemId: input.catalogItemId,
    aliasType: input.aliasType,
    aliasValue: input.aliasValue,
  };
}

export async function deleteCatalogAlias(aliasId: string): Promise<void> {
  await dbRun('DELETE FROM catalog_item_aliases WHERE id = ?', [aliasId]);
}
