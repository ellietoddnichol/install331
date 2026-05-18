import React, { useEffect, useMemo, useState } from 'react';
import type {
  LineModifierRecord,
  ModifierRecord,
  PricingMode,
  ProposalVisibility,
  RoomRecord,
  TakeoffLineRecord,
  TakeoffPricingSource,
} from '../../../shared/types/estimator';
import type { ProjectJobConditions } from '../../../shared/types/estimator';
import { deriveEstimateLaborBasisUi } from '../../../shared/utils/estimateCockpitDerived';
import { createDefaultProjectJobConditions } from '../../../shared/utils/jobConditions';
import { ModifierPanel } from '../ModifierPanel';
import { CatalogCategorySelect } from '../../intake/CatalogCategorySelect';
import { formatCurrencySafe } from '../../../utils/numberFormat';

interface LineDraft {
  description: string;
  qty: number;
  unit: string;
  roomId: string;
  category: string | null;
  notes: string | null;
  materialCost: number;
  laborMinutes: number;
  laborCost: number;
  unitSell: number;
  pricingSource: TakeoffPricingSource;
  proposalVisibility: ProposalVisibility;
}

function lineToDraft(line: TakeoffLineRecord): LineDraft {
  return {
    description: line.description || '',
    qty: Number(line.qty) || 0,
    unit: line.unit || 'EA',
    roomId: line.roomId,
    category: line.category,
    notes: line.notes,
    materialCost: Number(line.materialCost) || 0,
    laborMinutes: Number(line.laborMinutes) || 0,
    laborCost: Number(line.laborCost) || 0,
    unitSell: Number(line.unitSell) || 0,
    pricingSource: line.pricingSource,
    proposalVisibility: line.proposalVisibility || 'customer_visible',
  };
}

function draftsEqual(a: LineDraft, b: LineDraft): boolean {
  return (
    a.description === b.description &&
    a.qty === b.qty &&
    a.unit === b.unit &&
    a.roomId === b.roomId &&
    a.category === b.category &&
    a.notes === b.notes &&
    a.materialCost === b.materialCost &&
    a.laborMinutes === b.laborMinutes &&
    a.laborCost === b.laborCost &&
    a.unitSell === b.unitSell &&
    a.pricingSource === b.pricingSource &&
    a.proposalVisibility === b.proposalVisibility
  );
}

interface EstimateCockpitLinePanelProps {
  line: TakeoffLineRecord | null;
  rooms: RoomRecord[];
  categories: string[];
  pricingMode: PricingMode;
  jobConditions: ProjectJobConditions | null | undefined;
  catalogModifiers: ModifierRecord[];
  lineModifiers: LineModifierRecord[];
  showMaterial: boolean;
  showLabor: boolean;
  /** Condition labor multiplier from summary */
  projectLaborMultiplier: number;
  onSave: (lineId: string, updates: Partial<TakeoffLineRecord>) => Promise<void>;
  onClearSelection: () => void;
  onApplyModifier: (modifierId: string) => void;
  onRemoveModifier: (lineModifierId: string) => void;
  onOpenAdvancedTools?: () => void;
}

