import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { CatalogItem } from '../../types.ts';
import type { ModifierRecord } from '../../shared/types/estimator.ts';
import type { IntakeReviewLine } from '../../shared/types/intake.ts';

function baseReviewLine(over: Partial<IntakeReviewLine>): IntakeReviewLine {
  return {
    lineId: 'line-1',
    reviewLineFingerprint: 'fp1',
    reviewLineContentKey: 'ck1',
    roomName: 'Men',
    itemName: 'Towel bar',
    description: 'Towel bar stainless',
    category: 'Accessories',
    itemCode: '',
    quantity: 1,
    unit: 'EA',
    notes: '',
    sourceReference: 't',
    laborIncluded: null,
    materialIncluded: null,
    confidence: 0.9,
    completeness: 'complete',
    matchStatus: 'needs_match',
    matchedCatalogItemId: null,
    matchExplanation: '',
    catalogMatch: null,
    suggestedMatch: null,
    bundleMatch: null,
    suggestedBundle: null,
    warnings: [],
    ...over,
  };
}

const cat = (id: string, sku: string, description: string, manufacturer: string, category = 'Accessories'): CatalogItem => ({
  id,
  sku,
  category,
  description,
  manufacturer,
  uom: 'EA',
  baseMaterialCost: 10,
  baseLaborMinutes: 5,
  taxable: false,
  adaFlag: false,
  active: true,
});

test('buildIntakeEstimateDraft maps excluded_by_others from line text', async () => {
  const { buildIntakeEstimateDraft } = await import('./intakeMatcherService.ts');
  const catalogItems: CatalogItem[] = [cat('c1', 'TB-1', 'Towel bar', 'Acme')];
  const line = baseReviewLine({
    description: 'NIC mirror by others',
    notes: '',
    reviewLineFingerprint: 'abc',
  });
  const draft = await buildIntakeEstimateDraft({
    reviewLines: [line],
    catalog: catalogItems,
    modifiers: [],
    aiSuggestions: null,
  });
  assert.ok(draft);
  assert.equal(draft!.lineSuggestions[0].scopeBucket, 'excluded_by_others');
});

test('ignored review override persists for same fingerprint', async () => {
  const { buildIntakeEstimateDraft } = await import('./intakeMatcherService.ts');
  const { getEstimatorDb } = await import('../db/connection.ts');
  const db = getEstimatorDb();

  const fp = `fp-ignore-${crypto.randomUUID()}`;
  db.prepare(
    `INSERT OR REPLACE INTO intake_review_overrides_v1 (review_line_fingerprint, status, updated_at)
     VALUES (?, 'ignored', datetime('now'))`
  ).run(fp);

  const draft = await buildIntakeEstimateDraft({
    reviewLines: [
      {
        lineId: 'l1',
        reviewLineFingerprint: fp,
        roomName: 'General',
        itemName: 'Addendums: 1, 2',
        description: 'Addendums: 1, 2',
        category: '',
        itemCode: '',
        quantity: 1,
        unit: 'EA',
        notes: 'source: file.pdf page 1 chunk 2',
        sourceReference: 'file.pdf p1 chunk 2',
        laborIncluded: null,
        materialIncluded: null,
        confidence: 0.2,
        completeness: 'partial',
        matchStatus: 'needs_match',
        matchedCatalogItemId: null,
        matchExplanation: '',
        catalogMatch: null,
        suggestedMatch: null,
        bundleMatch: null,
        suggestedBundle: null,
        warnings: [],
        semanticTags: [],
      },
    ] as any,
    catalog: [{ id: 'c1', sku: 'X', description: 'Item', category: 'Cat', uom: 'EA', baseMaterialCost: 10, baseLaborMinutes: 10, taxable: true, adaFlag: false, active: true, tags: [] }] as any,
    modifiers: [],
  });
  assert.ok(draft);
  const row = draft!.lineSuggestions[0];
  assert.equal(row.applicationStatus, 'ignored');
});

