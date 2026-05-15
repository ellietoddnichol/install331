import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('sourceQuotesRepo stores quote lines and imports selected rows into estimate lines', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'install331-source-quotes-'));
  process.env.DATABASE_PATH = path.join(tmpDir, 'estimator.source-quotes.test.db');

  const { createProject } = await import('./projectsRepo.ts');
  const { createSourceQuote, createSourceQuoteLine, importSelectedQuoteLinesToEstimate, listSourceQuotes, listSourceQuoteLines } = await import('./sourceQuotesRepo.ts');
  const { listTakeoffLines } = await import('./takeoffRepo.ts');

  const project = await createProject({ projectName: 'Quote Import Project', clientName: 'Acme' });
  const quote = await createSourceQuote({
    projectId: project.id,
    vendorName: 'Vendor A',
    quoteNumber: 'Q-100',
  });

  await createSourceQuoteLine({
    sourceQuoteId: quote.id,
    rawDescription: 'Stainless grab bar',
    manufacturer: 'Bobrick',
    skuModel: 'GB-36',
    qty: 2,
    unit: 'EA',
    materialCost: 95,
    importSelected: true,
  });
  await createSourceQuoteLine({
    sourceQuoteId: quote.id,
    rawDescription: 'Manual note row',
    qty: 1,
    unit: 'EA',
    materialCost: 0,
    importSelected: false,
  });

  const storedQuotes = await listSourceQuotes(project.id);
  assert.equal(storedQuotes.length, 1);
  assert.equal(storedQuotes[0]?.vendorName, 'Vendor A');

  const storedLines = await listSourceQuoteLines(quote.id);
  assert.equal(storedLines.length, 2);
  assert.equal(storedLines[0]?.importSelected, true);

  const created = await importSelectedQuoteLinesToEstimate(quote.id);
  assert.equal(created.length, 1);
  assert.equal(created[0]?.sourceType, 'vendor_quote');
  assert.equal(created[0]?.sourceRef, storedLines[0]?.id);

  const createdAgain = await importSelectedQuoteLinesToEstimate(quote.id);
  assert.equal(createdAgain.length, 0);

  const estimateLines = await listTakeoffLines(project.id);
  assert.equal(estimateLines.length, 1);
  assert.equal(estimateLines[0]?.description, 'Stainless grab bar');
});