import React, { useMemo, useState } from 'react';
import { LineModifierRecord, ModifierRecord, ProjectJobConditions, TakeoffLineRecord } from '../../shared/types/estimator';
import { formatCurrencySafe, formatNumberSafe, formatPercentSafe } from '../../utils/numberFormat';

type ModifierScope = 'line' | 'room';

interface Props {
  mode?: 'takeoff' | 'estimate';
  selectedLine: TakeoffLineRecord | null;
  activeRoomName: string;
  activeRoomLineCount: number;
  modifiers: ModifierRecord[];
  activeLineModifiers: LineModifierRecord[];
  jobConditions: ProjectJobConditions;
  baseLaborRatePerHour: number;
  effectiveLaborRatePerHour: number;
  projectLaborMultiplier: number;
  onApplyLineModifier: (modifierId: string) => Promise<void> | void;
  onApplyRoomModifier: (modifierId: string) => Promise<void> | void;
  onRemoveLineModifier: (lineModifierId: string) => Promise<void> | void;
  onPatchJobConditions: (updates: Partial<ProjectJobConditions>) => void;
}

export function EstimateAddInsTab({
  mode = 'estimate',
  selectedLine,
  activeRoomName,
  activeRoomLineCount,
  modifiers,
  activeLineModifiers,
  jobConditions,
  baseLaborRatePerHour,
  effectiveLaborRatePerHour,
  projectLaborMultiplier,
  onApplyLineModifier,
  onApplyRoomModifier,
  onRemoveLineModifier,
  onPatchJobConditions,
}: Props) {
  const [scope, setScope] = useState<ModifierScope>('line');
  const [projectLaborOpen, setProjectLaborOpen] = useState(false);
  const [projectCostOpen, setProjectCostOpen] = useState(false);

  const laborDriverBreakdown = useMemo(() => {
    const baseRate = baseLaborRatePerHour;
    const rows: Array<{ key: string; label: string; percent: number; dollarsPerHour: number }> = [];

    const pushRow = (key: string, label: string, percent: number, enabled: boolean) => {
      if (!enabled || percent === 0) return;
      rows.push({
        key,
        label,
        percent,
        dollarsPerHour: Number((baseRate * percent).toFixed(2)),
      });
    };

    pushRow('prevailingWage', 'Prevailing wage', jobConditions.prevailingWageMultiplier, jobConditions.prevailingWage || jobConditions.laborRateBasis === 'prevailing');
    pushRow('nightWorkRate', 'After-hours / night shift', jobConditions.nightWorkLaborCostMultiplier, jobConditions.nightWork);
    pushRow('restrictedAccess', 'Restricted access', jobConditions.restrictedAccessMultiplier, jobConditions.restrictedAccess);
    pushRow('occupiedBuilding', 'Occupied building', jobConditions.occupiedBuildingMultiplier, jobConditions.occupiedBuilding);
    pushRow('remoteTravel', 'Remote travel', jobConditions.remoteTravelMultiplier, jobConditions.remoteTravel);
    pushRow('smallJob', 'Small job minimum', jobConditions.smallJobMultiplier, jobConditions.smallJobFactor);
    pushRow('phasedWork', 'Phased work', jobConditions.phasedWorkMultiplier, jobConditions.phasedWork);
    pushRow('scheduleCompression', 'Schedule compression', jobConditions.scheduleCompressionMultiplier, jobConditions.scheduleCompression);
    pushRow('customLabor', 'Custom labor multiplier', Math.max(0, jobConditions.laborRateMultiplier - 1), jobConditions.laborRateMultiplier !== 1);

    if (jobConditions.floors > 1) {
      const floorPercent = (jobConditions.floors - 1) * jobConditions.floorMultiplierPerFloor;
      pushRow('floors', `${jobConditions.floors} floors`, floorPercent, true);
    }

    return rows;
  }, [baseLaborRatePerHour, jobConditions]);

  const totalAdderDollarsPerHour = useMemo(
    () => Number(laborDriverBreakdown.reduce((sum, row) => sum + row.dollarsPerHour, 0).toFixed(2)),
    [laborDriverBreakdown]
  );

  const projectCostAdders = useMemo(() => {
    const rows: Array<{ key: string; label: string; detail: string }> = [];

    if (jobConditions.deliveryDifficulty === 'constrained') {
      rows.push({ key: 'deliveryDifficulty', label: 'Delivery difficulty', detail: 'Constrained access adds 5% execution impact' });
    }

    if (jobConditions.deliveryDifficulty === 'difficult') {
      rows.push({ key: 'deliveryDifficulty', label: 'Delivery difficulty', detail: 'Difficult delivery adds 10% execution impact' });
    }

    if (jobConditions.mobilizationComplexity === 'medium') {
      rows.push({ key: 'mobilization', label: 'Mobilization', detail: 'Medium mobilization adds 3% execution impact' });
    }

    if (jobConditions.mobilizationComplexity === 'high') {
      rows.push({ key: 'mobilization', label: 'Mobilization', detail: 'High mobilization adds 7% execution impact' });
    }

    if (jobConditions.deliveryRequired) {
      const deliveryDetail = jobConditions.deliveryPricingMode === 'flat'
        ? `${formatCurrencySafe(jobConditions.deliveryValue)} flat allowance`
        : jobConditions.deliveryPricingMode === 'percent'
          ? `${formatNumberSafe(jobConditions.deliveryValue, 2)}% of base pricing`
          : 'Included with no separate delivery charge';

      rows.push({
        key: 'deliveryAllowance',
        label: 'Delivery allowance',
        detail: `${deliveryDetail}${jobConditions.deliveryLeadDays > 0 ? ` • ${jobConditions.deliveryLeadDays} business day${jobConditions.deliveryLeadDays === 1 ? '' : 's'}` : ''}`,
      });
    }

    if (jobConditions.estimateAdderPercent !== 0) {
      rows.push({
        key: 'estimatePercent',
        label: 'Project adder %',
        detail: `${formatNumberSafe(jobConditions.estimateAdderPercent, 2)}% added to total estimate`,
      });
    }

    if (jobConditions.estimateAdderAmount !== 0) {
      rows.push({
        key: 'estimateAmount',
        label: 'Project adder $',
        detail: `${formatCurrencySafe(jobConditions.estimateAdderAmount)} added to total estimate`,
      });
    }

    return rows;
  }, [jobConditions]);

  const filteredModifiers = useMemo(() => {
    if (!selectedLine?.category) return modifiers;
    const category = selectedLine.category.toLowerCase();
    const matched = modifiers.filter((modifier) => modifier.appliesToCategories.length === 0 || modifier.appliesToCategories.some((entry) => entry.toLowerCase() === category));
    return matched.length > 0 ? matched : modifiers;
  }, [modifiers, selectedLine]);

  const canApplyToLine = Boolean(selectedLine);
  const canApplyToRoom = activeRoomLineCount > 0;
  const activeProjectDrivers = useMemo(() => {
    const drivers: string[] = [];
    if (jobConditions.prevailingWage || jobConditions.laborRateBasis === 'prevailing') drivers.push('Prevailing wage');
    if (jobConditions.nightWork) drivers.push('Night work');
    if (jobConditions.restrictedAccess) drivers.push('Restricted access');
    if (jobConditions.occupiedBuilding) drivers.push('Occupied building');
    if (jobConditions.remoteTravel) drivers.push('Remote travel');
    if (jobConditions.phasedWork) drivers.push('Phased work');
    if (jobConditions.smallJobFactor) drivers.push('Small job minimum');
    if (jobConditions.scheduleCompression) drivers.push('Schedule compression');
    if (jobConditions.floors > 1) drivers.push(`${jobConditions.floors} floors`);
    if (jobConditions.laborRateMultiplier !== 1) drivers.push(`Custom labor x${formatNumberSafe(jobConditions.laborRateMultiplier, 2)}`);
    return drivers;
  }, [jobConditions]);
  const heading = mode === 'takeoff' ? 'Conditions' : 'Pricing Add-Ins';
  const subheading = mode === 'takeoff'
    ? 'Review line, room, and project conditions while validating scope and quantity.'
    : 'Adjust pricing with modifiers, labor drivers, and project-wide pricing assumptions.';

  return (
    <div className="space-y-2.5">
      <div>
        <p className="ui-eyebrow">{heading}</p>
        <p className="mt-1 text-[11px] text-slate-500">{subheading}</p>
      </div>

      <div className="rounded-xl border border-slate-200/80 bg-[linear-gradient(180deg,rgba(15,23,42,0.98)_0%,rgba(26,40,68,0.98)_100%)] p-2.5 text-white shadow-[0_16px_30px_rgba(15,23,42,0.18)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300">Project Labor Rate</p>
            <p className="mt-1 text-[11px] text-slate-300">Project conditions update all install labor, not just one item.</p>
          </div>
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-white ring-1 ring-white/15">Project Scope</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 rounded-[16px] bg-white/8 px-3 py-3 ring-1 ring-white/10">
          <div>
            <p className="text-[10px] uppercase tracking-[0.12em] text-slate-300">Base</p>
            <p className="mt-1 text-base font-semibold text-white">{formatCurrencySafe(baseLaborRatePerHour)}/hr</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-[0.12em] text-slate-300">Adders</p>
            <p className="mt-1 text-base font-semibold text-white">+{formatCurrencySafe(totalAdderDollarsPerHour)}/hr</p>
            <p className="mt-0.5 text-[10px] text-slate-300">x{formatNumberSafe(projectLaborMultiplier, 2)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-[0.12em] text-slate-300">Effective</p>
            <p className="mt-1 text-lg font-semibold text-white">{formatCurrencySafe(effectiveLaborRatePerHour)}/hr</p>
          </div>
        </div>
        <div className="mt-2 rounded-[14px] bg-white/6 p-2 ring-1 ring-white/10">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-300">Adder Breakdown</p>
            <p className="text-[10px] text-slate-300">{laborDriverBreakdown.length > 0 ? `${laborDriverBreakdown.length} active` : 'No active adders'}</p>
          </div>
          <div className="mt-1.5 space-y-1.5">
            {laborDriverBreakdown.length > 0 ? laborDriverBreakdown.map((row) => (
              <div key={row.key} className="flex items-center justify-between gap-3 rounded-[12px] bg-white/6 px-2.5 py-2">
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-semibold text-white">{row.label}</p>
                  <p className="text-[10px] text-slate-300">+{formatPercentSafe(row.percent * 100)} labor</p>
                </div>
                <p className="shrink-0 text-[11px] font-semibold text-white">+{formatCurrencySafe(row.dollarsPerHour)}/hr</p>
              </div>
            )) : <p className="text-[10px] text-slate-300">No project-wide labor drivers are active.</p>}
          </div>
        </div>
      </div>

      <div className="ui-card bg-white/92 p-2">
        <p className="text-[11px] font-semibold text-slate-900">Apply Scope</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button onClick={() => setScope('line')} disabled={!canApplyToLine} className={`rounded-lg px-2.5 py-2 text-left text-[11px] font-semibold transition ${scope === 'line' ? 'bg-slate-950 text-white shadow-sm' : 'bg-slate-50 text-slate-600 ring-1 ring-slate-200'} disabled:cursor-not-allowed disabled:opacity-45`}>
            <p>Selected Line</p>
            <p className={`mt-1 text-[10px] ${scope === 'line' ? 'text-slate-300' : 'text-slate-500'}`}>{selectedLine ? selectedLine.description : 'Select a line first'}</p>
          </button>
          <button onClick={() => setScope('room')} disabled={!canApplyToRoom} className={`rounded-lg px-2.5 py-2 text-left text-[11px] font-semibold transition ${scope === 'room' ? 'bg-app-primary text-white shadow-sm' : 'bg-slate-50 text-slate-600 ring-1 ring-slate-200'} disabled:cursor-not-allowed disabled:opacity-45`}>
            <p>Active Room</p>
            <p className={`mt-1 text-[10px] ${scope === 'room' ? 'text-blue-100' : 'text-slate-500'}`}>{activeRoomName} • {activeRoomLineCount} lines</p>
          </button>
        </div>
      </div>

      <div className="ui-card bg-white/92 p-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold text-slate-900">Modifiers</p>
            <p className="text-[10px] text-slate-500">Per-item or room-scoped upgrades and add-ons.</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${scope === 'line' ? 'bg-slate-950 text-white ring-1 ring-slate-950' : 'bg-app-primary text-white ring-app-primary'}`}>{scope === 'line' ? 'Line Scope' : 'Room Scope'}</span>
            {scope === 'line' && selectedLine ? <span className="rounded-full bg-slate-50 px-2.5 py-1 text-[10px] font-medium text-slate-600 ring-1 ring-slate-200">{selectedLine.category || 'All categories'}</span> : null}
          </div>
        </div>

        {scope === 'line' ? (
          <div className="mt-2 space-y-1.5">
            {activeLineModifiers.length > 0 ? activeLineModifiers.map((modifier) => (
              <div key={modifier.id} className="rounded-[14px] border border-slate-200 bg-slate-50/70 p-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[12px] font-semibold text-slate-900">{modifier.name}</p>
                    <p className="mt-1 text-[10px] text-slate-500">+{formatCurrencySafe(modifier.addMaterialCost)} material • +{formatNumberSafe(modifier.addLaborMinutes, 1)} min • {formatPercentSafe(modifier.percentLabor)} labor</p>
                  </div>
                  <button onClick={() => void onRemoveLineModifier(modifier.id)} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-medium text-slate-600 transition hover:bg-slate-50">Remove</button>
                </div>
              </div>
            )) : <div className="rounded-[18px] border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-[11px] text-slate-500">No add-ins are active on this line.</div>}
          </div>
        ) : null}

        <div className="mt-2 max-h-[32vh] space-y-1.5 overflow-y-auto pr-0.5">
          {filteredModifiers.map((modifier) => (
            <button key={modifier.id} onClick={() => void (scope === 'line' ? onApplyLineModifier(modifier.id) : onApplyRoomModifier(modifier.id))} disabled={scope === 'line' ? !canApplyToLine : !canApplyToRoom} className="w-full rounded-[14px] border border-slate-200 bg-slate-50/70 p-2.5 text-left transition hover:border-blue-200 hover:bg-white disabled:cursor-not-allowed disabled:opacity-45">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[12px] font-semibold text-slate-900">{modifier.name}</p>
                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200">{modifier.modifierKey}</span>
              </div>
              <p className="mt-1 text-[10px] text-slate-500">+{formatCurrencySafe(modifier.addMaterialCost)} material • +{formatNumberSafe(modifier.addLaborMinutes, 1)} min • {formatPercentSafe(modifier.percentMaterial)} material • {formatPercentSafe(modifier.percentLabor)} labor</p>
            </button>
          ))}
          {filteredModifiers.length === 0 ? <div className="rounded-[18px] border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-[11px] text-slate-500">No add-ins are available for the current selection.</div> : null}
        </div>
      </div>

      <div className="rounded-[16px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(233,239,248,0.96)_0%,rgba(248,250,252,0.98)_100%)] p-2 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold text-slate-900">Project Labor</p>
            <p className="mt-1 text-[10px] text-slate-500">Global labor-rate and productivity conditions.</p>
          </div>
          <button type="button" onClick={() => setProjectLaborOpen((value) => !value)} className="rounded-full bg-slate-950 px-2.5 py-1 text-[10px] font-semibold text-white">{projectLaborOpen ? 'Hide' : 'Edit'}</button>
        </div>
        {!projectLaborOpen ? (
          <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
            <span className="rounded-full bg-white px-2 py-0.5 font-medium text-slate-700 ring-1 ring-slate-200">{laborDriverBreakdown.length} active</span>
            {laborDriverBreakdown.slice(0, 3).map((row) => <span key={row.key} className="rounded-full bg-white px-2 py-0.5 font-medium text-slate-700 ring-1 ring-slate-200">{row.label}</span>)}
          </div>
        ) : (
        <div className="mt-3 space-y-3">
          <div className="rounded-[18px] border border-slate-200 bg-white p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[12px] font-semibold text-slate-900">After-Hours / Night Shift Labor</p>
                <p className="mt-1 text-[10px] text-slate-500">Changes labor rate and labor hours across all scoped install items.</p>
              </div>
              <label className="inline-flex items-center gap-2 text-[11px] font-medium text-slate-700"><input type="checkbox" checked={jobConditions.nightWork} onChange={(event) => onPatchJobConditions({ nightWork: event.target.checked, afterHoursWork: event.target.checked })} /> Enabled</label>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className="text-[10px] font-medium text-slate-700">Hourly Rate Multiplier
                <input type="number" step="0.01" className="ui-input mt-1 h-8 rounded-lg" value={jobConditions.nightWorkLaborCostMultiplier} onChange={(event) => onPatchJobConditions({ nightWorkLaborCostMultiplier: Number(event.target.value) || 0, afterHoursMultiplier: Number(event.target.value) || 0 })} />
              </label>
              <label className="text-[10px] font-medium text-slate-700">Labor Hours Multiplier
                <input type="number" step="0.01" className="ui-input mt-1 h-8 rounded-lg" value={jobConditions.nightWorkLaborMinutesMultiplier} onChange={(event) => onPatchJobConditions({ nightWorkLaborMinutesMultiplier: Number(event.target.value) || 0 })} />
              </label>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="rounded-[18px] border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-700">
              <span className="mb-2 flex items-center justify-between gap-2"><span className="font-semibold text-slate-900">Restricted Access Labor</span><input type="checkbox" checked={jobConditions.restrictedAccess} onChange={(event) => onPatchJobConditions({ restrictedAccess: event.target.checked })} /></span>
              <span className="block text-[10px] text-slate-500">Multiplier</span>
              <input type="number" step="0.01" className="ui-input mt-1 h-8 rounded-lg" value={jobConditions.restrictedAccessMultiplier} onChange={(event) => onPatchJobConditions({ restrictedAccessMultiplier: Number(event.target.value) || 0 })} />
            </label>
            <label className="rounded-[18px] border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-700">
              <span className="mb-2 flex items-center justify-between gap-2"><span className="font-semibold text-slate-900">Occupied Building Labor</span><input type="checkbox" checked={jobConditions.occupiedBuilding} onChange={(event) => onPatchJobConditions({ occupiedBuilding: event.target.checked })} /></span>
              <span className="block text-[10px] text-slate-500">Multiplier</span>
              <input type="number" step="0.01" className="ui-input mt-1 h-8 rounded-lg" value={jobConditions.occupiedBuildingMultiplier} onChange={(event) => onPatchJobConditions({ occupiedBuildingMultiplier: Number(event.target.value) || 0 })} />
            </label>
            <label className="rounded-[18px] border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-700">
              <span className="mb-2 flex items-center justify-between gap-2"><span className="font-semibold text-slate-900">Remote Travel Labor</span><input type="checkbox" checked={jobConditions.remoteTravel} onChange={(event) => onPatchJobConditions({ remoteTravel: event.target.checked })} /></span>
              <span className="block text-[10px] text-slate-500">Multiplier</span>
              <input type="number" step="0.01" className="ui-input mt-1 h-8 rounded-lg" value={jobConditions.remoteTravelMultiplier} onChange={(event) => onPatchJobConditions({ remoteTravelMultiplier: Number(event.target.value) || 0 })} />
            </label>
            <label className="rounded-[18px] border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-700">
              <span className="mb-2 flex items-center justify-between gap-2"><span className="font-semibold text-slate-900">Small Job Labor Minimum</span><input type="checkbox" checked={jobConditions.smallJobFactor} onChange={(event) => onPatchJobConditions({ smallJobFactor: event.target.checked })} /></span>
              <span className="block text-[10px] text-slate-500">Multiplier</span>
              <input type="number" step="0.01" className="ui-input mt-1 h-8 rounded-lg" value={jobConditions.smallJobMultiplier} onChange={(event) => onPatchJobConditions({ smallJobMultiplier: Number(event.target.value) || 0 })} />
            </label>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="rounded-[18px] border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-700">
              <span className="mb-2 flex items-center justify-between gap-2"><span className="font-semibold text-slate-900">Prevailing Wage Labor Rate</span><input type="checkbox" checked={jobConditions.prevailingWage} onChange={(event) => onPatchJobConditions({ prevailingWage: event.target.checked, laborRateBasis: event.target.checked ? 'prevailing' : 'union' })} /></span>
              <span className="block text-[10px] text-slate-500">Multiplier</span>
              <input type="number" step="0.01" className="ui-input mt-1 h-8 rounded-lg" value={jobConditions.prevailingWageMultiplier} onChange={(event) => onPatchJobConditions({ prevailingWageMultiplier: Number(event.target.value) || 0 })} />
            </label>
            <label className="rounded-[18px] border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-700">
              <span className="mb-2 flex items-center justify-between gap-2"><span className="font-semibold text-slate-900">Custom Labor Multiplier</span><span className="text-[10px] text-slate-500">Always on</span></span>
              <span className="block text-[10px] text-slate-500">Multiplier</span>
              <input type="number" step="0.01" className="ui-input mt-1 h-8 rounded-lg" value={jobConditions.laborRateMultiplier} onChange={(event) => onPatchJobConditions({ laborRateMultiplier: Number(event.target.value) || 1 })} />
            </label>
          </div>
        </div>
        )}
      </div>

      <div className="rounded-[16px] border border-slate-200/80 bg-white/95 p-2 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold text-slate-900">Project Cost Adders</p>
            <p className="mt-1 text-[10px] text-slate-500">Logistics and direct bid adders that affect total pricing, not hourly labor rate.</p>
          </div>
          <button type="button" onClick={() => setProjectCostOpen((value) => !value)} className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-700 ring-1 ring-slate-200">{projectCostOpen ? 'Hide' : `${projectCostAdders.length} Active`}</button>
        </div>

        <div className="mt-2 rounded-[16px] border border-slate-200 bg-slate-50/80 p-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Active Cost Adders</p>
            <p className="text-[10px] text-slate-500">Project Scope</p>
          </div>
          <div className="mt-1.5 space-y-1.5">
            {projectCostAdders.length > 0 ? projectCostAdders.map((row) => (
              <div key={row.key} className="rounded-[12px] border border-slate-200 bg-white px-2.5 py-2">
                <p className="text-[11px] font-semibold text-slate-900">{row.label}</p>
                <p className="mt-0.5 text-[10px] text-slate-500">{row.detail}</p>
              </div>
            )) : <p className="text-[10px] text-slate-500">No non-rate project cost adders are active.</p>}
          </div>
        </div>

        {projectCostOpen ? (
        <>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="rounded-[18px] border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-700">
            <span className="mb-2 block font-semibold text-slate-900">Delivery Difficulty</span>
            <select className="ui-input h-8 rounded-lg" value={jobConditions.deliveryDifficulty} onChange={(event) => onPatchJobConditions({ deliveryDifficulty: event.target.value as ProjectJobConditions['deliveryDifficulty'], deliveryAutoCalculated: false })}>
              <option value="standard">Standard</option>
              <option value="constrained">Constrained</option>
              <option value="difficult">Difficult</option>
            </select>
          </label>

          <label className="rounded-[18px] border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-700">
            <span className="mb-2 block font-semibold text-slate-900">Mobilization Complexity</span>
            <select className="ui-input h-8 rounded-lg" value={jobConditions.mobilizationComplexity} onChange={(event) => onPatchJobConditions({ mobilizationComplexity: event.target.value as ProjectJobConditions['mobilizationComplexity'] })}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
        </div>

        <div className="mt-2 rounded-[18px] border border-slate-200 bg-slate-50/80 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[12px] font-semibold text-slate-900">Delivery Allowance</p>
              <p className="mt-1 text-[10px] text-slate-500">Use this for freight or delivery charges without changing the labor rate panel above.</p>
            </div>
            <label className="inline-flex items-center gap-2 text-[11px] font-medium text-slate-700">
              <input type="checkbox" checked={jobConditions.deliveryRequired} onChange={(event) => onPatchJobConditions({ deliveryRequired: event.target.checked, deliveryAutoCalculated: false })} />
              Enabled
            </label>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <label className="text-[10px] font-medium text-slate-700">Pricing Mode
              <select className="ui-input mt-1 h-8 rounded-lg" value={jobConditions.deliveryPricingMode} onChange={(event) => onPatchJobConditions({ deliveryPricingMode: event.target.value as ProjectJobConditions['deliveryPricingMode'], deliveryAutoCalculated: false })}>
                <option value="included">Included / No Charge</option>
                <option value="flat">Flat Amount</option>
                <option value="percent">Percent of Base</option>
              </select>
            </label>
            <label className="text-[10px] font-medium text-slate-700">Delivery Value
              <input type="number" step="0.01" className="ui-input mt-1 h-8 rounded-lg" value={jobConditions.deliveryValue} onChange={(event) => onPatchJobConditions({ deliveryValue: Number(event.target.value) || 0, deliveryAutoCalculated: false })} />
            </label>
            <label className="text-[10px] font-medium text-slate-700">Lead Time (Business Days)
              <input type="number" min={0} className="ui-input mt-1 h-8 rounded-lg" value={jobConditions.deliveryLeadDays} onChange={(event) => onPatchJobConditions({ deliveryLeadDays: Number(event.target.value) || 0, deliveryAutoCalculated: false })} />
            </label>
          </div>
        </div>

        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="rounded-[18px] border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-700">
            <span className="mb-2 block font-semibold text-slate-900">Project Adder %</span>
            <input type="number" step="0.01" className="ui-input h-8 rounded-lg" value={jobConditions.estimateAdderPercent} onChange={(event) => onPatchJobConditions({ estimateAdderPercent: Number(event.target.value) || 0 })} />
          </label>
          <label className="rounded-[18px] border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-700">
            <span className="mb-2 block font-semibold text-slate-900">Project Adder $</span>
            <input type="number" step="0.01" className="ui-input h-8 rounded-lg" value={jobConditions.estimateAdderAmount} onChange={(event) => onPatchJobConditions({ estimateAdderAmount: Number(event.target.value) || 0 })} />
          </label>
        </div>
        </>
        ) : null}
      </div>
    </div>
  );
}