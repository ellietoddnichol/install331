import test from 'node:test';
import assert from 'node:assert/strict';
import * as xlsx from 'xlsx';
import { parseUploadedWithRouter } from '../uploadRouter.ts';

test('parseUploadedWithRouter returns review_required for a low-confidence PDF parse', async () => {
  const previous = process.env.UPLOAD_LLM_NORMALIZATION;
  process.env.UPLOAD_LLM_NORMALIZATION = 'false';

  try {
    const pseudoPdfText = '(Project Name: Civic Center)\n(Room 101)\n(Powder coat finish add)';
    const result = await parseUploadedWithRouter({
      fileName: 'low-confidence.pdf',
      mimeType: 'application/pdf',
      dataBase64: Buffer.from(pseudoPdfText, 'latin1').toString('base64'),
      matchCatalog: true,
    });

    assert.equal(result.status, 'review_required');
    assert.equal(result.fileType, 'pdf');
    assert.equal(result.confidence?.recommendedAction, 'review-before-import');
    assert.equal((result.extractedItems?.length || 0) > 0, true);
  } finally {
    if (previous === undefined) delete process.env.UPLOAD_LLM_NORMALIZATION;
    else process.env.UPLOAD_LLM_NORMALIZATION = previous;
  }
});

test('parseUploadedWithRouter returns manual_template_required for an unrecoverable PDF parse', async () => {
  const previous = process.env.UPLOAD_LLM_NORMALIZATION;
  process.env.UPLOAD_LLM_NORMALIZATION = 'false';

  try {
    const pseudoPdfText = '(Project Name: Empty Upload)\n(Client: Test Client)';
    const result = await parseUploadedWithRouter({
      fileName: 'manual-template.pdf',
      mimeType: 'application/pdf',
      dataBase64: Buffer.from(pseudoPdfText, 'latin1').toString('base64'),
      matchCatalog: true,
    });

    assert.equal(result.status, 'manual_template_required');
    assert.equal(result.fileType, 'pdf');
    assert.equal(result.confidence?.recommendedAction, 'manual-template');
    assert.equal(result.validation?.isValid, false);
  } finally {
    if (previous === undefined) delete process.env.UPLOAD_LLM_NORMALIZATION;
    else process.env.UPLOAD_LLM_NORMALIZATION = previous;
  }
});

test('parseUploadedWithRouter surfaces matrix-takeoff matches and uncertain headers for review', async () => {
  const worksheet = xlsx.utils.aoa_to_sheet([
    ['Column1', 'Column2', 'Column3', 'Column4'],
    ['', 'Room', 'GB B6806 36', 'CH B212'],
    ['', 'Loadwing A Men', 1, 1],
    ['', 'Linehaul Women', 1, ''],
    ['', 'TOTALS', 2, 1],
  ]);
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, 'Inventory List');
  const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

  const result = await parseUploadedWithRouter({
    fileName: 'matrix-takeoff.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    dataBase64: buffer.toString('base64'),
    matchCatalog: true,
  });

  assert.equal(result.fileType, 'excel');
  assert.equal(result.sourceKind, 'spreadsheet-matrix');
  assert.equal(result.extractedItems?.length, 3);
  const grabBarLine = result.reviewLines.find((line) => line.itemCode === 'GB B6806 36');
  const coatHookLine = result.reviewLines.find((line) => line.itemCode === 'CH B212');
  assert.equal(Boolean(grabBarLine?.catalogMatch), true);
  assert.equal(Boolean(coatHookLine?.catalogMatch), true);
  assert.equal(Boolean(grabBarLine?.suggestedMatch), false);
  assert.equal(Boolean(coatHookLine?.suggestedMatch), false);
  assert.deepEqual(result.warnings, ['Ignored totals or summary rows on sheet Inventory List.']);
});

test('parseUploadedWithRouter preserves cleaned project metadata for matrix takeoff uploads', async () => {
  const worksheet = xlsx.utils.aoa_to_sheet([
    ['Column1', 'Column2', 'Column3', 'Column4'],
    ['JOB: FedEx Refresh KCMO', 'B290 1836', 'GB B6806 42', 'GB 36'],
    ['Loadwing A Men', 1, 1, 1],
    ['Linehaul Women', 1, 1, 1],
    ['TOTALS', 2, 2, 2],
  ]);
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, 'Inventory List');
  const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

  const result = await parseUploadedWithRouter({
    fileName: 'matrix-metadata.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    dataBase64: buffer.toString('base64'),
    matchCatalog: true,
  });

  assert.equal(result.sourceKind, 'spreadsheet-matrix');
  assert.equal(result.projectMetadata.projectName, 'FedEx Refresh KCMO');
  assert.equal(result.project.projectName, 'FedEx Refresh KCMO');
  assert.equal(result.projectMetadata.projectName.includes('B290 1836'), false);
  assert.equal(result.reviewLines.length, 6);
});