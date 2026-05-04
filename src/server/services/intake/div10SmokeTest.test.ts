import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSpreadsheetRows } from '../spreadsheetInterpreterService.ts';
import { toReviewLines } from '../matchPreparationService.ts';
import { parseSectionHeaderText } from '../rowClassifierService.ts';
import { buildIntakeEstimateDraft } from '../intakeMatcherService.ts';
import {
  classifyBidBucketKind,
  compareBidBucketKeys,
  computeDraftBasisSummary,
  isBidBucketIncludedByDefault,
} from '../../../shared/utils/intakeEstimateReview.ts';
import type { CatalogItem } from '../../../types.ts';

/**
 * Intake pipeline smoke test modelled on the Div10 starter-pack sample described in the
 * intake overhaul brief. We fabricate a structurally-realistic "proposal-style" spreadsheet
 * (Brand - Category - Bucket headers, mixed SKU / non-SKU rows, bundles, pricing notices) and
 * verify the new pipeline produces:
 *
 * - section-context inheritance on every child row
 * - installable-scope flags on partition/urinal/grab-bar/mirror rows even without catalog match
 * - bundle expansion for `Grab bar set: 18, 36[, 42]`
 * - non-scope rows (Material Total, bond note, logistics) are filtered out
 * - labor from install_family fallback when catalog lacks an exact SKU
 */
const sampleRows: Array<Array<string | number | boolean | null | undefined>> = [
  ['Div 10 Proposal - Sample Project', '', '', '', '', ''],
  ['Qty', 'SKU', 'Description', 'Unit', 'Material', 'Notes'],
  ['Scranton - Toilet Partitions - Base Bid'],
  [23, '', 'Eclipse HDPE toilet partitions with Eclipse hardware', 'compartments', 18500, ''],
  [7, '', 'Urinal screens, HDPE, floor mounted', 'each', 2800, ''],
  ['Material Total: $21,300.00'],
  ['If labor is needed, call for quote.'],
  ['Bradley - Toilet Accessories - Base Bid'],
  [18, '4781-11', 'Sanitary napkin disposal', 'EA', 1296, ''],
  [3, '780-2436', 'Angle frame mirror 24" x 36"', 'EA', 570, ''],
  [2, '8322', 'Grab bar set: 18 in, 36 in, 42 in', 'sets', 620, ''],
  ['Performance Bond: Y/N'],
  ['Customer to receive and unload'],
  ['Material Total: $2,486.00'],
  ['Scranton - Toilet Partitions - Alt. 1 Bid'],
  [4, '', 'Eclipse HDPE toilet partitions with Eclipse hardware', 'compartments', 3200, ''],
  ['Bradley - Toilet Accessories - Alt. 1 Bid'],
  [3, '4781-11', 'Sanitary napkin disposal', 'EA', 216, ''],
];

const emptyCatalog: CatalogItem[] = [];

test('Div10 sample: section context inherited on all priced rows', () => {
  const result = parseSpreadsheetRows(sampleRows, 'div10-smoke', emptyCatalog);
  assert.ok(result, 'expected parser to return a result');
  const partitionRows = result!.rows.filter((r) => /partition|urinal/i.test(r.description));
  assert.ok(partitionRows.length >= 2, 'expected partition + urinal rows');
  for (const row of partitionRows) {
    assert.equal(row.sourceManufacturer, 'Scranton');
    assert.ok(
      row.sourceBidBucket === 'Base Bid' || row.sourceBidBucket === 'Alt 1',
      `expected Scranton partition bucket to be Base Bid or Alt 1, got ${row.sourceBidBucket}`
    );
    assert.ok((row.sourceSectionHeader || '').toLowerCase().includes('scranton'));
  }
  const accessoryRows = result!.rows.filter((r) => /mirror|napkin|grab bar/i.test(r.description));
  assert.ok(accessoryRows.length >= 2, 'expected accessory rows');
  for (const row of accessoryRows) {
    assert.equal(row.sourceManufacturer, 'Bradley');
    assert.ok(
      row.sourceBidBucket === 'Base Bid' || row.sourceBidBucket === 'Alt 1',
      `expected Bradley accessory bucket to be Base Bid or Alt 1, got ${row.sourceBidBucket}`
    );
  }
  // Both Base Bid and Alt 1 must be represented in the parsed output (the sample has both).
  const buckets = new Set(
    result!.rows.map((r) => r.sourceBidBucket).filter((b): b is string => !!b)
  );
  assert.ok(buckets.has('Base Bid'));
  assert.ok(buckets.has('Alt 1'));
});

