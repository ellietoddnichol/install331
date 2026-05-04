import test from 'node:test';
import assert from 'node:assert/strict';
import type { CatalogItem } from '../../../types.ts';
import { matchMatrixHeaderToCatalog } from './catalogMatcher.ts';

const catalog: CatalogItem[] = [
  {
    id: 'gb-18',
    sku: 'GB-18',
    category: 'Toilet Accessories',
    description: 'Grab Bar 18 inch Stainless Steel',
    manufacturer: 'Bobrick',
    model: 'B-6818',
    uom: 'EA',
    baseMaterialCost: 42,
    baseLaborMinutes: 20,
    taxable: true,
    adaFlag: true,
    active: true,
  },
  {
    id: 'gb-2wall',
    sku: 'GB-2WALL',
    category: 'Toilet Accessories',
    description: 'Two-Wall Grab Bar Assembly',
    manufacturer: 'Bobrick',
    model: 'B-9999',
    uom: 'EA',
    baseMaterialCost: 90,
    baseLaborMinutes: 35,
    taxable: true,
    adaFlag: true,
    active: true,
  },
  {
    id: 'ch-b212',
    sku: 'CH-B212',
    category: 'Toilet Accessories',
    description: 'Coat Hook',
    manufacturer: 'Bobrick',
    model: 'B212',
    uom: 'EA',
    baseMaterialCost: 18,
    baseLaborMinutes: 10,
    taxable: true,
    adaFlag: false,
    active: true,
  },
  {
    id: 'snv-b2706',
    sku: 'SNV-B2706',
    category: 'Toilet Accessories',
    description: 'Sanitary Napkin Vendor',
    manufacturer: 'Bobrick',
    model: 'B2706',
    uom: 'EA',
    baseMaterialCost: 120,
    baseLaborMinutes: 25,
    taxable: true,
    adaFlag: false,
    active: true,
  },
  {
    id: 'ttd-w556509',
    sku: 'TTD-W556509',
    category: 'Toilet Accessories',
    description: 'Toilet Tissue Dispenser',
    manufacturer: 'ASI',
    model: 'W556509',
    uom: 'EA',
    baseMaterialCost: 68,
    baseLaborMinutes: 18,
    taxable: true,
    adaFlag: false,
    active: true,
  },
  {
    id: 'sd-w51919',
    sku: 'SD-W51919-04',
    category: 'Toilet Accessories',
    description: 'Soap Dispenser with LTX-12 Top Fill',
    manufacturer: 'ASI',
    model: 'W51919-04',
    uom: 'EA',
    baseMaterialCost: 88,
    baseLaborMinutes: 20,
    taxable: true,
    adaFlag: false,
    active: true,
  },
  {
    id: 'hd-xlsb',
    sku: 'HD-XL-SB-REC',
    category: 'Toilet Accessories',
    description: 'High Speed Hand Dryer XL-SB with Recess Kit',
    manufacturer: 'Excel Dryer',
    model: 'XL-SB',
    uom: 'EA',
    baseMaterialCost: 420,
    baseLaborMinutes: 35,
    taxable: true,
    adaFlag: false,
    active: true,
  },
  {
    id: 'scr-36',
    sku: 'SCR-36',
    category: 'Toilet Accessories',
    description: 'Shower Curtain Rod 36 inch Stainless Steel',
    manufacturer: 'ASI',
    model: 'SCR-36',
    uom: 'EA',
    baseMaterialCost: 55,
    baseLaborMinutes: 18,
    taxable: true,
    adaFlag: false,
    active: true,
  },
  {
    id: 'b290-1836',
    sku: 'MR-B290-1836',
    category: 'Toilet Accessories',
    description: 'Mirror B290 18x36 Stainless Steel Frame',
    manufacturer: 'Bobrick',
    model: 'B290',
    uom: 'EA',
    baseMaterialCost: 110,
    baseLaborMinutes: 20,
    taxable: true,
    adaFlag: false,
    active: true,
  },
  {
    id: 'snd-b270',
    sku: 'SND-B270',
    category: 'Toilet Accessories',
    description: 'Sanitary Napkin Disposal',
    manufacturer: 'Bobrick',
    model: 'B270',
    uom: 'EA',
    baseMaterialCost: 54,
    baseLaborMinutes: 16,
    taxable: true,
    adaFlag: false,
    active: true,
  },
  {
    id: 'sch-hooks',
    sku: 'SCH',
    category: 'Toilet Accessories',
    description: 'Shower Curtain Hooks (Set of 12)',
    manufacturer: 'ASI',
    model: 'SCH',
    uom: 'EA',
    baseMaterialCost: 12,
    baseLaborMinutes: 6,
    taxable: true,
    adaFlag: false,
    active: true,
  },
  {
    id: 'sc-curtain',
    sku: 'SC',
    category: 'Toilet Accessories',
    description: 'Vinyl Shower Curtain - White',
    manufacturer: 'ASI',
    model: 'SC',
    uom: 'EA',
    baseMaterialCost: 28,
    baseLaborMinutes: 8,
    taxable: true,
    adaFlag: false,
    active: true,
  },
  {
    id: 'fss-seat',
    sku: 'FSS',
    category: 'Toilet Accessories',
    description: 'Folding Shower Seat - Stainless Steel',
    manufacturer: 'ASI',
    model: 'FSS',
    uom: 'EA',
    baseMaterialCost: 310,
    baseLaborMinutes: 45,
    taxable: true,
    adaFlag: true,
    active: true,
  },
];

