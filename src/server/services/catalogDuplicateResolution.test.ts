import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

test('duplicate resolution workflow: selects canonical, creates legacy SKU aliases, deprecates non-canon (no deletes)', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'install331-dupes-'));
  process.env.DATABASE_PATH = path.join(tmpDir, 'catalog.dupeResolution.test.db');

  const { getEstimatorDb } = await import('../db/connection.ts');
  const { createCatalogAlias, listCatalogAliasesForItem } = await import('../repos/catalogAliasesRepo.ts');

  const db = getEstimatorDb();

  const groupKey = `dup-${crypto.randomUUID()}`;
  const canonicalId = `c-${crypto.randomUUID()}`;
  const dupeId = `d-${crypto.randomUUID()}`;

  const insertItem = (id: string, sku: string, desc: string) => {
    db.prepare(
      `INSERT INTO catalog_items (
        id, sku, canonical_sku, is_canonical, alias_of, category, description, uom,
        base_material_cost, base_labor_minutes, taxable, ada_flag, active,
        duplicate_group_key, deprecated, deprecated_reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      sku,
      null,
      0,
      null,
      'Grab Bars',
      desc,
      'EA',
      100,
      60,
      0,
      0,
      1,
      groupKey,
      0,
      null
    );
  };

  insertItem(canonicalId, 'GB-36', 'Grab Bar 36"');
  insertItem(dupeId, 'GB-36-OLD', 'Grab Bar 36" legacy row');

  // Simulate the client duplicate resolution sequence (canonicalize + alias + deprecate).
  db.prepare(
    `UPDATE catalog_items
      SET canonical_sku = ?, is_canonical = 1, alias_of = NULL, deprecated = 0, deprecated_reason = NULL
      WHERE id = ?`
  ).run('GB-36', canonicalId);

  // Create legacy alias for the duplicate SKU.
  createCatalogAlias({
    id: `a-${crypto.randomUUID()}`,
    catalogItemId: canonicalId,
    aliasType: 'legacy_sku',
    aliasValue: 'GB-36-OLD',
  });

  db.prepare(
    `UPDATE catalog_items
      SET canonical_sku = ?, is_canonical = 0, alias_of = ?, deprecated = 1, deprecated_reason = ?
      WHERE id = ?`
  ).run('GB-36', canonicalId, `Duplicate of GB-36 (Grab Bar 36")`, dupeId);

  const canon = db.prepare('SELECT * FROM catalog_items WHERE id = ?').get(canonicalId) as any;
  const dup = db.prepare('SELECT * FROM catalog_items WHERE id = ?').get(dupeId) as any;

  assert.ok(canon);
  assert.equal(canon.is_canonical, 1);
  assert.equal(canon.deprecated, 0);
  assert.equal(String(canon.canonical_sku), 'GB-36');

  assert.ok(dup);
  assert.equal(dup.is_canonical, 0);
  assert.equal(dup.deprecated, 1);
  assert.equal(String(dup.alias_of), canonicalId);
  assert.ok(String(dup.deprecated_reason || '').includes('Duplicate of GB-36'));

  const aliases = listCatalogAliasesForItem(canonicalId);
  assert.ok(aliases.some((a) => a.aliasType === 'legacy_sku' && a.aliasValue === 'GB-36-OLD'));
});

