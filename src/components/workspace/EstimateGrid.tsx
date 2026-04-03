import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Layers3, Sparkles } from 'lucide-react';
import { RoomRecord, TakeoffLineRecord } from '../../shared/types/estimator';
import { formatClientProposalItemDisplay } from '../../shared/utils/proposalDocument';
import { formatCurrencySafe, formatLaborDurationMinutes, formatNumberSafe } from '../../utils/numberFormat';

interface Props {
  lines: TakeoffLineRecord[];
  rooms: RoomRecord[];
  categories: string[];
  roomNamesById: Record<string, string>;
  pricingMode: 'material_only' | 'labor_only' | 'labor_and_material';
  viewMode: 'takeoff' | 'estimate';
  organizeBy: 'room' | 'item';
  laborMultiplier?: number;
  selectedLineId: string | null;
  onSelectLine: (lineId: string) => void;
  onPersistLine: (lineId: string, updates?: Partial<TakeoffLineRecord>) => Promise<void> | void;
  onDeleteLine: (lineId: string) => void;
}

interface DisplayRow {
  id: string;
  lineId: string;
  roomLabel: string;
  roomHint: string | null;
  category: string | null;
  description: string;
  qty: number;
  unit: string;
  notes: string | null;
  matched: boolean;
  sourceType: string;
  sourceRef: string | null;
  sku: string | null;
  materialCost: number;
  laborCost: number;
  /** Per-unit install minutes (weighted avg when rows are combined by item). */
  laborMinutesPerUnit: number;
  /** Extended install minutes (unit minutes × qty, summed for combined rows). */
  laborMinutesExtended: number;
  unitSell: number;
  lineTotal: number;
  bundleId: string | null;
  canDelete: boolean;
  modifierNames: string[];
}

function normalizeGroupKey(line: TakeoffLineRecord): string {
  const catalogKey = String(line.catalogItemId || '').trim().toLowerCase();
  if (catalogKey) return `catalog:${catalogKey}`;

  const skuKey = String(line.sku || '').trim().toLowerCase();
  if (skuKey) return `sku:${skuKey}`;

  return [line.category || '', line.description || '', line.unit || 'EA']
    .map((part) => String(part).trim().toLowerCase())
    .join('|');
}

