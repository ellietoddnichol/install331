import test from 'node:test';
import assert from 'node:assert/strict';
import type { TakeoffLineRecord } from '../types/estimator.ts';
import { buildEstimateLineDetailModel } from './estimateLineDetailModel.ts';

const project = {
  wallSubstrate: 'Tile',
  structuredAssumptions: [
    {
      id: 'b1',
      source: 'manual' as const,
      ruleId: 'blocking_status',
      text: 'Blocking / backing included',
      confidence: 1,
      createdAt: '',
    },
  ],
  jobConditions: { occupiedBuilding: false },
} as Parameters<typeof buildEstimateLineDetailModel>[0]['project'];

test('buildEstimateLineDetailModel marks ready labor when minutes present', () => {
  const line = {
    id: 'l1',
    description: 'Grab bar',
    qty: 2,
    unit: 'EA',
    category: 'Grab bar',
    materialCost: 40,
    laborMinutes: 25,
    laborCost: 50,
    lineTotal: 180,
    sourceType: 'vendor_quote',
    sourceRef: 'q1',
    notes: 'Source row type: material',
    installLaborFamily: 'grab_bar_install',
    laborOrigin: 'install_family',
  } as TakeoffLineRecord;

  const model = buildEstimateLineDetailModel({
    line,
    project,
    pricingMode: 'labor_and_material',
    laborRatePerHour: 100,
  });
  assert.equal(model.header.laborStatus, 'labor_ready');
  assert.equal(model.sourceQuote.linked, false);
});

test('buildEstimateLineDetailModel uses calm pause copy without internal flags', () => {
  const line = {
    id: 'l1',
    description: 'Grab bar',
    qty: 1,
    unit: 'EA',
    materialCost: 40,
    laborMinutes: 0,
    laborCost: 0,
    lineTotal: 40,
    sourceType: 'vendor_quote',
    notes:
      'Source row type: material | Install review: blocking_unknown | Install questions: Is backing/blocking in place? | Needs Review',
  } as TakeoffLineRecord;

  const model = buildEstimateLineDetailModel({
    line,
    project: {
      ...project,
      structuredAssumptions: [
        {
          id: 'b1',
          source: 'manual',
          ruleId: 'blocking_status',
          text: 'Blocking unknown',
          confidence: 1,
          createdAt: '',
        },
      ],
    },
    pricingMode: 'labor_and_material',
    laborRatePerHour: 100,
  });
  assert.equal(model.header.laborStatus, 'labor_paused');
  assert.match(model.labor.pauseMessage || '', /paused until/i);
  const serialized = JSON.stringify(model);
  assert.doesNotMatch(serialized, /blocking_unknown/);
});
