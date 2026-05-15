import React from 'react';

export type MvpStatusTone = 'ready' | 'review' | 'progress' | 'imported' | 'excluded' | 'draft' | 'neutral' | 'danger';

const TONE_CLASS: Record<MvpStatusTone, string> = {
  ready: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  review: 'bg-amber-50 text-amber-900 ring-amber-200',
  progress: 'bg-sky-50 text-sky-900 ring-sky-200',
  imported: 'bg-emerald-50/80 text-emerald-700 ring-emerald-100',
  excluded: 'bg-rose-50 text-rose-800 ring-rose-200',
  draft: 'bg-slate-100 text-slate-700 ring-slate-200',
  neutral: 'bg-slate-100 text-slate-600 ring-slate-200',
  danger: 'bg-rose-50 text-rose-800 ring-rose-200',
};

export function StatusBadge({ label, tone = 'neutral' }: { label: string; tone?: MvpStatusTone }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${TONE_CLASS[tone]}`}
    >
      {label}
    </span>
  );
}
