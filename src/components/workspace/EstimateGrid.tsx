import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Copy, Info, Layers3, Sparkles, Trash2 } from 'lucide-react';
import { PricingMode, RoomRecord, TakeoffLineModifierRollup, TakeoffLineRecord, isMaterialOnlyMainBid } from '../../shared/types/estimator';
import { formatClientProposalItemDisplay } from '../../shared/utils/proposalDocument';
import { formatCurrencySafe, formatLaborDurationMinutes, formatNumberSafe } from '../../utils/numberFormat';
import { api } from '../../services/api';
import { filterDisplayRowsVisibleInTable, visibleConcreteLineIds } from '../../shared/utils/estimateBulkSelection';

interface Props {
  lines: TakeoffLineRecord[];
  rooms: RoomRecord[];
  categories: string[];
  roomNamesById: Record<string, string>;
  pricingMode: PricingMode;
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
  /** When set, row actions include duplicate (same visibility as delete: not on combined “all rooms” rollups). */
  onDuplicateLine?: (lineId: string) => void;
  /** Visual weight: workspace uses a stronger frame for the pricing grid. */
  workspaceFrame?: boolean;
  /** When true (pricing view only), inject category group divider rows at category boundaries. Rows must already be sorted by category. */
  categoryGroupHeaders?: boolean;
  /** When true, first column is selection checkboxes for rows with `canDelete` (real line ids only). */
  multiSelectEnabled?: boolean;
  bulkSelectedLineIds?: string[];
  onBulkToggleLine?: (lineId: string) => void;
  /** Toggle select-all for rows currently visible in the table (excludes collapsed bundle children). */
  onBulkHeaderApplyVisibleToggle?: (visibleConcreteLineIds: string[]) => void;
  /** When set, matching concrete rows get a light highlight (e.g. estimate health strip focus). */
  healthHighlightLineIds?: ReadonlySet<string> | null;
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
  /** Intake-persisted bid bucket (e.g. "Base Bid" / "Alt 1"). Used for estimate-workspace bid-split chips. */
  sourceBidBucket: string | null;
  /** Source manufacturer inherited from the intake section header, if any. */
  sourceManufacturer: string | null;
  /** `source`, `catalog`, or `install_family` — drives the "generated labor" badge. */
  laborOrigin: 'source' | 'catalog' | 'install_family' | null;
  /** Catalog- or heuristic-seeded install-labor-family key, surfaced in the row tooltip. */
  installLaborFamily: string | null;
  /** Snapshot of chosen/inferred catalog attributes for the line (new work only). */
  catalogAttributeSnapshot?: Array<{
    attributeType: 'finish' | 'coating' | 'grip' | 'mounting' | 'assembly';
    attributeValue: string;
    source: 'user' | 'inferred';
  }> | null;
  /** Whether the row was classified as installable scope during intake. */
  isInstallableScope: boolean | null;
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
  onDuplicateLine,
  workspaceFrame = false,
  categoryGroupHeaders = false,
  multiSelectEnabled = false,
  bulkSelectedLineIds = [],
  onBulkToggleLine,
  onBulkHeaderApplyVisibleToggle,
  healthHighlightLineIds = null,
}: Props) {
  const [collapsedBundles, setCollapsedBundles] = useState<Record<string, boolean>>({});
  /**
   * Phase 1.4 — row-level "why this labor" inspector. One row at a time keeps the grid
   * readable; clicking the info button again on the same row collapses it. The inspector
   * exposes the labor-origin chain (source vs catalog vs install-family fallback), the
   * unit and extended minutes, the unit labor $, and the current add-in deltas so the
   * estimator can answer "where does this labor come from?" without opening the modal.
   */
  const [inspectorOpenLineId, setInspectorOpenLineId] = useState<string | null>(null);
  const [catalogAttrsByItemId, setCatalogAttrsByItemId] = useState<Record<string, import('../../types').CatalogItemAttribute[]>>({});
  const [catalogAttrsLoadingItemId, setCatalogAttrsLoadingItemId] = useState<string | null>(null);
  const toggleInspector = (lineId: string) => {
    setInspectorOpenLineId((current) => (current === lineId ? null : lineId));
  };

  async function ensureCatalogItemAttributesLoaded(catalogItemId: string) {
    if (!catalogItemId) return;
    if (catalogAttrsByItemId[catalogItemId]) return;
    setCatalogAttrsLoadingItemId(catalogItemId);
    try {
      const rows = await api.listCatalogItemAttributes(catalogItemId);
      setCatalogAttrsByItemId((prev) => ({ ...prev, [catalogItemId]: rows }));
    } finally {
      setCatalogAttrsLoadingItemId(null);
    }
  }
  const showMaterial = pricingMode !== 'labor_only';
  const showLabor = !isMaterialOnlyMainBid(pricingMode);
  const isTakeoffView = viewMode === 'takeoff';
  const addInsColumn = !isTakeoffView ? 1 : 0;

  /** Fixed column shares so the line grid—not a single description column—uses most width sensibly */
  const estimateColWidths = useMemo(() => {
    if (isTakeoffView) return null;
    const pad = multiSelectEnabled ? (['2.25rem'] as const) : [];
    if (showLabor && showMaterial) {
      return [...pad, '21%', '8%', '9%', '4%', '3%', '7%', '8%', '7%', '7%', '7%', '9%', '6%'];
    }
    if (showLabor) {
      return [...pad, '22%', '9%', '10%', '4%', '4%', '8%', '9%', '8%', '7%', '8%', '9%'];
    }
    return [...pad, '25%', '9%', '11%', '4%', '4%', '10%', '10%', '10%', '9%', '10%'];
  }, [isTakeoffView, showLabor, showMaterial, multiSelectEnabled]);

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

  /**
   * Compact chips surfacing the intake-derived context on each row so the estimate
   * workspace has visible parity with the intake review panel:
   *   - Bid bucket ("Base Bid" / "Alt 1") so split bids are visible in the grid.
   *   - Labor origin ("Gen labor") when minutes came from the install-family fallback,
   *     with a tooltip that includes the install-labor-family key for transparency.
   *   - Source manufacturer (muted) so multi-vendor documents keep attribution.
   */
  function bidBucketBadgeClass(bucket: string): string {
    const lc = bucket.toLowerCase();
    if (lc.includes('alt')) return 'bg-indigo-50 text-indigo-900 ring-indigo-100/90';
    if (lc === 'mixed') return 'bg-amber-50 text-amber-900 ring-amber-100/90';
    if (lc.includes('base')) return 'bg-emerald-50 text-emerald-900 ring-emerald-100/90';
    if (lc.includes('deduct')) return 'bg-rose-50 text-rose-900 ring-rose-100/90';
    if (lc.includes('allowance')) return 'bg-sky-50 text-sky-900 ring-sky-100/90';
    return 'bg-slate-100 text-slate-700 ring-slate-200/80';
  }

  function intakeContextChips(row: DisplayRow) {
    const chips: React.ReactNode[] = [];
    const missingFlags: string[] = [];
    if (showMaterial && (!Number.isFinite(row.materialCost) || row.materialCost <= 0)) {
      missingFlags.push('Material');
    }
    if (showLabor && (!Number.isFinite(row.laborMinutesExtended) || row.laborMinutesExtended <= 0)) {
      missingFlags.push('Labor');
    }
    if (showLabor && (!String(row.installLaborFamily || '').trim()) && (!Number.isFinite(row.laborMinutesExtended) || row.laborMinutesExtended <= 0)) {
      missingFlags.push('Install family');
    }
    if (missingFlags.length > 0) {
      chips.push(
        <span
          key="missing"
          className="inline-flex max-w-[14rem] items-center gap-1 rounded bg-rose-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-rose-950 ring-1 ring-rose-100/90"
          title={`Missing: ${missingFlags.join(' · ')}`}
        >
          Missing
          <span className="truncate font-mono normal-case text-rose-900/80">· {missingFlags.join(', ')}</span>
        </span>
      );
    }
    if (row.sourceBidBucket) {
      chips.push(
        <span
          key="bid-bucket"
          className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ring-1 ${bidBucketBadgeClass(row.sourceBidBucket)}`}
          title={`Bid bucket from intake: ${row.sourceBidBucket}`}
        >
          {row.sourceBidBucket}
        </span>
      );
    }
    if (row.laborOrigin === 'install_family') {
      const familyKey = row.installLaborFamily || null;
      const familyLabel = familyKey || 'install family';
      const minutesPerUnit = Number.isFinite(row.laborMinutesPerUnit) && row.laborMinutesPerUnit > 0
        ? row.laborMinutesPerUnit
        : null;
      const extendedMinutes = Number.isFinite(row.laborMinutesExtended) && row.laborMinutesExtended > 0
        ? row.laborMinutesExtended
        : null;
      const tooltipParts = [`Labor generated from install-labor family \`${familyLabel}\``];
      if (minutesPerUnit !== null) {
        tooltipParts.push(`~${minutesPerUnit.toFixed(minutesPerUnit < 10 ? 1 : 0)} min / unit`);
      }
      if (extendedMinutes !== null && extendedMinutes !== minutesPerUnit) {
        tooltipParts.push(`${Math.round(extendedMinutes)} min total`);
      }
      tooltipParts.push('No explicit labor on catalog item or source document.');
      chips.push(
        <span
          key="labor-origin"
          className="inline-flex max-w-[14rem] items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-950 ring-1 ring-amber-100/90"
          title={tooltipParts.join(' — ')}
        >
          <span>Gen labor</span>
          {familyKey ? (
            <span className="truncate font-mono normal-case text-amber-900/80" aria-label={`install family ${familyKey}`}>
              · {familyKey}
            </span>
          ) : null}
        </span>
      );
    } else if (row.laborOrigin === 'catalog' && row.isInstallableScope) {
      chips.push(
        <span
          key="labor-origin"
          className="rounded bg-sky-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-sky-900 ring-1 ring-sky-100/90"
          title="Labor minutes came from the matched catalog item (not the source document)."
        >
          Cat labor
        </span>
      );
    }
    if (row.sourceManufacturer) {
      chips.push(
        <span
          key="manufacturer"
          className="rounded bg-slate-50 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-slate-600 ring-1 ring-slate-200/80"
          title={`Source manufacturer: ${row.sourceManufacturer}`}
        >
          {row.sourceManufacturer}
        </span>
      );
    }
    if (chips.length === 0) return null;
    return <div className="mt-1 flex flex-wrap items-center gap-1" aria-hidden={false}>{chips}</div>;
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

  /**
   * Phase 1.4 — render the "why this labor" inspector row. Displayed below the opened
   * row and spans the whole grid width; answers: where did the labor minutes come from
   * (source doc, catalog item, or install-family fallback), what install family, how
   * many minutes per unit vs extended, unit labor $, and add-in deltas.
   */
  function renderLaborInspector(row: DisplayRow) {
    const origin = row.laborOrigin;
    const originLabel =
      origin === 'install_family'
        ? 'Install-family fallback'
        : origin === 'catalog'
          ? 'Catalog item labor'
          : origin === 'source'
            ? 'Source document labor'
            : origin === null || origin === undefined
              ? 'Not classified'
              : origin;
    const originExplanation =
      origin === 'install_family'
        ? 'Source document and matched catalog item had no explicit labor. Minutes were generated from the install-labor family so the line still carries install pricing.'
        : origin === 'catalog'
          ? 'Labor minutes were taken from the matched catalog item.'
          : origin === 'source'
            ? 'Labor minutes were priced on the source document itself.'
            : (origin as unknown as string) === 'mixed'
              ? 'Multiple underlying lines had different labor origins — expand to a single-room view to inspect each line individually.'
              : 'No labor origin recorded (typically a manual line).';
    const mins = row.laborMinutesPerUnit;
    const minsExtended = row.laborMinutesExtended;
    const unitLabor = row.laborCost;
    const unitMaterial = row.materialCost;
    const rollup = row.modifierRollup;
    const addinCount = rollup?.count ?? 0;
    const originTone =
      origin === 'install_family'
        ? 'bg-amber-50 text-amber-950 ring-amber-100/90'
        : origin === 'catalog'
          ? 'bg-sky-50 text-sky-900 ring-sky-100/90'
          : origin === 'source'
            ? 'bg-emerald-50 text-emerald-900 ring-emerald-100/90'
            : 'bg-slate-100 text-slate-700 ring-slate-200/80';

    const snapshot = row.catalogAttributeSnapshot || null;
    const selectedKeys = new Set((snapshot || []).map((a) => `${a.attributeType}:${a.attributeValue}`));
    const sourceLine = lines.find((l) => l.id === row.lineId) || null;
    const catalogItemId = sourceLine?.catalogItemId || null;

    const materialDeltas = sourceLine?.attributeDeltaMaterialSnapshot || null;
    const laborDeltas = sourceLine?.attributeDeltaLaborSnapshot || null;
    const hasDeltaSnapshots = Boolean((materialDeltas && materialDeltas.length) || (laborDeltas && laborDeltas.length));

    const snapshotEffectIndex = (() => {
      const index = new Map<string, { mat: boolean; labor: boolean }>();
      (materialDeltas || []).forEach((d) => {
        const key = `${d.attributeType}:${d.attributeValue}`;
        index.set(key, { mat: true, labor: index.get(key)?.labor ?? false });
      });
      (laborDeltas || []).forEach((d) => {
        const key = `${d.attributeType}:${d.attributeValue}`;
        index.set(key, { mat: index.get(key)?.mat ?? false, labor: true });
      });
      return index;
    })();

    const attributeChipRows = (snapshot || []).slice(0, 6).map((s) => {
      const key = `${s.attributeType}:${s.attributeValue}`;
      const effect = snapshotEffectIndex.get(key) || null;
      const affectsMaterial = effect?.mat ?? false;
      const affectsLabor = effect?.labor ?? false;
      const tone =
        affectsMaterial && affectsLabor
          ? 'bg-violet-50 text-violet-900 ring-violet-100/90'
          : affectsMaterial
            ? 'bg-emerald-50 text-emerald-900 ring-emerald-100/90'
            : affectsLabor
              ? 'bg-amber-50 text-amber-950 ring-amber-100/90'
              : 'bg-white text-slate-700 ring-slate-200/80';
      const effectLabel = affectsMaterial && affectsLabor ? 'Mat+Labor' : affectsMaterial ? 'Material' : affectsLabor ? 'Labor' : 'Selected';
      return { key, label: key, effectLabel, tone };
    });

    const baseMaterialCost = sourceLine?.baseMaterialCostSnapshot ?? sourceLine?.baseMaterialCost ?? null;
    const finalMaterialCost = sourceLine?.materialCost ?? null;
    const materialDelta =
      baseMaterialCost != null && finalMaterialCost != null ? Number((finalMaterialCost - baseMaterialCost).toFixed(2)) : null;

    const baseLaborMinutes = sourceLine?.baseLaborMinutesSnapshot ?? null;
    const finalLaborMinutes = sourceLine?.laborMinutes ?? null;
    const laborDelta =
      baseLaborMinutes != null && finalLaborMinutes != null ? Number((finalLaborMinutes - baseLaborMinutes).toFixed(2)) : null;

    const materialDeltaLines = (materialDeltas || []).slice(0, 6).map((d) => {
      const key = `${d.attributeType}:${d.attributeValue}`;
      const applied = Number(d.appliedAmount ?? 0);
      return { key, label: key, applied };
    });
    const laborDeltaLines = (laborDeltas || []).slice(0, 6).map((d) => {
      const key = `${d.attributeType}:${d.attributeValue}`;
      const applied = Number(d.appliedAmount ?? 0);
      return { key, label: key, applied };
    });
    return (
      <div className="space-y-2 rounded-xl bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_100%)] p-3 text-[11px] text-slate-700 shadow-inner ring-1 ring-slate-200/80">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500">Why this labor</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${originTone}`}>{originLabel}</span>
              {row.installLaborFamily ? (
                <span className="rounded-full bg-white px-2 py-0.5 font-mono text-[10px] font-semibold text-slate-700 ring-1 ring-slate-200/80" title="Install-labor family key">
                  {row.installLaborFamily}
                </span>
              ) : null}
              {row.isInstallableScope ? (
                <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-900 ring-1 ring-violet-100/90" title="Classified as installable scope during intake">
                  Installable scope
                </span>
              ) : null}
              {row.sourceBidBucket ? (
                <span className="rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700 ring-1 ring-slate-200/80" title="Bid bucket inherited from intake section">
                  {row.sourceBidBucket}
                </span>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setInspectorOpenLineId(null);
            }}
            className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 shadow-sm transition hover:bg-slate-50"
          >
            Close
          </button>
        </div>
        <p className="max-w-prose text-[11px] leading-snug text-slate-600">{originExplanation}</p>
        {snapshot && snapshot.length > 0 ? (
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                Selected options
                <span className="ml-1.5 text-[10px] font-medium normal-case tracking-normal text-slate-500">
                  {`(includes ${snapshot.length} option${snapshot.length === 1 ? '' : 's'} in pricing)`}
                </span>
              </p>
              {catalogItemId && !hasDeltaSnapshots && !catalogAttrsByItemId[catalogItemId] ? (
                <button
                  type="button"
                  className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 shadow-sm hover:bg-slate-50"
                  onClick={(e) => {
                    e.stopPropagation();
                    void ensureCatalogItemAttributesLoaded(catalogItemId);
                  }}
                  disabled={catalogAttrsLoadingItemId === catalogItemId}
                >
                  {catalogAttrsLoadingItemId === catalogItemId ? 'Loading…' : 'Load effects'}
                </button>
              ) : null}
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {attributeChipRows.map((chip) => (
                <span
                  key={chip.key}
                  className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold ring-1 ${chip.tone}`}
                  title="Selected option snapshot"
                >
                  <span className="mr-1.5 font-sans text-[9px] font-semibold uppercase tracking-wide opacity-80">{chip.effectLabel}</span>
                  {chip.label}
                </span>
              ))}
            </div>
          </div>
        ) : null}
        {sourceLine && snapshot && snapshot.length > 0 ? (
          <div className="grid grid-cols-1 gap-1.5 md:grid-cols-3">
            <div className="rounded-lg bg-white px-2 py-1.5 shadow-sm ring-1 ring-slate-200/80">
              <p className="text-[9px] font-semibold uppercase tracking-[0.06em] text-slate-500">Material (base → final)</p>
              <p className="mt-0.5 text-[12px] font-semibold tabular-nums text-slate-900">
                {baseMaterialCost != null ? formatCurrencySafe(baseMaterialCost) : '—'} → {finalMaterialCost != null ? formatCurrencySafe(finalMaterialCost) : '—'}
              </p>
              {materialDelta != null ? (
                <p className="mt-0.5 text-[9px] leading-snug text-slate-500">
                  {materialDelta >= 0 ? '+' : ''}
                  {formatCurrencySafe(materialDelta)} from options
                </p>
              ) : null}
            </div>
            <div className="rounded-lg bg-white px-2 py-1.5 shadow-sm ring-1 ring-slate-200/80">
              <p className="text-[9px] font-semibold uppercase tracking-[0.06em] text-slate-500">Labor minutes (base → final)</p>
              <p className="mt-0.5 text-[12px] font-semibold tabular-nums text-slate-900">
                {baseLaborMinutes != null ? `${formatNumberSafe(baseLaborMinutes, 2)} min` : '—'} → {finalLaborMinutes != null ? `${formatNumberSafe(finalLaborMinutes, 2)} min` : '—'}
              </p>
              {laborDelta != null ? <p className="mt-0.5 text-[9px] leading-snug text-slate-500">{laborDelta >= 0 ? '+' : ''}{formatNumberSafe(laborDelta, 2)} min from options</p> : null}
            </div>
            <div className="rounded-lg bg-white px-2 py-1.5 shadow-sm ring-1 ring-slate-200/80">
              <p className="text-[9px] font-semibold uppercase tracking-[0.06em] text-slate-500">Resolved (pricing)</p>
              <p className="mt-0.5 text-[12px] font-semibold tabular-nums text-slate-900">
                Mat {formatCurrencySafe(sourceLine.materialCost)} • Labor {formatCurrencySafe(sourceLine.laborCost)}
              </p>
              <p className="mt-0.5 text-[9px] leading-snug text-slate-500">Values shown already include selected options.</p>
            </div>
          </div>
        ) : null}
        {sourceLine && hasDeltaSnapshots ? (
          <div className="rounded-xl bg-white/70 p-2 ring-1 ring-slate-200/80">
            <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500">Applied option deltas (snapshotted)</p>
            <div className="mt-1 grid grid-cols-1 gap-1.5 md:grid-cols-2">
              <div className="rounded-lg bg-white px-2 py-1.5 shadow-sm ring-1 ring-slate-200/80">
                <p className="text-[9px] font-semibold uppercase tracking-[0.06em] text-slate-500">Material</p>
                {materialDeltaLines.length ? (
                  <div className="mt-1 space-y-0.5">
                    {materialDeltaLines.map((d) => (
                      <div key={d.key} className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="font-mono text-slate-700">{d.label}</span>
                        <span className="tabular-nums text-slate-900">{d.applied >= 0 ? '+' : ''}{formatCurrencySafe(d.applied)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-[11px] text-slate-500">No material deltas applied.</p>
                )}
              </div>
              <div className="rounded-lg bg-white px-2 py-1.5 shadow-sm ring-1 ring-slate-200/80">
                <p className="text-[9px] font-semibold uppercase tracking-[0.06em] text-slate-500">Labor minutes</p>
                {laborDeltaLines.length ? (
                  <div className="mt-1 space-y-0.5">
                    {laborDeltaLines.map((d) => (
                      <div key={d.key} className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="font-mono text-slate-700">{d.label}</span>
                        <span className="tabular-nums text-slate-900">{d.applied >= 0 ? '+' : ''}{formatNumberSafe(d.applied, 2)} min</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-[11px] text-slate-500">No labor deltas applied.</p>
                )}
              </div>
            </div>
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4">
          <div className="rounded-lg bg-white px-2 py-1.5 shadow-sm ring-1 ring-slate-200/80">
            <p className="text-[9px] font-semibold uppercase tracking-[0.06em] text-slate-500">Minutes / unit</p>
            <p className="mt-0.5 text-[12px] font-semibold tabular-nums text-slate-900">{formatNumberSafe(mins, 2)} min</p>
          </div>
          <div className="rounded-lg bg-white px-2 py-1.5 shadow-sm ring-1 ring-slate-200/80">
            <p className="text-[9px] font-semibold uppercase tracking-[0.06em] text-slate-500">Minutes (extended)</p>
            <p className="mt-0.5 text-[12px] font-semibold tabular-nums text-slate-900">
              {minsExtended >= 60 ? formatLaborDurationMinutes(minsExtended) : `${formatNumberSafe(minsExtended, 1)} min`}
            </p>
          </div>
          <div className="rounded-lg bg-white px-2 py-1.5 shadow-sm ring-1 ring-slate-200/80">
            <p className="text-[9px] font-semibold uppercase tracking-[0.06em] text-slate-500">Labor $ / unit</p>
            <p className="mt-0.5 text-[12px] font-semibold tabular-nums text-slate-900">{formatCurrencySafe(unitLabor)}</p>
            {mins > 0 && unitLabor > 0 ? (
              <p className="mt-0.5 text-[9px] leading-snug text-slate-500">≈ {formatCurrencySafe((unitLabor / mins) * 60)}/hr applied</p>
            ) : null}
          </div>
          <div className="rounded-lg bg-white px-2 py-1.5 shadow-sm ring-1 ring-slate-200/80">
            <p className="text-[9px] font-semibold uppercase tracking-[0.06em] text-slate-500">Material $ / unit</p>
            <p className="mt-0.5 text-[12px] font-semibold tabular-nums text-slate-900">{formatCurrencySafe(unitMaterial)}</p>
          </div>
        </div>
        <div className="rounded-lg bg-white px-2.5 py-2 shadow-sm ring-1 ring-slate-200/80">
          <p className="text-[9px] font-semibold uppercase tracking-[0.06em] text-slate-500">Add-in contributions</p>
          {addinCount > 0 && rollup ? (
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
              <span className="font-semibold text-violet-900">{addinCount} add-in{addinCount === 1 ? '' : 's'}</span>
              {rollup.addMaterialCost > 0.005 ? (
                <span className="tabular-nums text-slate-700">+{formatCurrencySafe(rollup.addMaterialCost)} material</span>
              ) : null}
              {rollup.addLaborMinutes > 0.05 ? (
                <span className="tabular-nums text-slate-700">+{formatNumberSafe(rollup.addLaborMinutes, 1)} min labor</span>
              ) : null}
              {rollup.hasPercentAdjustments ? (
                <span className="text-slate-500">% adjustments applied on base</span>
              ) : null}
            </div>
          ) : (
            <p className="mt-1 text-[11px] text-slate-500">No add-ins on this line.</p>
          )}
          {row.modifierNames.length > 0 ? (
            <p className="mt-1 text-[10px] leading-snug text-slate-500">{row.modifierNames.join(' · ')}</p>
          ) : null}
        </div>
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

  /**
   * Workstation aesthetic — drive the 3px left accent bar off the scope category
   * (partitions = green, screens/mirrors = blue, accessories = amber, exceptions
   * = red, unclassified = slate) instead of off the `sourceType`. This matches the
   * rest of the app (ScopeReviewPage, proposal) and gives the estimator an
   * at-a-glance color legend down the grid.
   */
  const rowAccentClass = (line: TakeoffLineRecord) => {
    const bucket = String(line.category || '').toLowerCase();
    if (bucket.includes('partition')) return 'border-l-emerald-500';
    if (bucket.includes('screen') || bucket.includes('mirror')) return 'border-l-blue-500';
    if (bucket.includes('accessor') || bucket.includes('grab') || bucket.includes('dispenser') || bucket.includes('disposal')) return 'border-l-amber-500';
    if (bucket.includes('exception') || bucket.includes('unknown')) return 'border-l-rose-500';
    if (line.bundleId) return 'border-l-indigo-400';
    return 'border-l-slate-300';
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
        sourceBidBucket: line.sourceBidBucket ?? null,
        sourceManufacturer: line.sourceManufacturer ?? null,
        laborOrigin: line.laborOrigin ?? null,
        installLaborFamily: line.installLaborFamily ?? null,
        catalogAttributeSnapshot: line.catalogAttributeSnapshot ?? null,
        isInstallableScope: line.isInstallableScope ?? null,
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
        sourceBidBucket: line.sourceBidBucket ?? null,
        sourceManufacturer: line.sourceManufacturer ?? null,
        laborOrigin: line.laborOrigin ?? null,
        installLaborFamily: line.installLaborFamily ?? null,
        catalogAttributeSnapshot: line.catalogAttributeSnapshot ?? null,
        isInstallableScope: line.isInstallableScope ?? null,
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

      const incomingBucket = line.sourceBidBucket ?? null;
      if (existing.sourceBidBucket && incomingBucket && existing.sourceBidBucket !== incomingBucket) {
        existing.sourceBidBucket = 'mixed';
      } else if (!existing.sourceBidBucket && incomingBucket) {
        existing.sourceBidBucket = incomingBucket;
      }
      const incomingOrigin = line.laborOrigin ?? null;
      if (existing.laborOrigin && incomingOrigin && existing.laborOrigin !== incomingOrigin) {
        // Prefer the "weakest" origin so the badge errs on the side of flagging generated labor.
        existing.laborOrigin =
          existing.laborOrigin === 'install_family' || incomingOrigin === 'install_family'
            ? 'install_family'
            : existing.laborOrigin === 'catalog' || incomingOrigin === 'catalog'
              ? 'catalog'
              : 'source';
      } else if (!existing.laborOrigin && incomingOrigin) {
        existing.laborOrigin = incomingOrigin;
      }
      if (!existing.installLaborFamily && line.installLaborFamily) existing.installLaborFamily = line.installLaborFamily;
      if (!existing.catalogAttributeSnapshot && line.catalogAttributeSnapshot) existing.catalogAttributeSnapshot = line.catalogAttributeSnapshot;
      if (existing.isInstallableScope == null && line.isInstallableScope != null) existing.isInstallableScope = line.isInstallableScope;
      if (!existing.sourceManufacturer && line.sourceManufacturer) existing.sourceManufacturer = line.sourceManufacturer;
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
          sourceBidBucket: entry.sourceBidBucket,
          sourceManufacturer: entry.sourceManufacturer,
          laborOrigin: entry.laborOrigin,
          installLaborFamily: entry.installLaborFamily,
          isInstallableScope: entry.isInstallableScope,
        };
      })
      .sort((left, right) => right.lineTotal - left.lineTotal || left.description.localeCompare(right.description));
  }, [lines, organizeBy, roomNamesById]);

  const collapsedBundleIdSet = useMemo(
    () => new Set(Object.keys(collapsedBundles).filter((bid) => collapsedBundles[bid])),
    [collapsedBundles]
  );
  const tableVisibleRows = useMemo(
    () => filterDisplayRowsVisibleInTable(displayRows, organizeBy, collapsedBundleIdSet),
    [displayRows, organizeBy, collapsedBundleIdSet]
  );

  const visibleConcreteInTable = useMemo(() => visibleConcreteLineIds(tableVisibleRows), [tableVisibleRows]);

  const baseColumnCount = isTakeoffView ? 4 : 8 + (showLabor ? 2 : 0) + (showMaterial ? 1 : 0) + addInsColumn;
  const multiSelectCol = multiSelectEnabled ? 1 : 0;
  const columnCount = baseColumnCount + multiSelectCol;

  const bulkSelectedSet = useMemo(() => new Set(bulkSelectedLineIds), [bulkSelectedLineIds]);
  const allVisibleConcreteSelected =
    visibleConcreteInTable.length > 0 && visibleConcreteInTable.every((id) => bulkSelectedSet.has(id));
  const someVisibleConcreteSelected = visibleConcreteInTable.some((id) => bulkSelectedSet.has(id));

  const bulkHeaderCheckboxRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = bulkHeaderCheckboxRef.current;
    if (!el || !multiSelectEnabled) return;
    el.indeterminate = someVisibleConcreteSelected && !allVisibleConcreteSelected;
  }, [multiSelectEnabled, someVisibleConcreteSelected, allVisibleConcreteSelected]);

  const panelClass = workspaceFrame && !isTakeoffView
    ? 'ui-panel overflow-hidden rounded-xl border-2 border-slate-200/90 shadow-md ring-1 ring-slate-200/40'
    : 'ui-panel overflow-hidden';

  /**
   * Workstation header strip — mirrors the reference's "ACTIVE AREA / LEDGER SUM"
   * kicker row above the grid. Only shown in the pricing (non-takeoff) view.
   */
  const ledgerSum = useMemo(
    () => displayRows.reduce((acc, r) => acc + Number(r.lineTotal || 0), 0),
    [displayRows]
  );
  const activeAreaLabel = useMemo(() => {
    if (organizeBy === 'item') return 'All Rooms';
    const names = Array.from(new Set(displayRows.map((r) => r.roomLabel).filter(Boolean)));
    if (names.length === 0) return 'No Room';
    if (names.length === 1) return names[0];
    return `${names.length} Rooms`;
  }, [displayRows, organizeBy]);

  /**
   * Ghost rows — render N empty numbered rows after the last real row so the
   * grid keeps its engineering-log density even on small estimates. Capped so
   * the grid does not get absurdly tall on large projects.
   */
  const ghostRowCount = isTakeoffView
    ? 0
    : Math.min(Math.max(8, 12 - displayRows.length), 12);

  return (
    <div className={panelClass}>
      {!isTakeoffView ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 bg-gradient-to-r from-white to-slate-50/60 px-3 py-2">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="ui-mono-kicker">Active Area</span>
            <span className="font-mono text-[12px] font-semibold uppercase tracking-[0.05em] text-slate-900">
              {activeAreaLabel}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="ui-mono-kicker">Ledger Sum</span>
            <span className="ui-mono-stat">{formatCurrencySafe(ledgerSum)}</span>
          </div>
        </div>
      ) : null}
      {isTakeoffView ? (
        <p className="border-b border-slate-100 bg-slate-50/95 px-3 py-1.5 text-[10px] leading-snug text-slate-600">
          {pricingMode === 'labor_only'
            ? 'Project is priced labor-only — material is hidden in Pricing; install time still drives labor here.'
            : pricingMode === 'material_only'
              ? 'Project is material-led — companion install labor (if any) is broken out separately in Pricing.'
              : pricingMode === 'material_with_optional_install_quote'
                ? 'Material-led bid with install quoted separately — install labor is tracked here for the companion quote.'
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
                  {multiSelectEnabled ? (
                    <th className="ui-table-th w-9 max-w-[2.25rem] px-2 text-center" scope="col">
                      {visibleConcreteInTable.length > 0 ? (
                        <input
                          ref={bulkHeaderCheckboxRef}
                          type="checkbox"
                          className="h-3.5 w-3.5 rounded border-slate-300 text-slate-900"
                          checked={allVisibleConcreteSelected}
                          onChange={() => onBulkHeaderApplyVisibleToggle?.(visibleConcreteInTable)}
                          aria-label="Select all lines visible in this table"
                          title="Select or clear all lines currently visible (excludes rolled-up combined rows)"
                        />
                      ) : null}
                    </th>
                  ) : null}
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
                  {multiSelectEnabled ? (
                    <th className="ui-table-th w-9 max-w-[2.25rem] px-2 text-center" scope="col">
                      {visibleConcreteInTable.length > 0 ? (
                        <input
                          ref={bulkHeaderCheckboxRef}
                          type="checkbox"
                          className="h-3.5 w-3.5 rounded border-slate-300 text-slate-900"
                          checked={allVisibleConcreteSelected}
                          onChange={() => onBulkHeaderApplyVisibleToggle?.(visibleConcreteInTable)}
                          aria-label="Select all lines visible in this table"
                          title="Select or clear all lines currently visible"
                        />
                      ) : null}
                    </th>
                  ) : null}
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
                const rowNumber = String(index + 1).padStart(3, '0');
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
                const healthHighlight = !!(healthHighlightLineIds?.size && healthHighlightLineIds.has(row.lineId));

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
                      } ${healthHighlight ? 'ring-2 ring-inset ring-amber-400/75' : ''} hover:bg-slate-100/80`}
                    >
                      {isTakeoffView ? (
                        <>
                          {multiSelectEnabled ? (
                            <td className="ui-table-cell w-9 max-w-[2.25rem] px-2 text-center align-middle" onClick={stopRowEvent}>
                              {row.canDelete ? (
                                <input
                                  type="checkbox"
                                  className="h-3.5 w-3.5 rounded border-slate-300 text-slate-900"
                                  checked={bulkSelectedSet.has(row.lineId)}
                                  onChange={() => onBulkToggleLine?.(row.lineId)}
                                  aria-label={`Select line for bulk delete: ${row.description || row.lineId}`}
                                />
                              ) : null}
                            </td>
                          ) : null}
                          <td className="ui-table-cell min-w-0 pr-4">
                            <div className="mb-0.5 flex items-center gap-1.5">
                              <span className="font-mono text-[10px] font-semibold tabular-nums tracking-[0.1em] text-slate-400">{rowNumber}</span>
                              {row.sku ? (
                                <span className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-slate-400">
                                  · IDREF <span className="text-slate-600">{row.sku}</span>
                                </span>
                              ) : null}
                            </div>
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
                            {intakeContextChips(row)}
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
                                  toggleInspector(row.lineId);
                                }}
                                className={`ui-table-action w-7 min-w-[1.75rem] border-transparent px-0 ${
                                  inspectorOpenLineId === row.lineId
                                    ? 'bg-blue-50 text-blue-800 ring-1 ring-blue-200'
                                    : 'text-slate-500 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700'
                                }`}
                                aria-label="Why this labor?"
                                title="Why this labor? (unit minutes, install family, add-ins, rate applied)"
                              >
                                <Info className="h-3.5 w-3.5" aria-hidden />
                              </button>
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
                              {onDuplicateLine && row.canDelete ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDuplicateLine(row.lineId);
                                  }}
                                  className="ui-table-action w-7 min-w-[1.75rem] border-transparent px-0 text-slate-500 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800"
                                  aria-label="Duplicate line"
                                  title="Duplicate line into the room selected for new lines"
                                >
                                  <Copy className="h-3.5 w-3.5" aria-hidden />
                                </button>
                              ) : null}
                              {row.canDelete ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (window.confirm('Delete this line item?')) {
                                      onDeleteLine(row.lineId);
                                    }
                                  }}
                                  className="ui-table-action w-7 min-w-[1.75rem] border-transparent px-0 text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                                  aria-label="Delete line"
                                  title="Delete line"
                                >
                                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          {multiSelectEnabled ? (
                            <td className="ui-table-cell w-9 max-w-[2.25rem] px-2 text-center align-top pt-3" onClick={stopRowEvent}>
                              {row.canDelete ? (
                                <input
                                  type="checkbox"
                                  className="h-3.5 w-3.5 rounded border-slate-300 text-slate-900"
                                  checked={bulkSelectedSet.has(row.lineId)}
                                  onChange={() => onBulkToggleLine?.(row.lineId)}
                                  aria-label={`Select line for bulk delete: ${row.description || row.lineId}`}
                                />
                              ) : null}
                            </td>
                          ) : null}
                          <td className="ui-table-cell min-w-0 align-top">
                            <div className="mb-0.5 flex items-center gap-1.5">
                              <span className="font-mono text-[10px] font-semibold tabular-nums tracking-[0.1em] text-slate-400">{rowNumber}</span>
                              {row.sku ? (
                                <span className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-slate-400">
                                  · IDREF <span className="text-slate-600">{row.sku}</span>
                                </span>
                              ) : null}
                            </div>
                            <div
                              className="ui-table-title line-clamp-2 break-words"
                              title={[row.description, row.modifierNames?.length ? row.modifierNames.join(' · ') : '', row.sku ? `SKU ${row.sku}` : '', row.notes || ''].filter(Boolean).join(' · ')}
                            >
                              {disp.title || row.description || '—'}
                            </div>
                            {disp.subtitle ? <div className="ui-table-meta line-clamp-2">{disp.subtitle}</div> : null}
                            {modifierLine(row.modifierNames)}
                            {intakeContextChips(row)}
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
                              {row.catalogAttributeSnapshot && row.catalogAttributeSnapshot.length > 0 ? (
                                <div className="ui-table-meta text-[10px] text-slate-500">incl options</div>
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
                              {row.catalogAttributeSnapshot && row.catalogAttributeSnapshot.length > 0 ? (
                                <div className="ui-table-meta text-right text-[10px] text-slate-500">incl options</div>
                              ) : null}
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
                                  toggleInspector(row.lineId);
                                }}
                                className={`ui-table-action w-7 min-w-[1.75rem] border-transparent px-0 ${
                                  inspectorOpenLineId === row.lineId
                                    ? 'bg-blue-50 text-blue-800 ring-1 ring-blue-200'
                                    : 'text-slate-500 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700'
                                }`}
                                aria-label="Why this labor?"
                                title="Why this labor? (unit minutes, install family, add-ins, rate applied)"
                              >
                                <Info className="h-3.5 w-3.5" aria-hidden />
                              </button>
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
                              {onDuplicateLine && row.canDelete ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDuplicateLine(row.lineId);
                                  }}
                                  className="ui-table-action w-7 min-w-[1.75rem] border-transparent px-0 text-slate-500 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800"
                                  aria-label="Duplicate line"
                                  title="Duplicate line into the room selected for new lines"
                                >
                                  <Copy className="h-3.5 w-3.5" aria-hidden />
                                </button>
                              ) : null}
                              {row.canDelete ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (window.confirm('Delete this line item?')) {
                                      onDeleteLine(row.lineId);
                                    }
                                  }}
                                  className="ui-table-action w-7 min-w-[1.75rem] border-transparent px-0 text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                                  aria-label="Delete line"
                                  title="Delete line"
                                >
                                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                    {inspectorOpenLineId === row.lineId ? (
                      <tr className="border-b border-slate-200/80 bg-slate-50/40">
                        <td colSpan={columnCount} className="px-3 py-2">
                          {renderLaborInspector(row)}
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                );
              })
            )}
            {!isTakeoffView && ghostRowCount > 0
              ? Array.from({ length: ghostRowCount }, (_, ghostIdx) => {
                  const ghostNumber = String(displayRows.length + ghostIdx + 1).padStart(3, '0');
                  return (
                    <tr key={`ghost-${ghostIdx}`} className="border-b border-slate-100/80 bg-white/60">
                      <td className="px-3 py-2.5" colSpan={columnCount}>
                        <div className="flex items-center gap-2 opacity-60">
                          <span className="font-mono text-[10px] font-semibold tabular-nums tracking-[0.1em] text-slate-300">
                            {ghostNumber}
                          </span>
                          <span className="text-[11px] italic text-slate-300">— open slot —</span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              : null}
          </tbody>
        </table>
        <datalist id={`estimate-grid-categories-${viewMode}`}>
          {categories.filter((category) => category && category !== 'all').map((category) => <option key={category} value={category} />)}
        </datalist>
      </div>
    </div>
  );
}
