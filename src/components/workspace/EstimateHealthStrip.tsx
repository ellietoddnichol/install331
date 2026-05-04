import React from 'react';
import { Activity } from 'lucide-react';
import { format } from 'date-fns';
import type { PricingMode } from '../../shared/types/estimator';
import { isMaterialOnlyMainBid } from '../../shared/types/estimator';
import type { EstimateHealthFocus, EstimateLineHealthDerived } from '../../shared/utils/estimateLineHealth';

interface Props {
  health: EstimateLineHealthDerived;
  pricingMode: PricingMode;
  bulkSelectedCount: number;
  /** ISO timestamp when takeoff lines were last loaded from the server (refresh or workspace load). */
  dataLoadedAt: string | null;
  focus: EstimateHealthFocus | null;
  onFocusChange: (next: EstimateHealthFocus | null) => void;
}

export function EstimateHealthStrip({
  health,
  pricingMode,
  bulkSelectedCount,
  dataLoadedAt,
  focus,
  onFocusChange,
}: Props) {
  const showMaterial = pricingMode !== 'labor_only';
  const showLabor = !isMaterialOnlyMainBid(pricingMode);

  function chip(
    kind: EstimateHealthFocus,
    label: string,
    count: number,
    title: string
  ): React.ReactNode {
    if (count <= 0) return null;
    const active = focus === kind;
    return (
      <button
        key={kind}
        type="button"
        title={title}
        onClick={() => onFocusChange(active ? null : kind)}
        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold tabular-nums transition ${
          active
            ? 'bg-amber-200/90 text-amber-950 ring-1 ring-amber-500/60'
            : 'bg-white/90 text-slate-800 ring-1 ring-slate-200/90 hover:bg-amber-50/90'
        }`}
      >
        <span className="text-slate-500">{label}</span>
        <span>{count}</span>
      </button>
    );
  }

  const dataHint =
    dataLoadedAt &&
    (() => {
      try {
        const d = new Date(dataLoadedAt);
        if (Number.isNaN(d.getTime())) return null;
        return `Data loaded ${format(d, 'h:mm a')}`;
      } catch {
        return null;
      }
    })();

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-200/80 bg-slate-50/95 px-2.5 py-1.5 text-[10px] text-slate-700">
      <div className="flex items-center gap-1.5 text-slate-600">
        <Activity className="h-3 w-3 shrink-0 text-slate-400" aria-hidden />
        <span className="font-semibold uppercase tracking-wide text-slate-500">Estimate health</span>
      </div>
      {health.attentionLineCount > 0 ? (
        <span className="inline-flex items-center gap-1 rounded-md bg-amber-100/80 px-2 py-0.5 font-semibold tabular-nums text-amber-950 ring-1 ring-amber-200/80">
          {health.attentionLineCount} need{health.attentionLineCount === 1 ? 's' : ''} attention
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50/90 px-2 py-0.5 font-medium text-emerald-900 ring-1 ring-emerald-200/70">
          No gaps in this view
        </span>
      )}
      <div className="flex flex-wrap items-center gap-1">
        {showMaterial ? chip('material', 'Mat $', health.missingMaterial.count, 'Missing or zero unit material — click to highlight') : null}
        {showLabor ? chip('labor', 'Labor', health.missingLabor.count, 'Missing or zero install minutes — click to highlight') : null}
        {chip(
          'installFamily',
          'Family',
          health.missingInstallFamily.count,
          'Install-family labor without family key — click to highlight'
        )}
      </div>
      {bulkSelectedCount > 0 ? (
        <span className="inline-flex items-center gap-1 rounded-md border border-blue-200/80 bg-blue-50/80 px-2 py-0.5 font-semibold tabular-nums text-blue-950">
          {bulkSelectedCount} selected
        </span>
      ) : null}
      {dataHint ? <span className="ml-auto text-[10px] font-medium text-slate-400">{dataHint}</span> : null}
    </div>
  );
}
