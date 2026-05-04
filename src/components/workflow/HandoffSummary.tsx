import React from 'react';
import type { InstallReviewEmailDraft } from '../../shared/types/estimator';
import type { FieldScheduleHint } from '../../shared/utils/fieldScheduleHint';
import { formatCurrencySafe, formatNumberSafe } from '../../utils/numberFormat';

interface HandoffSummaryProps {
  draft: InstallReviewEmailDraft | null;
  generating: boolean;
  onGenerate: () => void;
  onCopy: () => void;
  /** Advisory parallel-crew hint vs Setup crew (does not change estimate math). */
  fieldScheduleHint?: FieldScheduleHint | null;
}

export function HandoffSummary({ draft, generating, onGenerate, onCopy, fieldScheduleHint }: HandoffSummaryProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={onGenerate}
          disabled={generating}
          className="inline-flex h-9 items-center justify-center rounded-full border border-slate-200 bg-white px-3.5 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
        >
          {generating ? 'Generating...' : draft ? 'Regenerate' : 'Generate'}
        </button>
        <button
          type="button"
          onClick={onCopy}
          disabled={!draft}
          className="ui-btn-primary h-9 rounded-full px-3.5 text-[11px] font-semibold disabled:opacity-50"
        >
          Copy Email
        </button>
      </div>

      {draft ? (
        <div className="space-y-2.5">
          <div className="rounded-[14px] bg-slate-50 p-3 ring-1 ring-slate-200/80">
            <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-slate-500">Subject</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{draft.subject}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[14px] bg-slate-50 p-3 ring-1 ring-slate-200/80">
              <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-slate-500">Location</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{draft.summary.location || 'Location TBD'}</p>
            </div>
            <div className="rounded-[14px] bg-slate-50 p-3 ring-1 ring-slate-200/80">
              <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-slate-500">Timeline</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{draft.summary.timeline || 'Verify schedule with GC'}</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[22px] bg-slate-50/80 p-3 ring-1 ring-slate-200/80">
              <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-slate-500">Crew</p>
              <p className="mt-1 text-[22px] font-semibold tracking-[-0.04em] text-slate-950">{draft.summary.crewSize ?? 'TBD'}</p>
              <p className="mt-1 text-[10px] leading-snug text-slate-500">From project setup (schedule math)</p>
            </div>
            <div className="rounded-[22px] bg-slate-50/80 p-3 ring-1 ring-slate-200/80">
              <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-slate-500">Hours</p>
              <p className="mt-1 text-[22px] font-semibold tracking-[-0.04em] text-slate-950">{formatNumberSafe(draft.summary.estimatedHours || 0, 1)}</p>
            </div>
            <div className="rounded-[22px] bg-slate-50/80 p-3 ring-1 ring-slate-200/80">
              <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-slate-500">Days</p>
              <p className="mt-1 text-[22px] font-semibold tracking-[-0.04em] text-slate-950">{formatNumberSafe(draft.summary.estimatedDays || 0, 1)}</p>
              <p className="mt-1 text-[10px] leading-snug text-slate-500">Calendar from setup crew</p>
            </div>
          </div>
          {fieldScheduleHint ? (
            <div className="rounded-[14px] border border-blue-200/70 bg-blue-50/50 px-3 py-2.5 text-[11px] leading-snug text-slate-800">
              <p className="font-semibold text-blue-950">Field suggestion only — totals unchanged</p>
              <p className="mt-1 text-slate-700">
                Schedule math (Setup crew): {fieldScheduleHint.mathCrew} installer{fieldScheduleHint.mathCrew === 1 ? '' : 's'} ·{' '}
                {formatNumberSafe(fieldScheduleHint.mathDays, 1)} d. Parallel staffing idea: {fieldScheduleHint.fieldCrew} · ~{formatNumberSafe(fieldScheduleHint.fieldDays, 1)} d.
              </p>
              {fieldScheduleHint.reason ? <p className="mt-1 text-slate-600">{fieldScheduleHint.reason}</p> : null}
              <p className="mt-1 text-[10px] font-medium text-slate-600">
                Pricing and the bid total still follow your current Setup values and the estimate engine — this is guidance only.
              </p>
              <p className="mt-0.5 text-[10px] text-slate-500">Change crew on Setup if you want calendar math to match the field-style line.</p>
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[22px] bg-slate-50/80 p-3 ring-1 ring-slate-200/80">
              <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-slate-500">Material</p>
              <p className="mt-1 text-base font-semibold text-slate-900">{formatCurrencySafe(draft.summary.materialTotal || 0)}</p>
            </div>
            <div className="rounded-[22px] bg-slate-50/80 p-3 ring-1 ring-slate-200/80">
              <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-slate-500">Labor</p>
              <p className="mt-1 text-base font-semibold text-slate-900">{formatCurrencySafe(draft.summary.laborTotal || 0)}</p>
            </div>
            <div className="rounded-[22px] bg-slate-50/80 p-3 ring-1 ring-slate-200/80">
              <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-slate-500">Project modifiers</p>
              <p className="mt-1 text-base font-semibold text-slate-900">{draft.summary.projectConditions.length}</p>
            </div>
          </div>
          <div className="rounded-[14px] bg-white p-3 ring-1 ring-slate-200/80">
            <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-slate-500">Body</p>
            <pre className="mt-2 max-h-[min(50vh,420px)] overflow-auto whitespace-pre-wrap text-xs text-slate-700">{draft.body}</pre>
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-600">Generate an internal handoff email for install crews. Nothing here is shown on the client proposal.</p>
      )}
    </div>
  );
}