export function EstimateCockpitLinePanel({
  line,
  rooms,
  categories,
  pricingMode,
  jobConditions,
  catalogModifiers,
  lineModifiers,
  showMaterial,
  showLabor,
  projectLaborMultiplier,
  onSave,
  onClearSelection,
  onApplyModifier,
  onRemoveModifier,
  onOpenAdvancedTools,
}: EstimateCockpitLinePanelProps) {
  const jc = jobConditions ?? createDefaultProjectJobConditions();

  const [draft, setDraft] = useState<LineDraft | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!line) {
      setDraft(null);
      return;
    }
    setDraft(lineToDraft(line));
  }, [line?.id, line?.updatedAt]);

  const baseline = line ? lineToDraft(line) : null;
  const dirty = !!(draft && baseline && !draftsEqual(draft, baseline));

  const laborUi = line ? deriveEstimateLaborBasisUi(line, pricingMode) : null;

  const vendorQuote = line?.sourceType === 'vendor_quote';

  const scopeCategoryOptions = useMemo(() => {
    const s = new Set<string>();
    categories.forEach((c) => {
      const v = String(c || '').trim();
      if (v) s.add(v);
    });
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [categories]);

  async function handleSave() {
    if (!line || !draft) return;
    const baselineDraft = lineToDraft(line);
    const laborMinutesChanged = draft.laborMinutes !== baselineDraft.laborMinutes;
    const requestLaborRederive = laborMinutesChanged && draft.laborMinutes > 0;
    setSaving(true);
    try {
      await onSave(line.id, {
        description: draft.description,
        qty: draft.qty,
        unit: draft.unit,
        roomId: draft.roomId,
        category: draft.category,
        notes: draft.notes,
        materialCost: draft.materialCost,
        laborMinutes: draft.laborMinutes,
        ...(requestLaborRederive ? { laborCost: 0, baseLaborCost: 0 } : { laborCost: draft.laborCost }),
        unitSell: draft.unitSell,
        pricingSource: draft.pricingSource,
        proposalVisibility: draft.proposalVisibility,
      });
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    if (!line) return;
    setDraft(lineToDraft(line));
  }

  if (!line || !draft) {
    return (
      <aside className="flex min-h-[320px] min-w-[min(100%,22rem)] max-w-md flex-col rounded-xl border border-dashed border-app-line bg-app-surface-soft/50 p-4 text-app-muted">
        <p className="text-[11px] font-semibold uppercase tracking-wide">Line details</p>
        <p className="mt-3 text-sm leading-relaxed text-app-muted">Select a row to edit pricing and modifiers.</p>
      </aside>
    );
  }

  return (
    <aside className="flex max-h-[calc(100vh-12rem)] min-w-[min(100%,22rem)] max-w-md flex-col overflow-hidden rounded-xl border border-app-line bg-app-surface shadow-sm">
      <div className="border-b border-app-line px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-app-muted">Selected line</p>
            <p className="mt-1 line-clamp-2 text-sm font-semibold text-app">{line.description}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {vendorQuote ? (
                <span className="rounded-md bg-violet-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-violet-900 ring-1 ring-violet-100">
                  Vendor quote
                </span>
              ) : null}
              {line.sourceRef ? (
                <span className="truncate text-[10px] text-app-muted" title={`${line.sourceType}:${line.sourceRef}`}>
                  {line.sourceType}:{line.sourceRef}
                </span>
              ) : (
                <span className="text-[10px] text-app-muted">{line.sourceType}</span>
              )}
            </div>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-md border border-app-line bg-app-surface-soft px-2 py-1 text-[11px] font-medium text-app hover:bg-app-surface-muted"
            onClick={onClearSelection}
          >
            Close
          </button>
        </div>
        {showLabor && laborUi ? (
          <p className="mt-2 rounded-lg bg-app-surface-soft px-2 py-1 text-[11px] text-app">
            <span className="font-semibold text-app-muted">Labor · </span>
            {laborUi.label}
          </p>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <section className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-app-muted">Details</p>
          <label className="block text-[11px] font-medium text-app">
            Description
            <textarea
              rows={3}
              className="ui-textarea mt-1 min-h-[72px] w-full rounded-lg text-sm"
              value={draft.description}
              onChange={(e) => setDraft((d) => (d ? { ...d, description: e.target.value } : d))}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] font-medium text-app">
              Qty
              <input
                type="number"
                className="ui-input mt-1 h-9 w-full tabular-nums"
                value={draft.qty}
                onChange={(e) => setDraft((d) => (d ? { ...d, qty: Number(e.target.value) || 0 } : d))}
              />
            </label>
            <label className="text-[11px] font-medium text-app">
              Unit
              <input
                className="ui-input mt-1 h-9 w-full"
                value={draft.unit}
                onChange={(e) => setDraft((d) => (d ? { ...d, unit: e.target.value } : d))}
              />
            </label>
          </div>
          <label className="block text-[11px] font-medium text-app">
            Room
            <select
              className="ui-input mt-1 h-9 w-full"
              value={draft.roomId}
              onChange={(e) => setDraft((d) => (d ? { ...d, roomId: e.target.value } : d))}
            >
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.roomName}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[11px] font-medium text-app">
            Category
            <CatalogCategorySelect
              className="ui-input mt-1 h-9 w-full"
              value={draft.category || ''}
              options={scopeCategoryOptions}
              onChange={(v) => setDraft((d) => (d ? { ...d, category: v || null } : d))}
            />
          </label>
          {showMaterial ? (
            <label className="block text-[11px] font-medium text-app">
              Material unit cost
              <input
                type="number"
                className="ui-input mt-1 h-9 w-full tabular-nums"
                value={draft.materialCost}
                onChange={(e) => setDraft((d) => (d ? { ...d, materialCost: Number(e.target.value) || 0 } : d))}
              />
            </label>
          ) : null}
          {showLabor ? (
            <>
              <label className="block text-[11px] font-medium text-app">
                Labor minutes / unit
                <input
                  type="number"
                  className="ui-input mt-1 h-9 w-full tabular-nums"
                  value={draft.laborMinutes}
                  onChange={(e) =>
                    setDraft((d) =>
                      d ? { ...d, laborMinutes: Number(e.target.value) || 0, laborCost: 0 } : d
                    )
                  }
                />
                <span className="mt-1 block text-[10px] text-app-muted">
                  Saving recomputes labor dollars from minutes via the server when labor cost is cleared.
                </span>
              </label>
              <label className="block text-[11px] font-medium text-app">
                Labor amount override ($ / unit)
                <input
                  type="number"
                  className="ui-input mt-1 h-9 w-full tabular-nums"
                  value={draft.laborCost}
                  onChange={(e) => setDraft((d) => (d ? { ...d, laborCost: Number(e.target.value) || 0 } : d))}
                />
                {projectLaborMultiplier !== 1 ? (
                  <span className="mt-1 block text-[10px] text-app-muted">
                    Effective with project multiplier:{' '}
                    {formatCurrencySafe(draft.laborCost * projectLaborMultiplier)}
                  </span>
                ) : null}
              </label>
            </>
          ) : null}
          <label className="block text-[11px] font-medium text-app">
            Unit sell
            <input
              type="number"
              className="ui-input mt-1 h-9 w-full tabular-nums"
              value={draft.unitSell}
              onChange={(e) =>
                setDraft((d) =>
                  d ? { ...d, unitSell: Number(e.target.value) || 0, pricingSource: 'manual' } : d
                )
              }
            />
          </label>
          <label className="block text-[11px] font-medium text-app">
            Pricing source
            <select
              className="ui-input mt-1 h-9 w-full"
              value={draft.pricingSource}
              onChange={(e) =>
                setDraft((d) =>
                  d ? { ...d, pricingSource: e.target.value as TakeoffPricingSource } : d
                )
              }
            >
              <option value="auto">Auto-calculated</option>
              <option value="manual">Manual unit sell</option>
            </select>
          </label>
          <label className="block text-[11px] font-medium text-app">
            Proposal visibility
            <select
              className="ui-input mt-1 h-9 w-full"
              value={draft.proposalVisibility}
              onChange={(e) =>
                setDraft((d) =>
                  d ? { ...d, proposalVisibility: e.target.value as ProposalVisibility } : d
                )
              }
            >
              <option value="customer_visible">Customer visible</option>
              <option value="optional_or_alt">Optional / alternate</option>
              <option value="internal_only">Internal only</option>
            </select>
          </label>
          <label className="block text-[11px] font-medium text-app">
            Notes
            <textarea
              rows={2}
              className="ui-textarea mt-1 w-full rounded-lg text-sm"
              value={draft.notes || ''}
              onChange={(e) => setDraft((d) => (d ? { ...d, notes: e.target.value || null } : d))}
            />
          </label>
        </section>

        <section className="mt-5 border-t border-app-line pt-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-app-muted">Project setup modifiers</p>
          <p className="mt-1 text-[11px] leading-snug text-app-muted">
            Values reflect job conditions — edit them on the Setup tab.
          </p>
          <div className="mt-2 space-y-2">
            <SetupToggleRow label="Occupied building" active={jc.occupiedBuilding} value={`×${jc.occupiedBuildingMultiplier?.toFixed(2) ?? '1'}`} />
            <SetupToggleRow label="Tight access (restricted)" active={jc.restrictedAccess} value={`×${jc.restrictedAccessMultiplier?.toFixed(2) ?? '1'}`} />
            <SetupToggleRow
              label="Floors / vertical travel"
              active={jc.floors > 1 || !jc.elevatorAvailable}
              value={`${jc.floors ?? 1} fl · elevator ${jc.elevatorAvailable ? 'yes' : 'no'}`}
            />
            <PlaceholderRow label="Masonry drilling" />
            <PlaceholderRow label="Blocking / recessed install" />
            <SetupToggleRow
              label="Overtime / compressed schedule"
              active={jc.afterHoursWork || jc.nightWork || jc.scheduleCompression}
              value={[jc.afterHoursWork ? 'after hours' : null, jc.nightWork ? 'night' : null, jc.scheduleCompression ? 'compressed' : null]
                .filter(Boolean)
                .join(' · ') || '—'}
            />
            <SetupToggleRow
              label="Crew / productivity factor"
              active={jc.smallJobFactor || jc.scheduleCompression}
              value={`Installers ${jc.installerCount ?? '—'}`}
            />
          </div>
        </section>

        <section className="mt-5 border-t border-app-line pt-4">
          <ModifierPanel
            modifiers={catalogModifiers}
            activeModifiers={lineModifiers}
            selectedLinePresent
            hideKicker
            onApplyModifier={onApplyModifier}
            onRemoveModifier={onRemoveModifier}
          />
        </section>

        {onOpenAdvancedTools ? (
          <button
            type="button"
            className="mt-4 w-full rounded-lg border border-app-line bg-app-surface-soft py-2 text-[12px] font-semibold text-app hover:bg-app-surface-muted"
            onClick={onOpenAdvancedTools}
          >
            Advanced tools (catalog, add-ins drawer…)
          </button>
        ) : null}
      </div>

      <div className="flex shrink-0 gap-2 border-t border-app-line bg-app-surface-soft/90 px-3 py-2.5">
        <button
          type="button"
          className="flex-1 rounded-lg bg-app-brand-deep py-2 text-[12px] font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!dirty || saving}
          onClick={() => void handleSave()}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          className="flex-1 rounded-lg border border-app-line bg-app-surface py-2 text-[12px] font-semibold text-app disabled:opacity-50"
          disabled={!dirty || saving}
          onClick={handleCancel}
        >
          Cancel
        </button>
      </div>
    </aside>
  );
}

function SetupToggleRow(props: { label: string; active: boolean; value: string }) {
  const { label, active, value } = props;
  return (
    <div className={`rounded-lg border px-2.5 py-2 text-[11px] ${active ? 'border-emerald-200 bg-emerald-50/60' : 'border-app-line bg-app-surface-soft/80 opacity-70'}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-app">{label}</span>
        <span className="tabular-nums text-app-muted">{active ? value : 'Off'}</span>
      </div>
    </div>
  );
}

function PlaceholderRow(props: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-app-line bg-app-surface-soft/50 px-2.5 py-2 text-[11px] text-app-muted">
      <span className="font-semibold text-app opacity-60">{props.label}</span>
      <p className="mt-0.5 text-[10px]">Not tracked in job conditions yet.</p>
    </div>
  );
}
