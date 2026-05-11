import test from 'node:test';
import assert from 'node:assert/strict';
import { getIntegrationHealthSnapshot } from './integrationHealth.ts';

test('getIntegrationHealthSnapshot returns stable keys', () => {
  const snap = getIntegrationHealthSnapshot();
  assert.equal(typeof snap.dbDriver, 'string');
  assert.equal(typeof snap.gemini, 'boolean');
  assert.equal(typeof snap.googleSheets, 'boolean');
  assert.equal(typeof snap.catalogSheetsSyncEnabled, 'boolean');
  assert.equal(typeof snap.pdfProvider, 'string');
  assert.equal(typeof snap.div10BrainAdmin, 'boolean');
  assert.equal(typeof snap.workspaceTakeoffLinesTable, 'string');
  assert.equal(typeof snap.catalogAliasesReadTable, 'string');
  assert.equal(typeof snap.catalogAliasesWriteTable, 'string');
  assert.ok(snap.catalogAliasesLayout === 'sheet' || snap.catalogAliasesLayout === 'brain');
  assert.equal(typeof snap.catalogBundlesReadTable, 'string');
  assert.equal(typeof snap.catalogBundleItemsReadTable, 'string');
});
