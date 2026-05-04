import assert from 'node:assert';
import { test } from 'node:test';
import { mergeNlpHintsIntoPartialMetadata } from './naturalLanguageService.ts';

test('mergeNlpHintsIntoPartialMetadata fills only empty fields', () => {
  const merged = mergeNlpHintsIntoPartialMetadata(
    { client: 'ACME', generalContractor: '', address: '' },
    { generalContractor: 'BuildCo', address: '100 Main St' }
  );
  assert.strictEqual(merged.client, 'ACME');
  assert.strictEqual(merged.generalContractor, 'BuildCo');
  assert.strictEqual(merged.address, '100 Main St');
});

test('mergeNlpHintsIntoPartialMetadata leaves existing client', () => {
  const merged = mergeNlpHintsIntoPartialMetadata(
    { client: 'Keep Me', generalContractor: '', address: '' },
    { client: 'Other', generalContractor: 'GC' }
  );
  assert.strictEqual(merged.client, 'Keep Me');
  assert.strictEqual(merged.generalContractor, 'GC');
});

test('mergeNlpHintsIntoPartialMetadata no-ops when hints empty', () => {
  const base = { client: 'X', address: 'Y' };
  const merged = mergeNlpHintsIntoPartialMetadata(base, {});
  assert.deepStrictEqual(merged, base);
});
