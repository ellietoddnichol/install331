import React, { useEffect, useMemo, useState } from 'react';
import { LayoutGrid, X } from 'lucide-react';
import type { RoomRecord } from '../../shared/types/estimator';
import {
  DEFAULT_PARTITION_LAYOUT_BUILDER_INPUT,
  PARTITION_ESTIMATING_HELP,
  PARTITION_MATERIAL_SYSTEMS,
  type PartitionLayoutBuilderInput,
  type PartitionLayoutGeneratedLine,
  type PartitionMaterialSystemKey,
  type PartitionLayoutShape,
  type PartitionHardwareMode,
  buildPartitionLayoutLines,
  countPartitionCompartments,
  previewPilasterCount,
} from '../../shared/utils/partitionLayoutBuilder';
import { attachBestEffortCatalogMatches } from '../../shared/utils/partitionLayoutCatalogEnrichment';
import { api } from '../../services/api';

interface Props {
  open: boolean;
  rooms: RoomRecord[];
  activeRoomId: string;
  onClose: () => void;
  onAddLines: (roomId: string, lines: PartitionLayoutGeneratedLine[]) => Promise<void>;
}

const SHAPE_OPTIONS: { value: PartitionLayoutShape; label: string }[] = [
  { value: 'unspecified', label: 'Not set' },
  { value: 'linear', label: 'Linear (single run)' },
  { value: 'l_shape', label: 'L-shape' },
  { value: 'u_shape', label: 'U-shape' },
];

const HARDWARE_MODES: { value: PartitionHardwareMode; label: string }[] = [
  { value: 'per_door', label: 'Per door (discrete kit)' },
  { value: 'continuous_hinge', label: 'Continuous hinge / pivot' },
];

