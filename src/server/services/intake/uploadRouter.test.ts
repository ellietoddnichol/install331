import test from 'node:test';
import assert from 'node:assert/strict';
import * as xlsx from 'xlsx';
import { parseUploadedWithRouter } from '../uploadRouter.ts';

test('parseUploadedWithRouter returns review_required for a low-confidence PDF parse', async () => {
  const previous = process.env.UPLOAD_LLM_NORMALIZATION;
  const previousPdf = process.env.UPLOAD_PDF_PROVIDER;
  process.env.UPLOAD_LLM_NORMALIZATION = 'false';
  process.env.UPLOAD_PDF_PROVIDER = 'fallback-text';

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
    if (previousPdf === undefined) delete process.env.UPLOAD_PDF_PROVIDER;
    else process.env.UPLOAD_PDF_PROVIDER = previousPdf;
  }
});

test('parseUploadedWithRouter falls back to legacy intake when hybrid PDF extract is empty', async () => {
  const previousLlm = process.env.UPLOAD_LLM_NORMALIZATION;
  const previousPdf = process.env.UPLOAD_PDF_PROVIDER;
  const previousGemini = process.env.GEMINI_API_KEY;
  process.env.UPLOAD_LLM_NORMALIZATION = 'false';
  process.env.UPLOAD_PDF_PROVIDER = 'fallback-text';
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_GEMINI_API_KEY;

  try {
    // Minimal PDF shell — hybrid pdf-parse path yields no scope rows → legacy Gemini/text pipeline.
    const emptyPdf = Buffer.from('%PDF-1.4\n%%EOF\n', 'utf8').toString('base64');
    const result = await parseUploadedWithRouter({
      fileName: 'empty-shell.pdf',
      mimeType: 'application/pdf',
      dataBase64: emptyPdf,
      matchCatalog: false,
    });

    assert.equal(result.sourceType, 'pdf');
    assert.ok(Array.isArray(result.reviewLines));
    assert.ok(
      result.warnings.some((w) => /gemini|fallback|hybrid|document ai|pdf/i.test(w)) ||
        result.diagnostics?.parseStrategy?.includes('fallback') ||
        result.diagnostics?.parseStrategy?.includes('gemini'),
      `expected legacy intake fallback warnings/diagnostics, got warnings=${JSON.stringify(result.warnings?.slice(0, 2))}`,
    );
  } finally {
    if (previousLlm === undefined) delete process.env.UPLOAD_LLM_NORMALIZATION;
    else process.env.UPLOAD_LLM_NORMALIZATION = previousLlm;
    if (previousPdf === undefined) delete process.env.UPLOAD_PDF_PROVIDER;
    else process.env.UPLOAD_PDF_PROVIDER = previousPdf;
    if (previousGemini === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousGemini;
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