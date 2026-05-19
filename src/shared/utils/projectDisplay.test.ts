import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deleteConfirmationPhrase,
  isPlaceholderProjectName,
  projectDisplayTitle,
  proposalModeChipLabel,
} from './projectDisplay.ts';

test('projectDisplayTitle maps untitled to New project draft', () => {
  assert.equal(projectDisplayTitle('Untitled Project'), 'New project draft');
  assert.equal(projectDisplayTitle(''), 'New project draft');
  assert.equal(projectDisplayTitle('Memorial Hospital'), 'Memorial Hospital');
});

test('isPlaceholderProjectName', () => {
  assert.equal(isPlaceholderProjectName('untitled project'), true);
  assert.equal(isPlaceholderProjectName('Real Job'), false);
});

test('deleteConfirmationPhrase', () => {
  assert.equal(deleteConfirmationPhrase('Memorial Hospital'), 'Memorial Hospital');
  assert.equal(deleteConfirmationPhrase('Untitled Project'), 'DELETE');
});

test('proposalModeChipLabel', () => {
  assert.equal(proposalModeChipLabel('labor_only'), 'Install only');
  assert.equal(proposalModeChipLabel('material_only'), 'Material only');
  assert.equal(proposalModeChipLabel('labor_and_material'), 'Full');
});
