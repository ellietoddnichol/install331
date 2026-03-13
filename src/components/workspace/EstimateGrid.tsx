import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Layers3 } from 'lucide-react';
import { RoomRecord, TakeoffLineRecord } from '../../shared/types/estimator';
import { formatCurrencySafe } from '../../utils/numberFormat';

interface Props {
  lines: TakeoffLineRecord[];
  rooms: RoomRecord[];
  categories: string[];
  roomNamesById: Record<string, string>;
  pricingMode: 'material_only' | 'labor_only' | 'labor_and_material';
  viewMode: 'takeoff' | 'estimate';
  selectedLineId: string | null;
  onSelectLine: (lineId: string) => void;
  onPersistLine: (lineId: string, updates?: Partial<TakeoffLineRecord>) => Promise<void> | void;
  onDeleteLine: (lineId: string) => void;
}

export function EstimateGrid({ lines, rooms, categories, roomNamesById, pricingMode, viewMode, selectedLineId, onSelectLine, onPersistLine, onDeleteLine }: Props) {
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
    <div className={`rounded-xl border shadow-sm overflow-hidden ${isTakeoffView ? 'border-amber-200/90 bg-white' : 'border-slate-200/90 bg-white'}`}>
      <div className="overflow-y-auto max-h-[69vh]">
        <table className="w-full table-fixed text-xs">
          <thead className={`sticky top-0 z-10 backdrop-blur border-b ${isTakeoffView ? 'bg-amber-50/95 border-amber-200' : 'bg-slate-50/95 border-slate-200'}`}>
            <tr>
              <th className={`px-2 py-1.5 text-left text-[10px] uppercase tracking-[0.08em] text-slate-500 ${isTakeoffView ? 'w-32' : 'w-28'}`}>Room</th>
              <th className={`px-2 py-1.5 text-left text-[10px] uppercase tracking-[0.08em] text-slate-500 ${isTakeoffView ? 'w-24' : 'w-20'}`}>Category</th>
              <th className="px-2 py-1.5 text-left text-[10px] uppercase tracking-[0.08em] text-slate-500">Item / Description</th>
              <th className="px-2 py-1.5 w-14 text-left text-[10px] uppercase tracking-[0.08em] text-slate-500">Qty</th>
              <th className="px-2 py-1.5 w-12 text-left text-[10px] uppercase tracking-[0.08em] text-slate-500">Unit</th>
              {isTakeoffView ? <th className="px-2 py-1.5 w-28 text-left text-[10px] uppercase tracking-[0.08em] text-slate-500">Notes</th> : null}
              {isTakeoffView ? <th className="px-2 py-1.5 w-28 text-left text-[10px] uppercase tracking-[0.08em] text-slate-500">Match / Source</th> : null}
              {!isTakeoffView && showLabor ? <th className="px-2 py-1.5 w-20 text-right text-[10px] uppercase tracking-[0.08em] text-slate-500">Labor</th> : null}
              {!isTakeoffView && showMaterial ? <th className="px-2 py-1.5 w-20 text-right text-[10px] uppercase tracking-[0.08em] text-slate-500">Material</th> : null}
              {!isTakeoffView ? <th className="px-2 py-1.5 w-20 text-left text-[10px] uppercase tracking-[0.08em] text-slate-500">Unit Sell</th> : null}
              {!isTakeoffView ? <th className="px-2 py-1.5 w-20 text-right text-[10px] uppercase tracking-[0.08em] text-slate-500">Total</th> : null}
              {!isTakeoffView ? <th className="px-2 py-1.5 w-24 text-left text-[10px] uppercase tracking-[0.08em] text-slate-500">Notes</th> : null}
              <th className="px-1.5 py-1.5 w-20 text-right text-[10px] uppercase tracking-[0.08em] text-slate-500">Actions</th>
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
                const isBundleStart = !!line.bundleId && (index === 0 || lines[index - 1].bundleId !== line.bundleId);
                const isBundleCollapsed = !!line.bundleId && !!collapsedBundles[line.bundleId];
                const showLine = !line.bundleId || !isBundleCollapsed || isBundleStart;

                if (!showLine) {
                  return null;
                }

                return (
                  <React.Fragment key={line.id}>
                    {isBundleStart && line.bundleId ? (
                      <tr className="bg-violet-50/65 border-b border-violet-100">
                        <td colSpan={columnCount} className="px-2.5 py-1.5">
                          <button
                            className="inline-flex items-center gap-1.5 text-[11px] font-medium text-violet-800"
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
                      className={`border-b border-slate-100/90 border-l-2 cursor-pointer ${rowAccentClass(line)} ${selected ? (isTakeoffView ? 'bg-amber-50/80' : 'bg-blue-50/70') : stripe ? 'bg-white' : isTakeoffView ? 'bg-amber-50/20' : 'bg-slate-50/40'} hover:bg-slate-100/60 transition-colors`}
                    >
                      <td className="px-2 py-2 align-top">
                        <div className="truncate text-[11px] font-medium text-slate-700" title={roomNamesById[line.roomId] || 'Unassigned'}>
                          {roomNamesById[line.roomId] || 'Unassigned'}
                        </div>
                      </td>
                      <td className="px-2 py-2 align-top">
                        <div className="truncate text-[11px] text-slate-600" title={line.category || 'Uncategorized'}>
                          {line.category || 'Uncategorized'}
                        </div>
                      </td>
                      <td className="px-2 py-2 align-top">
                        <div className="line-clamp-2 text-[11px] font-medium text-slate-800" title={line.description}>
                          {line.description}
                        </div>
                        {line.sku ? <div className="mt-1 text-[10px] text-slate-500">SKU: {line.sku}</div> : null}
                      </td>
                      <td className="px-2 py-2 align-top text-[11px] font-medium text-slate-700 tabular-nums">
                        {line.qty}
                      </td>
                      <td className="px-2 py-2 align-top text-[11px] font-medium text-slate-700">
                        {line.unit}
                      </td>
                      {isTakeoffView ? (
                        <td className="px-2 py-2 align-top">
                          <div className="line-clamp-2 text-[11px] text-slate-600" title={line.notes || undefined}>
                            {line.notes || 'No notes'}
                          </div>
                        </td>
                      ) : null}
                      {isTakeoffView ? (
                        <td className="px-2 py-2 align-top">
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
                        <td className="px-2 py-2 align-top text-right text-[11px] font-medium text-slate-700 tabular-nums">
                          {formatCurrencySafe(line.laborCost)}
                        </td>
                      ) : null}
                      {!isTakeoffView && showMaterial ? (
                        <td className="px-2 py-2 align-top text-right text-[11px] font-medium text-slate-700 tabular-nums">
                          {formatCurrencySafe(line.materialCost)}
                        </td>
                      ) : null}
                      {!isTakeoffView ? (
                        <td className="px-2 py-2 align-top text-right text-[11px] font-medium text-slate-700 tabular-nums">
                          {formatCurrencySafe(line.unitSell)}
                        </td>
                      ) : null}
                      {!isTakeoffView ? <td className="px-2 py-2 align-top text-right text-[12px] font-semibold text-slate-800 tabular-nums">{formatCurrencySafe(line.lineTotal)}</td> : null}
                      {!isTakeoffView ? (
                        <td className="px-2 py-2 align-top">
                          <div className="line-clamp-2 text-[11px] text-slate-600" title={line.notes || undefined}>
                            {line.notes || 'No notes'}
                          </div>
                        </td>
                      ) : null}
                      <td className="px-1.5 py-1.5 text-right" onClick={stopRowEvent}>
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => onSelectLine(line.id)} className="text-[10px] px-1.5 py-0.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50">Edit</button>
                          <button onClick={(e) => { e.stopPropagation(); onDeleteLine(line.id); }} className="text-[10px] px-1 py-0.5 rounded border border-transparent text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-700">X</button>
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
