import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveIntakePersistFieldsForTakeoffLine } from './intakeEstimateReview.ts';
import type { IntakeEstimateDraft, IntakeLineEstimateSuggestion } from '../types/intake.ts';

function suggestion(over: Partial<IntakeLineEstimateSuggestion>): IntakeLineEstimateSuggestion {
  return {
    reviewLineFingerprint: 'fp1',
    reviewLineContentKey: 'ck1',
    lineId: 'l1',
    scopeBucket: 'priced_base_scope',
    applicationStatus: 'suggested',
    topCatalogCandidates: [],
    suggestedCatalogItemId: 'c1',
    suggestedLineModifierIds: [],
    suggestedProjectModifierIds: [],
    matcherSignals: [],
    marketingNotes: [],
    pricingPreview: null,
    laborOrigin: null,
    ...over,
  };
}

test('resolveIntakePersistFieldsForTakeoffLine sets minutes when laborOrigin is install_family', () => {
  const draft: IntakeEstimateDraft = {
    version: 1,
    readonly: true,
    generatedAt: new Date().toISOString(),
    lineSuggestions: [
      suggestion({
        pricingPreview: {
          materialEach: 0,
          laborMinutesEach: 42,
          qty: 1,
          laborFromInstallFamily: false,
          installFamilyKey: 'partition_compartment',
          materialOrigin: null,
        },
        laborOrigin: 'install_family',
      }),
    ],
    projectSuggestion: { applicationStatus: 'suggested', suggestedProjectModifierIds: [], marketingNotes: [] },
  };
  const out = resolveIntakePersistFieldsForTakeoffLine({
    draft,
    fingerprint: 'fp1',
    lineByFingerprint: {},
    catalogItemId: 'c1',
  });
  assert.equal(out.generatedLaborMinutes, 42);
  assert.equal(out.installLaborFamily, 'partition_compartment');
  assert.equal(out.laborOrigin, 'install_family');
});

test('resolveIntakePersistFieldsForTakeoffLine uses installFamilyKey from pricing preview for catalog labor path', () => {
  const draft: IntakeEstimateDraft = {
    version: 1,
    readonly: true,
    generatedAt: new Date().toISOString(),
    lineSuggestions: [
      suggestion({
        pricingPreview: {
          materialEach: 10,
          laborMinutesEach: 15,
          qty: 2,
          laborFromInstallFamily: false,
          installFamilyKey: 'grab_bar_36',
          materialOrigin: 'catalog',
        },
        laborOrigin: 'catalog',
      }),
    ],
    projectSuggestion: { applicationStatus: 'suggested', suggestedProjectModifierIds: [], marketingNotes: [] },
  };
  const out = resolveIntakePersistFieldsForTakeoffLine({
    draft,
    fingerprint: 'fp1',
    lineByFingerprint: {},
    catalogItemId: 'c1',
  });
  assert.equal(out.generatedLaborMinutes, null);
  assert.equal(out.installLaborFamily, 'grab_bar_36');
});
