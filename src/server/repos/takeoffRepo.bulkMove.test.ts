import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('bulkMoveTakeoffLinesToRoom assigns lines to target room; summary and proposal stay aligned', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'install331-bulkmove-'));
  process.env.DATABASE_PATH = path.join(tmpDir, 'estimator.bulkMove.test.db');

  const { getEstimatorDb } = await import('../db/connection.ts');
  const { bulkMoveTakeoffLinesToRoom, createTakeoffLine, listTakeoffLines } = await import('./takeoffRepo.ts');
  const { getProject } = await import('./projectsRepo.ts');
  const { calculateEstimateSummary } = await import('../services/estimateEngineV1.ts');
  const { buildProposalLineItems } = await import('../../shared/utils/proposalDocument.ts');

  const db = getEstimatorDb();
  const projectId = `pmove-${randomUUID()}`;
  const roomA = `rA-${randomUUID()}`;
  const roomB = `rB-${randomUUID()}`;

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
      ?, NULL, 'manual', 'Move test', NULL, 'manual', NULL, NULL,
      NULL, NULL, NULL,
      NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
      0, 0, 0, 0,
      'labor_and_material', '[]', '{}',
      'Draft', NULL, NULL,
      datetime('now'), datetime('now')
    )`
  ).run(projectId);
  for (const [rid, name] of [
    [roomA, 'Alpha'],
    [roomB, 'Beta'],
  ] as const) {
    db.prepare(
      `INSERT INTO rooms_v1 (id, project_id, room_name, sort_order, notes, created_at, updated_at)
       VALUES (?, ?, ?, 0, NULL, datetime('now'), datetime('now'))`
    ).run(rid, projectId, name);
  }

  const l1 = createTakeoffLine({
    projectId,
    roomId: roomA,
    description: 'One',
    sourceType: 'manual',
    qty: 1,
    unit: 'EA',
    materialCost: 100,
    laborMinutes: 0,
  });
  const l2 = createTakeoffLine({
    projectId,
    roomId: roomA,
    description: 'Two',
    sourceType: 'manual',
    qty: 1,
    unit: 'EA',
    materialCost: 50,
    laborMinutes: 0,
  });

  const project = getProject(projectId);
  assert.ok(project);
  const allBefore = listTakeoffLines(projectId);
  const summaryBefore = calculateEstimateSummary(project!, allBefore);
  const proposalBefore = buildProposalLineItems(allBefore);

  const moved = bulkMoveTakeoffLinesToRoom([l1.id, l2.id], roomB);
  assert.ok(!('error' in moved), 'error' in moved ? moved.error : '');
  assert.equal(moved.lines.length, 2);

  const inA = listTakeoffLines(projectId, roomA);
  const inB = listTakeoffLines(projectId, roomB);
  assert.equal(inA.length, 0);
  assert.equal(inB.length, 2);

  const allAfter = listTakeoffLines(projectId);
  const summaryAfter = calculateEstimateSummary(project!, allAfter);
  assert.ok(Math.abs(summaryAfter.baseBidTotal - summaryBefore.baseBidTotal) < 0.02);

  const proposalAfter = buildProposalLineItems(allAfter);
  assert.equal(proposalAfter.length, proposalBefore.length);
  assert.ok(Math.abs(proposalAfter.reduce((s, r) => s + r.total, 0) - proposalBefore.reduce((s, r) => s + r.total, 0)) < 0.05);
});

test('bulkMoveTakeoffLinesToRoom rejects room from another project', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'install331-bulkmove-bad-'));
  process.env.DATABASE_PATH = path.join(tmpDir, 'estimator.bulkMove.bad.test.db');

  const { getEstimatorDb } = await import('../db/connection.ts');
  const { bulkMoveTakeoffLinesToRoom, createTakeoffLine } = await import('./takeoffRepo.ts');

  const db = getEstimatorDb();
  const p1 = `p1-${randomUUID()}`;
  const p2 = `p2-${randomUUID()}`;
  const r1 = `r1-${randomUUID()}`;
  const r2 = `r2-${randomUUID()}`;

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
     VALUES (?, ?, 'R2', 0, NULL, datetime('now'), datetime('now'))`
  ).run(r2, p2);

  const line = createTakeoffLine({
    projectId: p1,
    roomId: r1,
    description: 'X',
    sourceType: 'manual',
    qty: 1,
    unit: 'EA',
    materialCost: 1,
    laborMinutes: 0,
  });

  const bad = bulkMoveTakeoffLinesToRoom([line.id], r2);
  assert.ok('error' in bad);
});

test('updateTakeoffLine rejects roomId outside line project', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'install331-roomval-'));
  process.env.DATABASE_PATH = path.join(tmpDir, 'estimator.roomval.test.db');

  const { getEstimatorDb } = await import('../db/connection.ts');
  const { createTakeoffLine, updateTakeoffLine } = await import('./takeoffRepo.ts');

  const db = getEstimatorDb();
  const p1 = `p1-${randomUUID()}`;
  const p2 = `p2-${randomUUID()}`;
  const r1 = `r1-${randomUUID()}`;
  const r2 = `r2-${randomUUID()}`;

  for (const pid of [p1, p2]) {
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
        ?, NULL, 'manual', 'P', NULL, 'manual', NULL, NULL,
        NULL, NULL, NULL,
        NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
        0, 0, 0, 0,
        'labor_and_material', '[]', '{}',
        'Draft', NULL, NULL,
        datetime('now'), datetime('now')
      )`
    ).run(pid);
  }
  db.prepare(
    `INSERT INTO rooms_v1 (id, project_id, room_name, sort_order, notes, created_at, updated_at)
     VALUES (?, ?, 'R1', 0, NULL, datetime('now'), datetime('now'))`
  ).run(r1, p1);
  db.prepare(
    `INSERT INTO rooms_v1 (id, project_id, room_name, sort_order, notes, created_at, updated_at)
     VALUES (?, ?, 'R2', 0, NULL, datetime('now'), datetime('now'))`
  ).run(r2, p2);

  const line = createTakeoffLine({
    projectId: p1,
    roomId: r1,
    description: 'X',
    sourceType: 'manual',
    qty: 1,
    unit: 'EA',
    materialCost: 1,
    laborMinutes: 0,
  });

  assert.equal(updateTakeoffLine(line.id, { roomId: r2 }), null);
});
