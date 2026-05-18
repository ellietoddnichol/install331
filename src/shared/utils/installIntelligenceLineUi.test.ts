import test from 'node:test';
import assert from 'node:assert/strict';
import type { TakeoffLineRecord } from '../types/estimator';
import {
  deriveInstallAssumptionGateUi,
  parseInstallIntelligenceNotes,
  shortMissingInstallPrompt,
} from './installIntelligenceLineUi.ts';
import { deriveEstimateLaborBasisUi } from './estimateCockpitDerived.ts';
import { formatClientProposalItemDisplay } from './proposalDocument.ts';

function line(partial: Partial<TakeoffLineRecord>): TakeoffLineRecord {
  return {
    projectId: 'p',
    roomId: 'r',
    id: partial.id || 'line-1',
    sourceType: partial.sourceType || 'vendor_quote',
    sourceRef: null,
    description: partial.description || 'Bobrick 36 inch grab bar',
    sku: null,
    category: null,
    subcategory: null,
    baseType: null,
    qty: 1,
    unit: 'EA',
    materialCost: 42,
    baseMaterialCost: 42,
    laborMinutes: partial.laborMinutes ?? 0,
    laborCost: 0,
    baseLaborCost: 0,
    pricingSource: 'auto',
    unitSell: 42,
    lineTotal: 42,
    notes: partial.notes ?? null,
    bundleId: null,
    catalogItemId: null,
    variantId: null,
    installLaborFamily: partial.installLaborFamily ?? 'grab_bar_install',
    isInstallableScope: true,
    createdAt: '',
    updatedAt: '',
    ...partial,
  } as TakeoffLineRecord;
}

const gatedGrabBarNotes =
  'Source row type: material | Install review: blocking_unknown | Install questions: Is backing/blocking in place for this grab bar location? | Needs Review';

test('gated grab bar line shows install assumption gate UI', () => {
  const grab = line({
    notes: gatedGrabBarNotes,
    laborMinutes: 0,
    generatedLaborMinutes: null,
  });
  const gate = deriveInstallAssumptionGateUi(grab, 'labor_and_material');
  assert.equal(gate.isGated, true);
  assert.equal(gate.badgeLabel, 'Needs Review');
  assert.match(gate.blockedLaborHeadline, /blocked until install assumptions/i);
  assert.equal(gate.topMissingPrompt, 'Confirm blocking status');

  const laborUi = deriveEstimateLaborBasisUi(grab, 'labor_and_material');
  assert.equal(laborUi.kind, 'gated');
  assert.match(laborUi.label, /assumptions/i);
});

test('resolved material line does not show install gate messaging', () => {
  const resolved = line({
    description: 'Mirror 24 x 36',
    laborMinutes: 25,
    laborOrigin: 'catalog',
    notes: 'Source row type: material | Labor baseline from catalog match.',
  });
  const gate = deriveInstallAssumptionGateUi(resolved, 'labor_and_material');
  assert.equal(gate.isGated, false);
  assert.equal(deriveEstimateLaborBasisUi(resolved, 'labor_and_material').kind, 'matched');
});

test('freight row is vendor-suppressed, not install-gated', () => {
  const freight = line({
    description: 'Freight',
    notes: 'Source row type: freight',
    sourceLineType: 'add_in',
    laborMinutes: 0,
    isInstallableScope: false,
  });
  const gate = deriveInstallAssumptionGateUi(freight, 'labor_and_material');
  assert.equal(gate.isGated, false);
  assert.equal(gate.isVendorLaborSuppressed, true);
  assert.equal(deriveEstimateLaborBasisUi(freight, 'labor_and_material').kind, 'suppressed');
});

test('internal review text does not appear in client proposal item display', () => {
  const grab = line({ notes: gatedGrabBarNotes });
  const display = formatClientProposalItemDisplay(grab.description, grab.sku);
  const displayText = `${display.title} ${display.subtitle || ''}`.toLowerCase();
  assert.ok(!displayText.includes('blocking_unknown'));
  assert.ok(!displayText.includes('install review'));
  const parsed = parseInstallIntelligenceNotes(grab.notes);
  assert.ok(parsed.reviewFlags.includes('blocking_unknown'));
  assert.equal(parsed.customerProposalClauses.length, 0);
});

test('shortMissingInstallPrompt maps blocking and substrate', () => {
  assert.equal(
    shortMissingInstallPrompt('Is backing/blocking in place for this grab bar location?'),
    'Confirm blocking status',
  );
  assert.equal(shortMissingInstallPrompt('Wall substrate at install location?'), 'Confirm wall substrate');
});
