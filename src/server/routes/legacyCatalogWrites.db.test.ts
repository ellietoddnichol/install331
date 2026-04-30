import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('legacy-style catalog soft-delete and modifier update execute via db abstraction', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'install331-legacy-writes-'));
  process.env.DATABASE_PATH = path.join(tmpDir, 'legacy.writes.test.db');

  const { getEstimatorDb } = await import('../db/connection.ts');
  getEstimatorDb();

  const { dbRun, dbGet, dbAll } = await import('../db/query.ts');
  const { getCatalogItemsTableName } = await import('../db/catalogTable.ts');

  const table = getCatalogItemsTableName();
  const itemId = 'legacy-write-item-1';
  await dbRun(
    `INSERT INTO ${table} (
      id, sku, canonical_sku, is_canonical, alias_of, category, description, uom,
      base_material_cost, base_labor_minutes, taxable, ada_flag, tags, notes, active,
      deprecated, deprecated_reason
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      itemId,
      'LW-1',
      'LW-1',
      1,
      null,
      'Test',
      'Legacy write row',
      'EA',
      10,
      5,
      0,
      0,
      '[]',
      null,
      1,
      0,
      null,
    ]
  );

  await dbRun(`UPDATE ${table} SET active = 0 WHERE id = ?`, [itemId]);
  const itemRow = (await dbGet(`SELECT active FROM ${table} WHERE id = ?`, [itemId])) as { active: number } | undefined;
  assert.ok(itemRow);
  assert.equal(Number(itemRow.active), 0);

  const modId = 'legacy-write-mod-1';
  const now = new Date().toISOString();
  await dbRun(
    `INSERT INTO modifiers_v1 (
      id, name, modifier_key, description, applies_to_categories,
      add_labor_minutes, add_material_cost, percent_labor, percent_material, active, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [modId, 'Original', 'ORIG', '', '[]', 0, 0, 0, 0, 1, now]
  );

  await dbRun(
    `UPDATE modifiers_v1
     SET name = ?, modifier_key = ?, applies_to_categories = ?, add_labor_minutes = ?, add_material_cost = ?,
         percent_labor = ?, percent_material = ?, active = ?, updated_at = ?
     WHERE id = ?`,
    ['Renamed', 'REN', '["Accessories"]', 1, 2, 3, 4, 1, now, modId]
  );

  const mods = await dbAll('SELECT name, modifier_key FROM modifiers_v1 WHERE id = ?', [modId]);
  assert.equal((mods[0] as { name: string }).name, 'Renamed');
  assert.equal((mods[0] as { modifier_key: string }).modifier_key, 'REN');
});
