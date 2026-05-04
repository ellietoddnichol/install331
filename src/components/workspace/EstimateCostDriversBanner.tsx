import React from 'react';
import type { PricingMode } from '../../shared/types/estimator';
import { formatCurrencySafe, formatNumberSafe } from '../../utils/numberFormat';

interface EstimateCostDriversBannerProps {
  pricingMode: PricingMode;
  baseLaborRatePerHour: number;
  effectiveLaborCostPerHour: number;
  laborCostMultiplier: number;
  laborHoursMultiplier: number;
  installerCount: number;
  productiveCrewHoursPerDay: number;
  totalLaborHours: number;
  durationDays: number;
  materialLoadedOrSubtotal: number;
  laborLoadedOrSubtotal: number;
  baseBidTotal: number;
}

export function EstimateCostDriversBanner({
  pricingMode,
  baseLaborRatePerHour,
  effectiveLaborCostPerHour,
  laborCostMultiplier,
  laborHoursMultiplier,
  installerCount,
  productiveCrewHoursPerDay,
  totalLaborHours,
  durationDays,
  materialLoadedOrSubtotal,
  laborLoadedOrSubtotal,
  baseBidTotal,
}: EstimateCostDriversBannerProps) {
  const modeSentence =
    pricingMode === 'labor_and_material'
      ? 'This bid includes catalog material units and install labor on each line, then company markup/tax/burden in the engine.'
      : pricingMode === 'labor_only'
        ? 'This bid is labor-led: line dollars emphasize install; material columns stay out of the way.'
        : pricingMode === 'material_with_optional_install_quote'
          ? 'This bid is material-led; install labor is tracked for a companion quote that is billed separately.'
          : 'This bid is material-led: line dollars emphasize material; companion install labor is separated where applicable.';

  return (
    <section className="rounded-xl border border-slate-200/90 bg-gradient-to-b from-slate-50/95 to-white px-3 py-3 text-[11px] text-slate-700 shadow-sm sm:px-4">
      <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-start 2xl:justify-between 2xl:gap-6">
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">What is in this estimate</p>
          <p className="leading-snug text-slate-800">{modeSentence}</p>
          <p className="text-[10px] text-slate-600">
            Row <strong>Material $</strong> / <strong>Labor $</strong> are per-unit inputs feeding <strong>Unit sell</strong>;{' '}
            <strong>Add-ins</strong> are stacked modifiers from the library (flat adds, minutes, and optional % on base).
          </p>
        </div>
        <div className="min-w-0 shrink-0 rounded-lg border border-slate-200/80 bg-white/90 px-3 py-2.5 2xl:max-w-[26rem]">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Why labor and duration are trustworthy</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[10px] leading-snug text-slate-600">
            <li>
              Unit <strong>labor $</strong> comes from line <strong>install minutes</strong> × company rate{' '}
              <strong>{formatCurrencySafe(baseLaborRatePerHour)}/hr</strong>
              {Math.abs(laborCostMultiplier - 1) > 0.001 ? (
                <>
                  {' '}
                  × job-condition <strong>cost</strong> multiplier <strong>{formatNumberSafe(laborCostMultiplier, 2)}</strong> →{' '}
                  <strong>{formatCurrencySafe(effectiveLaborCostPerHour)}/hr</strong> effective on the grid.
                </>
              ) : (
                <> (no job-condition cost multiplier).</>
              )}
            </li>
            <li>
              Rolled-up <strong>{formatNumberSafe(totalLaborHours, 1)} hr</strong> extends minutes × qty across lines; calendar{' '}
              <strong>{formatNumberSafe(durationDays, 0)}</strong> day{durationDays === 1 ? '' : 's'} uses{' '}
              <strong>{formatNumberSafe(installerCount, 0)}</strong> installer{installerCount === 1 ? '' : 's'} and{' '}
              <strong>{formatNumberSafe(productiveCrewHoursPerDay, 1)}</strong> productive crew-hr/day (install capacity: paid day minus breaks and setup/cleanup, per installer, × crew).
              {Math.abs(laborHoursMultiplier - 1) > 0.001 ? (
                <> Schedule <strong>time</strong> multiplier ×{formatNumberSafe(laborHoursMultiplier, 2)} adjusts hours, separate from $/hr.</>
              ) : null}
            </li>
            <li>Field-crew suggestions elsewhere are advisory; pricing uses the Setup / job-condition math above.</li>
          </ul>
        </div>
        <div className="flex shrink-0 flex-col justify-center gap-0.5 rounded-lg border border-blue-200/70 bg-blue-50/50 px-3 py-2.5 text-right 2xl:min-w-[11rem]">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Loaded subtotals</p>
          <p className="text-[10px] text-slate-700">
            Mat <span className="font-semibold tabular-nums text-slate-900">{formatCurrencySafe(materialLoadedOrSubtotal)}</span>
          </p>
          <p className="text-[10px] text-slate-700">
            Labor <span className="font-semibold tabular-nums text-slate-900">{formatCurrencySafe(laborLoadedOrSubtotal)}</span>
          </p>
          <p className="mt-0.5 text-[10px] font-semibold text-slate-900">
            Bid <span className="tabular-nums">{formatCurrencySafe(baseBidTotal)}</span>
          </p>
        </div>
      </div>
    </section>
  );
}
