import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * SQLite transaction path mirroring sheet sync ordering (items → modifiers → bundles → aliases → attributes).
 * No Google APIs; fixture rows exercise staging + relational upserts deterministically.
 */
test('catalog sheet upserts: items, staging, modifiers, bundles, aliases, attributes', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'install331-sheet-sync-int-'));
  process.env.DATABASE_PATH = path.join(tmpDir, 'estimator.sheet-sync-integration.db');
  process.env.DB_DRIVER = 'sqlite';
  delete process.env.CATALOG_SYNC_SKIP_STAGING;

  const { getEstimatorDb } = await import('../db/connection.ts');
  const { withCatalogSyncWriteTransaction } = await import('./catalogSyncTransaction.ts');
  const {
    upsertItems,
    upsertModifiers,
    upsertBundles,
    upsertAliases,
    upsertAttributes,
  } = await import('./googleSheetsCatalogSync.ts');

  const db = getEstimatorDb();
  const batchId = 'integration-batch-fixed-id';

  const itemRows = [
    ['SKU', 'Description', 'Unit', 'Material Cost', 'Base Labor Minutes', 'Active', 'Scope Category'],
    ['INT-SKU-1', 'Integration fixture item', 'EA', '125.50', '45', 'TRUE', 'Fixtures'],
  ];

  const modifierRows = [
    ['ModifierKey', 'Name', 'AppliesToCategories', 'AddLaborMinutes', 'AddMaterialCost', 'Active'],
    ['EDGE_TRIM', 'Edge trim', 'Fixtures', '0', '0', 'TRUE'],
  ];

  const bundleRows = [
    ['BundleName', 'IncludedSKUs', 'IncludedModifiers', 'Active'],
    ['Integration bundle', 'INT-SKU-1', 'EDGE_TRIM', 'TRUE'],
  ];

  const aliasRows = [
    ['Canonical_SKU', 'AliasType', 'AliasValue', 'Active'],
    ['INT-SKU-1', 'legacy_sku', 'LEGACY-ALT-9', 'TRUE'],
  ];

  const attributeRows = [
    ['Canonical_SKU', 'AttributeType', 'AttributeValue', 'MaterialDeltaType', 'MaterialDeltaValue', 'Active', 'SortOrder'],
    ['INT-SKU-1', 'finish', 'BRUSHED_NICKEL', 'absolute', '12', 'TRUE', '1'],
  ];

  const warnings: string[] = [];

  await withCatalogSyncWriteTransaction(async (ex) => {
    const itemsSynced = await upsertItems(ex, itemRows, warnings, false, {
      batchId,
      itemsTab: 'CLEAN_ITEMS',
    });
    const modifiersSynced = await upsertModifiers(ex, modifierRows, warnings, false);
    const bundleData = await upsertBundles(ex, 'catalog_items', bundleRows, warnings, false);
    const aliasData = await upsertAliases(ex, 'catalog_items', aliasRows, warnings);
    const attributeData = await upsertAttributes(ex, 'catalog_items', attributeRows, warnings);

    assert.equal(itemsSynced, 1);
    assert.equal(modifiersSynced, 1);
    assert.equal(bundleData.bundlesSynced, 1);
    assert.equal(bundleData.bundleItemsSynced, 1);
    assert.equal(aliasData.aliasesSynced, 1);
    assert.equal(attributeData.attributesSynced, 1);
  });

  const stagingCount = db
    .prepare('SELECT COUNT(1) as c FROM catalog_sheet_import_rows WHERE sync_batch_id = ?')
    .get(batchId) as { c: number };
  assert.equal(stagingCount.c, 1);

  const item = db
    .prepare('SELECT id, sku, catalog_source, catalog_source_tab FROM catalog_items WHERE sku = ?')
    .get('INT-SKU-1') as { id: string; sku: string; catalog_source: string | null; catalog_source_tab: string | null };

  assert.ok(item);
  assert.equal(item.catalog_source, 'google_sheet');
  assert.equal(item.catalog_source_tab, 'CLEAN_ITEMS');

  const mod = db.prepare('SELECT modifier_key FROM modifiers_v1 WHERE modifier_key = ?').get('EDGE_TRIM');
  assert.ok(mod);

  const bi = db.prepare('SELECT COUNT(1) as c FROM bundle_items_v1 WHERE catalog_item_id = ?').get(item.id) as { c: number };
  assert.equal(bi.c, 1);

  const alias = db
    .prepare('SELECT alias_value FROM catalog_item_aliases WHERE catalog_item_id = ? AND alias_type = ?')
    .get(item.id, 'legacy_sku') as { alias_value: string };
  assert.equal(alias.alias_value, 'LEGACY-ALT-9');

  const attr = db
    .prepare(
      'SELECT material_delta_type, CAST(material_delta_value AS REAL) as mv FROM catalog_item_attributes WHERE catalog_item_id = ? AND attribute_type = ?'
    )
    .get(item.id, 'finish') as { material_delta_type: string | null; mv: number };

  assert.equal(attr.material_delta_type, 'absolute');
  assert.ok(Math.abs(attr.mv - 12) < 0.001);

  await withCatalogSyncWriteTransaction(async (ex) => {
    const again = await upsertAliases(ex, 'catalog_items', aliasRows, warnings);
    assert.equal(again.aliasesSynced, 1);
  });

  const aliasCount = db.prepare('SELECT COUNT(1) as c FROM catalog_item_aliases WHERE catalog_item_id = ?').get(item.id) as {
    c: number;
  };
  assert.equal(aliasCount.c, 1);
});
