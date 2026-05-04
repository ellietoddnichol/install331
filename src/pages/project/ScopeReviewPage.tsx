import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Sparkles } from 'lucide-react';
import type { CatalogItem } from '../../types';
import type { PricingMode, RoomRecord, TakeoffLineRecord } from '../../shared/types/estimator';
import type { WorkspaceTab } from '../../shared/types/projectWorkflow';
import { listScopeExceptionLines } from '../../shared/utils/scopeReviewExceptions';
import type { ScopeLineException } from '../../shared/utils/scopeReviewExceptions';
import { classifyBidBucketKind, compareBidBucketKeys } from '../../shared/utils/intakeEstimateReview';
import type { BidBucketKind } from '../../shared/utils/intakeEstimateReview';
import { ImportSummaryCards } from '../../components/workflow/ImportSummaryCards';
import { EstimateTable } from '../../components/workflow/EstimateTable';
import { StatusChip } from '../../components/workflow/StatusChip';
import {
  attentionActionHeadline,
  buildCatalogById,
  catalogMatchSummary,
  confidenceLabel,
  partitionLinesByException,
  scopeReviewBucketLabel,
  scopeReviewOriginalLineText,
  sourceTypeLabel,
} from '../../shared/utils/scopeReviewPresentation.ts';

interface ScopeReviewPageProps {
  lines: TakeoffLineRecord[];
  rooms: RoomRecord[];
  categories: string[];
  roomNamesById: Record<string, string>;
  /** Catalog for “suggested match” copy on each row. */
  catalog: CatalogItem[];
  pricingMode: PricingMode;
  laborMultiplier: number;
  selectedLineId: string | null;
  onSelectLine: (lineId: string) => void;
  onPersistLine: (lineId: string, updates: Partial<TakeoffLineRecord>) => void;
  onDeleteLine: (lineId: string) => void;
  setActiveTab: (tab: WorkspaceTab) => void;
  onOpenLineInEstimate: (lineId: string) => void;
}

function exceptionKindChips(ex: ScopeLineException) {
  return (
    <div className="flex flex-wrap gap-1">
      {ex.kinds.includes('no_catalog_match') ? <StatusChip tone="warn">Catalog</StatusChip> : null}
      {ex.kinds.includes('zero_qty') ? <StatusChip tone="error">Qty</StatusChip> : null}
      {ex.kinds.includes('uncategorized') ? <StatusChip tone="warn">Category</StatusChip> : null}
      {ex.kinds.includes('missing_description') ? <StatusChip tone="error">Description</StatusChip> : null}
    </div>
  );
}

