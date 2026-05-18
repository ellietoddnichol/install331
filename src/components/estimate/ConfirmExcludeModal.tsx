import React, { useEffect, useState } from 'react';
import {
  EXCLUSION_REASON_OPTIONS,
  type ExclusionReason,
} from '../../shared/utils/exclusionReasonLabels';
import { formatCurrencySafe, formatNumberSafe } from '../../utils/numberFormat';

export type ConfirmExcludeMode = 'hide_from_proposal' | 'exclude_from_estimate';

export interface ConfirmExcludeTarget {
  description: string;
  qty: number;
  unit: string;
  materialTotal?: number | null;
  sourceLabel?: string | null;
}

export interface ConfirmExcludeResult {
  reason: ExclusionReason;
  note: string;
}

interface ConfirmExcludeModalProps {
  open: boolean;
  mode: ConfirmExcludeMode;
  target: ConfirmExcludeTarget | null;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (result: ConfirmExcludeResult) => void | Promise<void>;
}

function headerForMode(mode: ConfirmExcludeMode): string {
  return mode === 'hide_from_proposal'
    ? 'Hide this from the proposal?'
    : 'Exclude this row from the estimate?';
}

function bodyLeadForMode(mode: ConfirmExcludeMode): string {
  return mode === 'hide_from_proposal'
    ? 'Hidden from customer proposal, still visible internally.'
    : 'Excluded from estimate import, still saved with the quote.';
}

function confirmLabelForMode(mode: ConfirmExcludeMode): string {
  return mode === 'hide_from_proposal'
    ? 'Confirm hide from proposal'
    : 'Confirm exclude from estimate';
}

export function ConfirmExcludeModal({
  open,
  mode,
  target,
  busy = false,
  onCancel,
  onConfirm,
}: ConfirmExcludeModalProps) {
  const [reason, setReason] = useState<ExclusionReason>('not_in_scope');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) return;
    setReason(mode === 'exclude_from_estimate' ? 'freight_note' : 'internal_note');
    setNote('');
  }, [open, mode, target?.description]);

  if (!open || !target) return null;

  const detail =
    mode === 'hide_from_proposal'
      ? 'The line stays on your estimate for internal review, pricing checks, and install assumptions. It will not appear on the customer proposal.'
      : 'The row stays on the vendor quote for reference. It will not import or price as billable estimate scope.';

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/45 p-4"
      role="presentation"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-exclude-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-200 px-5 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">Scope visibility</p>
          <h2 id="confirm-exclude-title" className="mt-1 text-lg font-semibold text-slate-900">
            {headerForMode(mode)}
          </h2>
          <p className="mt-1 text-[13px] text-slate-600">{bodyLeadForMode(mode)}</p>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5">
            <p className="text-[13px] font-medium text-slate-900">{target.description}</p>
            <p className="mt-0.5 text-[11px] text-slate-600">
              {formatNumberSafe(target.qty, 2)} {target.unit}
              {target.materialTotal != null ? ` · ${formatCurrencySafe(target.materialTotal)} material` : ''}
            </p>
            {target.sourceLabel ? (
              <p className="mt-1 text-[11px] text-slate-500">{target.sourceLabel}</p>
            ) : null}
          </div>

          <p className="text-[12px] leading-relaxed text-slate-700">{detail}</p>

          <label className="block space-y-1 text-[12px]">
            <span className="font-medium text-slate-800">Reason (optional)</span>
            <select className="ui-input w-full" value={reason} onChange={(e) => setReason(e.target.value as ExclusionReason)}>
              {EXCLUSION_REASON_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1 text-[12px]">
            <span className="font-medium text-slate-800">Internal note (optional)</span>
            <textarea
              className="ui-input min-h-[72px] w-full"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="For estimators only — not printed on the customer proposal."
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-slate-50/80 px-5 py-3">
          <button type="button" className="ui-fo-btn-primary h-10 flex-1 px-3" disabled={busy} onClick={() => void onConfirm({ reason, note: note.trim() })}>
            {confirmLabelForMode(mode)}
          </button>
          <button type="button" className="ui-btn-secondary h-10 px-3 text-[12px] font-semibold" disabled={busy} onClick={onCancel}>
            {mode === 'hide_from_proposal' ? 'Keep line included' : 'Go back'}
          </button>
        </div>
      </div>
    </div>
  );
}
