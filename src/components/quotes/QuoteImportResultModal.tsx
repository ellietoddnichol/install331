import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { FieldOpsKpiCard } from '../fieldops/FieldOpsPrimitives';
import { formatCurrencySafe } from '../../utils/numberFormat';
import type { QuoteImportResultLine, QuoteImportResultSummary } from '../../shared/utils/quoteImportResultSummary';

interface QuoteImportResultModalProps {
  open: boolean;
  summary: QuoteImportResultSummary | null;
  onClose: () => void;
  onGoToEstimate: () => void;
  onReviewInstallAssumptions: () => void;
  onBackToQuotes: () => void;
  onImportAnotherQuote?: () => void;
}

function laborStatusTone(status: QuoteImportResultLine['laborStatus']): string {
  switch (status) {
    case 'labor_ready':
      return 'border-emerald-200 bg-emerald-50 text-emerald-900';
    case 'labor_paused':
      return 'border-amber-200 bg-amber-50 text-amber-950';
    case 'needs_review':
      return 'border-amber-200 bg-amber-50 text-amber-950';
    case 'material_only':
    default:
      return 'border-slate-200 bg-slate-50 text-slate-700';
  }
}

function LineRow({ line }: { line: QuoteImportResultLine }) {
  return (
    <li className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-slate-900">{line.description}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {line.qty} {line.unit}
            {line.materialAmount != null ? ` · ${formatCurrencySafe(line.materialAmount)} material` : ''}
          </p>
          {line.reason ? (
            <p className="mt-1 text-[11px] leading-snug text-slate-600">{line.reason}</p>
          ) : null}
        </div>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${laborStatusTone(line.laborStatus)}`}
        >
          {line.laborStatusLabel}
        </span>
      </div>
    </li>
  );
}

function LineSection({
  title,
  subtitle,
  lines,
}: {
  title: string;
  subtitle: string;
  lines: QuoteImportResultLine[];
}) {
  if (lines.length === 0) return null;
  return (
    <section className="space-y-2">
      <div>
        <h4 className="text-[12px] font-semibold text-slate-900">{title}</h4>
        <p className="text-[11px] text-slate-500">{subtitle}</p>
      </div>
      <ul className="space-y-2">{lines.map((line) => <LineRow key={line.id} line={line} />)}</ul>
    </section>
  );
}

export function QuoteImportResultModal({
  open,
  summary,
  onClose,
  onGoToEstimate,
  onReviewInstallAssumptions,
  onBackToQuotes,
  onImportAnotherQuote,
}: QuoteImportResultModalProps) {
  if (!open || !summary) return null;

  const hasPaused = summary.laborPaused.length > 0;

  return (
    <div
      className="fixed inset-0 z-[70] bg-slate-900/45 p-3 sm:p-6"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="mx-auto flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quote-import-result-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-slate-200 bg-gradient-to-b from-emerald-50/80 to-white px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700">
              <CheckCircle2 className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-emerald-800">Import complete</p>
              <h2 id="quote-import-result-title" className="mt-0.5 text-lg font-semibold text-slate-900">
                {summary.importedCount} line{summary.importedCount === 1 ? '' : 's'} added to the estimate
              </h2>
              <p className="mt-1 text-[13px] text-slate-600">{summary.vendorLabel}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-600">
                <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5">
                  {summary.importedCount} imported
                </span>
                {summary.excludedCount > 0 ? (
                  <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5">
                    {summary.excludedCount} excluded / not billable
                  </span>
                ) : null}
                {summary.needsAssumptionsCount > 0 ? (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-950">
                    {summary.needsAssumptionsCount} need install assumptions
                  </span>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              className="rounded-md border border-slate-300 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <FieldOpsKpiCard
              label="Imported to estimate"
              value={String(summary.importedCount)}
              hint="Selected quote rows now in your estimate"
            />
            <FieldOpsKpiCard
              label="Needs install assumptions"
              value={String(summary.needsAssumptionsCount)}
              hint={
                summary.needsAssumptionsCount > 0
                  ? 'Labor is paused until assumptions are confirmed'
                  : 'No labor paused for missing assumptions'
              }
              emphasize={summary.needsAssumptionsCount > 0}
            />
            <FieldOpsKpiCard
              label="Excluded / notes / freight"
              value={String(summary.excludedCount + summary.termsFreightNotes.length)}
              hint="Stayed on the quote — not billable install scope"
            />
            <FieldOpsKpiCard
              label="Ready for proposal"
              value={summary.readyForProposal ? 'Yes' : 'Review first'}
              hint={
                summary.readyForProposal
                  ? 'No install-assumption blockers on imported lines'
                  : 'Confirm install assumptions before customer proposal'
              }
              emphasize={!summary.readyForProposal}
            />
          </div>

          <div className="mt-5 space-y-5">
            <LineSection
              title="Imported lines"
              subtitle="These rows are now on your estimate."
              lines={summary.imported}
            />
            <LineSection
              title="Needs install assumptions"
              subtitle="Labor is paused until assumptions are confirmed — not a failed import."
              lines={summary.laborPaused}
            />
            <LineSection
              title="Excluded rows"
              subtitle="Not imported as billable estimate scope."
              lines={summary.excluded}
            />
            <LineSection
              title="Terms, freight, and notes"
              subtitle="Kept on the quote for reference."
              lines={summary.termsFreightNotes}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-slate-50/80 px-5 py-3">
          <button type="button" className="ui-fo-btn-primary h-10 px-4" onClick={onGoToEstimate}>
            Go to Estimate
          </button>
          {hasPaused ? (
            <button type="button" className="ui-btn-secondary h-10 px-4 text-[12px] font-semibold" onClick={onReviewInstallAssumptions}>
              Review install assumptions
            </button>
          ) : null}
          <button type="button" className="ui-btn-secondary h-10 px-4 text-[12px] font-semibold" onClick={onBackToQuotes}>
            Back to Quotes
          </button>
          {onImportAnotherQuote ? (
            <button type="button" className="ui-btn-secondary h-10 px-4 text-[12px] font-semibold" onClick={onImportAnotherQuote}>
              Import another quote
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
