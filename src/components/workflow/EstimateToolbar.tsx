import React, { useEffect, useState } from 'react';
import { ArrowRight, LayoutList, Plus, Sparkles } from 'lucide-react';
import type { EstimateWorkspaceView } from '../../shared/types/projectWorkflow';
import type { RoomRecord } from '../../shared/types/estimator';
import { TAKEOFF_ALL_ROOMS } from '../../shared/constants/workspaceUi';
import { formatLaborDurationMinutes, formatNumberSafe } from '../../utils/numberFormat';

export interface EstimateToolbarBidBucketStat {
  /** Raw bid-bucket key as persisted on lines (e.g. "Base Bid", "Alt 1"). */
  key: string;
  kind: 'base' | 'alternate' | 'deduct' | 'allowance' | 'unit_price' | 'unbucketed' | 'other';
  lineCount: number;
  laborMinutes: number;
}

interface EstimateToolbarProps {
  view: EstimateWorkspaceView;
  onViewChange: (view: EstimateWorkspaceView) => void;
  takeoffRoomFilter: string;
  onTakeoffRoomFilterChange: (roomId: string) => void;
  rooms: RoomRecord[];
  lineCountForFilter: number;
  takeoffStats: { lineCount: number; totalQty: number; laborMinutes: number };
  onAddManualLine: () => void;
  onOpenCatalog: () => void;
  onOpenBundles: () => void;
  /** Toilet partition layout wizard (standard + ADA stalls → lines). */
  onOpenPartitionBuilder?: () => void;
  /** Open line detail / modifiers (add-ins) for the selected line. */
  onOpenLineAddIns?: () => void;
  canOpenLineAddIns?: boolean;
  /** Short label for the currently selected line (used in add-ins affordance). */
  selectedLineLabel?: string | null;
  activeRoomId: string;
  activeRoomLabel: string;
  /** Room that receives new catalog / bundle / manual lines (replaces left Rooms column). */
  onWorkingRoomChange: (roomId: string) => void;
  onOpenCreateRoom: () => void;
  /** Rename, duplicate, delete rooms (full list). */
  onOpenManageRooms: () => void;
  /** Project total when pricing view */
  projectTotal?: number;
  formatCurrency: (n: number | undefined) => string;
  disabledAdd?: boolean;
  /** Optional bid-split stats — only shown when > 1 bucket exists. Parity with intake review panel. */
  bidBucketStats?: EstimateToolbarBidBucketStat[];
}

