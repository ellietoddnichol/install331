import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('createTakeoffLine snapshots exact base + applied attribute deltas (including % labor)', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'install331-test-'));
  const dbPath = path.join(tmpDir, 'estimator.test.db');
  process.env.DATABASE_PATH = dbPath;

  const { getEstimatorDb } = await import('../db/connection.ts');
  const { createTakeoffLine, getTakeoffLineCore } = await import('./takeoffRepo.ts');
  const db = getEstimatorDb();

  try {
    const hasTakeoff = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'takeoff_lines_v1'`)
      .get() as { name?: string } | undefined;
    assert.equal(hasTakeoff?.name, 'takeoff_lines_v1');

    // Make labor cost calc deterministic.
    db.prepare(`UPDATE settings_v1 SET default_labor_rate_per_hour = 120, updated_at = datetime('now') WHERE id = 'global'`).run();

  // Seed minimal project + room + catalog item.
    db.prepare(
      `INSERT INTO projects_v1 (
        id, project_number, project_number_source, project_name, client_name, client_name_source, general_contractor, estimator,
        bid_date, proposal_date, due_date,
        address, project_type, project_size, floor_level, access_difficulty, install_height, material_handling, wall_substrate,
        labor_burden_percent, overhead_percent, profit_percent, tax_percent,
        pricing_mode, scope_categories_json, job_conditions_json,
        status, notes, special_notes,
        created_at, updated_at
      ) VALUES (
        'p1', NULL, 'manual', 'P', NULL, 'manual', NULL, NULL,
        NULL, NULL, NULL,
        NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
        0, 0, 0, 0,
        'labor_and_material', '[]', '{}',
        'Draft', NULL, NULL,
        datetime('now'), datetime('now')
      )`
    ).run();
    db.prepare(
      `INSERT INTO rooms_v1 (id, project_id, room_name, sort_order, notes, created_at, updated_at)
       VALUES ('r1', 'p1', 'Room', 0, NULL, datetime('now'), datetime('now'))`
    ).run();
    db.prepare(
      `INSERT INTO catalog_items (
        id, sku, category, description, uom, base_material_cost, base_labor_minutes, taxable, ada_flag, active
      ) VALUES (
        'test-c1', 'SKU-1', 'Cat', 'Item', 'EA', 100, 60, 1, 0, 1
      )`
    ).run();

  // Two attributes: +$10 material, +10% labor minutes
    db.prepare(
      `INSERT INTO catalog_item_attributes (
        id, catalog_item_id, attribute_type, attribute_value,
        material_delta_type, material_delta_value,
        labor_delta_type, labor_delta_value,
        active, sort_order, created_at, updated_at
      ) VALUES
        ('test-a1','test-c1','finish','MATTE_BLACK','absolute',10,NULL,NULL,1,0,datetime('now'),datetime('now')),
        ('test-a2','test-c1','coating','ANTIMICROBIAL',NULL,NULL,'percent',10,1,0,datetime('now'),datetime('now'))`
    ).run();

  const line = createTakeoffLine({
    projectId: 'p1',
    roomId: 'r1',
    description: 'Item',
    sourceType: 'catalog',
    catalogItemId: 'test-c1',
    qty: 1,
    unit: 'EA',
    catalogAttributeSnapshot: [
      { attributeType: 'finish', attributeValue: 'MATTE_BLACK', source: 'user' },
      { attributeType: 'coating', attributeValue: 'ANTIMICROBIAL', source: 'user' },
    ],
  });

  assert.equal(line.baseMaterialCostSnapshot, 100);
  assert.equal(line.baseLaborMinutesSnapshot, 60);
  assert.ok(Array.isArray(line.attributeDeltaMaterialSnapshot));
  assert.ok(Array.isArray(line.attributeDeltaLaborSnapshot));

  // Material: +$10 applied.
  const mat = line.attributeDeltaMaterialSnapshot!.find((d) => d.attributeValue === 'MATTE_BLACK');
  assert.ok(mat);
  assert.equal(mat!.deltaType, 'absolute');
  assert.equal(mat!.deltaValue, 10);
  assert.equal(mat!.appliedAmount, 10);
  assert.equal(line.materialCost, 110);

  // Labor: +10% of 60 = +6 minutes applied.
  const lab = line.attributeDeltaLaborSnapshot!.find((d) => d.attributeValue === 'ANTIMICROBIAL');
  assert.ok(lab);
  assert.equal(lab!.deltaType, 'percent');
  assert.equal(lab!.deltaValue, 10);
  assert.ok(Math.abs(lab!.appliedAmount - 6) < 1e-9);
  assert.ok(Math.abs(line.laborMinutes - 66) < 1e-9);

    const persisted = getTakeoffLineCore(line.id);
    assert.ok(persisted, 'expected line to be persisted');
    assert.equal(persisted!.baseMaterialCostSnapshot, 100);
    assert.equal(persisted!.baseLaborMinutesSnapshot, 60);
    assert.ok(persisted!.attributeDeltaMaterialSnapshot?.length);
    assert.ok(persisted!.attributeDeltaLaborSnapshot?.length);
  } catch (err) {
    const e = err as any;
    throw new Error(`Snapshot test failed: ${e?.code || ''} ${e?.message || String(err)}`);
  }
});

test('updateTakeoffLine does not retroactively populate option snapshots for old lines', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'install331-test-'));
  const dbPath = path.join(tmpDir, 'estimator.retroSnapshots.test.db');
  process.env.DATABASE_PATH = dbPath;

  const { getEstimatorDb } = await import('../db/connection.ts');
  const { createTakeoffLine, updateTakeoffLine, getTakeoffLineCore } = await import('./takeoffRepo.ts');
  const db = getEstimatorDb();

  db.prepare(`UPDATE settings_v1 SET default_labor_rate_per_hour = 120, updated_at = datetime('now') WHERE id = 'global'`).run();

  db.prepare(
    `INSERT INTO projects_v1 (
      id, project_number, project_number_source, project_name, client_name, client_name_source, general_contractor, estimator,
      bid_date, proposal_date, due_date,
      address, project_type, project_size, floor_level, access_difficulty, install_height, material_handling, wall_substrate,
      labor_burden_percent, overhead_percent, profit_percent, tax_percent,
      pricing_mode, scope_categories_json, job_conditions_json,
      status, notes, special_notes,
      created_at, updated_at
    ) VALUES (
      'p2', NULL, 'manual', 'P2', NULL, 'manual', NULL, NULL,
      NULL, NULL, NULL,
      NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
      0, 0, 0, 0,
      'labor_and_material', '[]', '{}',
      'Draft', NULL, NULL,
      datetime('now'), datetime('now')
    )`
  ).run();
  db.prepare(
    `INSERT INTO rooms_v1 (id, project_id, room_name, sort_order, notes, created_at, updated_at)
     VALUES ('r2', 'p2', 'Room', 0, NULL, datetime('now'), datetime('now'))`
  ).run();

  const line = createTakeoffLine({
    projectId: 'p2',
    roomId: 'r2',
    description: 'Legacy-ish line (no snapshot)',
    sourceType: 'manual',
    qty: 1,
    unit: 'EA',
    materialCost: 50,
    laborMinutes: 10,
  });

  assert.equal(line.catalogAttributeSnapshot, null);
  assert.equal(line.baseMaterialCostSnapshot ?? null, null);
  assert.equal(line.baseLaborMinutesSnapshot ?? null, null);
  assert.equal(line.attributeDeltaMaterialSnapshot ?? null, null);
  assert.equal(line.attributeDeltaLaborSnapshot ?? null, null);

  updateTakeoffLine(line.id, {
    materialCost: 60,
    laborMinutes: 12,
  });

  const persisted = getTakeoffLineCore(line.id);
  assert.ok(persisted);
  assert.equal(persisted!.catalogAttributeSnapshot, null);
  assert.equal(persisted!.baseMaterialCostSnapshot ?? null, null);
  assert.equal(persisted!.baseLaborMinutesSnapshot ?? null, null);
  assert.equal(persisted!.attributeDeltaMaterialSnapshot ?? null, null);
  assert.equal(persisted!.attributeDeltaLaborSnapshot ?? null, null);
});

