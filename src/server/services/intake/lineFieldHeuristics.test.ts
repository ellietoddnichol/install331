import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compactDescription,
  extractManufacturerModelFinish,
  inferUnitFromDescription,
  parseLineLeadingQtyUnit,
} from './lineFieldHeuristics.ts';

test('parseLineLeadingQtyUnit: N UOM description', () => {
  const r = parseLineLeadingQtyUnit('2 EA Sign type A');
  assert.equal(r.quantity, 2);
  assert.equal(r.unit, 'EA');
  assert.equal(r.description, 'Sign type A');
});

test('parseLineLeadingQtyUnit: parenthetical full line', () => {
  const r = parseLineLeadingQtyUnit('(2 Grab Bar 36 inch)');
  assert.equal(r.quantity, 2);
  assert.equal(r.unit, null);
  assert.ok(r.description.includes('Grab Bar'));
});

test('parseLineLeadingQtyUnit: year-like line is not a quantity', () => {
  const r = parseLineLeadingQtyUnit('2024 building renovation scope');
  assert.equal(r.quantity, null);
  assert.ok(r.description.includes('2024'));
});

test('parseLineLeadingQtyUnit: LF-led line', () => {
  const r = parseLineLeadingQtyUnit('12 LF corner guard vinyl');
  assert.equal(r.quantity, 12);
  assert.equal(r.unit, 'LF');
  assert.ok(r.description.includes('corner guard'));
});

test('inferUnitFromDescription: per LF', () => {
  assert.equal(inferUnitFromDescription('Vinyl base priced per LF'), 'LF');
});

test('extractManufacturerModelFinish: labeled mfr and model', () => {
  const r = extractManufacturerModelFinish('Widget mfg: Acme model: X-100 finish: SS');
  assert.equal(r.manufacturer, 'Acme');
  assert.ok((r.model || '').includes('X-100'));
});

test('extractManufacturerModelFinish: Bobrick token', () => {
  const r = extractManufacturerModelFinish('Bobrick B-290 mirror 18x36');
  assert.equal(r.manufacturer, 'Bobrick');
  assert.equal(r.model, 'B-290');
});

test('compactDescription collapses spaces', () => {
  assert.equal(compactDescription('  foo   bar  '), 'foo bar');
});
