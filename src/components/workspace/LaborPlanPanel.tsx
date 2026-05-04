import React from 'react';
import { AlertTriangle, Clock, Hammer, Users } from 'lucide-react';
import { formatCurrencySafe, formatNumberSafe } from '../../utils/numberFormat';

/**
 * Phase 2.1 — Labor Plan surface.
 *
 * This panel answers the "can you actually staff this?" question the estimator keeps
 * asking. It surfaces crew count, duration, productive hours per day, and total labor
 * hours as glanceable tiles, followed by the cost / time multipliers driving those
 * numbers, and a set of guardrail callouts when the plan implies an implausible
 * schedule (e.g. a lone installer working 4+ weeks).
 *
 * All math comes from `calculateEstimateSummary` + `jobConditions`. This surface is
 * presentation-only per `docs/estimating-workspace-overhaul-brief.md §8` — no formula
 * changes happen here.
 */
interface LaborPlanPanelProps {
  installerCount: number;
  productiveCrewHoursPerDay: number;
  totalLaborHours: number;
  durationDays: number;
  baseLaborRatePerHour: number;
  effectiveLaborCostPerHour: number;
  laborCostMultiplier: number;
  laborHoursMultiplier: number;
  /** Optional hint for narrative context; renders as a small footnote. */
  deliveryDifficulty?: 'standard' | 'difficult' | 'very_difficult' | string | null;
  siteAccess?: string | null;
  /** When true, renders a collapsed one-line summary (for top-of-grid). */
  compact?: boolean;
}

interface Guardrail {
  tone: 'warn' | 'info';
  title: string;
  body: string;
}

function collectGuardrails({
  installerCount,
  durationDays,
  totalLaborHours,
  productiveCrewHoursPerDay,
  laborCostMultiplier,
  laborHoursMultiplier,
}: LaborPlanPanelProps): Guardrail[] {
  const guardrails: Guardrail[] = [];
  if (installerCount <= 1 && durationDays > 10) {
    guardrails.push({
      tone: 'warn',
      title: 'Single installer over a long calendar window',
      body: `The plan is 1 installer for ${formatNumberSafe(durationDays, 0)} working days. That is ${formatNumberSafe(durationDays / 5, 1)} weeks of continuous solo work. Consider adding a second installer in Setup, or label this as "single-crew sequential" in the proposal so the schedule is transparent.`,
    });
  }
  if (installerCount <= 1 && totalLaborHours > 80) {
    guardrails.push({
      tone: 'warn',
      title: 'Single-installer labor hours look heavy',
      body: `Rolled-up labor is ${formatNumberSafe(totalLaborHours, 0)} hours for one installer. Check if the scope should be split across a crew or phased across visits.`,
    });
  }
  if (productiveCrewHoursPerDay > 0 && productiveCrewHoursPerDay < 4) {
    guardrails.push({
      tone: 'info',
      title: 'Low productive crew-hours per day',
      body: `Setup assumes ${formatNumberSafe(productiveCrewHoursPerDay, 1)} productive hours per day. If your typical productive day is higher, the duration estimate will stretch.`,
    });
  }
  if (laborCostMultiplier > 1.25 || laborCostMultiplier < 0.85) {
    guardrails.push({
      tone: 'info',
      title: 'Unusual labor cost multiplier',
      body: `Job conditions apply a ×${formatNumberSafe(laborCostMultiplier, 2)} multiplier to the labor rate. That will be visible in the per-unit labor $ on every line.`,
    });
  }
  if (laborHoursMultiplier > 1.25 || laborHoursMultiplier < 0.85) {
    guardrails.push({
      tone: 'info',
      title: 'Unusual labor hours multiplier',
      body: `Job conditions inflate labor hours by ×${formatNumberSafe(laborHoursMultiplier, 2)}. Duration in calendar days reflects this; per-unit labor $ does not.`,
    });
  }
  return guardrails;
}

