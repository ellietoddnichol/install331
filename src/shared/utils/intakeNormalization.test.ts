import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeIntakeUnit } from './intakeNormalization.ts';

test('normalizeIntakeUnit maps common OCR and spreadsheet aliases', () => {
  assert.equal(normalizeIntakeUnit('E.A.'), 'EA');
  assert.equal(normalizeIntakeUnit('each'), 'EA');
  assert.equal(normalizeIntakeUnit('SQ FT'), 'SF');
  assert.equal(normalizeIntakeUnit('sqft'), 'SF');
  assert.equal(normalizeIntakeUnit('L.F.'), 'LF');
  assert.equal(normalizeIntakeUnit('lnft'), 'LF');
  assert.equal(normalizeIntakeUnit('lump sum'), 'LS');
  assert.equal(normalizeIntakeUnit(null), null);
  assert.equal(normalizeIntakeUnit(''), null);
  assert.equal(normalizeIntakeUnit('ZZTOP'), null);
});
