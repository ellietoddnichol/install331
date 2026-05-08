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
});
