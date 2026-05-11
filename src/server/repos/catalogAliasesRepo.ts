import { isPgCatalogBackend } from '../db/catalogBackend.ts';
import {
  getCatalogItemAliasesReadTableName,
  getCatalogItemAliasesWriteTableName,
  isCatalogAliasesBrainTableName,
} from '../db/catalogTable.ts';
import { getEstimatorDb } from '../db/connection.ts';
import { dbCatalogAll, dbCatalogRun } from '../db/query.ts';

export type CatalogAliasType = 'legacy_sku' | 'vendor_sku' | 'parser_phrase' | 'generic_name' | 'search_key';

export type CatalogItemAliasRow = {
  id: string;
  catalogItemId: string;
  aliasType: CatalogAliasType;
  aliasValue: string;
};

function mapRow(row: any): CatalogItemAliasRow {
  const aliasValue = row.alias_value ?? row.alias_text;
  return {
    id: String(row.id),
    catalogItemId: String(row.catalog_item_id),
    aliasType: String(row.alias_type) as CatalogAliasType,
    aliasValue: String(aliasValue ?? ''),
  };
}

export async function listCatalogAliasesForItem(catalogItemId: string): Promise<CatalogItemAliasRow[]> {
  const rel = getCatalogItemAliasesReadTableName();
  const valueCol = isCatalogAliasesBrainTableName(rel) ? 'alias_text' : 'alias_value';
  const orderSecond = isCatalogAliasesBrainTableName(rel) ? 'alias_text' : 'alias_value';
  const sql = `SELECT id, catalog_item_id, alias_type, ${valueCol} AS alias_value
       FROM ${rel}
       WHERE catalog_item_id = ?
       ORDER BY alias_type, ${orderSecond}`;
  if (isPgCatalogBackend()) {
    const rows = await dbCatalogAll(sql, [catalogItemId]);
    return (rows as any[]).map(mapRow);
  }
  const rows = getEstimatorDb().prepare(sql).all(catalogItemId);
  return (rows as any[]).map(mapRow);
}

export async function createCatalogAlias(input: {
  id: string;
  catalogItemId: string;
  aliasType: CatalogAliasType;
  aliasValue: string;
}): Promise<CatalogItemAliasRow> {
  const writeRel = getCatalogItemAliasesWriteTableName();
  const now = new Date().toISOString();
  if (isPgCatalogBackend()) {
    if (isCatalogAliasesBrainTableName(writeRel)) {
      await dbCatalogRun(
        `INSERT INTO ${writeRel} (id, catalog_item_id, alias_text, alias_type, created_at) VALUES (?, ?, ?, ?, ?)`,
        [input.id, input.catalogItemId, input.aliasValue, input.aliasType, now]
      );
    } else {
      await dbCatalogRun(
        `INSERT INTO ${writeRel} (id, catalog_item_id, alias_type, alias_value, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [input.id, input.catalogItemId, input.aliasType, input.aliasValue, now, now]
      );
    }
  } else if (isCatalogAliasesBrainTableName(writeRel)) {
    getEstimatorDb()
      .prepare(`INSERT INTO ${writeRel} (id, catalog_item_id, alias_text, alias_type, created_at) VALUES (?, ?, ?, ?, ?)`)
      .run(input.id, input.catalogItemId, input.aliasValue, input.aliasType, now);
  } else {
    getEstimatorDb()
      .prepare(
        `INSERT INTO ${writeRel} (id, catalog_item_id, alias_type, alias_value, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(input.id, input.catalogItemId, input.aliasType, input.aliasValue, now, now);
  }
  return {
    id: input.id,
    catalogItemId: input.catalogItemId,
    aliasType: input.aliasType,
    aliasValue: input.aliasValue,
  };
}

export async function deleteCatalogAlias(aliasId: string): Promise<void> {
  const writeRel = getCatalogItemAliasesWriteTableName();
  if (isPgCatalogBackend()) {
    await dbCatalogRun(`DELETE FROM ${writeRel} WHERE id = ?`, [aliasId]);
  } else {
    getEstimatorDb().prepare(`DELETE FROM ${writeRel} WHERE id = ?`).run(aliasId);
  }
}