export function EstimateGrid({ lines, rooms, categories, roomNamesById, pricingMode, viewMode, organizeBy, laborMultiplier = 1, selectedLineId, onSelectLine, onPersistLine, onDeleteLine }: Props) {
  const [collapsedBundles, setCollapsedBundles] = useState<Record<string, boolean>>({});
  const showMaterial = pricingMode !== 'labor_only';
  const showLabor = pricingMode !== 'material_only';
  const isTakeoffView = viewMode === 'takeoff';
  const columnCount = isTakeoffView ? 4 : 8 + (showLabor ? 2 : 0) + (showMaterial ? 1 : 0);

  const bundleMeta = useMemo(() => {
    const byBundle: Record<string, { count: number; subtotal: number; name: string; laborMinutesExtended: number }> = {};
    lines.forEach((line) => {
      if (!line.bundleId) return;
      if (!byBundle[line.bundleId]) {
        byBundle[line.bundleId] = {
          count: 0,
          subtotal: 0,
          name: line.notes?.trim() || line.category || 'Bundle',
          laborMinutesExtended: 0,
        };
      }
      byBundle[line.bundleId].count += 1;
      byBundle[line.bundleId].subtotal += line.lineTotal;
      byBundle[line.bundleId].laborMinutesExtended += Number(line.laborMinutes || 0) * Number(line.qty || 0);
    });
    return byBundle;
  }, [lines]);

  function itemCellDisplay(description: string, sku: string | null) {
    return formatClientProposalItemDisplay(String(description || '').trim(), sku);
  }

  function modifierLine(names: string[]) {
    if (!names.length) return null;
    return (
      <div className="mt-0.5 text-[10px] font-medium leading-snug text-indigo-800/90">
        {names.join(' · ')}
      </div>
    );
  }

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

  const displayRows = useMemo<DisplayRow[]>(() => {
    if (organizeBy === 'room') {
      return lines.map((line) => ({
        id: line.id,
        lineId: line.id,
        roomLabel: roomNamesById[line.roomId] || 'Unassigned',
        roomHint: null,
        category: line.category,
        description: line.description,
        qty: line.qty,
        unit: line.unit,
        notes: line.notes,
        matched: !!line.catalogItemId,
        sourceType: line.sourceType || 'line',
        sourceRef: line.sourceRef,
        sku: line.sku,
        materialCost: line.materialCost,
        laborCost: line.laborCost,
        laborMinutesPerUnit: Number(line.laborMinutes || 0),
        laborMinutesExtended: Number(line.laborMinutes || 0) * Number(line.qty || 0),
        unitSell: line.unitSell,
        lineTotal: line.lineTotal,
        bundleId: line.bundleId,
        canDelete: true,
        modifierNames: [...(line.modifierNames || [])],
      }));
    }

    const byItem = new Map<
      string,
      DisplayRow & {
        roomIds: Set<string>;
        notesSet: Set<string>;
        modSet: Set<string>;
        totalMaterial: number;
        totalLabor: number;
        totalLaborMinutes: number;
        totalSell: number;
      }
    >();
    lines.forEach((line) => {
      const key = normalizeGroupKey(line);
      const existing = byItem.get(key) || {
        id: key,
        lineId: line.id,
        roomLabel: '',
        roomHint: null,
        category: line.category,
        description: line.description,
        qty: 0,
        unit: line.unit,
        notes: null,
        matched: !!line.catalogItemId,
        sourceType: line.sourceType || 'line',
        sourceRef: line.sourceRef,
        sku: line.sku,
        materialCost: 0,
        laborCost: 0,
        laborMinutesPerUnit: 0,
        laborMinutesExtended: 0,
        unitSell: 0,
        lineTotal: 0,
        bundleId: null,
        canDelete: false,
        modifierNames: [],
        roomIds: new Set<string>(),
        notesSet: new Set<string>(),
        modSet: new Set<string>(),
        totalMaterial: 0,
        totalLabor: 0,
        totalLaborMinutes: 0,
        totalSell: 0,
      };

      existing.qty += Number(line.qty || 0);
      existing.lineTotal += Number(line.lineTotal || 0);
      existing.totalMaterial += Number(line.materialCost || 0) * Number(line.qty || 0);
      existing.totalLabor += Number(line.laborCost || 0) * Number(line.qty || 0);
      existing.totalLaborMinutes += Number(line.laborMinutes || 0) * Number(line.qty || 0);
      existing.totalSell += Number(line.unitSell || 0) * Number(line.qty || 0);
      existing.roomIds.add(line.roomId);
      if (line.notes) existing.notesSet.add(line.notes.trim());
      (line.modifierNames || []).forEach((m) => existing.modSet.add(m));
      if (!existing.category && line.category) existing.category = line.category;
      if (!existing.sku && line.sku) existing.sku = line.sku;
      if (!existing.sourceRef && line.sourceRef) existing.sourceRef = line.sourceRef;
      existing.matched = existing.matched || !!line.catalogItemId;
      if (existing.sourceType !== (line.sourceType || 'line')) existing.sourceType = 'mixed';
      byItem.set(key, existing);
    });

    return Array.from(byItem.values())
      .map((entry) => {
        const roomNames = Array.from(entry.roomIds).map((roomId) => roomNamesById[roomId] || 'Unassigned');
        const roomLabel = roomNames.length === 1 ? roomNames[0] : `${roomNames.length} rooms`;
        const roomHint = roomNames.slice(0, 4).join(', ');
        const notes = Array.from(entry.notesSet).slice(0, 2).join(' | ') || null;
        const qty = entry.qty || 1;
        const laborMinutesExtended = entry.totalLaborMinutes;
        const laborMinutesPerUnit = qty > 0 ? Number((laborMinutesExtended / qty).toFixed(2)) : 0;
        const modifierNames = Array.from(entry.modSet).sort((a, b) => a.localeCompare(b));
        return {
          id: entry.id,
          lineId: entry.lineId,
          roomLabel,
          roomHint,
          category: entry.category,
          description: entry.description,
          qty: entry.qty,
          unit: entry.unit,
          notes,
          matched: entry.matched,
          sourceType: entry.sourceType,
          sourceRef: entry.sourceRef,
          sku: entry.sku,
          materialCost: Number((entry.totalMaterial / qty).toFixed(2)),
          laborCost: Number((entry.totalLabor / qty).toFixed(2)),
          laborMinutesPerUnit,
          laborMinutesExtended,
          unitSell: Number((entry.totalSell / qty).toFixed(2)),
          lineTotal: entry.lineTotal,
          bundleId: entry.bundleId,
          canDelete: entry.canDelete,
          modifierNames,
        };
      })
      .sort((left, right) => right.lineTotal - left.lineTotal || left.description.localeCompare(right.description));
  }, [lines, organizeBy, roomNamesById]);

  return (
    <div className={`overflow-hidden border shadow-sm ${isTakeoffView ? 'rounded-lg border-teal-200/70 bg-white ring-1 ring-teal-100/60' : 'rounded-lg border-slate-200/70 bg-white'}`}>
      <div className="overflow-y-auto max-h-[min(70vh,820px)]">
        <table className={`w-full table-fixed ${isTakeoffView ? 'text-xs' : 'text-sm'}`}>
          <thead className={`sticky top-0 z-10 border-b ${isTakeoffView ? 'border-teal-200/70 bg-teal-50/70' : 'border-slate-200/70 bg-slate-100'}`}>
            <tr>
              {isTakeoffView ? (
                <>
                  <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-600">Item</th>
                  <th className="px-2 py-1.5 w-[4.5rem] text-left text-[10px] font-semibold uppercase tracking-wide text-slate-600">Qty</th>
                  <th
                    className="px-2 py-1.5 w-[6.5rem] text-left text-[10px] font-semibold uppercase tracking-wide text-slate-600"
                    title="Catalog install minutes × qty (before project schedule multipliers)"
                  >
                    Install
                  </th>
                  <th className="px-2 py-1.5 w-24 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-600">Actions</th>
                </>
              ) : (
                <>
                  <th className="px-2.5 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-600 min-w-0">Item</th>
                  <th className="px-2.5 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-600 w-[6.5rem]">Room</th>
                  <th className="px-2.5 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-600 w-28">Category</th>
                  <th className="px-2.5 py-2 w-14 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-600">Qty</th>
                  <th className="px-2.5 py-2 w-12 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-600">Unit</th>
                </>
              )}
              {!isTakeoffView && showLabor ? (
                <th className="px-2.5 py-2 w-[7rem] text-left text-[10px] font-semibold uppercase tracking-wide text-slate-600" title="Labor minutes × qty per line (before project schedule multipliers; see Labor time card for adjusted totals)">
                  Install time
                </th>
              ) : null}
              {!isTakeoffView && showLabor ? (
                <th className="w-24 border-l border-slate-200/80 px-2.5 py-2 pl-3 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                  Labor $
                </th>
              ) : null}
              {!isTakeoffView && showMaterial ? <th className="px-2.5 py-2 w-[4.5rem] text-right text-[10px] font-semibold uppercase tracking-wide text-slate-600">Material</th> : null}
              {!isTakeoffView ? <th className="px-2.5 py-2 w-[4.5rem] text-right text-[10px] font-semibold uppercase tracking-wide text-slate-600">Unit sell</th> : null}
              {!isTakeoffView ? <th className="px-2.5 py-2 w-[4.5rem] text-right text-[10px] font-semibold uppercase tracking-wide text-slate-600">Total</th> : null}
              {!isTakeoffView ? <th className="px-2.5 py-2 w-24 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-600">Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {displayRows.length === 0 ? (
              <tr>
                <td colSpan={columnCount} className="px-3 py-8 text-center text-sm text-slate-500">No lines yet. Add from catalog, bundle, import, or manual entry.</td>
              </tr>
            ) : (
              displayRows.map((row, index) => {
                const sourceLine = lines.find((line) => line.id === row.lineId) || null;
                const selected = selectedLineId === row.lineId;
                const stripe = index % 2 === 0;
                const effectiveLaborCost = Number((row.laborCost * laborMultiplier).toFixed(2));
                const previousBundleId = index > 0 ? displayRows[index - 1].bundleId : null;
                const isBundleStart = organizeBy === 'room' && !!row.bundleId && (index === 0 || previousBundleId !== row.bundleId);
                const isBundleCollapsed = organizeBy === 'room' && !!row.bundleId && !!collapsedBundles[row.bundleId];
                const showLine = organizeBy === 'item' || !row.bundleId || !isBundleCollapsed || isBundleStart;

                if (!showLine) {
                  return null;
                }

                const disp = itemCellDisplay(row.description, row.sku);

                return (
                  <React.Fragment key={row.id}>
                    {isBundleStart && row.bundleId ? (
                      <tr className="border-b border-violet-100 bg-violet-50/60">
                        <td colSpan={columnCount} className={isTakeoffView ? 'px-2 py-1.5' : 'px-2.5 py-2'}>
                          <button
                            className={`inline-flex items-center gap-1.5 rounded-lg bg-white font-medium text-violet-800 shadow-sm ring-1 ring-violet-200/70 ${isTakeoffView ? 'px-2 py-1 text-xs' : 'gap-2 px-3 py-1.5 text-sm'}`}
                            onClick={() => {
                              setCollapsedBundles((prev) => ({
                                ...prev,
                                [row.bundleId!]: !prev[row.bundleId!],
                              }));
                            }}
                          >
                            {collapsedBundles[row.bundleId] ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            <Layers3 className="h-3 w-3" />
                            {bundleMeta[row.bundleId]?.name || 'Bundle'}
                            <span className="text-violet-600/90">({bundleMeta[row.bundleId]?.count || 0})</span>
                            {isTakeoffView ? (
                              <span className="text-violet-800/90 tabular-nums">
                                · {formatLaborDurationMinutes(bundleMeta[row.bundleId]?.laborMinutesExtended ?? 0)}
                              </span>
                            ) : (
                              <span className="ml-1 text-violet-900">{formatCurrencySafe(bundleMeta[row.bundleId]?.subtotal)}</span>
                            )}
                          </button>
                        </td>
                      </tr>
                    ) : null}
                    <tr
                      onClick={() => onSelectLine(row.lineId)}
                      className={`cursor-pointer border-b border-slate-100/90 border-l-2 ${sourceLine ? rowAccentClass(sourceLine) : 'border-l-slate-200'} ${selected ? (isTakeoffView ? 'bg-teal-50/90 shadow-[inset_0_0_0_1px_rgba(13,148,136,0.2)]' : 'bg-blue-50/70 shadow-[inset_0_0_0_1px_rgba(11,61,145,0.12)]') : stripe ? 'bg-white' : isTakeoffView ? 'bg-teal-50/[0.12]' : 'bg-slate-50/[0.55]'} hover:bg-slate-50 transition-colors`}
                    >
                      {isTakeoffView ? (
                        <>
                          <td className="px-2 py-1.5 align-top min-w-0">
                            <div
                              className="text-xs font-semibold leading-snug text-slate-900"
                              title={[
                                row.description,
                                row.category || '',
                                row.sku ? `SKU ${row.sku}` : '',
                                row.notes || '',
                                row.matched ? 'Matched to catalog' : 'Not matched',
                                row.sourceRef || '',
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            >
                              {disp.title || row.description || '—'}
                            </div>
                            {disp.subtitle ? <div className="mt-0.5 text-[10px] text-slate-500">{disp.subtitle}</div> : null}
                            {row.category ? (
                              <div className="mt-0.5 text-[10px] text-slate-500">{row.category}</div>
                            ) : null}
                            {organizeBy === 'item' && (row.roomHint || row.roomLabel) ? (
                              <div className="mt-0.5 text-[10px] text-slate-500">{row.roomHint || row.roomLabel}</div>
                            ) : null}
                          </td>
                          <td className="px-2 py-1.5 align-top text-xs font-semibold text-slate-800 tabular-nums whitespace-nowrap">
                            <span>{formatNumberSafe(row.qty, row.qty % 1 === 0 ? 0 : 2)}</span>
                            <span className="ml-1 text-[11px] font-medium text-slate-600">{row.unit}</span>
                          </td>
                          <td className="px-2 py-1.5 align-top text-xs tabular-nums text-slate-800">
                            <div className="font-medium leading-tight" title={`${formatNumberSafe(row.laborMinutesExtended, row.laborMinutesExtended % 1 === 0 ? 0 : 1)} min total`}>
                              {formatLaborDurationMinutes(row.laborMinutesExtended)}
                            </div>
                            {row.qty !== 1 ? (
                              <div className="mt-0.5 text-[10px] font-normal text-slate-500">
                                {formatNumberSafe(row.laborMinutesPerUnit, row.laborMinutesPerUnit % 1 === 0 ? 0 : 1)}/u
                              </div>
                            ) : null}
                          </td>
                          <td className="px-2 py-1.5 text-right" onClick={stopRowEvent}>
                            <div className="flex items-center justify-end gap-1">
                              <button type="button" onClick={() => onSelectLine(row.lineId)} className={`text-[11px] font-semibold px-2 py-1 rounded-md border transition ${selected ? 'border-teal-400 bg-teal-50 text-teal-900' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}>{selected ? <span className="inline-flex items-center gap-0.5"><Sparkles className="h-3 w-3" /> Open</span> : organizeBy === 'item' ? 'View' : 'Edit'}</button>
                              {row.canDelete ? <button type="button" onClick={(e) => { e.stopPropagation(); onDeleteLine(row.lineId); }} className="text-[11px] font-semibold px-1.5 py-1 rounded-md border border-transparent text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-700" aria-label="Delete line">×</button> : null}
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                      <td className="px-2.5 py-2 align-top min-w-0">
                        <div
                          className="line-clamp-2 text-sm font-semibold text-slate-900"
                          title={[row.description, row.modifierNames?.length ? row.modifierNames.join(' · ') : '', row.sku ? `SKU ${row.sku}` : '', row.notes || ''].filter(Boolean).join(' · ')}
                        >
                          {disp.title || row.description || '—'}
                        </div>
                        {disp.subtitle ? <div className="mt-0.5 line-clamp-2 text-[11px] text-slate-500">{disp.subtitle}</div> : null}
                        {modifierLine(row.modifierNames)}
                      </td>
                      <td className="px-2.5 py-2 align-top">
                        <div className="truncate text-xs font-medium text-slate-800" title={row.roomHint || row.roomLabel}>
                          {row.roomLabel}
                        </div>
                        {row.roomHint && row.roomHint !== row.roomLabel ? <div className="mt-0.5 truncate text-[10px] text-slate-500">{row.roomHint}</div> : null}
                      </td>
                      <td className="px-2.5 py-2 align-top">
                        <div className="truncate text-xs text-slate-600" title={row.category || 'Uncategorized'}>
                          {row.category || 'Uncategorized'}
                        </div>
                      </td>
                      <td className="px-2.5 py-2 align-top text-xs font-semibold text-slate-800 tabular-nums">
                        {row.qty}
                      </td>
                      <td className="px-2.5 py-2 align-top text-xs font-medium text-slate-700">
                        {row.unit}
                      </td>
                      {!isTakeoffView && showLabor ? (
                        <td className="px-2.5 py-2 align-top text-xs tabular-nums text-slate-800">
                          <div className="font-medium leading-snug" title={`${formatNumberSafe(row.laborMinutesExtended, row.laborMinutesExtended % 1 === 0 ? 0 : 1)} min total`}>
                            {formatLaborDurationMinutes(row.laborMinutesExtended)}
                          </div>
                          {row.qty !== 1 ? (
                            <div className="mt-0.5 text-[10px] font-normal text-slate-500">
                              {formatNumberSafe(row.laborMinutesPerUnit, row.laborMinutesPerUnit % 1 === 0 ? 0 : 1)} min/u
                            </div>
                          ) : null}
                        </td>
                      ) : null}
                      {!isTakeoffView && showLabor ? (
                        <td className="border-l border-slate-200/80 px-2.5 py-2 pl-3 align-top text-right text-xs font-medium text-slate-800 tabular-nums">
                          <div>{formatCurrencySafe(effectiveLaborCost)}</div>
                          {laborMultiplier !== 1 ? <div className="text-[10px] text-slate-500">base {formatCurrencySafe(row.laborCost)}</div> : null}
                        </td>
                      ) : null}
                      {!isTakeoffView && showMaterial ? (
                        <td className="px-2.5 py-2 align-top text-right text-xs font-medium text-slate-800 tabular-nums">
                          {formatCurrencySafe(row.materialCost)}
                        </td>
                      ) : null}
                      {!isTakeoffView ? (
                        <td className="px-2.5 py-2 align-top text-right text-xs font-medium text-slate-800 tabular-nums">
                          {formatCurrencySafe(row.unitSell)}
                        </td>
                      ) : null}
                      {!isTakeoffView ? <td className="px-2.5 py-2 align-top text-right text-sm font-semibold text-slate-900 tabular-nums">{formatCurrencySafe(row.lineTotal)}</td> : null}
                      <td className="px-2.5 py-2 text-right" onClick={stopRowEvent}>
                        <div className="flex items-center justify-end gap-1">
                          <button type="button" onClick={() => onSelectLine(row.lineId)} className={`text-[11px] font-semibold px-2 py-1 rounded-md border transition ${selected ? 'border-blue-300 bg-blue-50 text-blue-800' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}>{selected ? <span className="inline-flex items-center gap-0.5"><Sparkles className="h-3 w-3" /> Open</span> : organizeBy === 'item' ? 'Inspect' : 'Edit'}</button>
                          {row.canDelete ? <button type="button" onClick={(e) => { e.stopPropagation(); onDeleteLine(row.lineId); }} className="text-[11px] font-semibold px-1.5 py-1 rounded-md border border-transparent text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-700" aria-label="Delete line">×</button> : null}
                        </div>
                      </td>
                        </>
                      )}
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
