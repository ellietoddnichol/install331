import React from 'react';
import type { PricingMode, ProjectStatus } from '../../../shared/types/estimator';
import { formatCurrencySafe } from '../../../utils/numberFormat';

function pricingModeLabel(mode: PricingMode): string {
  switch (mode) {
    case 'material_only':
      return 'Material only';
    case 'labor_only':
      return 'Labor only';
    case 'material_with_optional_install_quote':
      return 'Material · optional install quote';
    default:
      return 'Labor + material';
  }
}

interface EstimateCockpitHeaderProps {
  projectName: string;
  pricingMode: PricingMode;
  projectStatus: ProjectStatus | null | undefined;
  /** Running total for current workspace scope (e.g. filtered room subtotal or chip total). */
  runningTotal: number | null | undefined;
  /** Secondary hint — e.g. active room label */
  scopeHint?: string | null;
}

export function EstimateCockpitHeader({
  projectName,
  pricingMode,
  projectStatus,
  runningTotal,
  scopeHint,
}: EstimateCockpitHeaderProps) {
  return (
    <header className="rounded-xl border border-app-line bg-app-surface px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-app-muted">Estimate cockpit</p>
          <h2 className="mt-0.5 truncate text-lg font-semibold tracking-tight text-app">{projectName || 'Project'}</h2>
          {scopeHint ? (
            <p className="mt-1 text-[11px] text-app-muted">{scopeHint}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-end gap-4 text-right">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-app-muted">Proposal mode</p>
            <p className="mt-0.5 text-sm font-semibold text-app">{pricingModeLabel(pricingMode)}</p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-app-muted">Estimate status</p>
            <p className="mt-0.5 text-sm font-semibold text-app">{projectStatus ?? '—'}</p>
          </div>
          <div className="rounded-lg bg-[linear-gradient(180deg,#0f172a_0%,#111c33_100%)] px-4 py-2 text-white shadow-inner ring-1 ring-black/20">
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-300">Running total</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums tracking-tight">
              {runningTotal != null ? formatCurrencySafe(runningTotal) : '—'}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}
