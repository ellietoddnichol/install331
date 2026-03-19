import test from 'node:test';
import assert from 'node:assert/strict';
import { buildParseConfidenceSummary } from './confidence.ts';
import { validateNormalizedItems } from './validator.ts';
import type { NormalizedIntakeItem } from '../../../shared/types/intake.ts';

test('validator flags modifiers and confidence recommends review when warnings accumulate', () => {
  const items: NormalizedIntakeItem[] = [
    {
      sourceType: 'excel',
      sourceRef: { fileName: 'fixture.xlsx', sheetName: 'Takeoff', rowNumber: 8 },
      itemType: 'item',
      category: null,
      roomName: 'Room 101',
      description: 'Powder coat finish add',
      quantity: null,
      unit: 'EA',
      manufacturer: null,
      model: null,
      finish: null,
      modifiers: [],
      bundleCandidates: [],
      notes: [],
      alternate: false,
      exclusion: false,
      confidence: 0.42,
    },
  ];

  const validation = validateNormalizedItems(items);
  const confidence = buildParseConfidenceSummary(validation.correctedItems || items, validation);

  assert.equal(validation.isValid, true);
  assert.equal(validation.correctedItems?.[0]?.itemType, 'modifier');
  assert.equal(validation.warnings.length > 0, true);
  assert.equal(confidence.recommendedAction, 'review-before-import');
});

test('validator warns when a parsed line looks like a room header false positive', () => {
  const items: NormalizedIntakeItem[] = [
    {
      sourceType: 'excel',
      sourceRef: { fileName: 'fixture.xlsx', sheetName: 'Takeoff', rowNumber: 11 },
      itemType: 'item',
      category: null,
      roomName: null,
      description: 'Room 101 / Vestibule',
      quantity: null,
      unit: null,
      manufacturer: null,
      model: null,
      finish: null,
      modifiers: [],
      bundleCandidates: [],
      notes: [],
      alternate: false,
      exclusion: false,
      confidence: 0.4,
    },
  ];

  const validation = validateNormalizedItems(items);

  assert.equal(validation.isValid, true);
  assert.equal(validation.warnings.some((entry) => entry.includes('room header')), true);
});

test('confidence recommends manual template when no usable parsed items exist', () => {
  const validation = validateNormalizedItems([]);
  const confidence = buildParseConfidenceSummary(validation.correctedItems || [], validation);

  assert.equal(validation.isValid, false);
  assert.equal(confidence.recommendedAction, 'manual-template');
});

test('confidence does not collapse large takeoffs because of repeated warning variants', () => {
  const items: NormalizedIntakeItem[] = Array.from({ length: 40 }, (_value, index) => ({
    sourceType: 'excel',
    sourceRef: { fileName: 'fixture.xlsx', sheetName: 'Inventory List', rowNumber: index + 4, sourceColumn: 'C' },
    itemType: 'item',
    category: 'Toilet Accessories',
    roomName: `Room ${index + 1}`,
    description: 'Grab Bar 36',
    quantity: 1,
    unit: 'EA',
    manufacturer: 'Bobrick',
    model: 'B6806',
    finish: null,
    modifiers: [],
    bundleCandidates: [],
    notes: [],
    alternate: false,
    exclusion: false,
    confidence: 0.82,
    reviewRequired: true,
    catalogMatchCandidates: [
      {
        catalogItemId: 'gb-36',
        matchedName: 'Grab Bar 36 inch Stainless Steel',
        description: 'Grab Bar 36 inch Stainless Steel',
        sku: 'GB-36',
        category: 'Toilet Accessories',
        unit: 'EA',
        manufacturer: 'Bobrick',
        model: 'B6806',
        materialCost: 50,
        laborMinutes: 20,
        matchMethod: 'alias',
        confidence: 0.68,
        reasons: ['Takeoff family alias matched catalog item family'],
        parsedFamily: 'grab bar',
        parsedModelTokens: ['B6806'],
        parsedDimensions: [36],
        familyOnly: true,
        catalogCoverageGap: true,
      },
    ],
  }));

  const validation = {
    isValid: true,
    errors: [],
    warnings: items.flatMap((item, index) => [
      `Item Inventory List:${index + 4} has an uncertain catalog match (Grab Bar - 36\" SS (GB)).`,
      `Item Inventory List:${index + 4} from header "GB B6806 36" could not be matched to the catalog.`,
    ]),
    correctedItems: items,
  };

  const confidence = buildParseConfidenceSummary(items, validation);

  assert.equal(confidence.recommendedAction, 'review-before-import');
  assert.equal(confidence.overallConfidence > 0.45, true);
});