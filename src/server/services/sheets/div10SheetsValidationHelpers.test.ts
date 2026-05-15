import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectMissingHeadersFromFirstRow,
  findMissingTabs,
  maskSpreadsheetId,
} from './div10SheetsValidationHelpers.ts';

test('maskSpreadsheetId shows only last six characters', () => {
  assert.equal(maskSpreadsheetId(''), '(unset)');
  assert.equal(maskSpreadsheetId('   '), '(unset)');
  const id = '1a2b3c4d5e6f7g8h9';
  const m = maskSpreadsheetId(id);
  assert.ok(m.startsWith('********'));
  assert.equal(m.slice(-6), id.slice(-6));
  assert.ok(!m.includes(id.slice(0, -6)));
});

test('findMissingTabs lists only absent tab titles', () => {
  assert.deepEqual(findMissingTabs(['A', 'B'], ['A', 'C']), ['B']);
  assert.deepEqual(findMissingTabs(['Projects'], ['Projects']), []);
});

test('collectMissingHeadersFromFirstRow detects absent columns', () => {
  const row = ['ProjectID', 'ProjectName', 'Extra'];
  const missing = collectMissingHeadersFromFirstRow(row, ['ProjectID', 'Status', 'Zip']);
  assert.deepEqual(missing, ['Status', 'Zip']);
});

test('collectMissingHeadersFromFirstRow treats empty row as all missing', () => {
  assert.deepEqual(
    collectMissingHeadersFromFirstRow(['', '  '], ['A', 'B']),
    ['A', 'B']
  );
});
