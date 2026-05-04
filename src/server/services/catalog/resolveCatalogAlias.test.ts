import test from 'node:test';
import assert from 'node:assert/strict';

const isPg = String(process.env.DB_DRIVER || '').toLowerCase() === 'pg';

test(
  'resolveTargetCatalogItemIdBySkuOrAlias: GA-36 sku maps to c1 and BRADLEY-812 alias maps to c1 (SQLite local)',
  { skip: isPg },
  async () => {
    const { getEstimatorDb } = await import('../../db/connection.ts');
    getEstimatorDb();
    const { dbRun } = await import('../../db/query.ts');
    await dbRun(
      `INSERT OR IGNORE INTO catalog_items (id, sku, category, description, uom, base_material_cost, base_labor_minutes, manufacturer, model, taxable, ada_flag, active) VALUES (?, 'GA-36', 'Toilet Accessories', 'Grab Bar 36" Stainless Steel', 'EA', 45, 30, 'Bobrick', 'B-6806', 1, 0, 1)`,
      ['c1']
    );
    await dbRun("UPDATE catalog_items SET sku = 'GA-36', active = 1 WHERE id = 'c1'", []);
    const now = new Date().toISOString();
    await dbRun(
      `INSERT OR IGNORE INTO estimator_sku_aliases (id, alias_text, alias_kind, target_catalog_item_id, notes, active, created_at, updated_at)
       VALUES ('alias-bradley-812', 'BRADLEY-812', 'vendor_sku', 'c1', 'test seed', 1, ?, ?)`,
      [now, now]
    );

    const { resolveTargetCatalogItemIdBySkuOrAlias } = await import('./resolveCatalogAlias.ts');

    const a = await resolveTargetCatalogItemIdBySkuOrAlias('GA-36');
    const b = await resolveTargetCatalogItemIdBySkuOrAlias('bradley-812');
    assert.equal(a, 'c1');
    assert.equal(b, 'c1');
  }
);

test('resolveTargetCatalogItemIdBySkuOrAlias: empty and unknown return null (SQLite local)', { skip: isPg }, async () => {
  const { getEstimatorDb } = await import('../../db/connection.ts');
  getEstimatorDb();
  const { resolveTargetCatalogItemIdBySkuOrAlias } = await import('./resolveCatalogAlias.ts');
  assert.equal(await resolveTargetCatalogItemIdBySkuOrAlias(''), null);
  assert.equal(await resolveTargetCatalogItemIdBySkuOrAlias('  '), null);
  assert.equal(await resolveTargetCatalogItemIdBySkuOrAlias('TOTALLY-UNKNOWN-XYZ-123'), null);
});