export function PartitionLayoutBuilderModal({ open, rooms, activeRoomId, onClose, onAddLines }: Props) {
  const [roomId, setRoomId] = useState('');
  const [standardStalls, setStandardStalls] = useState(3);
  const [adaStalls, setAdaStalls] = useState(1);
  const [materialSystem, setMaterialSystem] = useState<PartitionMaterialSystemKey>('toilet_partition_hdpe');
  const [includeHardwareKits, setIncludeHardwareKits] = useState(true);
  const [hardwareMode, setHardwareMode] = useState<PartitionHardwareMode>('per_door');
  const [includeHeadrailPlaceholder, setIncludeHeadrailPlaceholder] = useState(false);
  const [layoutShape, setLayoutShape] = useState<PartitionLayoutShape>('linear');
  const [lLegA, setLLegA] = useState(0);
  const [lLegB, setLLegB] = useState(0);
  const [uLegA, setULegA] = useState(0);
  const [uLegB, setULegB] = useState(0);
  const [uLegC, setULegC] = useState(0);
  const [includePilasterLine, setIncludePilasterLine] = useState(false);
  const [includeAdaAccessoryPackage, setIncludeAdaAccessoryPackage] = useState(true);
  const [adaPackageGrabBars, setAdaPackageGrabBars] = useState(true);
  const [adaPackageToiletTissue, setAdaPackageToiletTissue] = useState(true);
  const [adaPackageSoap, setAdaPackageSoap] = useState(true);
  const [autoLinkCatalog, setAutoLinkCatalog] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRoomId(activeRoomId || rooms[0]?.id || '');
  }, [open, activeRoomId, rooms]);

  const input: PartitionLayoutBuilderInput = useMemo(
    () => ({
      ...DEFAULT_PARTITION_LAYOUT_BUILDER_INPUT,
      standardStalls,
      adaStalls,
      materialSystem,
      includeHardwareKits,
      hardwareMode,
      includeHeadrailPlaceholder,
      layoutShape,
      lLegA,
      lLegB,
      uLegA,
      uLegB,
      uLegC,
      includePilasterLine,
      includeAdaAccessoryPackage,
      adaPackageGrabBars,
      adaPackageToiletTissue,
      adaPackageSoap,
    }),
    [
      standardStalls,
      adaStalls,
      materialSystem,
      includeHardwareKits,
      hardwareMode,
      includeHeadrailPlaceholder,
      layoutShape,
      lLegA,
      lLegB,
      uLegA,
      uLegB,
      uLegC,
      includePilasterLine,
      includeAdaAccessoryPackage,
      adaPackageGrabBars,
      adaPackageToiletTissue,
      adaPackageSoap,
    ]
  );

  const preview = useMemo(() => buildPartitionLayoutLines(input), [input]);
  const totalCompartments = useMemo(() => countPartitionCompartments(input), [input]);
  const pilasterPreview = useMemo(() => previewPilasterCount(input), [input]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!roomId || preview.length === 0) return;
    setBusy(true);
    try {
      let plan = buildPartitionLayoutLines(input);
      if (autoLinkCatalog) {
        plan = await attachBestEffortCatalogMatches(plan, materialSystem, (q, category) =>
          api.searchCatalogItems({ query: q, category })
        );
      }
      await onAddLines(roomId, plan);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-labelledby="partition-builder-title">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <div className="min-w-0">
            <h2 id="partition-builder-title" className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <LayoutGrid className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
              Partition layout builder
            </h2>
            <p className="mt-0.5 text-xs text-slate-600">Generate takeoff lines from layout, compartment counts, material system, and optional catalog matching.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 px-4 py-3 text-xs text-slate-800">
          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Add lines to room</span>
            <select className="ui-input mt-1 h-9 w-full" value={roomId} onChange={(e) => setRoomId(e.target.value)} required>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.roomName}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Standard WC stalls</span>
              <input
                type="number"
                min={0}
                className="ui-input mt-1 h-9 w-full tabular-nums"
                value={standardStalls}
                onChange={(e) => setStandardStalls(Number(e.target.value) || 0)}
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">ADA WC stalls</span>
              <input
                type="number"
                min={0}
                className="ui-input mt-1 h-9 w-full tabular-nums"
                value={adaStalls}
                onChange={(e) => setAdaStalls(Number(e.target.value) || 0)}
              />
            </label>
          </div>

          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Material system (install time)</span>
            <select className="ui-input mt-1 h-9 w-full" value={materialSystem} onChange={(e) => setMaterialSystem(e.target.value as PartitionMaterialSystemKey)}>
              {PARTITION_MATERIAL_SYSTEMS.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label} (~{m.defaultMinutesPerCompartment} min/EA)
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Layout (pilaster heuristic)</span>
              <select className="ui-input mt-1 h-9 w-full" value={layoutShape} onChange={(e) => setLayoutShape(e.target.value as PartitionLayoutShape)}>
                {SHAPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-1.5 text-[11px] leading-snug text-slate-700">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Pilaster estimate (all stalls)</p>
              {totalCompartments === 0 ? (
                <p className="mt-0.5 text-amber-800">Add stalls to estimate pilasters.</p>
              ) : (
                <>
                  {pilasterPreview.count > 0 ? (
                    <p className="mt-0.5">
                      <span className="font-semibold tabular-nums text-slate-900">{pilasterPreview.count}</span> pilasters — {pilasterPreview.formula}
                    </p>
                  ) : (
                    <p className="mt-0.5">{pilasterPreview.formula}</p>
                  )}
                </>
              )}
            </div>
          </div>

          {layoutShape === 'l_shape' ? (
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">L leg A (stalls)</span>
                <input
                  type="number"
                  min={0}
                  className="ui-input mt-1 h-9 w-full tabular-nums"
                  value={lLegA}
                  onChange={(e) => setLLegA(Number(e.target.value) || 0)}
                />
              </label>
              <label className="block">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">L leg B (stalls)</span>
                <input
                  type="number"
                  min={0}
                  className="ui-input mt-1 h-9 w-full tabular-nums"
                  value={lLegB}
                  onChange={(e) => setLLegB(Number(e.target.value) || 0)}
                />
              </label>
            </div>
          ) : null}

          {layoutShape === 'u_shape' ? (
            <div className="grid grid-cols-3 gap-2">
              <label className="block">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">U leg A</span>
                <input
                  type="number"
                  min={0}
                  className="ui-input mt-1 h-9 w-full tabular-nums"
                  value={uLegA}
                  onChange={(e) => setULegA(Number(e.target.value) || 0)}
                />
              </label>
              <label className="block">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">U leg B</span>
                <input
                  type="number"
                  min={0}
                  className="ui-input mt-1 h-9 w-full tabular-nums"
                  value={uLegB}
                  onChange={(e) => setULegB(Number(e.target.value) || 0)}
                />
              </label>
              <label className="block">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">U leg C</span>
                <input
                  type="number"
                  min={0}
                  className="ui-input mt-1 h-9 w-full tabular-nums"
                  value={uLegC}
                  onChange={(e) => setULegC(Number(e.target.value) || 0)}
                />
              </label>
            </div>
          ) : null}

          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={includePilasterLine}
              onChange={(e) => setIncludePilasterLine(e.target.checked)}
              className="rounded border-slate-300"
            />
            <span>Include pilaster / vertical support line (when count &gt; 0 from layout above)</span>
          </label>

          <div className="space-y-1.5 border-t border-slate-200 pt-2">
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={includeHardwareKits} onChange={(e) => setIncludeHardwareKits(e.target.checked)} className="rounded border-slate-300" />
              <span>Include hardware line</span>
            </label>
            {includeHardwareKits ? (
              <label className="ml-5 block sm:ml-6">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Hardware type</span>
                <select className="ui-input mt-1 h-9 w-full" value={hardwareMode} onChange={(e) => setHardwareMode(e.target.value as PartitionHardwareMode)}>
                  {HARDWARE_MODES.map((h) => (
                    <option key={h.value} value={h.value}>
                      {h.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={includeHeadrailPlaceholder} onChange={(e) => setIncludeHeadrailPlaceholder(e.target.checked)} className="rounded border-slate-300" />
              <span>Include headrail / bracing reminder (LS placeholder, no labor minutes)</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={includeAdaAccessoryPackage}
                onChange={(e) => setIncludeAdaAccessoryPackage(e.target.checked)}
                className="rounded border-slate-300"
                disabled={adaStalls < 1}
              />
              <span>Suggest ADA accessory lines (grab / tissue / soap) per ADA WC count</span>
            </label>
            {includeAdaAccessoryPackage && adaStalls > 0 ? (
              <div className="ml-5 flex flex-col gap-1.5 sm:ml-6">
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="checkbox" checked={adaPackageGrabBars} onChange={(e) => setAdaPackageGrabBars(e.target.checked)} className="rounded border-slate-300" />
                  <span>36" + 42" grab bars (each / ADA WC)</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="checkbox" checked={adaPackageToiletTissue} onChange={(e) => setAdaPackageToiletTissue(e.target.checked)} className="rounded border-slate-300" />
                  <span>Toilet tissue dispenser</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="checkbox" checked={adaPackageSoap} onChange={(e) => setAdaPackageSoap(e.target.checked)} className="rounded border-slate-300" />
                  <span>Soap dispenser (placeholder; adjust if not in scope)</span>
                </label>
              </div>
            ) : null}
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={autoLinkCatalog} onChange={(e) => setAutoLinkCatalog(e.target.checked)} className="rounded border-slate-300" />
              <span>Auto-link first catalog match (Toilet Partitions / Accessories search)</span>
            </label>
          </div>

          <div className="rounded-lg border border-amber-200/80 bg-amber-50/80 p-2.5 text-[11px] leading-snug text-amber-950">
            <p className="font-semibold text-amber-900">How to read this for estimating</p>
            <p className="mt-1">{PARTITION_ESTIMATING_HELP.lead}</p>
            <p className="mt-1">{PARTITION_ESTIMATING_HELP.materials}</p>
            {includeHardwareKits ? <p className="mt-1">{PARTITION_ESTIMATING_HELP.hardware}</p> : null}
            {includePilasterLine ? <p className="mt-1">{PARTITION_ESTIMATING_HELP.pilaster}</p> : null}
            {includeHeadrailPlaceholder ? <p className="mt-1">{PARTITION_ESTIMATING_HELP.headrail}</p> : null}
            {includeAdaAccessoryPackage && adaStalls > 0 ? <p className="mt-1">{PARTITION_ESTIMATING_HELP.adaPackage}</p> : null}
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Preview ({totalCompartments} compartments + optional rows)</p>
            <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-[11px] text-slate-700">
              {preview.map((line) => (
                <li key={line.key}>
                  <span className="font-medium tabular-nums text-slate-900">{line.qty}</span> {line.unit} — {line.description}
                </li>
              ))}
            </ul>
            {preview.length === 0 ? <p className="mt-1 text-[11px] text-amber-800">Enter at least one standard or ADA stall.</p> : null}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 pt-3">
            <button type="button" onClick={onClose} className="ui-btn-secondary h-9 rounded-md px-3 text-xs font-medium">
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || preview.length === 0}
              className="ui-btn-primary h-9 rounded-md px-3 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'Adding…' : `Add ${preview.length} line${preview.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
