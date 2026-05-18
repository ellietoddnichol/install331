import type {
  PricingMode,
  ProjectRecord,
  SourceQuoteLineRecord,
  SourceQuoteRecord,
  TakeoffLineRecord,
} from '../types/estimator';
import { deriveInstallAssumptionGateUi } from './installIntelligenceLineUi.ts';
import { readBlockingStatusFromStructuredAssumptions } from './projectBlockingAssumptions.ts';

export type QuoteImportLineLaborStatus =
  | 'labor_ready'
  | 'labor_paused'
  | 'material_only'
  | 'needs_review';

export interface QuoteImportResultLine {
  id: string;
  description: string;
  qty: number;
  unit: string;
  materialAmount: number | null;
  laborStatus: QuoteImportLineLaborStatus;
  laborStatusLabel: string;
  reason: string | null;
}

export interface QuoteImportResultSummary {
  quoteId: string;
  vendorLabel: string;
  importedCount: number;
  excludedCount: number;
  needsAssumptionsCount: number;
  readyForProposal: boolean;
  imported: QuoteImportResultLine[];
  laborPaused: QuoteImportResultLine[];
  excluded: QuoteImportResultLine[];
  termsFreightNotes: QuoteImportResultLine[];
}

const BILLABLE_ROW_TYPES = new Set<SourceQuoteLineRecord['rowType']>([
  'material',
  'accessory',
  'installation',
  'service',
]);

export function laborStatusLabel(status: QuoteImportLineLaborStatus): string {
  switch (status) {
    case 'labor_ready':
      return 'Labor ready';
    case 'labor_paused':
      return 'Needs install assumptions';
    case 'material_only':
      return 'Material only';
    case 'needs_review':
      return 'Needs review';
    default:
      return 'Imported';
  }
}

function materialAmountForEstimateLine(line: TakeoffLineRecord): number | null {
  const cost = Number(line.materialCost);
  return Number.isFinite(cost) && cost > 0 ? cost : null;
}

function materialAmountForQuoteLine(line: SourceQuoteLineRecord): number | null {
  const cost = Number(line.materialCost) || Number(line.unitCost) || 0;
  return cost > 0 ? cost : null;
}

function pauseReasonForGatedLine(
  line: TakeoffLineRecord,
  project?: Pick<ProjectRecord, 'structuredAssumptions'> | null,
): string {
  const gate = deriveInstallAssumptionGateUi(line, 'labor_and_material');
  const blocking = readBlockingStatusFromStructuredAssumptions(project?.structuredAssumptions);
  const needsBlocking =
    gate.detail.requiredQuestions.some((q) => /blocking/i.test(q))
    || gate.detail.reviewFlags.some((f) => /blocking/i.test(f));

  if (needsBlocking && (!blocking || blocking === 'unknown')) {
    return 'Labor is paused until blocking/backing is confirmed in Setup or on this line.';
  }
  if (gate.topMissingPrompt) {
    return `Labor is paused until assumptions are confirmed — ${gate.topMissingPrompt}.`;
  }
  return 'Labor is paused until install assumptions are confirmed.';
}

export function classifyImportedEstimateLine(
  line: TakeoffLineRecord,
  pricingMode: PricingMode = 'labor_and_material',
  project?: Pick<ProjectRecord, 'structuredAssumptions'> | null,
): Pick<QuoteImportResultLine, 'laborStatus' | 'laborStatusLabel' | 'reason'> {
  const gate = deriveInstallAssumptionGateUi(line, pricingMode);
  const laborMin = Number(line.laborMinutes) || 0;

  if (gate.isVendorLaborSuppressed) {
    return {
      laborStatus: 'material_only',
      laborStatusLabel: laborStatusLabel('material_only'),
      reason: gate.vendorLaborSuppressedLabel,
    };
  }
  if (gate.isGated) {
    return {
      laborStatus: 'labor_paused',
      laborStatusLabel: laborStatusLabel('labor_paused'),
      reason: pauseReasonForGatedLine(line, project),
    };
  }
  if (laborMin > 0) {
    return {
      laborStatus: 'labor_ready',
      laborStatusLabel: laborStatusLabel('labor_ready'),
      reason: null,
    };
  }
  if (gate.needsReview) {
    return {
      laborStatus: 'needs_review',
      laborStatusLabel: laborStatusLabel('needs_review'),
      reason: gate.topMissingPrompt || 'Review install assumptions before pricing labor.',
    };
  }
  return {
    laborStatus: 'material_only',
    laborStatusLabel: laborStatusLabel('material_only'),
    reason: 'No install labor applied on this row.',
  };
}