export function LaborPlanPanel(props: LaborPlanPanelProps) {
  const {
    installerCount,
    productiveCrewHoursPerDay,
    totalLaborHours,
    durationDays,
    baseLaborRatePerHour,
    effectiveLaborCostPerHour,
    laborCostMultiplier,
    laborHoursMultiplier,
    deliveryDifficulty,
    siteAccess,
    compact,
  } = props;

  const guardrails = collectGuardrails(props);
  const hasCostMultiplier = Math.abs(laborCostMultiplier - 1) > 0.001;
  const hasHoursMultiplier = Math.abs(laborHoursMultiplier - 1) > 0.001;
  const crewLabel = installerCount <= 1 ? 'Solo installer' : `${installerCount} installer crew`;
  const scheduleLabel =
    installerCount <= 1 && durationDays > 10 ? 'Single-crew sequential' : `${formatNumberSafe(durationDays, 0)} working days`;

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-slate-200/80 bg-white/80 px-3 py-2 text-[11px] text-slate-700 shadow-sm">
        <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900">
          <Users className="h-3.5 w-3.5 text-slate-500" aria-hidden /> {crewLabel}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-slate-500" aria-hidden /> {scheduleLabel}
        </span>
        <span className="text-slate-600">
          {formatNumberSafe(totalLaborHours, 1)} hr total · {formatNumberSafe(productiveCrewHoursPerDay, 1)} hr/day productive
        </span>
        {guardrails.length > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-900 ring-1 ring-amber-100/90">
            <AlertTriangle className="h-3 w-3" aria-hidden /> {guardrails.length} check{guardrails.length === 1 ? '' : 's'}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200/90 bg-gradient-to-b from-slate-50/80 to-white px-3 py-3 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Labor plan</p>
          <h4 className="text-sm font-semibold tracking-tight text-slate-900">
            {crewLabel} · {scheduleLabel}
          </h4>
        </div>
        <p className="text-[10px] text-slate-500">Derived from Setup + job conditions · presentation only</p>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-lg bg-white px-3 py-2 shadow-sm ring-1 ring-slate-200/80">
          <p className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            <Users className="h-3 w-3" aria-hidden /> Crew size
          </p>
          <p className="mt-0.5 text-base font-semibold tabular-nums text-slate-900">{installerCount}</p>
          <p className="text-[10px] text-slate-500">installer{installerCount === 1 ? '' : 's'}</p>
        </div>
        <div className="rounded-lg bg-white px-3 py-2 shadow-sm ring-1 ring-slate-200/80">
          <p className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            <Clock className="h-3 w-3" aria-hidden /> Duration
          </p>
          <p className="mt-0.5 text-base font-semibold tabular-nums text-slate-900">{formatNumberSafe(durationDays, 0)}</p>
          <p className="text-[10px] text-slate-500">working day{durationDays === 1 ? '' : 's'}</p>
        </div>
        <div className="rounded-lg bg-white px-3 py-2 shadow-sm ring-1 ring-slate-200/80">
          <p className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            <Hammer className="h-3 w-3" aria-hidden /> Productive hr / day
          </p>
          <p className="mt-0.5 text-base font-semibold tabular-nums text-slate-900">{formatNumberSafe(productiveCrewHoursPerDay, 1)}</p>
          <p className="text-[10px] text-slate-500">crew-hours capacity</p>
        </div>
        <div className="rounded-lg bg-white px-3 py-2 shadow-sm ring-1 ring-slate-200/80">
          <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500">Total labor hours</p>
          <p className="mt-0.5 text-base font-semibold tabular-nums text-slate-900">{formatNumberSafe(totalLaborHours, 1)}</p>
          <p className="text-[10px] text-slate-500">minutes × qty, summed</p>
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-slate-200/80 bg-white px-3 py-2">
        <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500">Cost drivers</p>
        <ul className="mt-1 space-y-1 text-[11px] leading-snug text-slate-700">
          <li>
            Base rate <span className="font-semibold tabular-nums">{formatCurrencySafe(baseLaborRatePerHour)}/hr</span>
            {hasCostMultiplier ? (
              <>
                {' '}× job-condition ×<span className="font-semibold tabular-nums">{formatNumberSafe(laborCostMultiplier, 2)}</span> →{' '}
                <span className="font-semibold tabular-nums">{formatCurrencySafe(effectiveLaborCostPerHour)}/hr</span> effective.
              </>
            ) : (
              <> (no job-condition cost multiplier applied).</>
            )}
          </li>
          {hasHoursMultiplier ? (
            <li>
              Hours multiplier ×<span className="font-semibold tabular-nums">{formatNumberSafe(laborHoursMultiplier, 2)}</span> stretches calendar duration; it does not affect per-unit labor $.
            </li>
          ) : null}
          {deliveryDifficulty && deliveryDifficulty !== 'standard' ? (
            <li>Delivery difficulty: <span className="font-semibold capitalize">{String(deliveryDifficulty).replace(/_/g, ' ')}</span>.</li>
          ) : null}
          {siteAccess && siteAccess !== 'standard' ? (
            <li>Site access: <span className="font-semibold capitalize">{String(siteAccess).replace(/_/g, ' ')}</span>.</li>
          ) : null}
        </ul>
      </div>

      {guardrails.length > 0 ? (
        <div className="mt-3 space-y-1.5">
          {guardrails.map((g, idx) => (
            <div
              key={idx}
              className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-[11px] leading-snug ${
                g.tone === 'warn'
                  ? 'border-amber-200/80 bg-amber-50/70 text-amber-950'
                  : 'border-slate-200/80 bg-slate-50/80 text-slate-700'
              }`}
            >
              <AlertTriangle className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${g.tone === 'warn' ? 'text-amber-700' : 'text-slate-500'}`} aria-hidden />
              <div className="min-w-0">
                <p className="font-semibold">{g.title}</p>
                <p className="mt-0.5">{g.body}</p>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
