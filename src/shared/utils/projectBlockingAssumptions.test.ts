import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProjectAssumptionsForInstall,
  normalizeBlockingStatusForInstall,
  readBlockingStatusFromStructuredAssumptions,
} from './projectBlockingAssumptions.ts';

test('normalizeBlockingStatusForInstall handles labels and casing', () => {
  assert.equal(normalizeBlockingStatusForInstall('Included'), 'included');
  assert.equal(normalizeBlockingStatusForInstall('Blocking / backing included'), 'included');
  assert.equal(normalizeBlockingStatusForInstall('By Others'), 'by_others');
  assert.equal(normalizeBlockingStatusForInstall('blocking by others'), 'by_others');
  assert.equal(normalizeBlockingStatusForInstall('UNKNOWN'), 'unknown');
  assert.equal(normalizeBlockingStatusForInstall(''), undefined);
});

test('readBlockingStatusFromStructuredAssumptions is defensive', () => {
  assert.equal(readBlockingStatusFromStructuredAssumptions(undefined), undefined);
  assert.equal(readBlockingStatusFromStructuredAssumptions(null), undefined);
  assert.equal(readBlockingStatusFromStructuredAssumptions([]), undefined);
  assert.equal(
    readBlockingStatusFromStructuredAssumptions([
      {
        id: '1',
        source: 'manual',
        ruleId: 'blocking_status',
        text: 'Blocking / backing included',
        confidence: 1,
        createdAt: new Date().toISOString(),
      },
    ]),
    'included',
  );
});

test('buildProjectAssumptionsForInstall includes blocking_status and wallSubstrate', () => {
  const assumptions = buildProjectAssumptionsForInstall({
    wallSubstrate: 'Tile walls',
    structuredAssumptions: [
      {
        id: '1',
        source: 'manual',
        ruleId: 'blocking_status',
        text: 'Blocking by others',
        confidence: 1,
        createdAt: new Date().toISOString(),
      },
    ],
  });
  assert.equal(assumptions.wallSubstrate, 'tile');
  assert.equal(assumptions.blocking_status, 'by_others');
});
