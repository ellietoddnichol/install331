import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseLineInstallAssumptionsFromNotes,
  stripInstallIntelligenceMarkersFromNotes,
  upsertLineInstallAssumptionsInNotes,
} from './lineInstallAssumptions.ts';

test('line install assumptions round-trip in notes', () => {
  const base = 'Source row type: material | Install questions: blocking?';
  const next = upsertLineInstallAssumptionsInNotes(base, {
    blocking_status: 'included',
    wall_substrate: 'tile',
  });
  assert.match(next, /Install assumptions: blocking_status=included/);
  const parsed = parseLineInstallAssumptionsFromNotes(next);
  assert.equal(parsed.blocking_status, 'included');
  assert.equal(parsed.wall_substrate, 'tile');
});

test('stripInstallIntelligenceMarkersFromNotes removes review markers', () => {
  const stripped = stripInstallIntelligenceMarkersFromNotes(
    'Source row type: material | Install review: blocking_unknown | Needs Review | User note',
  );
  assert.match(stripped, /User note/);
  assert.doesNotMatch(stripped, /blocking_unknown/);
  assert.doesNotMatch(stripped, /Needs Review/);
});
