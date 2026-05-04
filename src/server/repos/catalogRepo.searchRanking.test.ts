import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('searchCatalogItemsForApi ranks sku/alias/canonical_sku and hides deprecated/non-canonical by default', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'install331-search-rank-'));
  process.env.DATABASE_PATH = path.join(tmpDir, 'catalog.searchRank.test.db');

  const { getEstimatorDb } = await import('../db/connection.ts');
  const { searchCatalogItemsForApi } = await import('./catalogRepo.ts');

  const db = getEstimatorDb();

  // Canonical item.
  db.prepare(
    `INSERT INTO catalog_items (
      id, sku, canonical_sku, is_canonical, alias_of, category, description, uom,
      base_material_cost, base_labor_minutes, taxable, ada_flag, active, deprecated, deprecated_reason
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    'c-can',
    'GB-36',
    'GB-36',
    1,
    null,
    'Grab Bars',
    'Grab Bar 36"',
    'EA',
    100,
    60,
    0,
    0,
    1,
    0,
    null
  );

  // Non-canonical legacy duplicate row (should be hidden by default).
  db.prepare(
    `INSERT INTO catalog_items (
      id, sku, canonical_sku, is_canonical, alias_of, category, description, uom,
      base_material_cost, base_labor_minutes, taxable, ada_flag, active, deprecated, deprecated_reason
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    'c-dup',
    'GB-36-MB',
    'GB-36',
    0,
    'c-can',
    'Grab Bars',
    'Grab Bar 36" Matte Black',
    'EA',
    110,
    60,
    0,
    0,
    1,
    0,
    null
  );

  // Deprecated row (hidden by default).
  db.prepare(
    `INSERT INTO catalog_items (
      id, sku, canonical_sku, is_canonical, alias_of, category, description, uom,
      base_material_cost, base_labor_minutes, taxable, ada_flag, active, deprecated, deprecated_reason
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    'c-dep',
    'GB-OLD',
    'GB-36',
    0,
    'c-can',
    'Grab Bars',
    'Grab Bar 36" legacy',
    'EA',
    90,
    60,
    0,
    0,
    1,
    1,
    'legacy'
  );

  // Alias for canonical.
  db.prepare(
    `INSERT INTO catalog_item_aliases (id, catalog_item_id, alias_type, alias_value)
     VALUES (?, ?, ?, ?)`
  ).run('a1', 'c-can', 'legacy_sku', '4781-11');

  // Query by alias should resolve to canonical and not include non-canon/deprecated by default.
  const byAlias = searchCatalogItemsForApi({ query: '4781-11' });
  assert.equal(byAlias[0]?.id, 'c-can');
  assert.ok(byAlias.every((r) => r.id !== 'c-dup'));
  assert.ok(byAlias.every((r) => r.id !== 'c-dep'));

  // Query by sku should rank canonical first.
  const bySku = searchCatalogItemsForApi({ query: 'GB-36' });
  assert.equal(bySku[0]?.id, 'c-can');

  // Including non-canonical should show the duplicate row too.
  const includeNonCanonical = searchCatalogItemsForApi({ query: 'GB-36', includeNonCanonical: true });
  assert.ok(includeNonCanonical.some((r) => r.id === 'c-dup'));

  // Including deprecated should show the deprecated row too.
  const includeDeprecated = searchCatalogItemsForApi({ query: 'GB-OLD', includeDeprecated: true, includeNonCanonical: true });
  assert.ok(includeDeprecated.some((r) => r.id === 'c-dep'));
});

