import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePdfLinesDeterministically } from './normalizer.ts';
import type { PdfChunk } from './pdfParser.ts';

function chunk(text: string, page = 1, idx = 1): PdfChunk {
  return {
    chunkId: `page-${page}-chunk-${idx}`,
    pageNumber: page,
    text,
    blockTypes: [],
  };
}

test('deterministic lenient keeps short lines without quantity', () => {
  const items = normalizePdfLinesDeterministically({
    fileName: 'x.pdf',
    chunks: [chunk('Lobby\nProvide widget per spec.\n')],
  });
  assert.equal(items.length, 1);
  assert.equal(items[0]?.description.includes('widget'), true);
});

test('deterministic strict drops short prose without qty, unit, or long description', () => {
  const items = normalizePdfLinesDeterministically(
    {
      fileName: 'x.pdf',
      chunks: [chunk('Lobby\nProvide widget per spec.\n2 EA Sign type A\n')],
    },
    { scopeRowFilter: 'strict' }
  );
  assert.equal(items.length, 1);
  assert.ok(items[0]?.description.includes('Sign'));
});

test('deterministic strict keeps qty-prefixed lines and parenthetical qty', () => {
  const items = normalizePdfLinesDeterministically(
    {
      fileName: 'x.pdf',
      chunks: [chunk('(2 Grab Bar 36 inch)\n')],
    },
    { scopeRowFilter: 'strict' }
  );
  assert.equal(items.length, 1);
});

test('deterministic strict keeps modifier phrases', () => {
  const items = normalizePdfLinesDeterministically(
    {
      fileName: 'x.pdf',
      chunks: [chunk('Powder coat finish add\n')],
    },
    { scopeRowFilter: 'strict' }
  );
  assert.equal(items.length, 1);
});
