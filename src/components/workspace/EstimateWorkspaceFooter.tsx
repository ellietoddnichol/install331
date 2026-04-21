import React from 'react';
import type { EstimateWorkspaceView } from '../../shared/types/projectWorkflow';
import type { PricingMode } from '../../shared/types/estimator';
import { formatCurrencySafe, formatLaborDurationMinutes, formatNumberSafe } from '../../utils/numberFormat';

interface EstimateWorkspaceFooterProps {
  estimateView: EstimateWorkspaceView;
  lineStats: { lineCount: number; totalQty: number; laborMinutes: number };
  baseBidTotal: number | null | undefined;
  pricingMode: PricingMode;
  /** Loaded material / labor subtotals when pricing summary is available. */
  materialLoadedSubtotal?: number;
  laborLoadedSubtotal?: number;
}

export function EstimateWorkspaceFooter({
  estimateView,
  lineStats,
  baseBidTotal,
  pricingMode,
  materialLoadedSubtotal,
  laborLoadedSubtotal,
}: EstimateWorkspaceFooterProps) {
  const bid = baseBidTotal;
  const modeLabel =
    pricingMode === 'material_only' ? 'Material bid' : pricingMode === 'labor_only' ? 'Labor bid' : 'Labor + material bid';

  return (
    <footer className="sticky bottom-0 z-20 mt-2 border-t border-slate-200/90 bg-white/95 px-3 py-2 shadow-[0_-4px_20px_rgba(15,23,42,0.06)] backdrop-blur-md supports-[backdrop-filter]:bg-white/88 print:hidden">
      <div className="mx-auto flex max-w-[1800px] flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600">
          <span className="font-semibold text-slate-800">{estimateView === 'quantities' ? 'Quantities' : 'Pricing'}</span>
          <span className="tabular-nums">{lineStats.lineCount} lines (project)</span>
          <span className="tabular-nums">{formatNumberSafe(lineStats.totalQty, 1)} qty</span>
          <span className="tabular-nums">{formatLaborDurationMinutes(lineStats.laborMinutes)} install</span>
          <span className="hidden text-slate-500 sm:inline">· {modeLabel}</span>
        </div>
        <div className="shrink-0 text-right">
          {materialLoadedSubtotal != null && laborLoadedSubtotal != null ? (
            <p className="mb-0.5 text-[10px] tabular-nums text-slate-500">
              Mat {formatCurrencySafe(materialLoadedSubtotal)} · Lab {formatCurrencySafe(laborLoadedSubtotal)}
            </p>
          ) : null}
          <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Running total</p>
          <p className="text-lg font-semibold tabular-nums leading-none text-slate-900">{bid != null ? formatCurrencySafe(bid) : '—'}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">Live — lines, add-ins, markups</p>
        </div>
      </div>
    </footer>
  );
}
