import test from 'node:test';
import assert from 'node:assert/strict';
import type { CatalogItem } from '../../types.ts';
import type { ModifierRecord } from '../../shared/types/estimator.ts';
import type { IntakeReviewLine } from '../../shared/types/intake.ts';
import { buildIntakeEstimateDraft } from './intakeMatcherService.ts';

function baseReviewLine(over: Partial<IntakeReviewLine>): IntakeReviewLine {
  return {
    lineId: 'line-1',
    reviewLineFingerprint: 'fp1',
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

test('buildIntakeEstimateDraft maps excluded_by_others from line text', () => {
  const catalogItems: CatalogItem[] = [cat('c1', 'TB-1', 'Towel bar', 'Acme')];
  const line = baseReviewLine({
    description: 'NIC mirror by others',
    notes: '',
    reviewLineFingerprint: 'abc',
  });
  const draft = buildIntakeEstimateDraft({
    reviewLines: [line],
    catalog: catalogItems,
    modifiers: [],
    aiSuggestions: null,
  });
  assert.ok(draft);
  assert.equal(draft!.lineSuggestions[0].scopeBucket, 'excluded_by_others');
});

test('buildIntakeEstimateDraft applies manufacturer consistency to ranking', () => {
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

  const draft = buildIntakeEstimateDraft({
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

test('modifier phrase maps to suggestedProjectModifierIds', () => {
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
  const draft = buildIntakeEstimateDraft({
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
