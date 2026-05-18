import test from 'node:test';
import assert from 'node:assert/strict';
import type { SourceQuoteLineRecord, SourceQuoteRecord, TakeoffLineRecord } from '../types/estimator.ts';
import { buildQuoteImportResultSummary, classifyImportedEstimateLine } from './quoteImportResultSummary.ts';

const quote: SourceQuoteRecord = {
  id: 'quote-1',
  projectId: 'proj-1',
  vendorName: 'Bobrick',
  quoteNumber: 'Q-100',
  quoteDate: null,
  deliveryDate: null,
  shipTo: null,
  sourceFileId: null,
  notes: null,
  importStatus: 'partially_imported',
  createdAt: '',
  updatedAt: '',
};

function estimateLine(partial: Partial<TakeoffLineRecord> & { id: string; sourceRef: string }): TakeoffLineRecord {
  return {
    projectId: 'proj-1',
    roomId: 'room-1',
    description: partial.description || 'Bobrick 36 inch grab bar',
    sku: null,
    category: null,
    subcategory: null,
    qty: 1,
    unit: 'EA',
    materialCost: 42,
    laborMinutes: partial.laborMinutes ?? 0,
    notes: partial.notes ?? null,
    sourceType: 'vendor_quote',
    sourceRef: partial.sourceRef,
    ...partial,
  } as TakeoffLineRecord;
}

test('classifyImportedEstimateLine marks grab bar with labor as ready', () => {
  const row = classifyImportedEstimateLine(
    estimateLine({
      id: 'est-1',
      sourceRef: 'q-1',
      laborMinutes: 30,
      notes: 'Source row type: material | Labor baseline from catalog match.',
    }),
  );
  assert.equal(row.laborStatus, 'labor_ready');
});

test('classifyImportedEstimateLine marks gated grab bar as labor paused', () => {
  const row = classifyImportedEstimateLine(
    estimateLine({
      id: 'est-1',
      sourceRef: 'q-1',
      laborMinutes: 0,
      notes:
        'Source row type: material | Install review: blocking_unknown | Install questions: Is backing/blocking in place for this grab bar location? | Needs Review',
    }),
    'labor_and_material',
    {
      structuredAssumptions: [
        {
          id: 'b1',
          source: 'manual',
          ruleId: 'blocking_status',
          text: 'Blocking unknown',
          confidence: 1,
          createdAt: '',
        },
      ],
    },
  );
  assert.equal(row.laborStatus, 'labor_paused');
  assert.match(row.reason || '', /paused until blocking/i);
});

test('buildQuoteImportResultSummary groups imported, paused, and excluded rows', () => {
  const quoteLines: SourceQuoteLineRecord[] = [
    {
      id: 'q-1',
      sourceQuoteId: quote.id,
      lineNumber: null,
      rawDescription: 'Grab bar',
      normalizedDescription: 'Grab bar',
      manufacturer: null,
      skuModel: null,
      qty: 1,
      unit: 'EA',
      unitCost: 42,
      totalCost: 42,
      materialCost: 42,
      rowType: 'material',
      notes: null,
      sortOrder: 0,
      importSelected: true,
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'q-2',
      sourceQuoteId: quote.id,
      lineNumber: null,
      rawDescription: 'Freight',
      normalizedDescription: 'Freight',
      manufacturer: null,
      skuModel: null,
      qty: 1,
      unit: 'FRT',
      unitCost: 100,
      totalCost: 100,
      materialCost: 100,
      rowType: 'freight',
      notes: null,
      sortOrder: 1,
      importSelected: false,
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'q-3',
      sourceQuoteId: quote.id,
      lineNumber: null,
      rawDescription: 'Sales tax',
      normalizedDescription: 'Sales tax',
      manufacturer: null,
      skuModel: null,
      qty: 1,
      unit: 'EA',
      unitCost: null,
      totalCost: null,
      materialCost: 0,
      rowType: 'ignore',
      notes: null,
      sortOrder: 2,
      importSelected: false,
      createdAt: '',
      updatedAt: '',
    },
  ];

  const created = [
    estimateLine({
      id: 'est-1',
      sourceRef: 'q-1',
      laborMinutes: 28,
      notes: 'Source row type: material | Install labor generated from labor family grab_bar_install.',
    }),
  ];

  const summary = buildQuoteImportResultSummary({
    quote,
    quoteLines,
    createdEstimateLines: created,
    project: {
      structuredAssumptions: [
        {
          id: 'b1',
          source: 'manual',
          ruleId: 'blocking_status',
          text: 'Blocking / backing included',
          confidence: 1,
          createdAt: '',
        },
      ],
    },
  });

  assert.equal(summary.importedCount, 1);
  assert.equal(summary.imported[0]?.laborStatus, 'labor_ready');
  assert.equal(summary.needsAssumptionsCount, 0);
  assert.equal(summary.readyForProposal, true);
  assert.equal(summary.termsFreightNotes.length, 1);
  assert.equal(summary.excluded.length, 1);
});