test('ignored review override matches by content key when fingerprint changes', async () => {
  const { buildIntakeEstimateDraft } = await import('./intakeMatcherService.ts');
  const { getEstimatorDb } = await import('../db/connection.ts');
  const { computeReviewLineContentKey } = await import('../utils/reviewLineFingerprint.ts');
  const db = getEstimatorDb();
  const fpOld = `fp-old-${crypto.randomUUID()}`;
  const fpNew = `fp-new-${crypto.randomUUID()}`;
  const contentKey = computeReviewLineContentKey({
    roomName: 'nd',
    itemCode: 'hs - auto',
    itemName: 'hs - auto',
    description: 'Automatic Hand Sanitizer Dispenser',
  });
  db.prepare(
    `INSERT OR REPLACE INTO intake_review_overrides_v1 (review_line_fingerprint, status, updated_at, content_ignore_key)
     VALUES (?, 'ignored', datetime('now'), ?)`
  ).run(fpOld, contentKey);

  const line = baseReviewLine({
    lineId: 'l-hand',
    reviewLineFingerprint: fpNew,
    reviewLineContentKey: contentKey,
    roomName: 'nd',
    itemCode: 'HS - AUTO',
    itemName: 'HS - AUTO',
    description: 'Automatic Hand Sanitizer Dispenser',
    quantity: 4,
  });
  const draft = await buildIntakeEstimateDraft({
    reviewLines: [line],
    catalog: [{ id: 'c1', sku: 'X', description: 'Item', category: 'Cat', uom: 'EA', baseMaterialCost: 10, baseLaborMinutes: 10, taxable: true, adaFlag: false, active: true, tags: [] }] as any,
    modifiers: [],
  });
  assert.ok(draft);
  assert.equal(draft!.lineSuggestions[0].applicationStatus, 'ignored');
  assert.ok(draft!.lineSuggestions[0].matcherSignals.includes('review_override:ignored'));
});

test('admin lines (addenda / qty headers / source metadata) are informational_only and do not surface as review items', async () => {
  const { buildIntakeEstimateDraft } = await import('./intakeMatcherService.ts');
  const draft = await buildIntakeEstimateDraft({
    reviewLines: [
      {
        lineId: 'l1',
        reviewLineFingerprint: 'fp-a',
        roomName: 'General',
        itemName: 'Addendums: 1, 2',
        description: 'Addendums: 1, 2',
        category: '',
        itemCode: '',
        quantity: 1,
        unit: 'EA',
        notes: '',
        sourceReference: 'doc.pdf page 1 chunk 2',
        laborIncluded: null,
        materialIncluded: null,
        confidence: 0.2,
        completeness: 'partial',
        matchStatus: 'needs_match',
        matchedCatalogItemId: null,
        matchExplanation: '',
        catalogMatch: null,
        suggestedMatch: null,
        bundleMatch: null,
        suggestedBundle: null,
        warnings: [],
        semanticTags: [],
      },
      {
        lineId: 'l2',
        reviewLineFingerprint: 'fp-b',
        roomName: 'General',
        itemName: 'Quantity Material',
        description: 'Quantity’s Material',
        category: '',
        itemCode: '',
        quantity: 1,
        unit: 'EA',
        notes: '',
        sourceReference: 'doc.pdf sheet 1 row 1',
        laborIncluded: null,
        materialIncluded: null,
        confidence: 0.2,
        completeness: 'partial',
        matchStatus: 'needs_match',
        matchedCatalogItemId: null,
        matchExplanation: '',
        catalogMatch: null,
        suggestedMatch: null,
        bundleMatch: null,
        suggestedBundle: null,
        warnings: [],
        semanticTags: [],
      },
      {
        lineId: 'l3',
        reviewLineFingerprint: 'fp-c',
        roomName: 'General',
        itemName: '',
        description: 'Source: doc.pdf Page 2 Chunk 7',
        category: '',
        itemCode: '',
        quantity: 1,
        unit: 'EA',
        notes: '',
        sourceReference: 'doc.pdf page 2 chunk 7',
        laborIncluded: null,
        materialIncluded: null,
        confidence: 0.2,
        completeness: 'partial',
        matchStatus: 'needs_match',
        matchedCatalogItemId: null,
        matchExplanation: '',
        catalogMatch: null,
        suggestedMatch: null,
        bundleMatch: null,
        suggestedBundle: null,
        warnings: [],
        semanticTags: [],
      },
    ] as any,
    catalog: [{ id: 'c1', sku: 'X', description: 'Item', category: 'Cat', uom: 'EA', baseMaterialCost: 10, baseLaborMinutes: 10, taxable: true, adaFlag: false, active: true, tags: [] }] as any,
    modifiers: [],
  });
  assert.ok(draft);
  for (const row of draft!.lineSuggestions) {
    assert.equal(row.scopeBucket, 'informational_only');
    assert.equal(row.applicationStatus, 'ignored');
  }
});

