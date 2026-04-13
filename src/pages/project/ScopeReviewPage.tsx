import React, { useMemo, useState } from 'react';
import type { PricingMode, RoomRecord, TakeoffLineRecord } from '../../shared/types/estimator';
import type { WorkspaceTab } from '../../shared/types/projectWorkflow';
import { listScopeExceptionLines } from '../../shared/utils/scopeReviewExceptions';
import { ExceptionList } from '../../components/workflow/ExceptionList';
import { ImportSummaryCards } from '../../components/workflow/ImportSummaryCards';
import { EstimateTable } from '../../components/workflow/EstimateTable';

interface ScopeReviewPageProps {
  lines: TakeoffLineRecord[];
  rooms: RoomRecord[];
  categories: string[];
  roomNamesById: Record<string, string>;
  pricingMode: PricingMode;
  laborMultiplier: number;
  selectedLineId: string | null;
  onSelectLine: (lineId: string) => void;
  onPersistLine: (lineId: string, updates: Partial<TakeoffLineRecord>) => void;
  onDeleteLine: (lineId: string) => void;
  setActiveTab: (tab: WorkspaceTab) => void;
  onOpenLineInEstimate: (lineId: string) => void;
}

export function ScopeReviewPage({
  lines,
  rooms,
  categories,
  roomNamesById,
  pricingMode,
  laborMultiplier,
  selectedLineId,
  onSelectLine,
  onPersistLine,
  onDeleteLine,
  setActiveTab,
  onOpenLineInEstimate,
}: ScopeReviewPageProps) {
  const exceptions = useMemo(() => listScopeExceptionLines(lines), [lines]);
  const linesById = useMemo(() => new Map(lines.map((l) => [l.id, l])), [lines]);
  const [showAllLines, setShowAllLines] = useState(false);
  const hasExceptions = exceptions.length > 0;

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <header className="rounded-2xl border border-slate-200/80 bg-white px-5 py-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="ui-label">After import</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">Scope review</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              {hasExceptions
                ? 'Exception-first checklist for this project — fix issues here, then refine on the estimate.'
                : 'Quick import check. When there is nothing to fix, continue in the estimate — you can always come back.'}
            </p>
          </div>
          <button type="button" onClick={() => setActiveTab('estimate')} className="ui-btn-primary h-10 shrink-0 rounded-full px-5 text-[11px] font-semibold">
            Open estimate
          </button>
        </div>
        <div className="mt-5">
          <ImportSummaryCards totalLines={lines.length} exceptionCount={exceptions.length} roomCount={rooms.length} />
        </div>
      </header>

      {hasExceptions ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">Exceptions</h3>
            <span className="text-[11px] text-slate-500">{exceptions.length} need attention</span>
          </div>
          <ExceptionList exceptions={exceptions} linesById={linesById} onOpenLine={(id) => onOpenLineInEstimate(id)} />
        </section>
      ) : (
        <div className="flex flex-col gap-3 rounded-xl border border-emerald-200/80 bg-emerald-50/40 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-emerald-950">Import checked: no scope exceptions found.</p>
            <p className="mt-0.5 text-xs text-emerald-900/90">Quantities, categories, and catalog links look consistent for this pass.</p>
          </div>
          <button type="button" onClick={() => setActiveTab('estimate')} className="ui-btn-primary h-9 shrink-0 self-start rounded-full px-4 text-[11px] font-semibold sm:self-center">
            Continue to estimate
          </button>
        </div>
      )}

      <section className="space-y-3">
        <button
          type="button"
          onClick={() => setShowAllLines((s) => !s)}
          className="text-[11px] font-semibold text-blue-800 underline decoration-slate-300 underline-offset-2 hover:text-blue-950"
        >
          {showAllLines ? 'Hide full line list' : `Show all ${lines.length} lines`}
        </button>
        {showAllLines ? (
          <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
            <EstimateTable
              lines={lines}
              rooms={rooms}
              categories={categories}
              roomNamesById={roomNamesById}
              pricingMode={pricingMode}
              viewMode="takeoff"
              organizeBy="item"
              takeoffShowRoom
              laborMultiplier={laborMultiplier}
              selectedLineId={selectedLineId}
              onSelectLine={onSelectLine}
              onPersistLine={onPersistLine}
              onDeleteLine={onDeleteLine}
            />
          </div>
        ) : null}
      </section>
    </div>
  );
}
