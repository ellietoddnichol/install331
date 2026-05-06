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

/** Regression: duplicate ITEMS stable keys map to one upsert target (sheet last row wins); avoids UNIQUE on catalog_items.id. */
test('ITEMS duplicate SKU rows: last sheet row wins, single synced item', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'install331-sheet-sync-dup-'));
  process.env.DATABASE_PATH = path.join(tmpDir, 'estimator.sheet-sync-dup.db');
  process.env.DB_DRIVER = 'sqlite';
  process.env.CATALOG_SYNC_SKIP_STAGING = '1';

  const { getEstimatorDb } = await import('../db/connection.ts');
  const { withCatalogSyncWriteTransaction } = await import('./catalogSyncTransaction.ts');
  const { upsertItems } = await import('./googleSheetsCatalogSync.ts');

  const db = getEstimatorDb();

  const itemRows = [
    ['SKU', 'Description', 'Unit', 'Material Cost', 'Base Labor Minutes', 'Active', 'Scope Category'],
    ['DUP-SKU-777', 'First row dup', 'EA', '10', '1', 'TRUE', 'Fixtures'],
    ['DUP-SKU-777', 'Last row wins dup', 'EA', '42', '99', 'TRUE', 'Fixtures'],
  ];
  const warnings: string[] = [];

  await withCatalogSyncWriteTransaction(async (ex) => {
    const n = await upsertItems(ex, itemRows, warnings, false, {
      batchId: 'dup-sku-batch',
      itemsTab: 'CLEAN_ITEMS',
    });
    assert.equal(n, 1);
  });

  const row = db.prepare('SELECT description, CAST(base_material_cost AS REAL) as m FROM catalog_items WHERE sku = ?').get('DUP-SKU-777') as {
    description: string;
    m: number;
  };
  assert.ok(row);
  assert.equal(row.description, 'Last row wins dup');
  assert.ok(Math.abs(row.m - 42) < 0.001);
});

test('sheet sync updates by primary key when sheetDerivedId exists but sku lookup misses', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'install331-sheet-sync-pk-'));
  process.env.DATABASE_PATH = path.join(tmpDir, 'estimator.sheet-sync-pk.db');
  process.env.DB_DRIVER = 'sqlite';
  process.env.CATALOG_SYNC_SKIP_STAGING = '1';

  const { getEstimatorDb } = await import('../db/connection.ts');
  const { withCatalogSyncWriteTransaction } = await import('./catalogSyncTransaction.ts');
  const { upsertItems } = await import('./googleSheetsCatalogSync.ts');

  const db = getEstimatorDb();
  const sku = 'COLLIDE-SKU-A';
  const sheetDerivedId = `sheet-item-${sku.toLowerCase()}`;

  db.prepare(
    `INSERT INTO catalog_items (
      id, sku, category, description, uom, base_material_cost, base_labor_minutes,
      taxable, ada_flag, tags, notes, active, canonical_sku, is_canonical, deprecated
    ) VALUES (?, NULL, ?, ?, 'EA', 0, 0, 1, 0, '[]', NULL, 1, NULL, 1, 0)`
  ).run(sheetDerivedId, 'Cats', 'Legacy row without SKU value');

  const itemRows = [
    ['SKU', 'Description', 'Unit', 'Material Cost', 'Base Labor Minutes', 'Active', 'Scope Category'],
    [sku, 'Updated by sheet sync', 'EA', '10', '5', 'TRUE', 'Cats'],
  ];
  const warnings: string[] = [];

  await withCatalogSyncWriteTransaction(async (ex) => {
    const n = await upsertItems(ex, itemRows, warnings, false, {
      batchId: 'pk-collision-batch',
      itemsTab: 'CLEAN_ITEMS',
    });
    assert.equal(n, 1);
  });

  const row = db.prepare('SELECT sku, description FROM catalog_items WHERE id = ?').get(sheetDerivedId) as {
    sku: string | null;
    description: string;
  };
  assert.equal(row?.sku, sku);
  assert.equal(row?.description, 'Updated by sheet sync');
});

