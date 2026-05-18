import assert from 'node:assert/strict';
import test from 'node:test';
import type { TakeoffLineRecord } from '../types/estimator.ts';
import {
  buildProposalScheduleSectionsByBidBucket,
  filterLinesForClientProposal,
  formatClientProposalItemDisplay,
  proposalCostBucketForLine,
} from './proposalDocument.ts';

test('formatClientProposalItemDisplay: extinguisher with model, weight, and class', () => {
  const out = formatClientProposalItemDisplay('FE05C Cosmic 5lb Extinguisher 3A-40BC', 'FE05C');
  assert.equal(out.title, 'Cosmic Fire Extinguisher');
  assert.ok(out.subtitle?.includes('FE05C'));
  assert.ok(out.subtitle?.includes('5 lb'));
  assert.ok(out.subtitle?.toUpperCase().includes('3A-40BC'));
});

test('formatClientProposalItemDisplay: hyphenated leading model', () => {
  const out = formatClientProposalItemDisplay('GB-36 Grab Bar 36 inch stainless', 'GB-36');
  assert.equal(out.title, 'Grab Bar 36 Inch Stainless');
  assert.match(out.subtitle || '', /GB-36/i);
});

test('formatClientProposalItemDisplay: plain description unchanged except title case', () => {
  const out = formatClientProposalItemDisplay('paper towel dispenser surface mount', null);
  assert.equal(out.title, 'Paper Towel Dispenser Surface Mount');
  assert.equal(out.subtitle, null);
});

test('formatClientProposalItemDisplay: adds finish option without leaking internal labels', () => {
  const out = formatClientProposalItemDisplay('36" grab bar', 'GB-36', [
    { attributeType: 'finish', attributeValue: 'MATTE_BLACK', source: 'inferred' as const },
  ]);
  assert.match(out.title, /Matte Black/);
  assert.ok(!/MATTE_BLACK|attribute_type|catalogAttributeSnapshot|finish:|mounting:|assembly:/i.test(out.title));
});

test('formatClientProposalItemDisplay: adds mounting option when present', () => {
  const out = formatClientProposalItemDisplay('Fire extinguisher cabinet', null, [
    { attributeType: 'mounting', attributeValue: 'RECESSED', source: 'inferred' as const },
  ]);
  assert.match(out.title, /Recessed/);
});

test('formatClientProposalItemDisplay: adds assembly/coating options (concise)', () => {
  const out = formatClientProposalItemDisplay('Single tier locker', null, [
    { attributeType: 'assembly', attributeValue: 'KD', source: 'inferred' as const },
    { attributeType: 'coating', attributeValue: 'ANTIMICROBIAL', source: 'inferred' as const },
  ]);
  assert.match(out.title, /KD Assembly/);
  assert.match(out.title, /Antimicrobial/);
});

test('formatClientProposalItemDisplay: fallback unchanged for no snapshot', () => {
  const base = formatClientProposalItemDisplay('coat hook', null);
  const out = formatClientProposalItemDisplay('coat hook', null, null);
  assert.deepEqual(out, base);
});

function minimalLine(over: Partial<TakeoffLineRecord>): TakeoffLineRecord {
  const now = new Date().toISOString();
  return {
    id: over.id ?? 'l1',
    projectId: over.projectId ?? 'p1',
    roomId: over.roomId ?? 'r1',
    sourceType: over.sourceType ?? 'manual',
    sourceRef: over.sourceRef ?? null,
    description: over.description ?? 'Item',
    sku: over.sku ?? null,
    category: over.category ?? null,
    subcategory: over.subcategory ?? null,
    baseType: over.baseType ?? null,
    qty: over.qty ?? 1,
    unit: over.unit ?? 'EA',
    materialCost: over.materialCost ?? 10,
    baseMaterialCost: over.baseMaterialCost ?? 10,
    laborMinutes: over.laborMinutes ?? 0,
    laborCost: over.laborCost ?? 0,
    baseLaborCost: over.baseLaborCost ?? 0,
    pricingSource: over.pricingSource ?? 'auto',
    unitSell: over.unitSell ?? 10,
    lineTotal: over.lineTotal ?? 10,
    notes: over.notes ?? null,
    bundleId: over.bundleId ?? null,
    catalogItemId: over.catalogItemId ?? null,
    variantId: over.variantId ?? null,
    createdAt: over.createdAt ?? now,
    updatedAt: over.updatedAt ?? now,
    ...over,
  };
}

test('gated grab bar line notes do not leak into client proposal item display', () => {
  const notes =
    'Source row type: material | Install review: blocking_unknown | Install questions: Is backing/blocking in place? | Needs Review';
  const display = formatClientProposalItemDisplay('Bobrick 36 inch grab bar satin', 'B-6806');
  const displayText = `${display.title} ${display.subtitle || ''}`;
  assert.ok(!displayText.includes('blocking_unknown'));
  assert.ok(!displayText.includes('Install review'));
  assert.ok(!notes.includes(displayText));
});

test('filterLinesForClientProposal excludes internal and disclaimer rows', () => {
  const lines = [
    minimalLine({ id: 'ok', description: 'Grab bar 36 in', materialCost: 50, lineTotal: 50 }),
    minimalLine({
      id: 'sub',
      description: 'Subtotal: $4,000',
      sourceLineType: 'quote_subtotal',
      proposalVisibility: 'internal_only',
    }),
    minimalLine({ id: 'int', description: 'Internal note', proposalVisibility: 'internal_only' }),
    minimalLine({ id: 'mat', description: 'Material: $1200' }),
  ];
  const out = filterLinesForClientProposal(lines);
  assert.equal(out.length, 1);
  assert.equal(out[0]?.id, 'ok');
});

test('proposalCostBucketForLine maps add-ins and labor-only rows', () => {
  assert.equal(
    proposalCostBucketForLine(
      minimalLine({ id: 'a', sourceLineType: 'add_in', materialCost: 100, laborCost: 0 }),
      true,
      true
    ),
    'add_ins'
  );
  assert.equal(
    proposalCostBucketForLine(minimalLine({ id: 'b', materialCost: 0, laborCost: 25, laborMinutes: 30 }), true, true),
    'labor'
  );
});

test('buildProposalScheduleSectionsByBidBucket splits by sourceBidBucket', () => {
  const lines: TakeoffLineRecord[] = [
    minimalLine({ id: 'a', description: 'A', sourceBidBucket: 'Base Bid', materialCost: 100, unitSell: 100, lineTotal: 100 }),
    minimalLine({ id: 'b', description: 'B', sourceBidBucket: 'Alt 1', materialCost: 50, unitSell: 50, lineTotal: 50 }),
    minimalLine({ id: 'c', description: 'C', sourceBidBucket: null, materialCost: 5, unitSell: 5, lineTotal: 5 }),
  ];
  const groups = buildProposalScheduleSectionsByBidBucket(lines, true, true, 1, null);
  assert.equal(groups.length, 3);
  const labels = groups.map((g) => g.bucketLabel).sort();
  assert.deepEqual(labels, ['', 'Alt 1', 'Base Bid']);
});
