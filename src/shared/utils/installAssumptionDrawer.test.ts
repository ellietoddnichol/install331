import test from 'node:test';
import assert from 'node:assert/strict';
import type { ProjectRecord, TakeoffLineRecord } from '../types/estimator.ts';
import { buildInstallAssumptionDrawerModel } from './installAssumptionDrawer.ts';

const project = {
  wallSubstrate: 'Tile',
  structuredAssumptions: [
    {
      id: 'b1',
      source: 'manual' as const,
      ruleId: 'blocking_status',
      text: 'Blocking unknown',
      confidence: 1,
      createdAt: '',
    },
  ],
  jobConditions: { occupiedBuilding: true, restrictedAccess: false },
} as Pick<ProjectRecord, 'wallSubstrate' | 'structuredAssumptions' | 'jobConditions'>;

test('buildInstallAssumptionDrawerModel surfaces paused blocking message', () => {
  const line = {
    id: 'line-1',
    description: 'Bobrick grab bar',
    qty: 1,
    unit: 'EA',
    category: 'Grab bar',
    laborMinutes: 0,
    notes:
      'Source row type: material | Install review: blocking_unknown | Install questions: Is backing/blocking in place for this grab bar location? | Needs Review',
    installLaborFamily: 'grab_bar_install',
  } as TakeoffLineRecord;

  const model = buildInstallAssumptionDrawerModel(line, project, 'labor_and_material');
  assert.equal(model.laborPaused, true);
  assert.match(model.pauseMessage, /paused until/i);
  assert.ok(model.editableFields.some((f) => f.key === 'blocking_status'));
  assert.equal(model.projectApplied.blockingStatus, 'unknown');
});