test('Div10 sample: installable-scope flags set even without catalog match', () => {
  const result = parseSpreadsheetRows(sampleRows, 'div10-smoke', emptyCatalog);
  assert.ok(result);
  const partition = result!.rows.find((r) => /eclipse hdpe/i.test(r.description));
  assert.ok(partition, 'expected partition row');
  assert.equal(partition!.isInstallableScope, true);
  assert.equal(partition!.installScopeType, 'partition_compartment');

  const urinal = result!.rows.find((r) => /urinal screen/i.test(r.description));
  assert.ok(urinal);
  assert.equal(urinal!.isInstallableScope, true);
  assert.equal(urinal!.installScopeType, 'urinal_screen');

  const napkin = result!.rows.find((r) => /napkin/i.test(r.description));
  assert.ok(napkin);
  assert.equal(napkin!.installScopeType, 'sanitary_napkin_disposal');
});

test('Div10 sample: bundle expansion explodes grab bar set into children', async () => {
  const result = parseSpreadsheetRows(sampleRows, 'div10-smoke', emptyCatalog);
  assert.ok(result);
  const reviewLines = await toReviewLines(result!.rows, emptyCatalog, false, []);
  const grabBarDescriptions = reviewLines
    .filter((r) => /grab bar/i.test(r.description))
    .map((r) => r.description);
  assert.ok(
    grabBarDescriptions.some((d) => /18"/.test(d)) &&
      grabBarDescriptions.some((d) => /36"/.test(d)) &&
      grabBarDescriptions.some((d) => /42"/.test(d)),
    `expected expanded grab bar sizes, got ${grabBarDescriptions.join(', ')}`
  );
  const gb18 = reviewLines.find((r) => /grab bar 18"/i.test(r.description));
  assert.ok(gb18);
  // Multiplied: 2 sets x 3 sizes → each child has qty=2.
  assert.equal(gb18!.quantity, 2);
});

test('Div10 sample: non-scope noise (totals, bonds, logistics) is filtered out', () => {
  const result = parseSpreadsheetRows(sampleRows, 'div10-smoke', emptyCatalog);
  assert.ok(result);
  const descriptions = result!.rows.map((r) => r.description.toLowerCase());
  assert.ok(!descriptions.some((d) => d.includes('material total')), 'Material Total should be filtered');
  assert.ok(!descriptions.some((d) => d.includes('bond')), 'Performance Bond should be filtered');
  assert.ok(!descriptions.some((d) => d.includes('receive and unload')), 'Logistics note should be filtered');
  assert.ok(!descriptions.some((d) => d.includes('if labor')), 'Pricing notice should be filtered');
});

test('Div10 sample: review lines get install-family fallback labor when no catalog match', async () => {
  const result = parseSpreadsheetRows(sampleRows, 'div10-smoke', emptyCatalog);
  assert.ok(result);
  const reviewLines = await toReviewLines(result!.rows, emptyCatalog, false, []);
  const partition = reviewLines.find((r) => /eclipse hdpe/i.test(r.description));
  assert.ok(partition);
  assert.equal(partition!.isInstallableScope, true);
  assert.ok(partition!.installFamilyFallback, 'expected install family fallback on partition');
  assert.equal(partition!.installFamilyFallback!.key, 'partition_compartment');
  assert.ok(partition!.installFamilyFallback!.minutes > 0);
});

test('Phase 0.2: catalog match with zero labor still triggers install-family fallback (zero-labor gap closed)', async () => {
  // Catalog has a SKU that will match by code, but baseLaborMinutes is 0.
  const zeroLaborCatalog: CatalogItem[] = [
    {
      id: 'zero-labor-item',
      sku: '4781-11',
      category: 'Toilet Accessories',
      description: 'Sanitary napkin disposal',
      uom: 'EA',
      baseMaterialCost: 72,
      baseLaborMinutes: 0, // <-- the bug case
      taxable: false,
      adaFlag: false,
      active: true,
    } as CatalogItem,
  ];
  const result = parseSpreadsheetRows(sampleRows, 'div10-smoke', zeroLaborCatalog);
  assert.ok(result);
  const reviewLines = await toReviewLines(result!.rows, zeroLaborCatalog, true, []);
  const disposal = reviewLines.find(
    (r) => /sanitary napkin/i.test(r.description) && r.catalogMatch?.catalogItemId === 'zero-labor-item'
  );
  assert.ok(disposal, 'expected sanitary napkin row to match the zero-labor catalog item');
  assert.equal(disposal!.isInstallableScope, true);
  assert.ok(
    disposal!.installFamilyFallback,
    'zero-labor catalog match should still surface an install-family fallback'
  );
  assert.ok(disposal!.installFamilyFallback!.minutes > 0);
});

test('Phase 0.2: catalog item installLaborFamily overrides the parsed installScopeType', async () => {
  // Catalog declares a specific family key; the in-code registry must prefer it.
  const editorialCatalog: CatalogItem[] = [
    {
      id: 'editorial-item',
      sku: '4781-11',
      category: 'Toilet Accessories',
      description: 'Sanitary napkin disposal',
      uom: 'EA',
      baseMaterialCost: 72,
      baseLaborMinutes: 0,
      installLaborFamily: 'accessory_generic', // editorial override
      taxable: false,
      adaFlag: false,
      active: true,
    } as CatalogItem,
  ];
  const result = parseSpreadsheetRows(sampleRows, 'div10-smoke', editorialCatalog);
  assert.ok(result);
  const reviewLines = await toReviewLines(result!.rows, editorialCatalog, true, []);
  const disposal = reviewLines.find(
    (r) => /sanitary napkin/i.test(r.description) && r.catalogMatch?.catalogItemId === 'editorial-item'
  );
  assert.ok(disposal, 'expected sanitary napkin row to match editorial catalog item');
  assert.ok(disposal!.installFamilyFallback);
  assert.equal(
    disposal!.installFamilyFallback!.key,
    'accessory_generic',
    'catalog installLaborFamily should win over parsed installScopeType'
  );
});

// --- Regression coverage for issues surfaced by the Lewis & Clark LPS proposal PDF ---

test('Alt. 1 Bid section header parses the bid bucket correctly (regex tolerates the period)', () => {
  const ctx = parseSectionHeaderText('Scranton – Toilet Partitions – Alt. 1 Bid');
  assert.ok(ctx, 'expected a SectionContext');
  assert.equal(ctx!.manufacturer, 'Scranton');
  assert.equal(ctx!.bidBucket, 'Alt 1');
});

test('Matcher emits install-family pricing preview even when scopeBucket is unknown (no catalog match, no AI classification)', async () => {
  const result = parseSpreadsheetRows(sampleRows, 'div10-smoke', emptyCatalog);
  assert.ok(result);
  const reviewLines = await toReviewLines(result!.rows, emptyCatalog, false, []);
  // A minimal dummy catalog so buildIntakeEstimateDraft does not early-return.
  const dummy: CatalogItem[] = [
    {
      id: 'dummy',
      sku: 'DUMMY',
      category: 'Toilet Accessories',
      description: 'dummy',
      uom: 'EA',
      baseMaterialCost: 0,
      baseLaborMinutes: 0,
      taxable: false,
      adaFlag: false,
      active: true,
    } as CatalogItem,
  ];
  const draft = buildIntakeEstimateDraft({
    reviewLines,
    catalog: dummy,
    modifiers: [],
    intakeAutomation: { mode: 'preselect_only', tierAMinScore: 0.82 },
  });
  assert.ok(draft, 'expected a draft');
  const partition = draft!.lineSuggestions.find((s) =>
    reviewLines.find((r) => r.reviewLineFingerprint === s.reviewLineFingerprint && /eclipse hdpe/i.test(r.description))
  );
  assert.ok(partition, 'expected partition suggestion');
  assert.ok(partition!.pricingPreview, 'install-family row should still have pricingPreview');
  assert.equal(partition!.pricingPreview!.laborFromInstallFamily, true);
  assert.equal(partition!.laborOrigin, 'install_family');
});

test('classifyBidBucketKind + compareBidBucketKeys + isBidBucketIncludedByDefault behave as spec', () => {
  assert.equal(classifyBidBucketKind('Base Bid'), 'base');
  assert.equal(classifyBidBucketKind('Alt 1'), 'alternate');
  assert.equal(classifyBidBucketKind('Alternate 2'), 'alternate');
  assert.equal(classifyBidBucketKind('Deduct Alt 1'), 'deduct');
  assert.equal(classifyBidBucketKind('Allowance'), 'allowance');
  assert.equal(classifyBidBucketKind('Unit Prices'), 'unit_price');
  assert.equal(classifyBidBucketKind(''), 'unbucketed');
  assert.equal(classifyBidBucketKind(null), 'unbucketed');

  assert.equal(isBidBucketIncludedByDefault('base'), true);
  assert.equal(isBidBucketIncludedByDefault('unbucketed'), true);
  assert.equal(isBidBucketIncludedByDefault('allowance'), true);
  assert.equal(isBidBucketIncludedByDefault('alternate'), false);
  assert.equal(isBidBucketIncludedByDefault('deduct'), false);
  assert.equal(isBidBucketIncludedByDefault('unit_price'), false);

  // Sort: base < alt 1 < alt 2 < deduct < allowance < unit_price < other < unbucketed
  const keys = [
    { key: 'Alt 2', kind: 'alternate' as const, label: 'Alt 2' },
    { key: '', kind: 'unbucketed' as const, label: '(no bucket)' },
    { key: 'Base Bid', kind: 'base' as const, label: 'Base Bid' },
    { key: 'Alt 1', kind: 'alternate' as const, label: 'Alt 1' },
    { key: 'Allowance', kind: 'allowance' as const, label: 'Allowance' },
  ];
  keys.sort(compareBidBucketKeys);
  assert.deepEqual(
    keys.map((k) => k.label),
    ['Base Bid', 'Alt 1', 'Alt 2', 'Allowance', '(no bucket)']
  );
});

test('computeDraftBasisSummary detects bid splits and excludes alternates from primary totals by default', async () => {
  const result = parseSpreadsheetRows(sampleRows, 'div10-smoke', emptyCatalog);
  assert.ok(result);
  const reviewLines = await toReviewLines(result!.rows, emptyCatalog, false, []);
  const dummy: CatalogItem[] = [
    { id: 'dummy', sku: 'DUMMY', category: 'Toilet Accessories', description: 'dummy', uom: 'EA', baseMaterialCost: 0, baseLaborMinutes: 0, taxable: false, adaFlag: false, active: true } as CatalogItem,
  ];
  const draft = buildIntakeEstimateDraft({
    reviewLines,
    catalog: dummy,
    modifiers: [],
    intakeAutomation: { mode: 'preselect_only', tierAMinScore: 0.82 },
  })!;

  // Accept all install-family rows (representative of user accepting rows).
  const byFp: Record<string, { selectedCatalogItemId: string | null; applicationStatus: 'suggested' | 'accepted' | 'replaced' | 'ignored'; selectedBundleId: string | null }> = {};
  for (const s of draft.lineSuggestions) {
    byFp[s.reviewLineFingerprint] = {
      selectedCatalogItemId: s.suggestedCatalogItemId,
      applicationStatus: s.pricingPreview?.laborFromInstallFamily ? 'accepted' : s.applicationStatus,
      selectedBundleId: null,
    };
  }
  const summary = computeDraftBasisSummary(draft, byFp, null, { pricingMode: 'labor_and_material' });
  assert.equal(summary.hasBidSplits, true, 'expected hasBidSplits with Base + Alt 1 sample');
  const baseBucket = summary.byBidBucket.find((b) => b.label === 'Base Bid');
  const altBucket = summary.byBidBucket.find((b) => b.label === 'Alt 1');
  assert.ok(baseBucket, 'expected a Base Bid bucket');
  assert.ok(altBucket, 'expected an Alt 1 bucket');
  assert.equal(baseBucket!.kind, 'base');
  assert.equal(baseBucket!.includedInPrimaryTotals, true);
  assert.equal(altBucket!.kind, 'alternate');
  assert.equal(altBucket!.includedInPrimaryTotals, false, 'Alt 1 should be excluded from primary totals by default');
  assert.ok(baseBucket!.laborMinutesSubtotalPreview > 0);
  assert.ok(altBucket!.laborMinutesSubtotalPreview > 0);
  // Primary total should equal base + allowance + unbucketed only (no alt).
  assert.equal(summary.laborMinutesSubtotalPreview, baseBucket!.laborMinutesSubtotalPreview);
  // Summary should carry a warning about excluded alternates.
  assert.ok(
    summary.warnings.some((w) => /alternate|deduct/i.test(w)),
    'expected a warning about excluded alternate buckets'
  );
});

test('computeDraftBasisSummary honors explicit bidBucketsIncluded filter (toggle alternates on)', async () => {
  const result = parseSpreadsheetRows(sampleRows, 'div10-smoke', emptyCatalog);
  assert.ok(result);
  const reviewLines = await toReviewLines(result!.rows, emptyCatalog, false, []);
  const dummy: CatalogItem[] = [
    { id: 'dummy', sku: 'DUMMY', category: 'Toilet Accessories', description: 'dummy', uom: 'EA', baseMaterialCost: 0, baseLaborMinutes: 0, taxable: false, adaFlag: false, active: true } as CatalogItem,
  ];
  const draft = buildIntakeEstimateDraft({
    reviewLines,
    catalog: dummy,
    modifiers: [],
    intakeAutomation: { mode: 'preselect_only', tierAMinScore: 0.82 },
  })!;
  const byFp: Record<string, { selectedCatalogItemId: string | null; applicationStatus: 'suggested' | 'accepted' | 'replaced' | 'ignored'; selectedBundleId: string | null }> = {};
  for (const s of draft.lineSuggestions) {
    byFp[s.reviewLineFingerprint] = {
      selectedCatalogItemId: s.suggestedCatalogItemId,
      applicationStatus: s.pricingPreview?.laborFromInstallFamily ? 'accepted' : s.applicationStatus,
      selectedBundleId: null,
    };
  }
  const defaultSummary = computeDraftBasisSummary(draft, byFp, null, { pricingMode: 'labor_and_material' });
  const allBuckets = new Set(defaultSummary.byBidBucket.map((b) => b.key));
  const fullSummary = computeDraftBasisSummary(draft, byFp, null, {
    pricingMode: 'labor_and_material',
    bidBucketsIncluded: allBuckets,
  });
  const sumAllBuckets = defaultSummary.byBidBucket.reduce((s, b) => s + b.laborMinutesSubtotalPreview, 0);
  assert.equal(fullSummary.laborMinutesSubtotalPreview, sumAllBuckets, 'with all buckets on, primary total = sum of all bucket labor');
  assert.ok(fullSummary.laborMinutesSubtotalPreview > defaultSummary.laborMinutesSubtotalPreview, 'toggling alt on must strictly increase primary total');
});

test('computeDraftBasisSummary excludes install-family labor in material_only mode but includes it otherwise', async () => {
  const result = parseSpreadsheetRows(sampleRows, 'div10-smoke', emptyCatalog);
  assert.ok(result);
  const reviewLines = await toReviewLines(result!.rows, emptyCatalog, false, []);
  const dummy: CatalogItem[] = [
    {
      id: 'dummy',
      sku: 'DUMMY',
      category: 'Toilet Accessories',
      description: 'dummy',
      uom: 'EA',
      baseMaterialCost: 0,
      baseLaborMinutes: 0,
      taxable: false,
      adaFlag: false,
      active: true,
    } as CatalogItem,
  ];
  const draft = buildIntakeEstimateDraft({
    reviewLines,
    catalog: dummy,
    modifiers: [],
    intakeAutomation: { mode: 'preselect_only', tierAMinScore: 0.82 },
  })!;
  const byFingerprint: Record<string, { selectedCatalogItemId: string | null; applicationStatus: 'suggested' | 'accepted' | 'replaced' | 'ignored'; selectedBundleId: string | null }> = {};
  for (const s of draft.lineSuggestions) {
    byFingerprint[s.reviewLineFingerprint] = {
      selectedCatalogItemId: s.suggestedCatalogItemId,
      applicationStatus: s.pricingPreview?.laborFromInstallFamily ? 'accepted' : s.applicationStatus,
      selectedBundleId: null,
    };
  }
  const withLabor = computeDraftBasisSummary(draft, byFingerprint, null, { pricingMode: 'labor_and_material' });
  const materialOnly = computeDraftBasisSummary(draft, byFingerprint, null, { pricingMode: 'material_only' });
  assert.ok(withLabor.laborMinutesSubtotalPreview > 0, 'expected generated labor to roll into labor_and_material totals');
  assert.equal(materialOnly.laborMinutesSubtotalPreview, 0, 'material_only should suppress generated labor');
});
