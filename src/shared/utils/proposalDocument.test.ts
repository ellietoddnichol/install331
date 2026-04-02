import assert from 'node:assert/strict';
import test from 'node:test';
import { formatClientProposalItemDisplay } from './proposalDocument.ts';

test('formatClientProposalItemDisplay: extinguisher with model, weight, and class', () => {
  const out = formatClientProposalItemDisplay('FE05C Cosmic 5lb Extinguisher 3A-40BC', 'FE05C');
  assert.equal(out.title, 'Cosmic Fire Extinguisher');
  assert.ok(out.subtitle?.includes('FE05C'));
  assert.ok(out.subtitle?.includes('5 lb'));
  assert.ok(out.subtitle?.toUpperCase().includes('3A-40BC'));
});

test('formatClientProposalItemDisplay: hyphenated leading model', () => {
  const out = formatClientProposalItemDisplay('GB-36 Grab Bar 36 inch stainless', 'GB-36');
  assert.equal(out.title, 'Grab Bar 36 Inch Stainless');
  assert.match(out.subtitle || '', /GB-36/i);
});

test('formatClientProposalItemDisplay: plain description unchanged except title case', () => {
  const out = formatClientProposalItemDisplay('paper towel dispenser surface mount', null);
  assert.equal(out.title, 'Paper Towel Dispenser Surface Mount');
  assert.equal(out.subtitle, null);
});
