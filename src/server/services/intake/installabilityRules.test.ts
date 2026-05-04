import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateInstallability } from './installabilityRules.ts';

test('detects partition compartment from HDPE description', () => {
  const r = evaluateInstallability({
    description: 'Eclipse HDPE toilet partitions with Eclipse hardware',
    category: 'Toilet Partitions',
    sourceSectionHeader: 'Scranton - Toilet Partitions - Base Bid',
  });
  assert.equal(r.isInstallableScope, true);
  assert.equal(r.installScopeType, 'partition_compartment');
});

test('detects urinal screen', () => {
  const r = evaluateInstallability({
    description: '7 urinal screens, HDPE, floor mounted',
    category: 'Toilet Partitions',
  });
  assert.equal(r.installScopeType, 'urinal_screen');
  assert.equal(r.isInstallableScope, true);
});

test('extracts size for grab bars', () => {
  const r = evaluateInstallability({
    description: 'Grab bar 36"',
    category: 'Toilet Accessories',
  });
  assert.equal(r.installScopeType, 'grab_bar_36');
  assert.equal(r.isInstallableScope, true);
});

test('grab bar without size falls back to generic grab_bar', () => {
  const r = evaluateInstallability({ description: 'ADA grab bar', category: 'Toilet Accessories' });
  assert.equal(r.installScopeType, 'grab_bar');
});

test('sanitary napkin disposal detected', () => {
  const r = evaluateInstallability({
    description: 'Sanitary napkin disposal, SKU 4781-11',
    category: 'Toilet Accessories',
  });
  assert.equal(r.installScopeType, 'sanitary_napkin_disposal');
});

test('subtotal lines are not installable', () => {
  const r = evaluateInstallability({ description: 'Material Total: $40,855.00' });
  assert.equal(r.isInstallableScope, false);
});

test('bond / logistics notes are not installable', () => {
  const r1 = evaluateInstallability({ description: 'Performance Bond: Y/N' });
  const r2 = evaluateInstallability({ description: 'Customer to receive and unload' });
  assert.equal(r1.isInstallableScope, false);
  assert.equal(r2.isInstallableScope, false);
});

test('unknown text under toilet accessory section falls back to accessory_generic', () => {
  const r = evaluateInstallability({
    description: 'Custom branded wall piece',
    category: 'Toilet Accessories',
    sourceSectionHeader: 'Bradley - Toilet Accessories - Base Bid',
  });
  assert.equal(r.isInstallableScope, true);
  assert.equal(r.installScopeType, 'accessory_generic');
});
