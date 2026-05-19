import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, FileDown, MoreHorizontal, Save, Send } from 'lucide-react';
import { ProjectRecord } from '../../shared/types/estimator';
import { projectDisplayTitle } from '../../shared/utils/projectDisplay';
import { formatCurrencySafe, formatNumberSafe } from '../../utils/numberFormat';

interface Props {
  project: ProjectRecord;
  sectionLabel: string;
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
  onBackToProjects: () => void;
  onSave: () => Promise<void> | void;
  onExport: () => void;
  onSubmitBid: () => Promise<void> | void;
  /** Opens typed delete confirmation — not shown on the main toolbar. */
  onRequestDelete?: () => void;
  statusActionLabel: string;
}

/**
 * Workstation-style project header.
 *
 * Layout (top → bottom):
 *   1. LIVE breadcrumb strip: pulsing dot + "BRIGHTEN BUILDERS / ESTIMATOR STATION"
 *   2. Title row: sans project name + mono-italic subtitle, plus READY / SYNC /
 *      EXPORT DOCUMENT / SAVE / SUBMIT controls on the right.
 *   3. Stat strip: ESTIMATED VALUATION, LABOR COMMITMENT (+ WITHIN LIMIT chip),
 *      ACTIVE SCOPE ITEMS, ENTRIES.
 *
 * The component is purely presentational — all data is passed in by the caller.
 */
export function TopProjectHeader({
  project,
  sectionLabel,
  baseBidTotal,
  totalLaborHours = 0,
  scopeLineCount = 0,
  roomCount = 0,
  laborHoursLimit = 4000,
  syncState,
  lastSavedAt,
  onBackToProjects,
  onSave,
  onExport,
  onSubmitBid,
  onRequestDelete,
  statusActionLabel,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
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
  const title = projectDisplayTitle(project.projectName);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [menuOpen]);

  return (
    <header
      className="workspace-top-header sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 px-4 py-3 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-white/90 print:hidden md:px-6 md:py-4"
    >
      <div className="flex items-center justify-between gap-2.5 text-[10px]">
        <div className="flex items-center gap-2.5">
          <span className="ui-status-live">Live</span>
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
            Project workspace <span className="mx-1 text-slate-300">/</span> {sectionLabel}
          </span>
        </div>
        <button
          type="button"
          onClick={onBackToProjects}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-600 hover:bg-slate-50"
        >
          <ChevronLeft className="h-3 w-3" /> All projects
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[22px] font-semibold leading-tight tracking-tight text-slate-950 md:text-[26px]">
            {title}
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
          </div>
          <button type="button" onClick={onExport} className="ui-btn-cta" title="Export document">
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
          {onRequestDelete ? (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                className="inline-flex h-10 items-center gap-1 rounded-md border border-slate-200 bg-white px-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-700 hover:bg-slate-50"
                aria-expanded={menuOpen}
                aria-haspopup="menu"
              >
                <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
                More
                <ChevronDown className={`h-3.5 w-3.5 transition ${menuOpen ? 'rotate-180' : ''}`} aria-hidden />
              </button>
              {menuOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 z-20 mt-1 min-w-[12rem] rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
                >
                  <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Danger zone
                  </p>
                  <button
                    type="button"
                    role="menuitem"
                    className="block w-full px-3 py-2 text-left text-sm font-medium text-rose-700 hover:bg-rose-50"
                    onClick={() => {
                      setMenuOpen(false);
                      onRequestDelete();
                    }}
                  >
                    Delete project…
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

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
