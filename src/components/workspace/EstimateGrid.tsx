import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Layers3, Sparkles } from 'lucide-react';
import { RoomRecord, TakeoffLineModifierRollup, TakeoffLineRecord } from '../../shared/types/estimator';
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
  /** In takeoff view, show each line’s room under the item (e.g. when listing all rooms). */
  takeoffShowRoom?: boolean;
  laborMultiplier?: number;
  selectedLineId: string | null;
  onSelectLine: (lineId: string) => void;
  /** When set, the row action button opens line detail (e.g. drawer) without relying on `onSelectLine` (used for pricing: row = select, button = open). */
  onOpenLineDetail?: (lineId: string) => void;
  onPersistLine: (lineId: string, updates?: Partial<TakeoffLineRecord>) => Promise<void> | void;
  onDeleteLine: (lineId: string) => void;
  /** Visual weight: workspace uses a stronger frame for the pricing grid. */
  workspaceFrame?: boolean;
  /** When true (pricing view only), inject category group divider rows at category boundaries. Rows must already be sorted by category. */
  categoryGroupHeaders?: boolean;
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
  modifierRollup: TakeoffLineModifierRollup | null;
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

export function EstimateGrid({
  lines,
  rooms,
  categories,
  roomNamesById,
  pricingMode,
  viewMode,
  organizeBy,
  takeoffShowRoom = false,
  laborMultiplier = 1,
  selectedLineId,
  onSelectLine,
  onOpenLineDetail,
  onPersistLine,
  onDeleteLine,
  workspaceFrame = false,
  categoryGroupHeaders = false,
}: Props) {
  const [collapsedBundles, setCollapsedBundles] = useState<Record<string, boolean>>({});
  const showMaterial = pricingMode !== 'labor_only';
  const showLabor = pricingMode !== 'material_only';
  const isTakeoffView = viewMode === 'takeoff';
  const addInsColumn = !isTakeoffView ? 1 : 0;
  const columnCount = isTakeoffView ? 4 : 8 + (showLabor ? 2 : 0) + (showMaterial ? 1 : 0) + addInsColumn;

  /** Fixed column shares so the line grid—not a single description column—uses most width sensibly */
  const estimateColWidths = useMemo(() => {
    if (isTakeoffView) return null;
    if (showLabor && showMaterial) {
      return ['22%', '8%', '9%', '4%', '3%', '7%', '8%', '7%', '7%', '7%', '9%', '6%'];
    }
    if (showLabor) {
      return ['23%', '9%', '10%', '4%', '4%', '8%', '9%', '8%', '7%', '8%', '9%'];
    }
    return ['26%', '9%', '11%', '4%', '4%', '10%', '10%', '10%', '9%', '10%'];
  }, [isTakeoffView, showLabor, showMaterial]);

  const bundleIdList = useMemo(
    () => Array.from(new Set(lines.map((l) => l.bundleId).filter(Boolean) as string[])),
    [lines]
  );

  const bundleMeta = useMemo(() => {
    const byBundle: Record<string, {
      count: number;
      subtotal: number;
      name: string;
      laborMinutesExtended: number;
      materialSubtotal: number;
      laborSubtotal: number;
    }> = {};
    lines.forEach((line) => {
      if (!line.bundleId) return;
      if (!byBundle[line.bundleId]) {
        byBundle[line.bundleId] = {
          count: 0,
          subtotal: 0,
          name: line.notes?.trim() || line.category || 'Bundle',
          laborMinutesExtended: 0,
          materialSubtotal: 0,
          laborSubtotal: 0,
        };
      }
      const qty = Number(line.qty || 0);
      byBundle[line.bundleId].count += 1;
      byBundle[line.bundleId].subtotal += line.lineTotal;
      byBundle[line.bundleId].laborMinutesExtended += Number(line.laborMinutes || 0) * qty;
      byBundle[line.bundleId].materialSubtotal += Number(line.materialCost || 0) * qty;
      byBundle[line.bundleId].laborSubtotal += Number(line.laborCost || 0) * qty * (laborMultiplier || 1);
    });
    return byBundle;
  }, [lines, laborMultiplier]);

  const categoryMeta = useMemo(() => {
    const byCategory: Record<string, {
      count: number;
      subtotal: number;
      laborMinutesExtended: number;
      materialSubtotal: number;
      laborSubtotal: number;
    }> = {};
    lines.forEach((line) => {
      const key = String(line.category || '').trim() || 'Uncategorized';
      if (!byCategory[key]) {
        byCategory[key] = {
          count: 0,
          subtotal: 0,
          laborMinutesExtended: 0,
          materialSubtotal: 0,
          laborSubtotal: 0,
        };
      }
      const qty = Number(line.qty || 0);
      byCategory[key].count += 1;
      byCategory[key].subtotal += line.lineTotal;
      byCategory[key].laborMinutesExtended += Number(line.laborMinutes || 0) * qty;
      byCategory[key].materialSubtotal += Number(line.materialCost || 0) * qty;
      byCategory[key].laborSubtotal += Number(line.laborCost || 0) * qty * (laborMultiplier || 1);
    });
    return byCategory;
  }, [lines, laborMultiplier]);

  function collapseAllBundles() {
    setCollapsedBundles(Object.fromEntries(bundleIdList.map((bid) => [bid, true])));
  }

  function expandAllBundles() {
    setCollapsedBundles({});
  }

  function itemCellDisplay(description: string, sku: string | null) {
    return formatClientProposalItemDisplay(String(description || '').trim(), sku);
  }

  function modifierLine(names: string[]) {
    if (!names.length) return null;
    return <div className="mt-0.5 text-xs font-normal leading-snug text-slate-700">{names.join(' · ')}</div>;
  }

  function pricingStreamPills() {
    return (
      <div className="mt-1 flex flex-wrap gap-1" aria-hidden>
        {showMaterial ? (
          <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-900 ring-1 ring-emerald-100/90">
            Material
          </span>
        ) : (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500 ring-1 ring-slate-200/80">
            Mat off
          </span>
        )}
        {showLabor ? (
          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-950 ring-1 ring-amber-100/90">
            Install labor
          </span>
        ) : (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500 ring-1 ring-slate-200/80">
            Labor off
          </span>
        )}
      </div>
    );
  }

  function addInsSummaryCell(rollup: TakeoffLineModifierRollup | null, names: string[]) {
    if (!rollup || rollup.count < 1) {
      return <span className="text-[11px] text-slate-400">None</span>;
    }
    const bits: string[] = [];
    if (rollup.addMaterialCost > 0.005) bits.push(`+${formatCurrencySafe(rollup.addMaterialCost)} mat`);
    if (rollup.addLaborMinutes > 0.05) bits.push(`+${formatNumberSafe(rollup.addLaborMinutes, 0)} min`);
    if (rollup.hasPercentAdjustments) bits.push('% on base');
    const sub = bits.join(' · ') || 'See names under item';
    const title = names.length ? `${rollup.count} add-ins — ${names.join(', ')}` : `${rollup.count} add-ins`;
    return (
      <div className="text-left" title={title}>
        <span className="text-[11px] font-semibold text-violet-900">{rollup.count} add-in{rollup.count === 1 ? '' : 's'}</span>
        <span className="mt-0.5 block text-[10px] leading-snug text-slate-600">{sub}</span>
      </div>
    );
  }

  const rowAccentClass = (line: TakeoffLineRecord) => {
    if (line.bundleId) return 'border-l-slate-500';
    const key = String(line.sourceType || '').toLowerCase();
    if (key.includes('catalog')) return 'border-l-slate-400';
    if (key.includes('manual')) return 'border-l-slate-300';
    if (key.includes('takeoff') || key.includes('parser')) return 'border-l-slate-300';
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
        modifierRollup: line.lineModifierRollup && line.lineModifierRollup.count > 0 ? line.lineModifierRollup : null,
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
        rollupCount: number;
        rollupAddMat: number;
        rollupAddMin: number;
        rollupHasPct: boolean;
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
        modifierRollup: null,
        roomIds: new Set<string>(),
        notesSet: new Set<string>(),
        modSet: new Set<string>(),
        totalMaterial: 0,
        totalLabor: 0,
        totalLaborMinutes: 0,
        totalSell: 0,
        rollupCount: 0,
        rollupAddMat: 0,
        rollupAddMin: 0,
        rollupHasPct: false,
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
      const lr = line.lineModifierRollup;
      if (lr && lr.count > 0) {
        existing.rollupCount += lr.count;
        existing.rollupAddMat += lr.addMaterialCost;
        existing.rollupAddMin += lr.addLaborMinutes;
        existing.rollupHasPct = existing.rollupHasPct || lr.hasPercentAdjustments;
      }
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
        const modifierRollup =
          entry.rollupCount > 0
            ? {
                count: entry.rollupCount,
                addMaterialCost: entry.rollupAddMat,
                addLaborMinutes: entry.rollupAddMin,
                hasPercentAdjustments: entry.rollupHasPct,
              }
            : null;
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
          modifierRollup,
        };
      })
      .sort((left, right) => right.lineTotal - left.lineTotal || left.description.localeCompare(right.description));
  }, [lines, organizeBy, roomNamesById]);

  const panelClass = workspaceFrame && !isTakeoffView
    ? 'ui-panel overflow-hidden rounded-xl border-2 border-slate-200/90 shadow-md ring-1 ring-slate-200/40'
    : 'ui-panel overflow-hidden';

  return (
    <div className={panelClass}>
      {isTakeoffView ? (
        <p className="border-b border-slate-100 bg-slate-50/95 px-3 py-1.5 text-[10px] leading-snug text-slate-600">
          {pricingMode === 'labor_only'
            ? 'Project is priced labor-only — material is hidden in Pricing; install time still drives labor here.'
            : pricingMode === 'material_only'
              ? 'Project is material-led — companion install labor (if any) is broken out separately in Pricing.'
              : 'Project includes material and install labor; this grid shows quantities and baseline install minutes per line.'}
        </p>
      ) : null}
      {organizeBy === 'room' && bundleIdList.length > 0 ? (
        <div className="flex flex-wrap items-center justify-end gap-2 border-b border-slate-100 bg-white px-2 py-1">
          <span className="text-[10px] font-medium text-slate-500">
            {bundleIdList.length} bundle{bundleIdList.length === 1 ? '' : 's'}
          </span>
          <button type="button" className="text-[10px] font-semibold text-blue-800 underline decoration-slate-300 underline-offset-2" onClick={collapseAllBundles}>
            Collapse all
          </button>
          <button type="button" className="text-[10px] font-semibold text-blue-800 underline decoration-slate-300 underline-offset-2" onClick={expandAllBundles}>
            Expand all
          </button>
        </div>
      ) : null}
      <div className="ui-data-grid-scroll">
        <table className="ui-data-grid-table">
          {estimateColWidths ? (
            <colgroup>
              {estimateColWidths.map((w, i) => (
                <col key={i} style={{ width: w }} />
              ))}
            </colgroup>
          ) : null}
          <thead className="ui-data-grid-thead">
            <tr>
              {isTakeoffView ? (
                <>
                  <th className="ui-table-th min-w-[12rem]">Item</th>
                  <th className="ui-table-th-end w-[5.5rem] whitespace-nowrap">Qty</th>
                  <th
                    className="ui-table-th-end w-[7.5rem] whitespace-nowrap"
                    title="Catalog install minutes × qty (before project schedule multipliers)"
                  >
                    Install
                  </th>
                  <th className="ui-table-th-end w-[7.25rem] whitespace-nowrap pl-2">Actions</th>
                </>
              ) : (
                <>
                  <th className="ui-table-th min-w-0">Item</th>
                  <th className="ui-table-th whitespace-nowrap">Room</th>
                  <th className="ui-table-th min-w-0">Category</th>
                  <th className="ui-table-th-end w-12 whitespace-nowrap">Qty</th>
                  <th className="ui-table-th w-11 text-center">Unit</th>
                </>
              )}
              {!isTakeoffView && showLabor ? (
                <th
                  className="ui-table-th-end w-[6.25rem] whitespace-nowrap"
                  title="Labor minutes × qty per line (before project schedule multipliers; see Labor time card for adjusted totals)"
                >
                  <span className="block">Install time</span>
                  <span className="mt-0.5 block text-[9px] font-normal normal-case tracking-normal text-slate-500">minutes</span>
                </th>
              ) : null}
              {!isTakeoffView && showLabor ? (
                <th className="ui-table-th-end w-[5.25rem] whitespace-nowrap border-l border-slate-300/60 pl-3">
                  <span className="block">Labor $</span>
                  <span className="mt-0.5 block text-[9px] font-normal normal-case tracking-normal text-slate-500">
                    install / unit
                    {laborMultiplier !== 1 ? ` · ×${formatNumberSafe(laborMultiplier, 2)} job` : ''}
                  </span>
                </th>
              ) : null}
              {!isTakeoffView && showMaterial ? (
                <th className="ui-table-th-end w-[5.25rem] whitespace-nowrap">
                  <span className="block">Material $</span>
                  <span className="mt-0.5 block text-[9px] font-normal normal-case tracking-normal text-slate-500">per unit</span>
                </th>
              ) : null}
              {!isTakeoffView ? (
                <th className="ui-table-th-end w-[5.25rem] whitespace-nowrap">
                  <span className="block">Unit sell</span>
                  <span className="mt-0.5 block text-[9px] font-normal normal-case tracking-normal text-slate-500">in this bid</span>
                </th>
              ) : null}
              {!isTakeoffView ? (
                <th className="ui-table-th-end w-[5.25rem] whitespace-nowrap">
                  <span className="block">Line total</span>
                  <span className="mt-0.5 block text-[9px] font-normal normal-case tracking-normal text-slate-500">qty × unit</span>
                </th>
              ) : null}
              {!isTakeoffView ? (
                <th className="ui-table-th min-w-[6.5rem] whitespace-normal text-left">
                  <span className="block">Add-ins</span>
                  <span className="mt-0.5 block text-[9px] font-normal normal-case tracking-normal text-slate-500">modifiers</span>
                </th>
              ) : null}
              {!isTakeoffView ? <th className="ui-table-th-end w-[7.25rem] whitespace-nowrap pl-2">Open</th> : null}
            </tr>
          </thead>
          <tbody>
            {displayRows.length === 0 ? (
              <tr>
                <td colSpan={columnCount} className="px-3 py-6 text-center text-sm text-slate-500">No lines yet. Add from catalog, bundle, import, or manual entry.</td>
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

                const currentCategory = String(row.category || '').trim() || 'Uncategorized';
                const previousCategory = index > 0 ? (String(displayRows[index - 1].category || '').trim() || 'Uncategorized') : null;
                const isCategoryStart = categoryGroupHeaders && !isTakeoffView && (index === 0 || previousCategory !== currentCategory);

                const disp = itemCellDisplay(row.description, row.sku);

                return (
                  <React.Fragment key={row.id}>
                    {isCategoryStart ? (
                      <tr className="border-b border-slate-200/80 bg-gradient-to-r from-slate-50 to-white">
                        <td colSpan={columnCount} className="px-3 py-2">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-300/80 bg-white px-2 py-0.5 font-semibold text-slate-900 shadow-sm">
                              <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--brand)' }} aria-hidden />
                              {currentCategory}
                            </span>
                            <span className="text-slate-500">
                              ({categoryMeta[currentCategory]?.count || 0})
                            </span>
                            <span className="tabular-nums text-slate-500">
                              Mat <span className="font-semibold text-slate-900">{formatCurrencySafe(categoryMeta[currentCategory]?.materialSubtotal ?? 0)}</span>
                            </span>
                            <span className="tabular-nums text-slate-500">
                              · Lab <span className="font-semibold text-slate-900">{formatCurrencySafe(categoryMeta[currentCategory]?.laborSubtotal ?? 0)}</span>
                            </span>
                            <span className="tabular-nums text-slate-500">
                              · {formatLaborDurationMinutes(categoryMeta[currentCategory]?.laborMinutesExtended ?? 0)}
                            </span>
                            <span className="ml-auto border-l border-slate-300 pl-2 tabular-nums font-semibold text-slate-900">
                              {formatCurrencySafe(categoryMeta[currentCategory]?.subtotal ?? 0)}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                    {isBundleStart && row.bundleId ? (
                      <tr className="border-b border-slate-200/80 bg-slate-100/90">
                        <td colSpan={columnCount} className="px-3 py-2">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 shadow-sm"
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
                            <span className="text-slate-500">({bundleMeta[row.bundleId]?.count || 0})</span>
                            {isTakeoffView ? (
                              <span className="tabular-nums text-slate-700">
                                · {formatLaborDurationMinutes(bundleMeta[row.bundleId]?.laborMinutesExtended ?? 0)}
                              </span>
                            ) : (
                              <>
                                <span className="ml-1 tabular-nums text-slate-500">
                                  Mat <span className="font-semibold text-slate-900">{formatCurrencySafe(bundleMeta[row.bundleId]?.materialSubtotal ?? 0)}</span>
                                </span>
                                <span className="tabular-nums text-slate-500">
                                  · Lab <span className="font-semibold text-slate-900">{formatCurrencySafe(bundleMeta[row.bundleId]?.laborSubtotal ?? 0)}</span>
                                </span>
                                <span className="tabular-nums text-slate-500">
                                  · {formatLaborDurationMinutes(bundleMeta[row.bundleId]?.laborMinutesExtended ?? 0)}
                                </span>
                                <span className="ml-1 border-l border-slate-300 pl-2 tabular-nums font-semibold text-slate-900">
                                  {formatCurrencySafe(bundleMeta[row.bundleId]?.subtotal)}
                                </span>
                              </>
                            )}
                          </button>
                        </td>
                      </tr>
                    ) : null}
                    <tr
                      onClick={() => onSelectLine(row.lineId)}
                      className={`ui-data-grid-row cursor-pointer border-l-[3px] ${sourceLine ? rowAccentClass(sourceLine) : 'border-l-slate-200'} ${
                        selected
                          ? 'bg-blue-50/90 shadow-[inset_0_0_0_1px_rgba(11,61,145,0.14)]'
                          : stripe
                            ? 'bg-white'
                            : 'bg-slate-50/80'
                      } hover:bg-slate-100/80`}
                    >
                      {isTakeoffView ? (
                        <>
                          <td className="ui-table-cell min-w-0 pr-4">
                            <div
                              className="ui-table-title"
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
                            {disp.subtitle ? <div className="ui-table-meta line-clamp-2">{disp.subtitle}</div> : null}
                            {row.category ? <div className="ui-table-meta">{row.category}</div> : null}
                            {(organizeBy === 'item' && (row.roomHint || row.roomLabel)) || (organizeBy === 'room' && takeoffShowRoom && row.roomLabel) ? (
                              <div className="mt-0.5 text-xs font-medium leading-snug text-slate-600">{row.roomHint || row.roomLabel}</div>
                            ) : null}
                          </td>
                          <td className="ui-table-cell whitespace-nowrap text-right tabular-nums">
                            <span className="ui-table-num">{formatNumberSafe(row.qty, row.qty % 1 === 0 ? 0 : 2)}</span>
                            <span className="ml-1.5 text-xs font-normal text-slate-600">{row.unit}</span>
                          </td>
                          <td className="ui-table-cell text-right tabular-nums">
                            <div className="ui-table-num leading-tight" title={`${formatNumberSafe(row.laborMinutesExtended, row.laborMinutesExtended % 1 === 0 ? 0 : 1)} min total`}>
                              {formatLaborDurationMinutes(row.laborMinutesExtended)}
                            </div>
                            {row.qty !== 1 ? (
                              <div className="ui-table-meta text-right">{formatNumberSafe(row.laborMinutesPerUnit, row.laborMinutesPerUnit % 1 === 0 ? 0 : 1)}/u</div>
                            ) : null}
                          </td>
                          <td className="ui-table-cell pl-2 text-right" onClick={stopRowEvent}>
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  (onOpenLineDetail ?? onSelectLine)(row.lineId);
                                }}
                                className={`ui-table-action ${selected ? 'border-blue-400 bg-blue-50 text-blue-900' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
                              >
                                {selected ? (
                                  <span className="inline-flex items-center gap-1">
                                    <Sparkles className="h-3.5 w-3.5 shrink-0" />
                                    Open
                                  </span>
                                ) : organizeBy === 'item' ? (
                                  'View'
                                ) : (
                                  'Edit'
                                )}
                              </button>
                              {row.canDelete ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDeleteLine(row.lineId);
                                  }}
                                  className="ui-table-action w-7 min-w-[1.75rem] border-transparent px-0 text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                                  aria-label="Delete line"
                                >
                                  ×
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="ui-table-cell min-w-0 align-top">
                            <div
                              className="ui-table-title line-clamp-2 break-words"
                              title={[row.description, row.modifierNames?.length ? row.modifierNames.join(' · ') : '', row.sku ? `SKU ${row.sku}` : '', row.notes || ''].filter(Boolean).join(' · ')}
                            >
                              {disp.title || row.description || '—'}
                            </div>
                            {disp.subtitle ? <div className="ui-table-meta line-clamp-2">{disp.subtitle}</div> : null}
                            {modifierLine(row.modifierNames)}
                            {!isTakeoffView ? pricingStreamPills() : null}
                          </td>
                          <td className="ui-table-cell">
                            <div className="text-xs font-normal leading-snug text-slate-800" title={row.roomHint || row.roomLabel}>
                              {row.roomLabel}
                            </div>
                            {row.roomHint && row.roomHint !== row.roomLabel ? <div className="ui-table-meta truncate">{row.roomHint}</div> : null}
                          </td>
                          <td className="ui-table-cell">
                            <div className="line-clamp-2 text-xs font-normal leading-snug text-slate-700" title={row.category || 'Uncategorized'}>
                              {row.category || 'Uncategorized'}
                            </div>
                          </td>
                          <td className="ui-table-cell text-right tabular-nums">
                            <span className="ui-table-num">{row.qty}</span>
                          </td>
                          <td className="ui-table-cell text-center text-xs font-normal text-slate-700">{row.unit}</td>
                          {!isTakeoffView && showLabor ? (
                            <td className="ui-table-cell">
                              <div className="ui-table-num leading-tight" title={`${formatNumberSafe(row.laborMinutesExtended, row.laborMinutesExtended % 1 === 0 ? 0 : 1)} min total`}>
                                {formatLaborDurationMinutes(row.laborMinutesExtended)}
                              </div>
                              {row.qty !== 1 ? (
                                <div className="ui-table-meta">{formatNumberSafe(row.laborMinutesPerUnit, row.laborMinutesPerUnit % 1 === 0 ? 0 : 1)} min/u</div>
                              ) : null}
                            </td>
                          ) : null}
                          {!isTakeoffView && showLabor ? (
                            <td className="ui-table-cell border-l border-slate-200/80 pl-2.5 text-right">
                              <div className="ui-table-num text-right">{formatCurrencySafe(effectiveLaborCost)}</div>
                              {laborMultiplier !== 1 ? <div className="ui-table-meta text-right">base {formatCurrencySafe(row.laborCost)}</div> : null}
                            </td>
                          ) : null}
                          {!isTakeoffView && showMaterial ? (
                            <td className="ui-table-cell text-right">
                              <span className="ui-table-num">{formatCurrencySafe(row.materialCost)}</span>
                              <div className="ui-table-meta text-right text-[10px] text-slate-500">mat / u</div>
                            </td>
                          ) : null}
                          {!isTakeoffView ? (
                            <td className="ui-table-cell text-right">
                              <span className="ui-table-num">{formatCurrencySafe(row.unitSell)}</span>
                              {showMaterial && showLabor ? (
                                <div className="ui-table-meta text-right text-[10px] text-slate-500">mat + labor</div>
                              ) : showLabor ? (
                                <div className="ui-table-meta text-right text-[10px] text-slate-500">labor-led</div>
                              ) : showMaterial ? (
                                <div className="ui-table-meta text-right text-[10px] text-slate-500">material-led</div>
                              ) : null}
                            </td>
                          ) : null}
                          {!isTakeoffView ? (
                            <td className="ui-table-cell text-right">
                              <span className="ui-table-num-em">{formatCurrencySafe(row.lineTotal)}</span>
                            </td>
                          ) : null}
                          {!isTakeoffView ? (
                            <td className="ui-table-cell align-top text-left">{addInsSummaryCell(row.modifierRollup, row.modifierNames)}</td>
                          ) : null}
                          <td className="ui-table-cell pl-2 text-right" onClick={stopRowEvent}>
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  (onOpenLineDetail ?? onSelectLine)(row.lineId);
                                }}
                                className={`ui-table-action ${selected ? 'border-blue-300 bg-blue-50 text-blue-800' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
                              >
                                {selected ? (
                                  <span className="inline-flex items-center gap-1">
                                    <Sparkles className="h-3.5 w-3.5 shrink-0" />
                                    {onOpenLineDetail ? 'Open' : 'Line'}
                                  </span>
                                ) : onOpenLineDetail ? (
                                  'Open'
                                ) : (
                                  'Line'
                                )}
                              </button>
                              {row.canDelete ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDeleteLine(row.lineId);
                                  }}
                                  className="ui-table-action w-7 min-w-[1.75rem] border-transparent px-0 text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                                  aria-label="Delete line"
                                >
                                  ×
                                </button>
                              ) : null}
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
