import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCatalogCanonicalKey,
  mapCategoryMain,
  normalizeSku,
  normalizeUnit,
} from './catalogNormalization.ts';

test('normalizeSku strips punctuation and lowercases', () => {
  assert.equal(normalizeSku('  AB-12/34 '), 'ab1234');
});

test('normalizeUnit maps common aliases', () => {
  assert.equal(normalizeUnit('ea'), 'EA');
  assert.equal(normalizeUnit('sq ft'), 'SF');
  assert.equal(normalizeUnit('LINEAR FT'), 'LF');
});

test('mapCategoryMain buckets washroom lines', () => {
  assert.equal(mapCategoryMain('Washroom accessories — towel bar'), 'Toilet Accessories');
});

test('buildCatalogCanonicalKey combines mfr and sku', () => {
  const k = buildCatalogCanonicalKey({
    manufacturerNormalized: 'bobrick',
    skuNormalized: 'b6806',
    description: 'x',
  });
  assert.match(k, /bobrick/);
  assert.match(k, /b6806/);
});
