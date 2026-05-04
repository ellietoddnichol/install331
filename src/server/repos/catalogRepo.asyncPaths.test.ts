import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('catalogRepo list/count helpers use db abstraction and honor CATALOG_ITEMS_TABLE', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'install331-catalog-async-'));
  process.env.DATABASE_PATH = path.join(tmpDir, 'catalog.asyncPaths.test.db');

  const { getEstimatorDb } = await import('../db/connection.ts');
  const { listActiveCatalogItems, getCatalogInventoryCounts } = await import('./catalogRepo.ts');

  const db = getEstimatorDb();
  db.prepare(
    `INSERT INTO catalog_items (
      id, sku, canonical_sku, is_canonical, alias_of, category, description, uom,
      base_material_cost, base_labor_minutes, taxable, ada_flag, active, deprecated, deprecated_reason
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run('ca-1', 'SKU-A', 'SKU-A', 1, null, 'Cat', 'Item A', 'EA', 1, 1, 0, 0, 1, 0, null);

  db.prepare(
    `INSERT INTO catalog_items (
      id, sku, canonical_sku, is_canonical, alias_of, category, description, uom,
      base_material_cost, base_labor_minutes, taxable, ada_flag, active, deprecated, deprecated_reason
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run('ca-2', 'SKU-B', 'SKU-B', 1, null, 'Cat', 'Item B inactive', 'EA', 1, 1, 0, 0, 0, 0, null);

  const listed = await listActiveCatalogItems();
  assert.ok(listed.some((r) => r.id === 'ca-1'));
  assert.ok(!listed.some((r) => r.id === 'ca-2'));

  const counts = await getCatalogInventoryCounts();
  assert.ok(counts.total >= 2);
  assert.ok(counts.active >= 1);
  assert.ok(counts.inactive >= 1);

  db.exec(`CREATE VIEW IF NOT EXISTS catalog_items_clean AS SELECT * FROM catalog_items`);
  const prev = process.env.CATALOG_ITEMS_TABLE;
  try {
    process.env.CATALOG_ITEMS_TABLE = 'catalog_items_clean';
    const listedClean = await listActiveCatalogItems();
    assert.ok(listedClean.some((r) => r.id === 'ca-1'));
  } finally {
    if (prev === undefined) delete process.env.CATALOG_ITEMS_TABLE;
    else process.env.CATALOG_ITEMS_TABLE = prev;
  }
});

test('settingsRepo catalog sync reads use db abstraction', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'install331-settings-sync-'));
  process.env.DATABASE_PATH = path.join(tmpDir, 'settings.sync.test.db');

  const { getEstimatorDb } = await import('../db/connection.ts');
  const { getCatalogSyncStatus, listCatalogSyncRuns } = await import('./settingsRepo.ts');

  getEstimatorDb();

  const row = await getCatalogSyncStatus();
  assert.equal(row.id, 'catalog');
  assert.ok(['never', 'running', 'success', 'failed'].includes(row.status));

  const runs = await listCatalogSyncRuns(5);
  assert.ok(Array.isArray(runs));
});
