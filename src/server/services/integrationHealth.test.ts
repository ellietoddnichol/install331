import test from 'node:test';
import assert from 'node:assert/strict';
import { getIntegrationHealthSnapshot } from './integrationHealth.ts';

test('getIntegrationHealthSnapshot returns stable keys', () => {
  const snap = getIntegrationHealthSnapshot();
  assert.equal(typeof snap.dbDriver, 'string');
  assert.equal(typeof snap.databaseUrl, 'boolean');
  assert.equal(typeof snap.catalogBackend, 'string');
  assert.equal(typeof snap.catalogAutoSyncOnStart, 'boolean');
  assert.equal(typeof snap.googleSheetsSpreadsheetId, 'boolean');
  assert.equal(typeof snap.gemini, 'boolean');
  assert.equal(typeof snap.googleSheets, 'boolean');
  assert.equal(typeof snap.publicSupabaseClient, 'boolean');
  assert.equal(typeof snap.supabaseStorageBucket, 'boolean');
  assert.equal(typeof snap.pdfProvider, 'string');
  assert.equal(typeof snap.defaultLaborRatePerHour, 'number');
  assert.equal(typeof snap.div10BrainAdmin, 'boolean');
});
