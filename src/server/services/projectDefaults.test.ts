import assert from 'assert';
import { test } from 'node:test';
import {
  generateBidPackageNumber,
  inferDefaultClientName,
  inferDefaultLocationFromProjectTitle,
  isBlankOrPlaceholderBidNumber,
  titleStringForInference,
} from './projectDefaults.ts';

test('async preview matches sync generate (same as server autofill inputs)', async () => {
  const { generateBidPackageNumberPreview } = await import('../../shared/utils/bidPackageNumber.ts');
  const id = 'proj-1';
  const name = 'CWA - Example Project';
  const now = new Date('2026-01-02T00:00:00Z');
  const a = generateBidPackageNumber({ projectId: id, projectName: name, now });
  const b = await generateBidPackageNumberPreview({ projectId: id, projectName: name, now });
  assert.equal(a, b);
});

test('generateBidPackageNumber is stable for same inputs (same calendar year)', () => {
  const id = 'proj-1';
  const name = 'CWA - Example Project';
  const a = generateBidPackageNumber({ projectId: id, projectName: name, now: new Date('2026-01-02T00:00:00Z') });
  const b = generateBidPackageNumber({ projectId: id, projectName: name, now: new Date('2026-01-02T12:00:00Z') });
  assert.equal(a, b);
});

test('inferDefaultClientName returns CWA only on strong token match', () => {
  assert.deepEqual(inferDefaultClientName({ projectName: 'CWA - Lobby Renovation' }), { clientName: 'CWA', reason: 'CWA token' });
  assert.equal(inferDefaultClientName({ projectName: 'Central Warehouse Annex' })?.clientName ?? null, null);
});

test('inferDefaultLocationFromProjectTitle fills only on strong City, ST patterns', () => {
  assert.equal(inferDefaultLocationFromProjectTitle({ projectName: 'Bid - West Clinic - Kansas City, KS' })?.locationLabel ?? null, 'Kansas City, KS');
  assert.equal(inferDefaultLocationFromProjectTitle({ projectName: 'Project X - Austin, TX' })?.locationLabel ?? null, 'Austin, TX');
  assert.equal(inferDefaultLocationFromProjectTitle({ projectName: 'Project X (Denver, CO)' })?.locationLabel ?? null, 'Denver, CO');
  assert.equal(inferDefaultLocationFromProjectTitle({ projectName: 'Project X - Somewhere' }), null);
  assert.equal(inferDefaultLocationFromProjectTitle({ projectName: 'Central Warehouse Annex' }), null);
});

test('titleStringForInference strips controls and collapses whitespace', () => {
  assert.equal(titleStringForInference('  A\u0000 - B  '), 'A - B');
});

test('isBlankOrPlaceholderBidNumber treats 0, dashes, and tbd as empty for bid # autofill', () => {
  assert.equal(isBlankOrPlaceholderBidNumber(''), true);
  assert.equal(isBlankOrPlaceholderBidNumber('0'), true);
  assert.equal(isBlankOrPlaceholderBidNumber('TBD'), true);
  assert.equal(isBlankOrPlaceholderBidNumber('BP-2026-ABCDEF'), false);
  assert.equal(isBlankOrPlaceholderBidNumber('ACME-1234'), false);
});

