import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('bulk delete removes multiple takeoff lines; summary and proposal items align', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'install331-bulk-'));
  process.env.DATABASE_PATH = path.join(tmpDir, 'estimator.bulkDelete.test.db');

  const { getEstimatorDb } = await import('../db/connection.ts');
  const { createTakeoffLine, deleteTakeoffLine, listTakeoffLines } = await import('./takeoffRepo.ts');
  const { getProject } = await import('./projectsRepo.ts');
  const { calculateEstimateSummary } = await import('../services/estimateEngineV1.ts');
  const { buildProposalLineItems } = await import('../../shared/utils/proposalDocument.ts');

  const db = getEstimatorDb();
  const projectId = `pbulk-${randomUUID()}`;
  const roomId = `rbulk-${randomUUID()}`;

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
      ?, NULL, 'manual', 'Bulk', NULL, 'manual', NULL, NULL,
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
     VALUES (?, ?, 'R', 0, NULL, datetime('now'), datetime('now'))`
  ).run(roomId, projectId);

  const a = createTakeoffLine({
    projectId,
    roomId,
    description: 'Alpha',
    sourceType: 'manual',
    qty: 1,
    unit: 'EA',
    materialCost: 10,
    laborMinutes: 0,
  });
  const b = createTakeoffLine({
    projectId,
    roomId,
    description: 'Beta',
    sourceType: 'manual',
    qty: 2,
    unit: 'EA',
    materialCost: 20,
    laborMinutes: 0,
  });
  const c = createTakeoffLine({
    projectId,
    roomId,
    description: 'Gamma',
    sourceType: 'manual',
    qty: 1,
    unit: 'EA',
    materialCost: 30,
    laborMinutes: 0,
  });

  const project = getProject(projectId);
  assert.ok(project);
  const linesBefore = listTakeoffLines(projectId);
  assert.equal(linesBefore.length, 3);
  const summaryBefore = calculateEstimateSummary(project!, linesBefore);
  const proposalBefore = buildProposalLineItems(linesBefore);
  assert.ok(proposalBefore.length >= 3);

  assert.equal(deleteTakeoffLine(a.id), true);
  assert.equal(deleteTakeoffLine(b.id), true);

  const linesAfter = listTakeoffLines(projectId);
  assert.equal(linesAfter.length, 1);
  assert.equal(linesAfter[0]!.id, c.id);

  const summaryAfter = calculateEstimateSummary(project!, linesAfter);
  assert.ok(summaryAfter.baseBidTotal < summaryBefore.baseBidTotal);

  const proposalAfter = buildProposalLineItems(linesAfter);
  assert.equal(proposalAfter.length, 1);
  assert.ok(/gamma/i.test(proposalAfter[0]!.description));
});
