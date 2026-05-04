import React from 'react';

export function IntakeFieldBadge({ kind }: { kind: 'required' | 'optional' | 'office' }) {
  if (kind === 'required') {
    return (
      <span className="ml-1.5 inline-flex items-center rounded bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-blue-900">
        Required
      </span>
    );
  }
  if (kind === 'optional') {
    return (
      <span className="ml-1.5 inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-600">
        Optional
      </span>
    );
  }
  return (
    <span className="ml-1.5 inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-600">
      Office default
    </span>
  );
}

export function IntakeFieldLegend() {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-slate-200/80 bg-slate-50/80 px-3 py-2.5 text-[11px] text-slate-600">
      <span className="font-semibold text-slate-700">Field types:</span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-blue-600" aria-hidden />
        Required for this estimate
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-slate-400" aria-hidden />
        Optional adjustment
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-slate-300" aria-hidden />
        Usually office default
      </span>
    </div>
  );
}
