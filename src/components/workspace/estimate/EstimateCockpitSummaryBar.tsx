import React from 'react';
import type { EstimateSummary, ProjectJobConditions } from '../../../shared/types/estimator';
import { formatCurrencySafe } from '../../../utils/numberFormat';

interface EstimateCockpitSummaryBarProps {
  summary: EstimateSummary | null | undefined;
  jobConditions: ProjectJobConditions | null | undefined;
}

/**
 * Sticky bottom ledger for the estimate cockpit — loaded material/labor from summary,
 * stacked overhead/profit-style fees, tax, optional bond hint from setup.
 */
export function EstimateCockpitSummaryBar({ summary, jobConditions }: EstimateCockpitSummaryBarProps) {
  const material = summary?.materialLoadedSubtotal ?? summary?.materialSubtotal;
  const labor = summary?.laborLoadedSubtotal ?? summary?.adjustedLaborSubtotal ?? summary?.laborSubtotal;

  const overheadProfitStack =
    (summary?.overheadAmount ?? 0) +
    (summary?.profitAmount ?? 0) +
    (summary?.burdenAmount ?? 0) +
    (summary?.laborOverheadAmount ?? 0) +
    (summary?.laborProfitAmount ?? 0) +
    (summary?.subLaborManagementFeeAmount ?? 0);

  const tax = summary?.taxAmount;
  const grand = summary?.baseBidTotal;

  const bondPct = jobConditions?.performanceBondPercent ?? 0;
  const bondOn = jobConditions?.performanceBondRequired && bondPct > 0;

  return (
    <footer className="sticky bottom-0 z-30 mt-auto border-t border-app-line bg-app-surface/95 px-3 py-2 shadow-[0_-6px_24px_rgba(15,23,42,0.07)] backdrop-blur-md supports-[backdrop-filter]:bg-app-surface/88 print:hidden sm:px-4">
      <div className="mx-auto flex max-w-[1920px] flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-wrap gap-x-4 gap-y-2">
          <LedgerChip label="Material" value={material != null ? formatCurrencySafe(material) : '—'} emphasized={false} />
          <LedgerChip label="Labor" value={labor != null ? formatCurrencySafe(labor) : '—'} emphasized={false} />
          <LedgerChip
            label="OH / P & fees"
            value={summary ? formatCurrencySafe(overheadProfitStack) : '—'}
            emphasized={false}
          />
          <LedgerChip label="Tax" value={tax != null ? formatCurrencySafe(tax) : '—'} emphasized={false} />
          <LedgerChip
            label="Bond"
            value={bondOn ? `${bondPct.toFixed(2)}% (setup)` : '—'}
            hint={bondOn ? 'Allowance from setup (see estimate engine)' : 'Not configured in setup'}
            emphasized={false}
          />
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <div className="rounded-lg bg-[linear-gradient(180deg,#0f172a_0%,#111c33_100%)] px-4 py-2 text-white shadow-md ring-1 ring-black/15">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-300">Grand total</p>
            <p className="mt-0.5 text-xl font-semibold tabular-nums">{grand != null ? formatCurrencySafe(grand) : '—'}</p>
          </div>
        </div>
      </div>
    </footer>
  );
}

function LedgerChip(props: { label: string; value: string; hint?: string; emphasized?: boolean }) {
  const { label, value, hint, emphasized } = props;
  return (
    <div
      className={`min-w-[6.5rem] rounded-lg border px-2.5 py-1.5 ${
        emphasized ? 'border-slate-700 bg-slate-900 text-white' : 'border-app-line bg-app-surface-soft text-app'
      }`}
    >
      <p className={`text-[10px] font-semibold uppercase tracking-wide ${emphasized ? 'text-slate-300' : 'text-app-muted'}`}>
        {label}
      </p>
      <p className={`mt-0.5 text-sm font-semibold tabular-nums ${emphasized ? 'text-white' : 'text-app'}`}>{value}</p>
      {hint ? <p className="mt-0.5 text-[10px] text-app-muted">{hint}</p> : null}
    </div>
  );
}