export function ScopeReviewPage({
  lines,
  rooms,
  categories,
  roomNamesById,
  catalog,
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
  const catalogById = useMemo(() => buildCatalogById(catalog), [catalog]);
  const { trusted } = useMemo(() => partitionLinesByException(lines, exceptions), [lines, exceptions]);

  /**
   * Phase 1.5 — sub-group exception rows (and trusted rows) by intake-derived bid bucket so
   * estimators see Base Bid vs Alt 1 vs Deduct as separate sections, matching intake review.
   * Only render bucket headers when more than one bucket exists — a single-bucket project
   * should not gain chrome it doesn't need.
   */
  const exceptionGroups = useMemo(() => {
    const groups = new Map<string, {
      key: string;
      label: string;
      kind: BidBucketKind;
      exceptions: ScopeLineException[];
    }>();
    exceptions.forEach((ex) => {
      const line = linesById.get(ex.lineId);
      const rawBucket = line?.sourceBidBucket?.trim() || '';
      const key = rawBucket || '__unbucketed__';
      const label = rawBucket || 'Unbucketed';
      const kind = classifyBidBucketKind(rawBucket || null);
      if (!groups.has(key)) groups.set(key, { key, label, kind, exceptions: [] });
      groups.get(key)!.exceptions.push(ex);
    });
    return Array.from(groups.values()).sort(compareBidBucketKeys);
  }, [exceptions, linesById]);

  const trustedGroups = useMemo(() => {
    const groups = new Map<string, {
      key: string;
      label: string;
      kind: BidBucketKind;
      lines: TakeoffLineRecord[];
    }>();
    trusted.forEach((line) => {
      const rawBucket = line.sourceBidBucket?.trim() || '';
      const key = rawBucket || '__unbucketed__';
      const label = rawBucket || 'Unbucketed';
      const kind = classifyBidBucketKind(rawBucket || null);
      if (!groups.has(key)) groups.set(key, { key, label, kind, lines: [] });
      groups.get(key)!.lines.push(line);
    });
    return Array.from(groups.values()).sort(compareBidBucketKeys);
  }, [trusted]);

  const bidBucketTone = (kind: BidBucketKind): string => {
    switch (kind) {
      case 'base':
        return 'bg-emerald-50 text-emerald-900 ring-emerald-100/90';
      case 'alternate':
        return 'bg-indigo-50 text-indigo-900 ring-indigo-100/90';
      case 'deduct':
        return 'bg-rose-50 text-rose-900 ring-rose-100/90';
      case 'allowance':
        return 'bg-sky-50 text-sky-900 ring-sky-100/90';
      case 'unit_price':
        return 'bg-amber-50 text-amber-900 ring-amber-100/90';
      default:
        return 'bg-slate-100 text-slate-700 ring-slate-200/80';
    }
  };

  const [reviewScope, setReviewScope] = useState<'exceptions' | 'full_project'>('exceptions');
  const [trustedExpanded, setTrustedExpanded] = useState(false);
  const [showFullGrid, setShowFullGrid] = useState(false);

  const hasExceptions = exceptions.length > 0;

  useEffect(() => {
    if (!hasExceptions && trusted.length > 0) setTrustedExpanded(true);
  }, [hasExceptions, trusted.length]);

  return (
    <div className="mx-auto max-w-[1600px] space-y-5">
      <header className="rounded-2xl border border-slate-200/80 bg-white px-5 py-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <span className={`ui-mono-chip ${hasExceptions ? 'ui-mono-chip--warn' : 'ui-mono-chip--ok'}`}>
                {hasExceptions ? 'Action Required' : 'Ready'}
              </span>
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                Module 02 <span className="mx-1 text-slate-300">/</span> Scope Review
              </span>
            </div>
            <h2 className="mt-1.5 text-[22px] font-semibold leading-tight tracking-tight text-slate-950">Exceptions first</h2>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.06em] text-slate-500">
              {hasExceptions
                ? `${exceptions.length} line${exceptions.length === 1 ? '' : 's'} need review · ${trusted.length} trusted`
                : `${trusted.length} trusted · nothing flagged`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('estimate')}
            className="ui-btn-cta shrink-0"
          >
            Open Estimate
          </button>
        </div>
        <div className="mt-5">
          <ImportSummaryCards totalLines={lines.length} exceptionCount={exceptions.length} roomCount={rooms.length} />
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">View</span>
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50/80 p-0.5">
            <button
              type="button"
              onClick={() => setReviewScope('exceptions')}
              className={`rounded-md px-3 py-1.5 text-[11px] font-semibold transition ${
                reviewScope === 'exceptions' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Action items first
            </button>
            <button
              type="button"
              onClick={() => {
                setReviewScope('full_project');
                setTrustedExpanded(true);
              }}
              className={`rounded-md px-3 py-1.5 text-[11px] font-semibold transition ${
                reviewScope === 'full_project' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Whole project
            </button>
          </div>
        </div>
      </header>

      {hasExceptions ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Needs attention</h3>
              <p className="text-[11px] text-slate-500">
                {exceptions.length} line{exceptions.length === 1 ? '' : 's'} — expand for rationale
                {exceptionGroups.length > 1 ? ` · grouped by bid split (${exceptionGroups.length})` : ''}
              </p>
            </div>
          </div>
          {(exceptionGroups.length > 1 ? exceptionGroups : [{ key: '__all__', label: '', kind: 'base' as BidBucketKind, exceptions }]).map((group) => (
          <div key={group.key} className={exceptionGroups.length > 1 ? 'space-y-2' : ''}>
            {exceptionGroups.length > 1 ? (
              <div className="flex items-baseline gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${bidBucketTone(group.kind)}`}>
                  {group.label}
                </span>
                <span className="text-[10px] font-medium text-slate-500">
                  {group.exceptions.length} line{group.exceptions.length === 1 ? '' : 's'}
                </span>
              </div>
            ) : null}
          <ul className="space-y-2">
            {group.exceptions.map((ex) => {
              const line = linesById.get(ex.lineId);
              if (!line) return null;
              const roomLabel = roomNamesById[line.roomId] || 'Unassigned';
              const bucket = scopeReviewBucketLabel(line);
              const matchSummary = catalogMatchSummary(line, catalogById);
              const conf = confidenceLabel(line, true);
              const originalText = scopeReviewOriginalLineText(line);
              const actionLine = attentionActionHeadline(ex, line);
              return (
                <li
                  key={ex.lineId}
                  className="overflow-hidden rounded-xl border border-amber-200/80 bg-gradient-to-b from-amber-50/50 to-white shadow-sm ring-1 ring-amber-100/80"
                >
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-3.5 marker:content-none [&::-webkit-details-marker]:hidden">
                      <ChevronRight
                        className="mt-1 h-4 w-4 shrink-0 text-amber-700 transition-transform group-open:rotate-90"
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1 text-left">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-950">
                            Action
                          </span>
                          <span className="text-[10px] font-medium text-slate-500">
                            {roomLabel} · {sourceTypeLabel(line)} · Qty{' '}
                            <span className="tabular-nums text-slate-700">{line.qty}</span> {line.unit}
                          </span>
                        </div>
                        <div className="grid gap-2 border-t border-amber-100/80 pt-2 sm:grid-cols-2 lg:grid-cols-5 lg:gap-x-3">
                          <div className="min-w-0 lg:col-span-1">
                            <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Original line</p>
                            <p className="mt-0.5 text-xs font-semibold leading-snug text-slate-950 line-clamp-3" title={originalText}>
                              {originalText}
                            </p>
                          </div>
                          <div className="min-w-0 lg:col-span-1">
                            <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Catalog match</p>
                            <p className="mt-0.5 text-xs leading-snug text-slate-800 line-clamp-3" title={matchSummary}>
                              {matchSummary}
                            </p>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Scope bucket</p>
                            <p className="mt-0.5 text-xs font-medium text-slate-800">{bucket}</p>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Confidence</p>
                            <p className="mt-0.5">
                              <span className="inline-flex rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-800 ring-1 ring-slate-200/90">
                                {conf}
                              </span>
                            </p>
                          </div>
                          <div className="min-w-0 sm:col-span-2 lg:col-span-1">
                            <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Status / next step</p>
                            <p className="mt-0.5 text-xs font-medium leading-snug text-amber-950">{actionLine}</p>
                          </div>
                        </div>
                        <div className="mt-2">{exceptionKindChips(ex)}</div>
                      </div>
                    </summary>
                    <div className="space-y-3 border-t border-amber-100/90 bg-white/80 px-4 py-3.5">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Why this row is flagged</p>
                        <p className="mt-1 text-sm leading-relaxed text-slate-800">{ex.summary}</p>
                      </div>
                      {line.notes ? (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Line notes</p>
                          <p className="mt-1 text-xs leading-relaxed text-slate-600">{line.notes}</p>
                        </div>
                      ) : null}
                      {line.modifierNames && line.modifierNames.length > 0 ? (
                        <p className="text-xs text-slate-600">
                          <span className="font-semibold text-slate-800">Modifiers:</span> {line.modifierNames.join(', ')}
                        </p>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => onOpenLineInEstimate(ex.lineId)}
                          className="ui-btn-primary h-9 px-4 text-[11px] font-semibold"
                        >
                          Open in estimate
                        </button>
                      </div>
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
          </div>
          ))}
        </section>
      ) : (
        <div className="flex flex-col gap-3 rounded-xl border border-emerald-200/80 bg-emerald-50/40 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-emerald-950">Import checks passed for every line.</p>
            <p className="mt-0.5 text-xs text-emerald-900/90">Quantities, categories, and catalog links look consistent.</p>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('estimate')}
            className="ui-btn-primary h-9 shrink-0 self-start rounded-full px-4 text-[11px] font-semibold sm:self-center"
          >
            Continue to estimate
          </button>
        </div>
      )}

      {trusted.length > 0 ? (
        <section
          className={`rounded-xl border px-3 py-3 ${
            hasExceptions ? 'border-slate-200/60 bg-slate-50/35' : 'border-slate-200/70 bg-white/90'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">Looks good</p>
              <p className="text-xs text-slate-500">
                <span className="font-medium text-slate-600">{trusted.length}</span> line{trusted.length === 1 ? '' : 's'} passed import checks
                {hasExceptions ? ' — kept low so exceptions stay primary.' : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setTrustedExpanded((s) => !s)}
              className="text-[10px] font-medium text-slate-500 underline decoration-slate-300/80 underline-offset-2 hover:text-slate-700"
            >
              {trustedExpanded ? 'Hide' : 'Show'} compact list
            </button>
          </div>
          {trustedExpanded ? (
            <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200/80 bg-white">
              <table className="min-w-full text-left text-[12px]">
                <thead className="border-b border-slate-100 bg-slate-50/90 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Line</th>
                    <th className="px-3 py-2">Room</th>
                    <th className="px-3 py-2">Bucket</th>
                    <th className="px-3 py-2">Confidence</th>
                    <th className="px-3 py-2">Catalog match</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800">
                  {trustedGroups.map((group) => (
                    <React.Fragment key={group.key}>
                      {trustedGroups.length > 1 ? (
                        <tr className="bg-slate-50/90">
                          <td colSpan={7} className="px-3 py-1.5">
                            <div className="flex items-baseline gap-2">
                              <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ring-1 ${bidBucketTone(group.kind)}`}>
                                {group.label}
                              </span>
                              <span className="text-[10px] font-medium text-slate-500">
                                {group.lines.length} line{group.lines.length === 1 ? '' : 's'}
                              </span>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                      {group.lines.map((line) => (
                        <tr key={line.id} className="hover:bg-slate-50/60">
                          <td className="max-w-[min(28rem,40vw)] px-3 py-2 font-medium text-slate-900">
                            <span className="line-clamp-2">{line.description}</span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-slate-600">{roomNamesById[line.roomId] || '—'}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-slate-600">{scopeReviewBucketLabel(line)}</td>
                          <td className="whitespace-nowrap px-3 py-2">
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-900 ring-1 ring-emerald-100">
                              {confidenceLabel(line, false)}
                            </span>
                          </td>
                          <td className="max-w-[14rem] px-3 py-2 text-slate-600">
                            <span className="line-clamp-2">{catalogMatchSummary(line, catalogById)}</span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-700">
                            {line.qty} {line.unit}
                          </td>
                          <td className="px-2 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => onOpenLineInEstimate(line.id)}
                              className="text-[10px] font-semibold text-blue-700 hover:text-blue-900"
                            >
                              Open
                            </button>
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}

      <aside className="flex gap-2 rounded-lg border border-dashed border-slate-200/90 bg-slate-50/30 px-3 py-2 text-[11px] leading-snug text-slate-500">
        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
        <p>
          <span className="font-medium text-slate-600">Div 10 Brain (advisory):</span> import checks above; open a line in Estimate for AI match / modifier hints.
        </p>
      </aside>

      <section className="space-y-2 border-t border-slate-200/80 pt-4">
        <button
          type="button"
          onClick={() => setShowFullGrid((s) => !s)}
          className="text-[11px] font-semibold text-blue-800 underline decoration-slate-300 underline-offset-2 hover:text-blue-950"
        >
          {showFullGrid ? 'Hide full editable grid' : `Show full editable grid (${lines.length} lines)`}
        </button>
        {showFullGrid ? (
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
