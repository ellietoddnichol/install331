import type { EstimateLineHealthDerived } from './estimateLineHealth';
import type {
  EstimateSummary,
  ProjectRecord,
  SourceQuoteLineRecord,
  SourceQuoteRecord,
  TakeoffLineRecord,
} from '../types/estimator';
import type { WorkspaceTab } from '../types/projectWorkflow';

/** UX-facing workflow step state for the readiness bar. */
export type WorkflowBarState = 'complete' | 'ready' | 'needs_review' | 'missing' | 'blocked';

export type WorkflowBarStepKey = 'setup' | 'quotes' | 'estimate' | 'proposal';

export interface WorkflowBarStep {
  key: WorkflowBarStepKey;
  title: string;
  detail: string;
  state: WorkflowBarState;
}

export interface ProjectReadinessInput {
  project: ProjectRecord | null;
  /** Company default labor rate; used only to judge setup completeness. */
  defaultLaborRatePerHour: number;
  sourceQuotes: SourceQuoteRecord[];
  /** All quote lines for the project (aggregated across quotes). Safe to pass []. */
  allQuoteLines: SourceQuoteLineRecord[];
  takeoffLines: TakeoffLineRecord[];
  summary: EstimateSummary | null;
  lineHealth: EstimateLineHealthDerived;
}

function nonEmpty(s: string | null | undefined): boolean {
  return Boolean(String(s ?? '').trim());
}

/**
 * Derives the four workflow steps for the project workspace readiness bar.
 * Uses conservative heuristics; refine when richer quote/estimate signals exist.
 */
export function computeWorkflowBarSteps(input: ProjectReadinessInput): WorkflowBarStep[] {
  const { project, defaultLaborRatePerHour, sourceQuotes, allQuoteLines, takeoffLines, summary, lineHealth } = input;

  const setupComplete =
    project != null &&
    nonEmpty(project.projectName) &&
    nonEmpty(project.clientName) &&
    nonEmpty(project.address) &&
    (defaultLaborRatePerHour > 0 || Number(project.laborBurdenPercent) >= 0);

  const setup: WorkflowBarStep = {
    key: 'setup',
    title: 'Setup',
    detail: setupComplete ? 'Project info & defaults' : 'Finish project setup',
    state: setupComplete ? 'complete' : 'missing',
  };

  const hasQuotes = sourceQuotes.length > 0;
  const quoteNeedsReview = sourceQuotes.some((q) => q.importStatus === 'manual_review');
  const quoteReadyImport = sourceQuotes.some((q) => q.importStatus === 'ready_to_import' || q.importStatus === 'partially_imported');

  let quotesState: WorkflowBarState;
  let quotesDetail: string;
  if (!hasQuotes) {
    quotesState = 'missing';
    quotesDetail = 'No quotes yet';
  } else if (quoteNeedsReview) {
    quotesState = 'needs_review';
    quotesDetail = 'Needs review';
  } else if (quoteReadyImport) {
    quotesState = 'ready';
    quotesDetail = 'Ready to import';
  } else {
    quotesState = 'complete';
    quotesDetail = 'Quotes on file';
  }

  const quotes: WorkflowBarStep = {
    key: 'quotes',
    title: 'Quotes',
    detail: quotesDetail,
    state: quotesState,
  };

  const lineCount = takeoffLines?.length ?? 0;
  const hasLines = lineCount > 0;
  const attention = lineHealth?.attentionLineCount ?? 0;

  let estimateState: WorkflowBarState;
  let estimateDetail: string;
  if (!hasLines) {
    estimateState = 'missing';
    estimateDetail = 'No estimate lines';
  } else if (attention > 0) {
    estimateState = 'needs_review';
    estimateDetail = attention === 1 ? '1 line needs review' : `${attention} lines need review`;
  } else {
    estimateState = 'ready';
    estimateDetail = 'Totals ready';
  }

  const estimate: WorkflowBarStep = {
    key: 'estimate',
    title: 'Estimate',
    detail: estimateDetail,
    state: estimateState,
  };

  const bid = summary?.baseBidTotal ?? 0;
  const estimateLooksReady = hasLines && attention === 0 && Number.isFinite(bid);
  let proposalState: WorkflowBarState;
  let proposalDetail: string;
  if (!estimateLooksReady) {
    proposalState = 'missing';
    proposalDetail = 'Not ready';
  } else if (bid <= 0) {
    proposalState = 'needs_review';
    proposalDetail = 'Check totals';
  } else {
    proposalState = 'ready';
    proposalDetail = 'Proposal ready';
  }

  const proposal: WorkflowBarStep = {
    key: 'proposal',
    title: 'Proposal',
    detail: proposalDetail,
    state: proposalState,
  };

  // TODO: incorporate row-level review counts from `allQuoteLines` when quote APIs expose clear signals.
  void allQuoteLines;

  return [setup, quotes, estimate, proposal];
}

export interface NextBestAction {
  label: string;
  tab: WorkspaceTab;
}

/**
 * Single suggested next step for estimators (Overview “Next best action”).
 */
export function computeNextBestAction(steps: WorkflowBarStep[]): NextBestAction {
  const order: WorkflowBarStepKey[] = ['setup', 'quotes', 'estimate', 'proposal'];
  for (const key of order) {
    const s = steps.find((x) => x.key === key);
    if (!s) continue;
    if (s.key === 'setup' && s.state === 'missing') {
      return { label: 'Finish project setup', tab: 'setup' };
    }
    if (s.key === 'quotes' && s.state === 'missing') {
      return { label: 'Add a vendor quote', tab: 'quotes' };
    }
    if (s.key === 'quotes' && s.state === 'needs_review') {
      return { label: 'Review quote rows', tab: 'quotes' };
    }
    if (s.key === 'quotes' && s.state === 'ready') {
      return { label: 'Import ready rows to estimate', tab: 'quotes' };
    }
    if (s.key === 'estimate' && s.state === 'missing') {
      return { label: 'Build the estimate', tab: 'estimate' };
    }
    if (s.key === 'estimate' && s.state === 'needs_review') {
      return { label: 'Review estimate totals', tab: 'estimate' };
    }
    if (s.key === 'proposal' && (s.state === 'missing' || s.state === 'needs_review')) {
      return { label: 'Preview proposal', tab: 'proposal' };
    }
  }
  return { label: 'Preview proposal', tab: 'proposal' };
}
