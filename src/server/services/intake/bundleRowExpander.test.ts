import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectBundleExpansion,
  expandBundleLine,
  expandBundleLines,
  resolveSetMultiplier,
  type ExpandableLineLike,
} from './bundleRowExpander.ts';

test('detects grab bar set with "in" suffix', () => {
  const plan = detectBundleExpansion('Grab bar set: 18 in, 36 in');
  assert.ok(plan, 'expected a bundle plan');
  assert.equal(plan!.family, 'grab_bar');
  assert.deepEqual(plan!.members, ['18"', '36"']);
});

test('detects grab bar set with three sizes and quote suffix', () => {
  const plan = detectBundleExpansion('Grab bar set: 18", 36", 42"');
  assert.ok(plan);
  assert.equal(plan!.members.length, 3);
  assert.deepEqual(plan!.members, ['18"', '36"', '42"']);
});

test('detects partition set with descriptive members', () => {
  const plan = detectBundleExpansion('Toilet partition set: pilaster, door, panel');
  assert.ok(plan);
  assert.equal(plan!.family, 'partition_set');
  assert.deepEqual(plan!.members, ['pilaster', 'door', 'panel']);
});

test('detects accessory kit when members are descriptive phrases', () => {
  const plan = detectBundleExpansion('Accessory kit: soap dispenser, paper towel dispenser, mirror');
  assert.ok(plan);
  assert.equal(plan!.family, 'accessory_kit');
  assert.equal(plan!.members.length, 3);
});

test('returns null for non-bundle descriptions', () => {
  assert.equal(detectBundleExpansion('Sanitary napkin disposal, SKU 4781-11'), null);
  assert.equal(detectBundleExpansion(''), null);
  assert.equal(detectBundleExpansion('Eclipse HDPE toilet partitions with Eclipse hardware'), null);
});

test('resolveSetMultiplier returns quantity when unit is a set synonym', () => {
  const line: ExpandableLineLike = {
    description: 'Grab bar set: 18 in, 36 in',
    quantity: 2,
    unit: 'sets',
  };
  assert.equal(resolveSetMultiplier(line), 2);
});

test('resolveSetMultiplier returns 1 for non-set units', () => {
  const line: ExpandableLineLike = {
    description: 'Grab bar 36"',
    quantity: 2,
    unit: 'EA',
  };
  assert.equal(resolveSetMultiplier(line), 1);
});

test('expandBundleLine multiplies by set quantity and preserves context', () => {
  const line: ExpandableLineLike = {
    description: 'Grab bar set: 18 in, 36 in',
    itemName: 'Grab bar set',
    quantity: 2,
    unit: 'sets',
    category: 'Toilet Accessories',
    sourceManufacturer: 'Bradley',
    sourceBidBucket: 'Base Bid',
    sourceSectionHeader: 'Bradley - Toilet Accessories - Base Bid',
    warnings: [],
  };
  const plan = detectBundleExpansion(line.description)!;
  const children = expandBundleLine(line, plan);
  assert.equal(children.length, 2);
  assert.equal(children[0].child.description, 'Grab bar 18"');
  assert.equal(children[1].child.description, 'Grab bar 36"');
  for (const c of children) {
    assert.equal(c.child.quantity, 2);
    assert.equal(c.child.unit, 'EA');
    assert.equal(c.child.sourceManufacturer, 'Bradley');
    assert.equal(c.child.category, 'Toilet Accessories');
    assert.ok(c.child.warnings && c.child.warnings.length >= 1);
  }
});

test('detects grab bar set even when PDF leaves "Sets <sku>" prefix attached (real-world form)', () => {
  // Shape observed in Lewis & Clark LPS proposal after PDF deterministic normalization:
  // `Sets 8322 Grab Bars – 18", 36"` with quantity=2, unit=null.
  const plan = detectBundleExpansion('Sets 8322 Grab Bars – 18”, 36”');
  assert.ok(plan, 'should still detect a grab bar bundle despite leading "Sets <sku>" noise');
  assert.equal(plan!.family, 'grab_bar');
  assert.deepEqual(plan!.members, ['18"', '36"']);
});

test('detects grab bar 18/36/42 bundle with en-dash and curly quotes', () => {
  const plan = detectBundleExpansion('Sets 8322 Grab Bars – 18”, 36”, 42”');
  assert.ok(plan);
  assert.deepEqual(plan!.members, ['18"', '36"', '42"']);
});

test('resolveSetMultiplier infers set multiplier from description when unit is null (PDF path)', () => {
  const line: ExpandableLineLike = {
    description: 'Sets 8322 Grab Bars – 18”, 36”',
    quantity: 2,
    unit: null as unknown as string,
  };
  assert.equal(resolveSetMultiplier(line), 2);
});

test('expandBundleLines multiplies correctly for PDF-shape grab bar set rows', () => {
  const out = expandBundleLines<ExpandableLineLike>([
    { description: 'Sets 8322 Grab Bars – 18”, 36”', quantity: 2, unit: null as unknown as string },
    { description: 'Sets 8322 Grab Bars – 18”, 36”, 42”', quantity: 2, unit: null as unknown as string },
  ]);
  assert.equal(out.length, 5, 'expected 2 + 3 children');
  const sum = (size: string) => out
    .filter((l) => l.description === `Grab bar ${size}`)
    .reduce((n, l) => n + Number(l.quantity), 0);
  assert.equal(sum('18"'), 4);
  assert.equal(sum('36"'), 4);
  assert.equal(sum('42"'), 2);
});

test('expandBundleLines preserves non-bundle lines and inlines children', () => {
  const lines: ExpandableLineLike[] = [
    { description: 'Sanitary napkin disposal', quantity: 18, unit: 'EA' },
    {
      description: 'Grab bar set: 18 in, 36 in, 42 in',
      quantity: 2,
      unit: 'sets',
      warnings: [],
    },
    { description: 'Angle frame mirror', quantity: 3, unit: 'EA' },
  ];
  const out = expandBundleLines(lines);
  assert.equal(out.length, 1 + 3 + 1);
  assert.equal(out[0].description, 'Sanitary napkin disposal');
  assert.equal(out[1].description, 'Grab bar 18"');
  assert.equal(out[2].description, 'Grab bar 36"');
  assert.equal(out[3].description, 'Grab bar 42"');
  assert.equal(out[1].quantity, 2);
  assert.equal(out[4].description, 'Angle frame mirror');
});