test('1–2 character scope fragments (OCR/cell noise) are informational_only, not priced review', async () => {
  const { buildIntakeEstimateDraft } = await import('./intakeMatcherService.ts');
  const cat = { id: 'c1', sku: 'X', description: 'Item', category: 'Cat', uom: 'EA', baseMaterialCost: 10, baseLaborMinutes: 10, taxable: true, adaFlag: false, active: true, tags: [] } as any;
  const draft = await buildIntakeEstimateDraft({
    reviewLines: [
      {
        lineId: 'l-nd',
        reviewLineFingerprint: 'fp-nd',
        reviewLineContentKey: 'ck-nd',
        roomName: 'General',
        itemName: 'nd',
        description: 'nd',
        category: 'Misc',
        itemCode: '',
        quantity: 1,
        unit: 'EA',
        notes: '',
        sourceReference: 'doc.pdf',
        laborIncluded: null,
        materialIncluded: null,
        confidence: 0.4,
        completeness: 'complete',
        matchStatus: 'suggested',
        matchedCatalogItemId: null,
        matchExplanation: '',
        catalogMatch: null,
        suggestedMatch: {
          catalogItemId: 'c-flag',
          sku: 'FLAG-EXT-20',
          description: '20ft flagpole',
          category: 'Misc',
          unit: 'EA',
          materialCost: 1,
          laborMinutes: 1,
          score: 0.4,
          confidence: 'possible' as const,
          reason: 'name similarity',
        },
        bundleMatch: null,
        suggestedBundle: null,
        warnings: [],
        semanticTags: [],
      },
    ] as any,
    catalog: [cat],
    modifiers: [],
  });
  assert.ok(draft);
  const row = draft!.lineSuggestions[0];
  assert.equal(row.scopeBucket, 'informational_only');
  assert.equal(row.applicationStatus, 'ignored');
});

test('buildIntakeEstimateDraft applies manufacturer consistency to ranking', async () => {
  const { buildIntakeEstimateDraft } = await import('./intakeMatcherService.ts');
  const catalogItems: CatalogItem[] = [
    cat('acme-towel', 'T1', 'Towel bar deluxe stainless wall mount', 'Acme Hardware'),
    cat('other-towel', 'T2', 'Towel bar stainless wall', 'Other Brand'),
  ];
  const strongAcme = {
    catalogItemId: 'acme-towel',
    sku: 'T1',
    description: 'Towel bar deluxe stainless wall mount',
    category: 'Accessories',
    unit: 'EA',
    materialCost: 10,
    laborMinutes: 5,
    score: 0.95,
    confidence: 'strong' as const,
    reason: 'match',
  };
  const lineA = baseReviewLine({
    lineId: 'a',
    reviewLineFingerprint: 'fa',
    roomName: 'Rest 1',
    catalogMatch: strongAcme,
    suggestedMatch: null,
    matchStatus: 'matched',
    matchedCatalogItemId: 'acme-towel',
  });
  const lineB = baseReviewLine({
    lineId: 'b',
    reviewLineFingerprint: 'fb',
    roomName: 'Rest 1',
    catalogMatch: { ...strongAcme, catalogItemId: 'acme-towel' },
    matchStatus: 'matched',
    matchedCatalogItemId: 'acme-towel',
  });
  const lineC = baseReviewLine({
    lineId: 'c',
    reviewLineFingerprint: 'fc',
    roomName: 'Rest 1',
    description: 'Towel bar stainless wall',
    itemName: 'Towel bar',
    catalogMatch: null,
    suggestedMatch: null,
    matchStatus: 'needs_match',
  });

  const draft = await buildIntakeEstimateDraft({
    reviewLines: [lineA, lineB, lineC],
    catalog: catalogItems,
    modifiers: [],
    aiSuggestions: null,
  });
  assert.ok(draft);
  const top = draft!.lineSuggestions[2].topCatalogCandidates[0];
  assert.equal(top.catalogItemId, 'acme-towel');
  assert.ok(draft!.lineSuggestions[2].matcherSignals.includes('cross_line_top_candidate'));
});