/** CLEAN_ITEMS `Canonical_SKU` must land in DB and match BUNDLES / ALIASES tokens (not only the `SKU` column). */
test('ITEMS Canonical_SKU column: bundle lines resolve included SKU to correct catalog row', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'install331-sheet-sync-canon-'));
  process.env.DATABASE_PATH = path.join(tmpDir, 'estimator.sheet-sync-canon.db');
  process.env.DB_DRIVER = 'sqlite';
  process.env.CATALOG_SYNC_SKIP_STAGING = '1';

  const { getEstimatorDb } = await import('../db/connection.ts');
  const { withCatalogSyncWriteTransaction } = await import('./catalogSyncTransaction.ts');
  const { upsertItems, upsertBundles } = await import('./googleSheetsCatalogSync.ts');
  const { preflightCatalogWorkbookSync } = await import('./catalogSyncWorkbookValidation.ts');

  const db = getEstimatorDb();
  const warnings: string[] = [];

  const itemRows = [
    ['SKU', 'Canonical_SKU', 'Description', 'Unit', 'Material Cost', 'Base Labor Minutes', 'Active', 'Scope Category'],
    ['internal-row-99', 'PUB-CANON-1', 'Row keyed by public canonical', 'EA', '11', '6', 'TRUE', 'Fixtures'],
  ];
  const bundleRows = [
    ['BundleName', 'IncludedSKUs', 'Active'],
    ['Canon bundle', 'PUB-CANON-1', 'TRUE'],
  ];

  await withCatalogSyncWriteTransaction(async (ex) => {
    await upsertItems(ex, itemRows, warnings, false, { batchId: 'canon-batch', itemsTab: 'CLEAN_ITEMS' });
    const bundleData = await upsertBundles(ex, 'catalog_items', bundleRows, warnings, false);
    assert.equal(bundleData.bundleItemsSynced, 1);
  });

  const row = db
    .prepare('SELECT id, sku, canonical_sku FROM catalog_items WHERE sku = ?')
    .get('internal-row-99') as { id: string; sku: string; canonical_sku: string | null };
  assert.ok(row);
  assert.equal(row.canonical_sku, 'PUB-CANON-1');

  const bi = db
    .prepare('SELECT catalog_item_id, sku FROM bundle_items_v1 WHERE sku = ?')
    .get('internal-row-99') as { catalog_item_id: string; sku: string };
  assert.ok(bi);
  assert.equal(bi.catalog_item_id, row.id);

  const pre = await preflightCatalogWorkbookSync({
    itemRows,
    modifierRows: [['ModifierKey', 'Name', 'Active'], ['K', 'N', 'TRUE']],
    bundleRows,
    aliasRows: null,
    attributeRows: null,
  });
  assert.equal(pre.blocking.length, 0, pre.blocking.join('\n'));
});

/** Regression: failed attempts must update status/message without clobbering count columns (`updateSyncStatus` omits counts on failure). */
test('catalog_sync_status_v1 retains last successful counts when only status and message fail', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'install331-sheet-sync-pres-'));
  process.env.DATABASE_PATH = path.join(tmpDir, 'estimator.sync-pres.db');
  process.env.DB_DRIVER = 'sqlite';

  const { getEstimatorDb } = await import('../db/connection.ts');
  const db = getEstimatorDb();

  db.prepare(
    `UPDATE catalog_sync_status_v1 SET items_synced = ?, modifiers_synced = ?, bundles_synced = ?, bundle_items_synced = ?, aliases_synced = ?, attributes_synced = ?, status = 'success', message = ?
     WHERE id = 'catalog'`
  ).run(321, 4, 2, 0, 1, 0, 'Catalog sync complete: 321 items.');

  const failedAt = new Date().toISOString();
  db.prepare(
    `UPDATE catalog_sync_status_v1 SET status = 'failed', message = ?, last_attempt_at = ?, warnings_json = '[]'
     WHERE id = 'catalog'`
  ).run(`Missing required tab "CLEAN_ITEMS".`, failedAt);

  const row = db.prepare('SELECT items_synced, modifiers_synced, status, message FROM catalog_sync_status_v1 WHERE id = ?').get('catalog') as {
    items_synced: number;
    modifiers_synced: number;
    status: string;
    message: string | null;
  };
  assert.equal(row.items_synced, 321);
  assert.equal(row.modifiers_synced, 4);
  assert.equal(row.status, 'failed');
  assert.match(String(row.message), /Missing required tab/i);
});
