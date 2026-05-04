import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('upsertAliases + upsertAttributes ingest Canonical_SKU sheet rows safely', async () => {
  // Uses the normal schema init path (connection.ts), but points it at a temp DB file.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'install331-test-'));
  process.env.DATABASE_PATH = path.join(tmpDir, 'estimator.aliases-attrs.test.db');
  const { getEstimatorDb } = await import('../db/connection.ts');
  const { upsertAliases, upsertAttributes } = await import('./googleSheetsCatalogSync.ts');
  const db = getEstimatorDb();

  // Seed one catalog item.
  db.prepare(
    `INSERT INTO catalog_items (
      id, sku, canonical_sku, category, description, uom, base_material_cost, base_labor_minutes, taxable, ada_flag, active
    ) VALUES (
      'test-c1', 'GB-36', 'GB-36', 'Toilet Accessories', 'Grab Bar', 'EA', 100, 60, 1, 0, 1
    )`
  ).run();

  const warnings: string[] = [];

  const aliasRows = [
    ['Canonical_SKU', 'AliasType', 'AliasValue', 'Active', 'Notes'],
    ['GB-36', 'legacy_sku', '4781-11', 'TRUE', ''],
  ];
  const attributeRows = [
    ['Canonical_SKU', 'AttributeType', 'AttributeValue', 'MaterialDeltaType', 'MaterialDeltaValue', 'LaborDeltaType', 'LaborDeltaValue', 'Active', 'SortOrder', 'Notes'],
    ['GB-36', 'finish', 'MATTE_BLACK', 'absolute', '10', 'percent', '10', 'TRUE', '0', ''],
  ];

  const a = upsertAliases(aliasRows, warnings);
  const b = upsertAttributes(attributeRows, warnings);
  assert.equal(a.aliasesSynced, 1);
  assert.equal(b.attributesSynced, 1);

  const alias = db.prepare('SELECT * FROM catalog_item_aliases WHERE catalog_item_id = ?').get('test-c1') as any;
  assert.ok(alias);
  assert.equal(alias.alias_type, 'legacy_sku');
  assert.equal(alias.alias_value, '4781-11');

  const attr = db
    .prepare('SELECT * FROM catalog_item_attributes WHERE catalog_item_id = ? AND attribute_type = ? AND attribute_value = ?')
    .get('test-c1', 'finish', 'MATTE_BLACK') as any;
  assert.ok(attr);
  assert.equal(attr.material_delta_type, 'absolute');
  assert.equal(Number(attr.material_delta_value), 10);
  assert.equal(attr.labor_delta_type, 'percent');
  assert.equal(Number(attr.labor_delta_value), 10);
  assert.equal(attr.active, 1);
});

