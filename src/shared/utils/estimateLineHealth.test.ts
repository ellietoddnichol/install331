import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveEstimateLineHealth, shouldIncludeLineInEstimateHealth } from './estimateLineHealth.ts';
import type { TakeoffLineRecord } from '../types/estimator';

function line(p: Partial<TakeoffLineRecord> & Pick<TakeoffLineRecord, 'id'>): TakeoffLineRecord {
  return {
    projectId: 'p',
    roomId: 'r',
    sourceType: 'manual',
    sourceRef: null,
    description: 'Test',
    sku: null,
    category: 'Cat',
    subcategory: null,
    baseType: null,
    qty: 1,
    unit: 'EA',
    materialCost: 10,
    baseMaterialCost: 10,
    laborMinutes: 5,
    laborCost: 0,
    baseLaborCost: 0,
    pricingSource: 'auto',
    unitSell: 10,
    lineTotal: 10,
    notes: null,
    bundleId: null,
    catalogItemId: null,
    variantId: null,
    createdAt: '',
    updatedAt: '',
    ...p,
  };
}

test('shouldIncludeLineInEstimateHealth excludes informational and excluded buckets', () => {
  assert.equal(shouldIncludeLineInEstimateHealth(line({ id: '1', intakeScopeBucket: 'informational_only' })), false);
  assert.equal(shouldIncludeLineInEstimateHealth(line({ id: '2', intakeScopeBucket: 'excluded_by_others' })), false);
  assert.equal(shouldIncludeLineInEstimateHealth(line({ id: '3', intakeScopeBucket: 'priced_base_scope' })), true);
});

test('deriveEstimateLineHealth counts missing material when pricing shows material', () => {
  const h = deriveEstimateLineHealth(
    [
      line({ id: 'a', materialCost: 0, laborMinutes: 10 }),
      line({ id: 'b', materialCost: 5, laborMinutes: 10 }),
    ],
    'labor_and_material'
  );
  assert.equal(h.missingMaterial.count, 1);
  assert.deepEqual(h.missingMaterial.lineIds, ['a']);
});

test('deriveEstimateLineHealth skips material checks in labor_only mode', () => {
  const h = deriveEstimateLineHealth([line({ id: 'a', materialCost: 0, laborMinutes: 10 })], 'labor_only');
  assert.equal(h.missingMaterial.count, 0);
});

test('deriveEstimateLineHealth counts missing labor when pricing shows labor in main bid', () => {
  const h = deriveEstimateLineHealth(
    [
      line({ id: 'a', materialCost: 10, laborMinutes: 0 }),
      line({ id: 'b', materialCost: 10, laborMinutes: 3 }),
    ],
    'labor_and_material'
  );
  assert.equal(h.missingLabor.count, 1);
  assert.deepEqual(h.missingLabor.lineIds, ['a']);
});

test('deriveEstimateLineHealth skips labor in material_only main bid', () => {
  const h = deriveEstimateLineHealth([line({ id: 'a', materialCost: 10, laborMinutes: 0 })], 'material_only');
  assert.equal(h.missingLabor.count, 0);
});

test('deriveEstimateLineHealth flags install_family lines without installLaborFamily', () => {
  const h = deriveEstimateLineHealth(
    [
      line({ id: 'a', laborOrigin: 'install_family', installLaborFamily: null, laborMinutes: 5 }),
      line({ id: 'b', laborOrigin: 'install_family', installLaborFamily: 'grab_bar_36', laborMinutes: 5 }),
    ],
    'labor_and_material'
  );
  assert.equal(h.missingInstallFamily.count, 1);
  assert.deepEqual(h.missingInstallFamily.lineIds, ['a']);
});

test('deriveEstimateLineHealth attentionLineCount dedupes lines with multiple issues', () => {
  const h = deriveEstimateLineHealth(
    [line({ id: 'x', materialCost: 0, laborMinutes: 0 })],
    'labor_and_material'
  );
  assert.equal(h.missingMaterial.count, 1);
  assert.equal(h.missingLabor.count, 1);
  assert.equal(h.attentionLineCount, 1);
  assert.deepEqual(h.attentionLineIds, ['x']);
});

test('deriveEstimateLineHealth updates when line set changes', () => {
  const a = [line({ id: '1', materialCost: 0 })];
  const b = [line({ id: '1', materialCost: 100 })];
  assert.equal(deriveEstimateLineHealth(a, 'labor_and_material').missingMaterial.count, 1);
  assert.equal(deriveEstimateLineHealth(b, 'labor_and_material').missingMaterial.count, 0);
});

test('deriveEstimateLineHealth only considers lines passed in (filtered grid view)', () => {
  const all = [
    line({ id: 'in_view', materialCost: 0, laborMinutes: 5 }),
    line({ id: 'out_of_view', materialCost: 0, laborMinutes: 5 }),
  ];
  const subset = [all[0]];
  assert.equal(deriveEstimateLineHealth(all, 'labor_and_material').missingMaterial.count, 2);
  assert.equal(deriveEstimateLineHealth(subset, 'labor_and_material').missingMaterial.count, 1);
  assert.deepEqual(deriveEstimateLineHealth(subset, 'labor_and_material').missingMaterial.lineIds, ['in_view']);
});
