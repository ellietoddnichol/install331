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

/**
 * Workstation-style sticky footer — dark navy bar with mono uppercase kickers
 * and tabular-nums stats so the estimator always sees the LEDGER SUM live.
 */
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
    pricingMode === 'material_only'
      ? 'Material Bid'
      : pricingMode === 'labor_only'
        ? 'Labor Bid'
        : pricingMode === 'material_with_optional_install_quote'
          ? 'Material · Install Quoted'
          : 'Labor + Material';

  const viewLabel = estimateView === 'quantities' ? 'Quantities' : 'Pricing';

  return (
    <footer className="sticky bottom-0 z-20 mt-3 border-t border-slate-200/80 bg-white/95 px-4 py-2.5 shadow-[0_-4px_20px_rgba(15,23,42,0.06)] backdrop-blur-md supports-[backdrop-filter]:bg-white/88 print:hidden md:px-6">
      <div className="mx-auto flex max-w-[1800px] flex-wrap items-stretch justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2">
          <FooterStat kicker="View" value={viewLabel} />
          <FooterStat kicker="Mode" value={modeLabel} />
          <FooterStat kicker="Lines" value={String(lineStats.lineCount).padStart(2, '0')} />
          <FooterStat kicker="Qty" value={formatNumberSafe(lineStats.totalQty, 1)} />
          <FooterStat kicker="Install" value={formatLaborDurationMinutes(lineStats.laborMinutes)} />
        </div>
        <div className="flex items-stretch gap-2">
          {materialLoadedSubtotal != null ? (
            <div className="ui-stat-tile min-w-[120px]">
              <p className="ui-stat-tile-kicker">Material</p>
              <p className="ui-stat-tile-value">{formatCurrencySafe(materialLoadedSubtotal)}</p>
            </div>
          ) : null}
          {laborLoadedSubtotal != null ? (
            <div className="ui-stat-tile min-w-[120px]">
              <p className="ui-stat-tile-kicker">Labor</p>
              <p className="ui-stat-tile-value">{formatCurrencySafe(laborLoadedSubtotal)}</p>
            </div>
          ) : null}
          <div
            className="ui-stat-tile min-w-[140px]"
            style={{
              background: 'linear-gradient(180deg, #0f172a 0%, #111c33 100%)',
              border: '1px solid #0b1222',
              boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)',
            }}
          >
            <p className="ui-stat-tile-kicker text-slate-300">Project Total</p>
            <p className="ui-stat-tile-value text-[18px]">{bid != null ? formatCurrencySafe(bid) : '—'}</p>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterStat({ kicker, value }: { kicker: string; value: string }) {
  return (
    <div className="flex min-w-0 items-baseline gap-1.5">
      <p className="ui-mono-kicker whitespace-nowrap">{kicker}</p>
      <p className="font-mono text-[12px] font-semibold uppercase tracking-[0.06em] tabular-nums text-slate-800">
        {value}
      </p>
    </div>
  );
}
