import assert from 'node:assert/strict';
import test from 'node:test';
import type { EstimateSummary, ProjectRecord, TakeoffLineRecord } from '../types/estimator.ts';
import {
  buildProposalPrintModel,
  DEFAULT_PROPOSAL_OUTPUT_OPTIONS,
  filterAlternateLinesForClientProposal,
} from './proposalPrintModel.ts';
import { calculateEstimateSummary } from './estimateSummary.ts';
import { createDefaultProjectJobConditions } from './jobConditions.ts';

function minimalLine(over: Partial<TakeoffLineRecord>): TakeoffLineRecord {
  const now = new Date().toISOString();
  return {
    id: over.id ?? 'l1',
    projectId: over.projectId ?? 'p1',
    roomId: over.roomId ?? 'r1',
    sourceType: over.sourceType ?? 'manual',
    sourceRef: over.sourceRef ?? null,
    description: over.description ?? 'Item',
    sku: over.sku ?? null,
    category: over.category ?? null,
    subcategory: over.subcategory ?? null,
    baseType: over.baseType ?? null,
    qty: over.qty ?? 1,
    unit: over.unit ?? 'EA',
    materialCost: over.materialCost ?? 10,
    baseMaterialCost: over.baseMaterialCost ?? 10,
    laborMinutes: over.laborMinutes ?? 0,
    laborCost: over.laborCost ?? 0,
    baseLaborCost: over.baseLaborCost ?? 0,
    pricingSource: over.pricingSource ?? 'auto',
    unitSell: over.unitSell ?? 10,
    lineTotal: over.lineTotal ?? 10,
    notes: over.notes ?? null,
    bundleId: over.bundleId ?? null,
    catalogItemId: over.catalogItemId ?? null,
    variantId: over.variantId ?? null,
    proposalVisibility: over.proposalVisibility ?? 'customer_visible',
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

function minimalSummary(over: Partial<EstimateSummary> = {}): EstimateSummary {
  return {
    materialSubtotal: 100,
    laborSubtotal: 50,
    materialLoadedSubtotal: 110,
    laborLoadedSubtotal: 55,
    baseBidTotal: 165,
    durationDays: 2,
    totalLaborHours: 16,
    conditionLaborHoursMultiplier: 1,
    ...over,
  } as EstimateSummary;
}

function minimalProject(over: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id: 'p1',
    projectName: 'Test Project',
    clientName: 'Acme Corp',
    address: '123 Main St',
    pricingMode: 'labor_and_material',
    ...over,
  } as ProjectRecord;
}

test('buildProposalPrintModel excludes internal_only and ignore rows', () => {
  const lines = [
    minimalLine({ id: 'visible', description: 'Visible grab bar', materialCost: 20, laborCost: 5 }),
    minimalLine({ id: 'hidden', description: 'Internal note line', proposalVisibility: 'internal_only' }),
    minimalLine({
      id: 'ignored',
      description: 'Excluded freight',
      notes: 'Source row type: ignore',
      materialCost: 0,
      laborCost: 0,
      lineTotal: 0,
    }),
    minimalLine({
      id: 'paused',
      description: 'GB-36 Grab Bar',
      notes:
        'Source row type: material | Install review: blocking_unknown | Install questions: Is backing in place? | Needs Review',
      laborCost: 12,
    }),
  ];

  const model = buildProposalPrintModel({
    project: minimalProject(),
    settings: null,
    lines,
    summary: minimalSummary(),
    options: { ...DEFAULT_PROPOSAL_OUTPUT_OPTIONS, format: 'detailed' },
  });

  const serialized = JSON.stringify(model);
  assert.equal(model.sections.flatMap((s) => s.lines).length, 2);
  assert.ok(model.sections.some((s) => s.lines.some((l) => l.description.includes('Grab Bar'))));
  assert.doesNotMatch(serialized, /internal_only|blocking_unknown|Install review|ignore|Excluded freight/i);
  assert.doesNotMatch(serialized, /Internal note line/i);
});

test('buildProposalPrintModel investment totals exclude internal_only lines', () => {
  const project = minimalProject({
    overheadPercent: 0,
    profitPercent: 0,
    taxPercent: 0,
    jobConditions: createDefaultProjectJobConditions(),
  });
  const visible = minimalLine({ id: 'visible', materialCost: 100, laborCost: 50, qty: 1 });
  const hidden = minimalLine({
    id: 'hidden',
    proposalVisibility: 'internal_only',
    materialCost: 9000,
    laborCost: 9000,
    qty: 1,
  });
  const clientSummary = calculateEstimateSummary(project, [visible]);
  const inflatedSummary = minimalSummary({
    baseBidTotal: 999_999,
    materialLoadedSubtotal: 999_999,
    laborLoadedSubtotal: 999_999,
  });
  const model = buildProposalPrintModel({
    project,
    settings: null,
    lines: [visible, hidden],
    summary: inflatedSummary,
    options: DEFAULT_PROPOSAL_OUTPUT_OPTIONS,
  });
  const totalRow = model.investmentRows.find((row) => row.isTotal);
  assert.equal(totalRow?.amount, clientSummary.baseBidTotal);
  assert.notEqual(totalRow?.amount, inflatedSummary.baseBidTotal);
});

test('buildProposalPrintModel summary format omits line detail', () => {
  const lines = [minimalLine({ description: 'Paper towel dispenser', materialCost: 15 })];
  const model = buildProposalPrintModel({
    project: minimalProject(),
    settings: null,
    lines,
    summary: minimalSummary(),
    options: { ...DEFAULT_PROPOSAL_OUTPUT_OPTIONS, format: 'summary' },
  });
  assert.equal(model.sections[0]?.lines.length, 0);
  assert.ok(model.scopeRollups.length > 0);
});

test('filterAlternateLinesForClientProposal only returns optional_or_alt lines', () => {
  const lines = [
    minimalLine({ id: 'base', description: 'Base item' }),
    minimalLine({ id: 'alt', description: 'Alt upgrade', proposalVisibility: 'optional_or_alt', materialCost: 30 }),
    minimalLine({ id: 'hidden-alt', description: 'Hidden alt', proposalVisibility: 'optional_or_alt', materialCost: 0, laborCost: 0, lineTotal: 0 }),
  ];
  const alternates = filterAlternateLinesForClientProposal(lines);
  assert.equal(alternates.length, 1);
  assert.equal(alternates[0]?.id, 'alt');
});