test('matchMatrixHeaderToCatalog interprets shorthand headers and model tokens', () => {
  const cases = [
    ['GB 18', 'gb-18'],
    ['2 Wall GB', 'gb-2wall'],
    ['CH B212', 'ch-b212'],
    ['SNV B2706', 'snv-b2706'],
    ['TTD W556509', 'ttd-w556509'],
    ['SD W51919-04 LTX-12', 'sd-w51919'],
    ['HD XL-SB w/ Recess Kit', 'hd-xlsb'],
    ['SND B270', 'snd-b270'],
    ['SCH', 'sch-hooks'],
    ['SC', 'sc-curtain'],
    ['FSS', 'fss-seat'],
    ['SCR 36', 'scr-36'],
    ['B290 1836', 'b290-1836'],
  ] as const;

  cases.forEach(([header, expectedId]) => {
    const top = matchMatrixHeaderToCatalog(header, catalog)[0];
    assert.equal(top?.catalogItemId, expectedId);
    assert.notEqual(top?.matchMethod, 'unmatched');
    assert.equal((top?.confidence || 0) > 0.45, true);
    assert.ok(top?.parsedFamily);
  });
});

test('matchMatrixHeaderToCatalog returns family-only suggestions when the exact model is missing', () => {
  const familyOnlyCatalog = catalog.filter((item) => !['ch-b212', 'snv-b2706', 'ttd-w556509'].includes(item.id));
  familyOnlyCatalog.push({
    id: 'generic-coat-hook',
    sku: 'HK-H',
    category: 'Toilet Accessories',
    description: 'Heavy Duty Coat Hook',
    manufacturer: 'Bobrick',
    model: undefined,
    uom: 'EA',
    baseMaterialCost: 14,
    baseLaborMinutes: 8,
    taxable: true,
    adaFlag: false,
    active: true,
  });

  const top = matchMatrixHeaderToCatalog('CH B212', familyOnlyCatalog)[0];
  assert.equal(top?.catalogItemId, 'generic-coat-hook');
  assert.equal(top?.familyOnly, true);
  assert.equal(Boolean(top?.catalogCoverageGap), true);
  assert.equal((top?.confidence || 0) < 0.75, true);
  assert.equal(top?.reasons.some((reason) => /exact takeoff model appears missing from coverage/i.test(reason)), true);
});

test('matchMatrixHeaderToCatalog explains catalog coverage gaps when no family candidate exists', () => {
  const top = matchMatrixHeaderToCatalog('TTD W556509', catalog.filter((item) => item.id !== 'ttd-w556509'))[0];
  assert.equal(top?.matchMethod, 'unmatched');
  assert.equal(top?.parsedFamily, 'toilet tissue dispenser');
  assert.equal(top?.catalogCoverageGap, true);
  assert.equal(top?.reasons.some((reason) => /catalog coverage may be missing/i.test(reason)), true);
});

test('matchMatrixHeaderToCatalog preserves existing strong grab bar matches', () => {
  const gb18 = matchMatrixHeaderToCatalog('GB 18', catalog)[0];
  const gb36 = matchMatrixHeaderToCatalog('GB 36', [
    ...catalog,
    {
      id: 'gb-36',
      sku: 'GB-36',
      category: 'Toilet Accessories',
      description: 'Grab Bar 36 inch Stainless Steel',
      manufacturer: 'Bobrick',
      model: 'B6806',
      uom: 'EA',
      baseMaterialCost: 52,
      baseLaborMinutes: 20,
      taxable: true,
      adaFlag: true,
      active: true,
    },
  ])[0];
  const gbModel = matchMatrixHeaderToCatalog('GB B6806 42', [
    ...catalog,
    {
      id: 'gb-b6806-42',
      sku: 'GB-B6806-42',
      category: 'Toilet Accessories',
      description: 'Grab Bar 42 inch Stainless Steel',
      manufacturer: 'Bobrick',
      model: 'B6806',
      uom: 'EA',
      baseMaterialCost: 58,
      baseLaborMinutes: 22,
      taxable: true,
      adaFlag: true,
      active: true,
    },
  ])[0];

  assert.equal((gb18?.confidence || 0) >= 0.75, true);
  assert.equal((gb36?.confidence || 0) >= 0.75, true);
  assert.equal((gbModel?.confidence || 0) >= 0.75, true);
});

test('matchMatrixHeaderToCatalog returns unmatched candidate when shorthand is unknown', () => {
  const top = matchMatrixHeaderToCatalog('XYZ CUSTOM-77', catalog)[0];
  assert.equal(top?.matchMethod, 'unmatched');
  assert.equal(top?.confidence, 0);
});