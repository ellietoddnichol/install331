import test from 'node:test';
import assert from 'node:assert/strict';
import { isPlausibleIntakeLineDescription, looksLikePdfBinaryGarbageText } from './intakeTextGuards.ts';

test('looksLikePdfBinaryGarbageText detects Latin-1 PDF object dumps', () => {
  const garbage = '<< /Type /Pages /Kids [ 3 0 R 4 0 R ] /Count 2 >> %âãÏÓ';
  assert.equal(looksLikePdfBinaryGarbageText(garbage), true);
});

test('isPlausibleIntakeLineDescription accepts normal scope text', () => {
  assert.equal(isPlausibleIntakeLineDescription('HDPE locker 36in wide triple tier'), true);
  assert.equal(isPlausibleIntakeLineDescription('<< /Type /Page'), false);
});
