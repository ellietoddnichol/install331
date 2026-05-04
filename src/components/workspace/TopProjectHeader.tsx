import React from 'react';
import { FileDown, Save, Send, Trash2 } from 'lucide-react';
import { ProjectRecord } from '../../shared/types/estimator';
import { formatCurrencySafe, formatNumberSafe } from '../../utils/numberFormat';

interface Props {
  project: ProjectRecord;
  baseBidTotal: number;
  /** Total estimated install hours across the project. Drives the LABOR COMMITMENT stat. */
  totalLaborHours?: number;
  /** Count of priced scope items. Drives the ACTIVE SCOPE ITEMS stat. */
  scopeLineCount?: number;
  /** Count of active rooms / bid buckets. Drives the ENTRIES stat. */
  roomCount?: number;
  /** Max reasonable labor hours for the project — if totalLaborHours exceeds this the WITHIN LIMIT chip flips. */
  laborHoursLimit?: number;
  syncState: 'idle' | 'syncing' | 'ok' | 'error';
  lastSavedAt: string | null;
  onSave: () => Promise<void> | void;
  onExport: () => void;
  onSubmitBid: () => Promise<void> | void;
  onDeleteProject: () => Promise<void> | void;
  statusActionLabel: string;
}

/**
 * Workstation-style project header.
 *
 * Layout (top → bottom):
 *   1. LIVE breadcrumb strip: pulsing dot + "BRIGHTEN BUILDERS / ESTIMATOR STATION"
 *   2. Title row: sans project name + mono-italic subtitle, plus READY / SYNC /
 *      EXPORT DOCUMENT / SAVE / SUBMIT / DELETE controls on the right.
 *   3. Stat strip: ESTIMATED VALUATION, LABOR COMMITMENT (+ WITHIN LIMIT chip),
 *      ACTIVE SCOPE ITEMS, ENTRIES.
 *
 * The component is purely presentational — all data is passed in by the caller.
 */
export function TopProjectHeader({
  project,
  baseBidTotal,
  totalLaborHours = 0,
  scopeLineCount = 0,
  roomCount = 0,
  laborHoursLimit = 4000,
  syncState,
  lastSavedAt,
  onSave,
  onExport,
  onSubmitBid,
  onDeleteProject,
  statusActionLabel,
}: Props) {
  const readyChipClass =
    syncState === 'error'
      ? 'ui-mono-chip ui-mono-chip--danger'
      : syncState === 'syncing'
        ? 'ui-mono-chip ui-mono-chip--info'
        : 'ui-mono-chip ui-mono-chip--ok';
  const readyChipLabel =
    syncState === 'error' ? 'SAVE ERROR' : syncState === 'syncing' ? 'SAVING' : 'READY';

  const syncLabel = lastSavedAt
    ? `SYNC ${new Date(lastSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}`
    : 'SYNC —';

  const laborWithinLimit = totalLaborHours > 0 && totalLaborHours <= laborHoursLimit;
  const scopeCountLabel = String(scopeLineCount).padStart(2, '0');
  const entriesLabel = String(Math.max(roomCount, 0)).padStart(2, '0');

  const subtitle = project.clientName || 'No client assigned';
  const subtitleSuffix = project.generalContractor ? ` · GC ${project.generalContractor}` : '';

  return (
    <header
      className="workspace-top-header sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 px-4 py-3 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-white/90 print:hidden md:px-6 md:py-4"
    >
      {/* Row 1 — LIVE breadcrumb */}
      <div className="flex items-center gap-2.5 text-[10px]">
        <span className="ui-status-live">LIVE</span>
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
          Brighten Builders <span className="mx-1 text-slate-300">/</span> Estimator Station
        </span>
      </div>

      {/* Row 2 — title + controls */}
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[22px] font-semibold leading-tight tracking-tight text-slate-950 md:text-[26px]">
            {project.projectName}
            {project.projectNumber ? (
              <span className="ml-2 align-middle font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-slate-400">
                #{project.projectNumber}
              </span>
            ) : null}
          </h1>
          <p className="mt-1 font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-slate-500">
            {subtitle}
            {subtitleSuffix}
            {project.estimator ? (
              <span className="ml-2 text-slate-400">· EST {project.estimator}</span>
            ) : null}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className={readyChipClass}>{readyChipLabel}</span>
          <span className="hidden font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500 md:inline">
            {syncLabel}
          </span>
          <div className="hidden items-center gap-1 rounded-md border border-slate-200 bg-white p-0.5 md:flex">
            <button
              type="button"
              onClick={() => onSave()}
              className="inline-flex h-8 items-center gap-1 rounded-[5px] px-2.5 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/40"
              title="Save project"
            >
              <Save className="h-3.5 w-3.5" /> Save
            </button>
            <button
              type="button"
              onClick={() => onDeleteProject()}
              className="inline-flex h-8 items-center gap-1 rounded-[5px] px-2.5 text-[11px] font-medium text-rose-600 transition-colors hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/50"
              title="Delete project"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          </div>
          <button
            type="button"
            onClick={onExport}
            className="ui-btn-cta"
            title="Downloads an HTML file you can open in a browser. Use Print → Save as PDF for a PDF."
          >
            <FileDown className="mr-1.5 h-3.5 w-3.5" />
            Export Document
          </button>
          <button
            type="button"
            onClick={() => onSubmitBid()}
            className="ui-btn-primary h-10 rounded-md px-3 text-[11px] font-semibold uppercase tracking-[0.06em]"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            <Send className="mr-1.5 h-3.5 w-3.5" /> {statusActionLabel}
          </button>
        </div>
      </div>

      {/* Row 3 — stat strip */}
      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 border-t border-slate-200 pt-2.5 md:grid-cols-4">
        <StatCell label="Estimated Valuation" value={formatCurrencySafe(baseBidTotal)} />
        <StatCell
          label="Labor Commitment"
          value={`${formatNumberSafe(totalLaborHours, 1)} HRS`}
          trailing={
            totalLaborHours > 0 ? (
              <span className={`ui-mono-chip ${laborWithinLimit ? 'ui-mono-chip--ok' : 'ui-mono-chip--warn'}`}>
                {laborWithinLimit ? 'Within Limit' : 'Review'}
              </span>
            ) : null
          }
        />
        <StatCell label="Active Scope Items" value={`${scopeCountLabel} Lines`} />
        <StatCell label="Entries" value={`${entriesLabel} Rooms`} />
      </div>
    </header>
  );
}

function StatCell({
  label,
  value,
  trailing,
}: {
  label: string;
  value: string;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-baseline gap-2">
      <p className="ui-mono-kicker whitespace-nowrap">{label}</p>
      <p className="ui-mono-stat truncate">{value}</p>
      {trailing}
    </div>
  );
}
