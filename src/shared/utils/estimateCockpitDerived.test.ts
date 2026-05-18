import test from 'node:test';
import assert from 'node:assert/strict';
import type { TakeoffLineRecord } from '../types/estimator';
import {
  cockpitRowGroupForLine,
  deriveEstimateLaborBasisUi,
  groupEstimateLinesForCockpit,
} from './estimateCockpitDerived.ts';

function L(partial: Partial<TakeoffLineRecord> & Pick<TakeoffLineRecord, 'id' | 'sourceType'>): TakeoffLineRecord {
  return {
    projectId: 'p',
    roomId: 'r',
    sourceRef: null,
    description: 'Item',
    sku: null,
    category: null,
    subcategory: null,
    baseType: null,
    qty: 1,
    unit: 'EA',
    materialCost: 10,
    baseMaterialCost: 10,
    laborMinutes: 0,
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
    ...partial,
  } as TakeoffLineRecord;
}

test('cockpitRowGroupForLine prefers vendor bucket', () => {
  const line = L({
    id: 'a',
    sourceType: 'vendor_quote',
    proposalVisibility: 'optional_or_alt',
  });
  assert.equal(cockpitRowGroupForLine(line), 'vendor_quote');
});

test('allowance bucket from visibility / line types', () => {
  assert.equal(
    cockpitRowGroupForLine(L({ id: 'b', sourceType: 'catalog', proposalVisibility: 'optional_or_alt' })),
    'allowance_alt_note'
  );
  assert.equal(
    cockpitRowGroupForLine(L({ id: 'c', sourceType: 'manual', sourceLineType: 'add_in' })),
    'allowance_alt_note'
  );
});

test('deriveEstimateLaborBasisUi labels install-gated labor separately from missing labor', () => {
  const gatedNotes =
    'Source row type: material | Install review: blocking_unknown | Install questions: Is backing/blocking in place? | Needs Review';
  assert.equal(
    deriveEstimateLaborBasisUi(
      L({ id: 'gate', sourceType: 'vendor_quote', laborMinutes: 0, notes: gatedNotes }),
      'labor_and_material'
    ).kind,
    'gated'
  );
  assert.equal(
    deriveEstimateLaborBasisUi(L({ id: 'f', sourceType: 'manual', laborMinutes: 0, laborCost: 0 }), 'labor_and_material').kind,
    'needs'
  );
});

test('deriveEstimateLaborBasisUi maps origins', () => {
  assert.equal(
    deriveEstimateLaborBasisUi(L({ id: 'd', sourceType: 'manual', laborMinutes: 30, laborOrigin: 'catalog' }), 'labor_and_material')
      .label,
    'Labor matched'
  );
  assert.equal(
    deriveEstimateLaborBasisUi(
      L({ id: 'e', sourceType: 'manual', laborMinutes: 15, laborOrigin: 'install_family', installLaborFamily: 'x' }),
      'labor_and_material'
    ).label,
    'Labor fallback'
  );
  assert.equal(
    deriveEstimateLaborBasisUi(L({ id: 'f', sourceType: 'manual', laborMinutes: 12, laborOrigin: null }), 'labor_and_material').label,
    'Manual labor'
  );
  assert.equal(
    deriveEstimateLaborBasisUi(L({ id: 'g', sourceType: 'manual', laborMinutes: 0, laborCost: 0 }), 'labor_and_material').label,
    'Needs labor'
  );
});

test('groupEstimateLinesForCockpit preserves vendor-first ordering', () => {
  const grouped = groupEstimateLinesForCockpit([
    L({ id: '1', sourceType: 'manual', description: 'm' }),
    L({ id: '2', sourceType: 'vendor_quote', description: 'v' }),
  ]);
  assert.equal(grouped[0]?.group, 'vendor_quote');
  assert.equal(grouped[0]?.lines[0]?.id, '2');
});

test('each line appears in exactly one cockpit group', () => {
  const lines = [
    L({ id: '1', sourceType: 'vendor_quote', proposalVisibility: 'optional_or_alt' }),
    L({ id: '2', sourceType: 'manual', proposalVisibility: 'optional_or_alt' }),
    L({ id: '3', sourceType: 'catalog' }),
  ];
  const grouped = groupEstimateLinesForCockpit(lines);
  const seen = new Set<string>();
  for (const { lines: bucket } of grouped) {
    for (const line of bucket) {
      assert.ok(!seen.has(line.id), `duplicate group membership for ${line.id}`);
      seen.add(line.id);
    }
  }
  assert.equal(seen.size, lines.length);
  assert.equal(cockpitRowGroupForLine(lines[0]!), 'vendor_quote');
});