function estimateLineToResultLine(
  line: TakeoffLineRecord,
  pricingMode: PricingMode,
  project?: Pick<ProjectRecord, 'structuredAssumptions'> | null,
): QuoteImportResultLine {
  const classified = classifyImportedEstimateLine(line, pricingMode, project);
  return {
    id: line.id,
    description: line.description,
    qty: Number(line.qty) || 1,
    unit: line.unit || 'EA',
    materialAmount: materialAmountForEstimateLine(line),
    ...classified,
  };
}

function quoteLineToResultLine(
  line: SourceQuoteLineRecord,
  reason: string,
): QuoteImportResultLine {
  return {
    id: line.id,
    description: String(line.normalizedDescription || line.rawDescription || '').trim() || '—',
    qty: Number(line.qty) || 1,
    unit: line.unit || 'EA',
    materialAmount: materialAmountForQuoteLine(line),
    laborStatus: 'material_only',
    laborStatusLabel: rowTypeLabel(line.rowType),
    reason,
  };
}

function rowTypeLabel(rowType: SourceQuoteLineRecord['rowType']): string {
  switch (rowType) {
    case 'ignore':
      return 'Excluded';
    case 'note':
      return 'Terms / note';
    case 'freight':
      return 'Freight / fee';
    case 'installation':
      return 'Installation';
    case 'service':
      return 'Service';
    default:
      return 'Not imported';
  }
}

export function buildQuoteImportResultSummary(input: {
  quote: SourceQuoteRecord;
  quoteLines: SourceQuoteLineRecord[];
  createdEstimateLines: TakeoffLineRecord[];
  pricingMode?: PricingMode;
  project?: Pick<ProjectRecord, 'structuredAssumptions'> | null;
}): QuoteImportResultSummary {
  const pricingMode = input.pricingMode ?? 'labor_and_material';
  const createdSourceRefs = new Set(
    input.createdEstimateLines
      .map((line) => String(line.sourceRef || ''))
      .filter(Boolean),
  );

  const imported = input.createdEstimateLines.map((line) =>
    estimateLineToResultLine(line, pricingMode, input.project),
  );
  const laborPaused = imported.filter((line) => line.laborStatus === 'labor_paused');

  const notImported = input.quoteLines.filter((line) => !createdSourceRefs.has(line.id));
  const excluded: QuoteImportResultLine[] = [];
  const termsFreightNotes: QuoteImportResultLine[] = [];

  for (const line of notImported) {
    if (line.rowType === 'note' || line.rowType === 'freight') {
      termsFreightNotes.push(
        quoteLineToResultLine(
          line,
          line.rowType === 'freight'
            ? 'Freight and fees stay on the quote — not billable install scope.'
            : 'Terms and notes stay on the quote — not imported to the estimate.',
        ),
      );
      continue;
    }
    if (line.rowType === 'ignore') {
      excluded.push(quoteLineToResultLine(line, 'Marked excluded on the quote.'));
      continue;
    }
    if (BILLABLE_ROW_TYPES.has(line.rowType) && !line.importSelected) {
      excluded.push(quoteLineToResultLine(line, 'Not included for import (Include unchecked).'));
      continue;
    }
    if (BILLABLE_ROW_TYPES.has(line.rowType) && line.importSelected) {
      excluded.push(quoteLineToResultLine(line, 'Already in the estimate from a prior import.'));
      continue;
    }
    if (!BILLABLE_ROW_TYPES.has(line.rowType)) {
      termsFreightNotes.push(quoteLineToResultLine(line, `${rowTypeLabel(line.rowType)} row — not imported as material scope.`));
    }
  }

  const vendorLabel = [input.quote.vendorName, input.quote.quoteNumber].filter(Boolean).join(' · ') || 'Vendor quote';
  const needsAssumptionsCount = laborPaused.length;
  const readyForProposal = imported.length > 0 && needsAssumptionsCount === 0;

  return {
    quoteId: input.quote.id,
    vendorLabel,
    importedCount: imported.length,
    excludedCount: excluded.length,
    needsAssumptionsCount,
    readyForProposal,
    imported,
    laborPaused,
    excluded,
    termsFreightNotes,
  };
}