test('modifier phrase maps to suggestedProjectModifierIds', async () => {
  const { buildIntakeEstimateDraft } = await import('./intakeMatcherService.ts');
  const modifiers: ModifierRecord[] = [
    {
      id: 'mod-night',
      name: 'Night work',
      modifierKey: 'night_work',
      description: 'Work performed outside standard daytime hours; often carries labor premiums or productivity impacts.',
      appliesToCategories: [],
      addLaborMinutes: 0,
      addMaterialCost: 0,
      percentLabor: 0,
      percentMaterial: 0,
      active: true,
      updatedAt: '',
    },
  ];
  const draft = await buildIntakeEstimateDraft({
    reviewLines: [baseReviewLine({})],
    catalog: [cat('c1', 'X', 'Thing', 'M')],
    modifiers,
    aiSuggestions: {
      documentType: 'bid',
      pricingModeSuggested: '',
      documentConfidence: 0,
      documentRationale: '',
      documentEvidence: '',
      suggestedProjectModifierHints: [{ phrase: 'Allow for night work on site', confidence: 0.8, rationale: '', evidenceText: '' }],
      requiresGrounding: [],
      lineClassifications: [],
    },
  });
  assert.ok(draft);
  assert.ok(draft!.projectSuggestion.suggestedProjectModifierIds.includes('mod-night'));
});

test('alias-driven canonical resolution + explicit attribute inference (strict)', async () => {
  const { getEstimatorDb } = await import('../db/connection.ts');
  const { buildIntakeEstimateDraft } = await import('./intakeMatcherService.ts');
  const db = getEstimatorDb();
  const itemId = `test-c-${crypto.randomUUID()}`;
  const aliasId = `test-al-${crypto.randomUUID()}`;
  const attrId = `test-at-${crypto.randomUUID()}`;
  const aliasToken = `B-${crypto.randomUUID().slice(0, 8)}-1234`;

  // Seed catalog item + alias + attribute.
  db.prepare(
    `INSERT INTO catalog_items (id, sku, category, description, manufacturer, uom, base_material_cost, base_labor_minutes, taxable, ada_flag, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(itemId, 'GB-36-SS', 'Grab Bars', 'Grab Bar 36" SS', 'Acme', 'EA', 55, 18, 0, 0, 1);

  db.prepare(
    `INSERT INTO catalog_item_aliases (id, catalog_item_id, alias_type, alias_value)
     VALUES (?, ?, ?, ?)`
  ).run(aliasId, itemId, 'legacy_sku', aliasToken);

  db.prepare(
    `INSERT INTO catalog_item_attributes (id, catalog_item_id, attribute_type, attribute_value, material_delta_type, material_delta_value, labor_delta_type, labor_delta_value, active, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
  ).run(attrId, itemId, 'finish', 'MATTE_BLACK', 'none', 0, 'none', 0, 1, 1);

  const catalogItems: CatalogItem[] = [
    {
      id: itemId,
      sku: 'GB-36-SS',
      category: 'Grab Bars',
      description: 'Grab Bar 36" SS',
      manufacturer: 'Acme',
      uom: 'EA',
      baseMaterialCost: 55,
      baseLaborMinutes: 18,
      taxable: false,
      adaFlag: false,
      active: true,
    },
  ];

  const line = baseReviewLine({
    lineId: 'a1',
    reviewLineFingerprint: 'fp-a1',
    itemCode: aliasToken,
    description: `Matte black grab bar ${aliasToken}`,
    itemName: 'Grab bar',
    category: 'Grab Bars',
  });

  const draft = await buildIntakeEstimateDraft({
    reviewLines: [line],
    catalog: catalogItems,
    modifiers: [],
    aiSuggestions: null,
  });
  assert.ok(draft);

  const sug = draft!.lineSuggestions[0];
  assert.equal(sug.suggestedCatalogItemId, itemId);
  assert.ok(sug.topCatalogCandidates[0]?.reason?.includes('Alias match'));
  assert.ok(sug.matcherSignals.some((s) => s.startsWith('alias_match:')));
  assert.ok(sug.inferredCatalogAttributeSnapshot);
  assert.equal(sug.inferredCatalogAttributeSnapshot?.[0]?.attributeType, 'finish');
  assert.equal(sug.inferredCatalogAttributeSnapshot?.[0]?.attributeValue, 'MATTE_BLACK');

  // Strictness: if the attribute doesn't exist on the item, it must not be invented.
  const line2 = baseReviewLine({
    lineId: 'a2',
    reviewLineFingerprint: 'fp-a2',
    itemCode: aliasToken,
    description: `Antimicrobial grab bar ${aliasToken}`,
    itemName: 'Grab bar',
    category: 'Grab Bars',
  });
  const draft2 = await buildIntakeEstimateDraft({
    reviewLines: [line2],
    catalog: catalogItems,
    modifiers: [],
    aiSuggestions: null,
  });
  assert.ok(draft2);
  assert.equal(draft2!.lineSuggestions[0].suggestedCatalogItemId, itemId);
  assert.equal(draft2!.lineSuggestions[0].inferredCatalogAttributeSnapshot, null);
});