export function EstimateToolbar({
  view,
  onViewChange,
  takeoffRoomFilter,
  onTakeoffRoomFilterChange,
  rooms,
  lineCountForFilter,
  takeoffStats,
  onAddManualLine,
  onOpenCatalog,
  onOpenBundles,
  onOpenPartitionBuilder,
  onOpenLineAddIns,
  canOpenLineAddIns,
  selectedLineLabel,
  activeRoomId,
  activeRoomLabel,
  onWorkingRoomChange,
  onOpenCreateRoom,
  onOpenManageRooms,
  projectTotal,
  formatCurrency,
  disabledAdd,
  bidBucketStats,
}: EstimateToolbarProps) {
  const bucketsWithData = (bidBucketStats ?? []).filter((b) => b.lineCount > 0);
  const showBidSplitStrip = bucketsWithData.length > 1;
  const bidBucketKindClass = (kind: EstimateToolbarBidBucketStat['kind']): string => {
    if (kind === 'base') return 'bg-emerald-50 text-emerald-900 ring-emerald-100/90';
    if (kind === 'alternate') return 'bg-indigo-50 text-indigo-900 ring-indigo-100/90';
    if (kind === 'deduct') return 'bg-rose-50 text-rose-900 ring-rose-100/90';
    if (kind === 'allowance') return 'bg-sky-50 text-sky-900 ring-sky-100/90';
    if (kind === 'unit_price') return 'bg-amber-50 text-amber-900 ring-amber-100/90';
    return 'bg-slate-100 text-slate-700 ring-slate-200/80';
  };
  const formatBucketMinutes = (m: number): string => {
    if (m >= 60) {
      const hrs = m / 60;
      return `${hrs.toFixed(hrs >= 10 ? 0 : 1)} h`;
    }
    return `${Math.round(m)} m`;
  };
  const [addInsGate, setAddInsGate] = useState(false);

  useEffect(() => {
    if (!addInsGate) return;
    const t = window.setTimeout(() => setAddInsGate(false), 4500);
    return () => window.clearTimeout(t);
  }, [addInsGate]);

  function handleAddInsClick() {
    if (!onOpenLineAddIns) return;
    if (!canOpenLineAddIns) {
      setAddInsGate(true);
      return;
    }
    onOpenLineAddIns();
  }

  return (
    <div className="space-y-2">
      <div className="ui-panel-muted px-3 py-2.5">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-900">Estimate</span>
            <div className="inline-flex rounded-lg border border-slate-200/90 bg-white p-0.5 shadow-sm">
              <button
                type="button"
                onClick={() => onViewChange('quantities')}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ${view === 'quantities' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                Quantities
              </button>
              <button
                type="button"
                onClick={() => onViewChange('pricing')}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ${view === 'pricing' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                Pricing
              </button>
            </div>
            {view === 'quantities' ? (
              <>
                <span className="hidden h-3 w-px bg-slate-200 lg:inline" aria-hidden />
                <span className="rounded-md border border-slate-200/90 bg-white px-2 py-0.5 text-[11px] font-medium tabular-nums text-slate-700">
                  {takeoffStats.lineCount} ln
                </span>
                <span className="rounded-md border border-slate-200/90 bg-white px-2 py-0.5 text-[11px] font-medium tabular-nums text-slate-700">
                  {formatNumberSafe(takeoffStats.totalQty, 1)} qty
                </span>
                <span className="rounded-md border border-slate-200/90 bg-white px-2 py-0.5 text-[11px] font-medium tabular-nums text-slate-700">
                  {formatLaborDurationMinutes(takeoffStats.laborMinutes)}
                </span>
              </>
            ) : projectTotal != null ? (
              <>
                <span className="hidden h-3 w-px bg-slate-200 lg:inline" aria-hidden />
                <span className="text-[11px] font-medium text-slate-600">
                  Project total <span className="font-semibold tabular-nums text-slate-900">{formatCurrency(projectTotal)}</span>
                </span>
              </>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            {view === 'pricing' ? (
              <button type="button" onClick={() => onViewChange('quantities')} className="ui-btn-secondary inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-xs font-semibold">
                Quantities <ArrowRight className="h-3 w-3" />
              </button>
            ) : null}
          </div>
        </div>
        {showBidSplitStrip ? (
          <div
            className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-slate-200/80 pt-2"
            title="Bid splits detected from intake. Each chip is a bucket the estimate tracks separately (base vs. alternates, deducts, allowances, etc.)."
          >
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Bid splits</span>
            {bucketsWithData.map((bucket) => (
              <span
                key={bucket.key}
                className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${bidBucketKindClass(bucket.kind)}`}
                title={`${bucket.key} · ${bucket.lineCount} line${bucket.lineCount === 1 ? '' : 's'} · ${formatBucketMinutes(bucket.laborMinutes)} install labor`}
              >
                <span>{bucket.key}</span>
                <span className="rounded bg-white/60 px-1 py-[1px] text-[9px] font-medium">
                  {bucket.lineCount} ln · {formatBucketMinutes(bucket.laborMinutes)}
                </span>
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="ui-panel-muted px-3 py-2.5">
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-end lg:gap-4">
          <label className="block min-w-0 flex-1 text-xs font-medium text-slate-700">
            <span className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Room for new lines</span>
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="ui-input h-9 min-w-[12rem] max-w-md flex-1 text-xs font-medium text-slate-900"
                value={activeRoomId}
                onChange={(e) => onWorkingRoomChange(e.target.value)}
                disabled={rooms.length === 0}
              >
                {rooms.length === 0 ? <option value="">No rooms yet</option> : null}
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.roomName}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={onOpenCreateRoom}
                className="ui-btn-secondary inline-flex h-9 shrink-0 items-center gap-1 rounded-md px-2.5 text-xs font-semibold"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Add room
              </button>
              <button
                type="button"
                onClick={onOpenManageRooms}
                className="ui-btn-secondary inline-flex h-9 shrink-0 items-center gap-1 rounded-md px-2.5 text-xs font-semibold"
              >
                <LayoutList className="h-3.5 w-3.5" aria-hidden />
                Manage rooms
              </button>
            </div>
            <p className="mt-1 text-[10px] leading-snug text-slate-500">
              Catalog, bundles, and manual lines are added to this room. Use Manage rooms to rename, duplicate, or delete.
            </p>
          </label>
          {view === 'quantities' ? (
            <label className="block min-w-0 flex-1 text-xs font-medium text-slate-700 lg:max-w-md">
              <span className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Takeoff view</span>
              <select
                className="ui-input h-9 w-full text-xs font-medium text-slate-900"
                value={takeoffRoomFilter}
                onChange={(e) => onTakeoffRoomFilterChange(e.target.value)}
              >
                <option value={TAKEOFF_ALL_ROOMS}>
                  All rooms ({lineCountForFilter} line{lineCountForFilter === 1 ? '' : 's'})
                </option>
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.roomName}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200/80 bg-white/90 px-2.5 py-2 shadow-sm">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Add scope items</p>
            <span className="text-[9px] font-semibold uppercase tracking-wide text-emerald-800">Creates rows</span>
          </div>
          <p className="mt-0.5 text-[10px] leading-snug text-slate-500">
            Adds new rows to {view === 'pricing' ? 'the estimate' : 'the takeoff'} (catalog picker, bundle, or typed line). Does not touch the selected row.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button type="button" onClick={onOpenCatalog} className="ui-btn-primary inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-xs font-semibold">
              Catalog
            </button>
            <button type="button" onClick={onOpenBundles} className="ui-btn-secondary h-8 rounded-md px-2.5 text-xs font-medium">
              Bundles
            </button>
            {onOpenPartitionBuilder ? (
              <button
                type="button"
                onClick={onOpenPartitionBuilder}
                className="ui-btn-secondary h-8 rounded-md px-2.5 text-xs font-medium"
                title="Build takeoff lines from standard and ADA stall counts"
              >
                Partitions
              </button>
            ) : null}
            <button
              type="button"
              onClick={onAddManualLine}
              disabled={disabledAdd || !activeRoomId}
              className="ui-btn-secondary inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Sparkles className="h-3 w-3" /> Add line
            </button>
          </div>
          <p className="mt-1.5 text-[10px] text-slate-500">
            New rows land in <span className="font-medium text-slate-700">{activeRoomLabel}</span>.
          </p>
        </div>
        <div className="rounded-lg border border-slate-200/60 bg-slate-50/80 px-2.5 py-2">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Line add-ins</p>
            <span className="text-[9px] font-semibold uppercase tracking-wide text-violet-800">Edits selected row</span>
          </div>
          <p className="mt-0.5 text-[10px] leading-snug text-slate-500">
            Does not add SKUs. Add-ins live in the right-rail lane on wide screens; this button opens the full line drawer for pricing, unit, and notes.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={handleAddInsClick}
              disabled={!onOpenLineAddIns}
              className="ui-btn-secondary h-8 rounded-md px-2.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50"
            >
              Modifiers and line detail
            </button>
            {selectedLineLabel ? (
              <span className="max-w-[16rem] truncate rounded-md border border-violet-200/70 bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-900" title={selectedLineLabel}>
                {selectedLineLabel}
              </span>
            ) : (
              <span className="rounded-md border border-slate-200/80 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-500">No row selected</span>
            )}
          </div>
          {addInsGate ? (
            <p className="mt-2 text-[10px] font-medium text-amber-900">Select a row in the grid, then open add-ins.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
