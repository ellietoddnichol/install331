import test from 'node:test';
import assert from 'node:assert/strict';

test('getCatalogItemsTableName allows only whitelisted relations', async () => {
  const prev = process.env.CATALOG_ITEMS_TABLE;
  try {
    const { getCatalogItemsTableName, getCatalogItemsWriteTableName } = await import('./catalogTable.ts');

    process.env.CATALOG_ITEMS_TABLE = 'catalog_items_clean';
    assert.equal(getCatalogItemsTableName(), 'catalog_items_clean');
    assert.equal(getCatalogItemsWriteTableName(), 'catalog_items');

    process.env.CATALOG_ITEMS_TABLE = 'catalog_items';
    assert.equal(getCatalogItemsTableName(), 'catalog_items');
    assert.equal(getCatalogItemsWriteTableName(), 'catalog_items');

    process.env.CATALOG_ITEMS_TABLE = 'catalog_items; DROP TABLE catalog_items; --';
    assert.equal(getCatalogItemsTableName(), 'catalog_items');

    delete process.env.CATALOG_ITEMS_TABLE;
    assert.equal(getCatalogItemsTableName(), 'catalog_items');
    assert.equal(getCatalogItemsWriteTableName(), 'catalog_items');
  } finally {
    if (prev === undefined) delete process.env.CATALOG_ITEMS_TABLE;
    else process.env.CATALOG_ITEMS_TABLE = prev;
  }
});
