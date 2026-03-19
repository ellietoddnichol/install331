import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePdfUpload } from './pdfParser.ts';

test('parsePdfUpload builds chunked page output from fallback extraction', async () => {
  const pseudoPdfText = '(Project Name: Civic Center)\n(Room 101)\n(2 Grab Bar 36)\f(Page 2)\n(Lobby)\n(1 Directory Sign)';
  const result = await parsePdfUpload({
    fileName: 'bid.pdf',
    mimeType: 'application/pdf',
    dataBase64: Buffer.from(pseudoPdfText, 'latin1').toString('base64'),
  });

  assert.equal(result.document.pages.length, 2);
  assert.equal(result.chunks.length >= 2, true);
  assert.deepEqual(result.sourceSummary.pagesProcessed, [1, 2]);
  assert.equal(result.metadata.projectName, 'Civic Center');
});