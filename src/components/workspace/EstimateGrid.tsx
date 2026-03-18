import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Layers3, Sparkles } from 'lucide-react';
import { RoomRecord, TakeoffLineRecord } from '../../shared/types/estimator';
import { formatCurrencySafe } from '../../utils/numberFormat';

interface Props {
  lines: TakeoffLineRecord[];
  rooms: RoomRecord[];
  categories: string[];
  roomNamesById: Record<string, string>;
  pricingMode: 'material_only' | 'labor_only' | 'labor_and_material';
  viewMode: 'takeoff' | 'estimate';
  laborMultiplier?: number;
  selectedLineId: string | null;
  onSelectLine: (lineId: string) => void;
  onPersistLine: (lineId: string, updates?: Partial<TakeoffLineRecord>) => Promise<void> | void;
  onDeleteLine: (lineId: string) => void;
}

export function EstimateGrid({ lines, rooms, categories, roomNamesById, pricingMode, viewMode, laborMultiplier = 1, selectedLineId, onSelectLine, onPersistLine, onDeleteLine }: Props) {
  const [collapsedBundles, setCollapsedBundles] = useState<Record<string, boolean>>({});
  const showMaterial = pricingMode !== 'labor_only';
  const showLabor = pricingMode !== 'material_only';
  const isTakeoffView = viewMode === 'takeoff';
  const columnCount = isTakeoffView ? 8 : 9 + (showLabor ? 1 : 0) + (showMaterial ? 1 : 0);

  const bundleMeta = useMemo(() => {
    const byBundle: Record<string, { count: number; subtotal: number; name: string }> = {};
    lines.forEach((line) => {
      if (!line.bundleId) return;
      if (!byBundle[line.bundleId]) {
        byBundle[line.bundleId] = {
          count: 0,
          subtotal: 0,
          name: line.notes?.trim() || line.category || 'Bundle',
        };
      }
      byBundle[line.bundleId].count += 1;
      byBundle[line.bundleId].subtotal += line.lineTotal;
    });
    return byBundle;
  }, [lines]);

  const sourceBadgeClass = (sourceType: string) => {
    const key = String(sourceType || '').toLowerCase();
    if (key.includes('bundle')) return 'bg-violet-50 text-violet-700 border-violet-200';
    if (key.includes('catalog')) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (key.includes('manual')) return 'bg-amber-50 text-amber-700 border-amber-200';
    if (key.includes('takeoff') || key.includes('parser')) return 'bg-sky-50 text-sky-700 border-sky-200';
    return 'bg-slate-100 text-slate-600 border-slate-200';
  };

  const rowAccentClass = (line: TakeoffLineRecord) => {
    if (line.bundleId) return 'border-l-violet-300';
    const key = String(line.sourceType || '').toLowerCase();
    if (key.includes('catalog')) return 'border-l-emerald-300';
    if (key.includes('manual')) return 'border-l-amber-300';
    if (key.includes('takeoff') || key.includes('parser')) return 'border-l-sky-300';
    return 'border-l-slate-200';
  };

  function stopRowEvent(event: React.SyntheticEvent) {
    event.stopPropagation();
  }

  return (
    <div className={`overflow-hidden rounded-[22px] border shadow-[0_18px_38px_rgba(15,23,42,0.06)] ${isTakeoffView ? 'border-amber-200/70 bg-[linear-gradient(180deg,#fffdfa_0%,#ffffff_100%)]' : 'border-slate-200/70 bg-[linear-gradient(180deg,#fbfcfe_0%,#ffffff_100%)]'}`}>
      <div className="overflow-y-auto max-h-[69vh]">
        <table className="w-full table-fixed text-xs">
          <thead className={`sticky top-0 z-10 border-b backdrop-blur ${isTakeoffView ? 'border-amber-200/70 bg-[linear-gradient(180deg,rgba(255,249,235,0.96)_0%,rgba(255,255,255,0.92)_100%)]' : 'border-slate-200/70 bg-[linear-gradient(180deg,rgba(245,248,252,0.96)_0%,rgba(255,255,255,0.92)_100%)]'}`}>
            <tr>
              <th className={`px-3 py-2 text-left text-[10px] font-semibold tracking-[0.03em] text-slate-500 ${isTakeoffView ? 'w-36' : 'w-30'}`}>Room</th>
              <th className={`px-3 py-2 text-left text-[10px] font-semibold tracking-[0.03em] text-slate-500 ${isTakeoffView ? 'w-26' : 'w-24'}`}>Category</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold tracking-[0.03em] text-slate-500">Item / Description</th>
              <th className="px-3 py-2 w-16 text-left text-[10px] font-semibold tracking-[0.03em] text-slate-500">Qty</th>
              <th className="px-3 py-2 w-14 text-left text-[10px] font-semibold tracking-[0.03em] text-slate-500">Unit</th>
              {isTakeoffView ? <th className="px-3 py-2 w-32 text-left text-[10px] font-semibold tracking-[0.03em] text-slate-500">Notes</th> : null}
              {isTakeoffView ? <th className="px-3 py-2 w-32 text-left text-[10px] font-semibold tracking-[0.03em] text-slate-500">Match / Source</th> : null}
              {!isTakeoffView && showLabor ? <th className="px-3 py-2 w-24 text-right text-[10px] font-semibold tracking-[0.03em] text-slate-500">Labor</th> : null}
              {!isTakeoffView && showMaterial ? <th className="px-3 py-2 w-24 text-right text-[10px] font-semibold tracking-[0.03em] text-slate-500">Material</th> : null}
              {!isTakeoffView ? <th className="px-3 py-2 w-24 text-right text-[10px] font-semibold tracking-[0.03em] text-slate-500">Unit Sell</th> : null}
              {!isTakeoffView ? <th className="px-3 py-2 w-24 text-right text-[10px] font-semibold tracking-[0.03em] text-slate-500">Total</th> : null}
              {!isTakeoffView ? <th className="px-3 py-2 w-28 text-left text-[10px] font-semibold tracking-[0.03em] text-slate-500">Notes</th> : null}
              <th className="px-2 py-2 w-24 text-right text-[10px] font-semibold tracking-[0.03em] text-slate-500">Actions</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td colSpan={columnCount} className="px-3 py-10 text-center text-slate-500">No scope items yet. Add from catalog, bundle, import, or manual entry.</td>
              </tr>
            ) : (
              lines.map((line, index) => {
                const selected = selectedLineId === line.id;
                const stripe = index % 2 === 0;
                const effectiveLaborCost = Number((line.laborCost * laborMultiplier).toFixed(2));
                const isBundleStart = !!line.bundleId && (index === 0 || lines[index - 1].bundleId !== line.bundleId);
                const isBundleCollapsed = !!line.bundleId && !!collapsedBundles[line.bundleId];
                const showLine = !line.bundleId || !isBundleCollapsed || isBundleStart;

                if (!showLine) {
                  return null;
                }

                return (
                  <React.Fragment key={line.id}>
                    {isBundleStart && line.bundleId ? (
                      <tr className="border-b border-violet-100 bg-violet-50/60">
                        <td colSpan={columnCount} className="px-3 py-2">
                          <button
                            className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-2.5 py-1 text-[11px] font-medium text-violet-800 shadow-sm"
                            onClick={() => {
                              setCollapsedBundles((prev) => ({
                                ...prev,
                                [line.bundleId!]: !prev[line.bundleId!],
                              }));
                            }}
                          >
                            {collapsedBundles[line.bundleId] ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                            <Layers3 className="h-3.5 w-3.5" />
                            {bundleMeta[line.bundleId]?.name || 'Bundle'}
                            <span className="text-violet-600/90">({bundleMeta[line.bundleId]?.count || 0} lines)</span>
                            <span className="ml-1 text-violet-900">{formatCurrencySafe(bundleMeta[line.bundleId]?.subtotal)}</span>
                          </button>
                        </td>
                      </tr>
                    ) : null}
                    <tr
                      onClick={() => onSelectLine(line.id)}
                      className={`cursor-pointer border-b border-slate-100/90 border-l-2 ${rowAccentClass(line)} ${selected ? (isTakeoffView ? 'bg-amber-50/90 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.18)]' : 'bg-[linear-gradient(90deg,rgba(231,239,255,0.82)_0%,rgba(243,248,255,0.96)_100%)] shadow-[inset_0_0_0_1px_rgba(11,61,145,0.12)]') : stripe ? 'bg-white' : isTakeoffView ? 'bg-amber-50/10' : 'bg-slate-50/[0.55]'} hover:bg-[linear-gradient(90deg,rgba(241,245,249,0.96)_0%,rgba(248,250,252,0.96)_100%)] transition-colors`}
                    >
                      <td className="px-3 py-2.5 align-top">
                        <div className="truncate text-[11px] font-semibold text-slate-700" title={roomNamesById[line.roomId] || 'Unassigned'}>
                          {roomNamesById[line.roomId] || 'Unassigned'}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <div className="truncate text-[11px] text-slate-600" title={line.category || 'Uncategorized'}>
                          {line.category || 'Uncategorized'}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <div className="line-clamp-2 text-[11px] font-semibold text-slate-800" title={line.description}>
                          {line.description}
                        </div>
                        {line.sku ? <div className="mt-1 text-[10px] text-slate-500">SKU: {line.sku}</div> : null}
                      </td>
                      <td className="px-3 py-2.5 align-top text-[11px] font-medium text-slate-700 tabular-nums">
                        {line.qty}
                      </td>
                      <td className="px-3 py-2.5 align-top text-[11px] font-medium text-slate-700">
                        {line.unit}
                      </td>
                      {isTakeoffView ? (
                        <td className="px-3 py-2.5 align-top">
                          <div className="line-clamp-2 text-[11px] text-slate-600" title={line.notes || undefined}>
                            {line.notes || 'No notes'}
                          </div>
                        </td>
                      ) : null}
                      {isTakeoffView ? (
                        <td className="px-3 py-2.5 align-top">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${line.catalogItemId ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                                {line.catalogItemId ? 'Matched' : 'Unmatched'}
                              </span>
                              {line.bundleId ? <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">Bundle</span> : null}
                            </div>
                            <div className="flex flex-wrap items-center gap-1 text-[10px] text-slate-500">
                              <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 font-medium ${sourceBadgeClass(line.sourceType)}`} title={line.sourceType}>
                                {line.sourceType || 'line'}
                              </span>
                              {line.sourceRef ? <span className="truncate" title={line.sourceRef}>{line.sourceRef}</span> : null}
                            </div>
                            <div className="truncate text-[10px] text-slate-500" title={line.sku || undefined}>{line.sku || 'No SKU'}</div>
                          </div>
                        </td>
                      ) : null}
                      {!isTakeoffView && showLabor ? (
                        <td className="px-3 py-2.5 align-top text-right text-[11px] font-medium text-slate-700 tabular-nums">
                          <div>{formatCurrencySafe(effectiveLaborCost)}</div>
                          {laborMultiplier !== 1 ? <div className="text-[10px] text-slate-500">base {formatCurrencySafe(line.laborCost)}</div> : null}
                        </td>
                      ) : null}
                      {!isTakeoffView && showMaterial ? (
                        <td className="px-3 py-2.5 align-top text-right text-[11px] font-medium text-slate-700 tabular-nums">
                          {formatCurrencySafe(line.materialCost)}
                        </td>
                      ) : null}
                      {!isTakeoffView ? (
                        <td className="px-3 py-2.5 align-top text-right text-[11px] font-medium text-slate-700 tabular-nums">
                          {formatCurrencySafe(line.unitSell)}
                        </td>
                      ) : null}
                      {!isTakeoffView ? <td className="px-3 py-2.5 align-top text-right text-[12px] font-semibold text-slate-900 tabular-nums">{formatCurrencySafe(line.lineTotal)}</td> : null}
                      {!isTakeoffView ? (
                        <td className="px-3 py-2.5 align-top">
                          <div className="line-clamp-2 text-[11px] text-slate-600" title={line.notes || undefined}>
                            {line.notes || 'No notes'}
                          </div>
                        </td>
                      ) : null}
                      <td className="px-2 py-2 text-right" onClick={stopRowEvent}>
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => onSelectLine(line.id)} className={`text-[10px] px-2 py-1 rounded-full border transition ${selected ? 'border-blue-200 bg-white text-blue-700 shadow-sm' : 'border-slate-200 text-slate-600 hover:bg-white hover:shadow-sm'}`}>{selected ? <span className="inline-flex items-center gap-1"><Sparkles className="h-3 w-3" /> Open</span> : 'Edit'}</button>
                          <button onClick={(e) => { e.stopPropagation(); onDeleteLine(line.id); }} className="text-[10px] px-1.5 py-1 rounded-full border border-transparent text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-700">X</button>
                        </div>
                      </td>
                    </tr>
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
        <datalist id={`estimate-grid-categories-${viewMode}`}>
          {categories.filter((category) => category && category !== 'all').map((category) => <option key={category} value={category} />)}
        </datalist>
      </div>
    </div>
  );
}
