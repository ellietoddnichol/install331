import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseExcelUpload } from './excelParser.ts';
import { normalizeSpreadsheetRows } from './normalizer.ts';
import { validateNormalizedItems } from './validator.ts';
import { toReviewLines } from '../matchPreparationService.ts';
import type { CatalogItem } from '../../../types.ts';
import type { BundleRecord } from '../../../shared/types/estimator.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, 'fixtures');

function readFixtureBase64(name: string): string {
  return fs.readFileSync(path.join(fixturesDir, name)).toString('base64');
}

const emptyCatalog: CatalogItem[] = [];

const mockBundles: BundleRecord[] = [
  {
    id: 'fixture-bundle-restroom',
    bundleName: "Men's Restroom Accessory Bundle",
    category: 'Toilet Accessories',
    active: true,
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'fixture-bundle-locker',
    bundleName: 'Locker Room Starter',
    category: 'Lockers',
    active: true,
    updatedAt: new Date().toISOString(),
  },
];

async function parseFixtureCsv(fileName: string) {
  const dataBase64 = readFixtureBase64(fileName);
  const excel = parseExcelUpload({
    fileName,
    mimeType: 'text/csv',
    dataBase64,
  });
  const items = normalizeSpreadsheetRows({
    fileType: excel.fileType,
    fileName,
    rows: excel.extractedRows,
    metadata: excel.metadata,
  });
  const validation = validateNormalizedItems(items);
  const corrected = validation.correctedItems || items;
  const reviewLines = await toReviewLines(
    corrected.map((item) => ({
      roomName: item.roomName || 'General',
      category: item.category || '',
      itemCode: item.model || '',
      itemName: item.description,
      description: item.description,
      quantity: item.quantity ?? 1,
      unit: item.unit || 'EA',
      notes: item.notes.join(' | '),
      sourceReference: fileName,
      laborIncluded: null,
      materialIncluded: null,
      confidence: item.confidence,
      parserTag: item.sourceType,
      warnings: [],
      bundleCandidates: item.bundleCandidates,
      semanticTags: item.semanticTags,
    })),
    emptyCatalog,
    false,
    mockBundles
  );
  return { excel, items: corrected, reviewLines, validation };
}

test('fixture: restroom-schedule.csv parses rooms and multiple lines', async () => {
  const { items, reviewLines } = await parseFixtureCsv('restroom-schedule.csv');
  assert.ok(items.length >= 3, `expected at least 3 rows, got ${items.length}`);
  const rooms = new Set(reviewLines.map((l) => l.roomName));
  assert.ok(rooms.size >= 2);
  const bundleHint = reviewLines.filter((l) => l.bundleMatch || l.suggestedBundle);
  assert.ok(
    bundleHint.length >= 1,
    `expected a bundle hint from room/bundle overlap; rooms=${[...rooms].join('|')}`
  );
});

test('fixture: locker-bank.csv captures assembly and locker keywords', async () => {
  const { items, reviewLines } = await parseFixtureCsv('locker-bank.csv');
  assert.ok(items.length >= 2);
  const kd = reviewLines.find((l) => /KD|assemble/i.test(l.description));
  assert.ok(kd);
  assert.ok(kd.semanticTags?.includes('field_assembly') || /assembly/i.test(kd.notes));
});

test('fixture: mixed-trades.csv parses without throwing', async () => {
  const { items } = await parseFixtureCsv('mixed-trades.csv');
  assert.ok(items.length >= 1);
});
