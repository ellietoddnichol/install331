import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeIntakeLineSemantics,
  looksLikeModifierLine,
  shouldTreatAsStandaloneModifier,
} from './intakeSemantics.ts';

test('field assembly on lockers stays an item with field_assembly tag', () => {
  const sem = analyzeIntakeLineSemantics('Metal lockers need to be assembled on site');
  assert.equal(sem.kind, 'item');
  assert.equal(sem.semanticTags.includes('field_assembly'), true);
  assert.equal(shouldTreatAsStandaloneModifier('Metal lockers need to be assembled on site'), false);
  assert.equal(looksLikeModifierLine('Metal lockers need to be assembled on site'), false);
});

test('KD / RTA cues tag field_assembly', () => {
  const sem = analyzeIntakeLineSemantics('12 EA steel lockers KD');
  assert.equal(sem.kind, 'item');
  assert.equal(sem.semanticTags.includes('field_assembly'), true);
});

test('standalone powder coat add is a modifier', () => {
  const sem = analyzeIntakeLineSemantics('Powder coat finish add');
  assert.equal(sem.kind, 'modifier');
  assert.equal(shouldTreatAsStandaloneModifier('Powder coat finish add'), true);
  assert.equal(looksLikeModifierLine('Powder coat finish add'), true);
});

test('Add ... scope lines starting with add/deduct are modifiers even with product words', () => {
  const sem = analyzeIntakeLineSemantics('Add stainless upgrade for all toilet accessories');
  assert.equal(sem.kind, 'modifier');
});

test('bundle cue returns bundle kind', () => {
  const sem = analyzeIntakeLineSemantics('Restroom accessory package per ADA toilet room');
  assert.equal(sem.kind, 'bundle');
});
