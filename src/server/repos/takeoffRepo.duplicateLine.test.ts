import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('duplicateTakeoffLine creates new id, preserves governed fields and modifiers, leaves source unchanged', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'install331-dup-'));
  const dbPath = path.join(tmpDir, 'estimator.duplicateLine.test.db');
  process.env.DATABASE_PATH = dbPath;

  const { getEstimatorDb } = await import('../db/connection.ts');
  const { createTakeoffLine, duplicateTakeoffLine, getTakeoffLineCore, listTakeoffLines } = await import('./takeoffRepo.ts');
  const { applyModifierToLine, listLineModifiers } = await import('./modifiersRepo.ts');
  const { getProject } = await import('./projectsRepo.ts');
  const { calculateEstimateSummary } = await import('../services/estimateEngineV1.ts');
  const { buildProposalLineItems } = await import('../../shared/utils/proposalDocument.ts');

  const db = getEstimatorDb();
  const projectId = `pdup-${randomUUID()}`;
  const roomA = `rA-${randomUUID()}`;
  const roomB = `rB-${randomUUID()}`;

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
      ?, NULL, 'manual', 'Dup test', NULL, 'manual', NULL, NULL,
      NULL, NULL, NULL,
      NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
      0, 0, 0, 0,
      'labor_and_material', '[]', '{}',
      'Draft', NULL, NULL,
      datetime('now'), datetime('now')
    )`
  ).run(projectId);

  db.prepare(
    `INSERT INTO rooms_v1 (id, project_id, room_name, sort_order, notes, created_at, updated_at)
     VALUES (?, ?, 'Room A', 0, NULL, datetime('now'), datetime('now'))`
  ).run(roomA, projectId);
  db.prepare(
    `INSERT INTO rooms_v1 (id, project_id, room_name, sort_order, notes, created_at, updated_at)
     VALUES (?, ?, 'Room B', 1, NULL, datetime('now'), datetime('now'))`
  ).run(roomB, projectId);

  db.prepare(
    `INSERT INTO catalog_items (
      id, sku, category, description, uom, base_material_cost, base_labor_minutes, taxable, ada_flag, active
    ) VALUES (
      ?, 'SKU-DUP', 'Cat', 'Catalog row', 'EA', 80, 30, 1, 0, 1
    )`
  ).run(`cat-${randomUUID()}`);

  const catalogItemId = db
    .prepare(`SELECT id FROM catalog_items WHERE sku = 'SKU-DUP' LIMIT 1`)
    .get() as { id: string };

  db.prepare(
    `INSERT INTO catalog_item_attributes (
      id, catalog_item_id, attribute_type, attribute_value,
      material_delta_type, material_delta_value,
      labor_delta_type, labor_delta_value,
      active, sort_order, created_at, updated_at
    ) VALUES (?, ?, 'finish', 'X','absolute',5,NULL,NULL,1,0,datetime('now'),datetime('now'))`
  ).run(`attr-${randomUUID()}`, catalogItemId.id);

  const source = createTakeoffLine({
    projectId,
    roomId: roomA,
    description: 'Line to clone',
    sourceType: 'catalog',
    catalogItemId: catalogItemId.id,
    sku: 'SKU-DUP',
    category: 'Cat',
    qty: 3,
    unit: 'LF',
    pricingSource: 'manual',
    unitSell: 199.99,
    catalogAttributeSnapshot: [{ attributeType: 'finish', attributeValue: 'X', source: 'user' }],
  });

  const modApply = applyModifierToLine(source.id, 'mod-recessed');
  assert.ok(modApply?.line, 'expected modifier apply to succeed (seeded mod-recessed)');

  const sourceAfterMod = getTakeoffLineCore(source.id)!;
  const modsBefore = listLineModifiers(source.id);
  assert.equal(modsBefore.length, 1);

  const snapBefore = JSON.stringify(getTakeoffLineCore(source.id));

  const dup = duplicateTakeoffLine(source.id, roomB);
  assert.ok(dup);
  assert.notEqual(dup!.id, source.id);
  assert.equal(dup!.roomId, roomB);
  assert.equal(dup!.projectId, projectId);

  assert.equal(JSON.stringify(getTakeoffLineCore(source.id)), snapBefore, 'source row bytes unchanged after duplicate');

  assert.equal(dup!.description, sourceAfterMod.description);
  assert.equal(dup!.catalogItemId, sourceAfterMod.catalogItemId);
  assert.equal(dup!.sku, sourceAfterMod.sku);
  assert.equal(dup!.qty, sourceAfterMod.qty);
  assert.equal(dup!.unit, sourceAfterMod.unit);
  assert.equal(dup!.materialCost, sourceAfterMod.materialCost);
  assert.equal(dup!.baseMaterialCost, sourceAfterMod.baseMaterialCost);
  assert.equal(dup!.laborMinutes, sourceAfterMod.laborMinutes);
  assert.equal(dup!.laborCost, sourceAfterMod.laborCost);
  assert.equal(dup!.pricingSource, sourceAfterMod.pricingSource);
  assert.equal(dup!.unitSell, sourceAfterMod.unitSell);
  assert.equal(dup!.lineTotal, sourceAfterMod.lineTotal);
  assert.equal(dup!.baseMaterialCostSnapshot, sourceAfterMod.baseMaterialCostSnapshot);
  assert.equal(dup!.baseLaborMinutesSnapshot, sourceAfterMod.baseLaborMinutesSnapshot);
  assert.ok(dup!.catalogAttributeSnapshot?.length);
  assert.ok(dup!.attributeDeltaMaterialSnapshot?.length);

  const dupMods = listLineModifiers(dup!.id);
  assert.equal(dupMods.length, 1);
  assert.equal(dupMods[0]!.modifierId, modsBefore[0]!.modifierId);
  assert.equal(dupMods[0]!.addMaterialCost, modsBefore[0]!.addMaterialCost);

  const lines = listTakeoffLines(projectId);
  assert.equal(lines.length, 2);

  const project = getProject(projectId);
  assert.ok(project);
  const summaryBefore = calculateEstimateSummary(project!, [sourceAfterMod]);
  const summaryAfter = calculateEstimateSummary(project!, lines);
  assert.ok(Math.abs(summaryAfter.baseBidTotal - 2 * summaryBefore.baseBidTotal) < 0.02);

  const proposalItems = buildProposalLineItems(lines);
  const merged = proposalItems.find((row) => /line to clone/i.test(row.description));
  assert.ok(merged, 'proposal line items include duplicated description');
  assert.equal(merged!.quantity, 6);
  const sumLineTotals = lines.reduce((s, l) => s + Number(l.lineTotal || 0), 0);
  assert.ok(Math.abs(merged!.total - sumLineTotals) < 0.05);
});

test('duplicateTakeoffLine returns null for room in another project', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'install331-dup-bad-'));
  process.env.DATABASE_PATH = path.join(tmpDir, 'estimator.duplicateLine.badroom.test.db');

  const { getEstimatorDb } = await import('../db/connection.ts');
  const { createTakeoffLine, duplicateTakeoffLine } = await import('./takeoffRepo.ts');

  const db = getEstimatorDb();
  const p1 = `p1-${randomUUID()}`;
  const p2 = `p2-${randomUUID()}`;
  const r1 = `r1-${randomUUID()}`;
  const rOther = `rO-${randomUUID()}`;

  for (const [pid, name] of [
    [p1, 'P1'],
    [p2, 'P2'],
  ] as const) {
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
        ?, NULL, 'manual', ?, NULL, 'manual', NULL, NULL,
        NULL, NULL, NULL,
        NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
        0, 0, 0, 0,
        'labor_and_material', '[]', '{}',
        'Draft', NULL, NULL,
        datetime('now'), datetime('now')
      )`
    ).run(pid, name);
  }

  db.prepare(
    `INSERT INTO rooms_v1 (id, project_id, room_name, sort_order, notes, created_at, updated_at)
     VALUES (?, ?, 'R1', 0, NULL, datetime('now'), datetime('now'))`
  ).run(r1, p1);
  db.prepare(
    `INSERT INTO rooms_v1 (id, project_id, room_name, sort_order, notes, created_at, updated_at)
     VALUES (?, ?, 'Other', 0, NULL, datetime('now'), datetime('now'))`
  ).run(rOther, p2);

  const line = createTakeoffLine({
    projectId: p1,
    roomId: r1,
    description: 'Only in p1',
    sourceType: 'manual',
    qty: 1,
    unit: 'EA',
    materialCost: 10,
    laborMinutes: 0,
  });

  assert.equal(duplicateTakeoffLine(line.id, rOther), null);
});
