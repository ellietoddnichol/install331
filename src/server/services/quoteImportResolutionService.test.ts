import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveQuoteLineForEstimate } from './quoteImportResolutionService.ts';
import type { SourceQuoteLineRecord, SourceQuoteRecord } from '../../shared/types/estimator.ts';

const quote: SourceQuoteRecord = {
  id: 'quote-1',
  projectId: 'proj-1',
  vendorName: 'Bobrick',
  quoteNumber: 'Q-1',
  quoteDate: null,
  deliveryDate: null,
  shipTo: null,
  sourceFileId: null,
  notes: null,
  importStatus: 'manual_review',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function line(partial: Partial<SourceQuoteLineRecord>): SourceQuoteLineRecord {
  return {
    id: partial.id || 'line-1',
    sourceQuoteId: quote.id,
    lineNumber: null,
    rawDescription: partial.rawDescription || '',
    normalizedDescription: partial.normalizedDescription ?? partial.rawDescription ?? '',
    manufacturer: partial.manufacturer ?? null,
    skuModel: partial.skuModel ?? null,
    qty: partial.qty ?? 1,
    unit: partial.unit ?? 'EA',
    unitCost: partial.unitCost ?? null,
    totalCost: partial.totalCost ?? null,
    materialCost: partial.materialCost ?? 0,
    rowType: partial.rowType ?? 'material',
    notes: partial.notes ?? null,
    sortOrder: 0,
    importSelected: partial.importSelected ?? true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

test('resolveQuoteLineForEstimate suppresses labor on freight rows', () => {
  const resolved = resolveQuoteLineForEstimate({
    quote,
    line: line({
      rawDescription: 'Freight',
      rowType: 'freight',
      unit: 'FRT',
      materialCost: 350,
      totalCost: 350,
    }),
    projectId: 'proj-1',
    roomId: 'room-1',
    catalogItems: [],
  });
  assert.equal(resolved.createInput.laborMinutes, 0);
  assert.equal(resolved.createInput.sourceLineType, 'add_in');
  assert.match(resolved.flags.join(' '), /freight/i);
});

test('resolveQuoteLineForEstimate suppresses Brighten labor fallback on vendor service rows', () => {
  const resolved = resolveQuoteLineForEstimate({
    quote,
    line: line({
      rawDescription: 'Mirror installation by vendor',
      rowType: 'installation',
      unit: 'SRV',
      materialCost: 1200,
    }),
    projectId: 'proj-1',
    roomId: 'room-1',
    catalogItems: [],
  });
  assert.equal(resolved.createInput.laborMinutes, 0);
  assert.equal(resolved.createInput.generatedLaborMinutes, null);
  assert.match(resolved.flags.join(' '), /installation\/service/i);
});

test('resolveQuoteLineForEstimate blocks grab bar labor until blocking is known', () => {
  const resolved = resolveQuoteLineForEstimate({
    quote,
    line: line({
      rawDescription: 'Bobrick 36 inch grab bar satin',
      rowType: 'material',
      skuModel: 'B-6806',
      materialCost: 42,
    }),
    projectId: 'proj-1',
    roomId: 'room-1',
    catalogItems: [],
  });
  assert.equal(resolved.createInput.laborMinutes, 0);
  assert.ok(resolved.flags.some((f) => /Needs Review|blocking|Install question/i.test(f)));
});
