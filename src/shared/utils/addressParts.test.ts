import test from 'node:test';
import assert from 'node:assert/strict';
import { composeAddress, parseAddressParts } from './addressParts.ts';

test('parseAddressParts: full US line with state and zip', () => {
  const p = parseAddressParts('123 Main St, Kansas City, MO 64108');
  assert.equal(p.address1, '123 Main St');
  assert.equal(p.city, 'Kansas City');
  assert.equal(p.state, 'MO');
  assert.equal(p.zip, '64108');
});

test('parseAddressParts: two segments without state zip uses second as city', () => {
  const p = parseAddressParts('123 Main St, Springfield');
  assert.equal(p.address1, '123 Main St');
  assert.equal(p.city, 'Springfield');
  assert.equal(p.state, '');
  assert.equal(p.zip, '');
});

test('parseAddressParts: strips trailing USA from autocomplete', () => {
  const p = parseAddressParts('123 Main St, Kansas City, MO 64108, USA');
  assert.equal(p.city, 'Kansas City');
  assert.equal(p.state, 'MO');
  assert.equal(p.zip, '64108');
});

test('composeAddress round-trip after editing city', () => {
  const initial = parseAddressParts('123 Main St, Kansas City, MO 64108');
  const edited = { ...initial, city: 'Springfield' };
  assert.equal(composeAddress(edited), '123 Main St, Springfield, MO 64108');
  const reparsed = parseAddressParts(composeAddress(edited));
  assert.equal(reparsed.city, 'Springfield');
});
