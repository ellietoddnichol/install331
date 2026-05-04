import React, { useMemo } from 'react';
import { ChevronDown, Info } from 'lucide-react';
import type { ProjectJobConditions, ProjectRecord, RoomRecord, SettingsRecord } from '../../shared/types/estimator';
import { OFFICE_FIELD_SCHEDULE_DEFAULTS, recommendDeliveryPlan } from '../../shared/utils/jobConditions';
import { PROJECT_JOB_SIZE_OPTIONS, suggestProjectJobSizeTier } from '../../shared/utils/projectJobSizeTiers';
import { formatCurrencySafe, formatNumberSafe } from '../../utils/numberFormat';

type SummaryLite = {
  conditionLaborMultiplier?: number;
  conditionAdjustmentAmount?: number;
  adjustedLaborSubtotal?: number;
  conditionAssumptions?: string[];
  durationDays?: number;
  baseBidTotal?: number;
};

function FieldBadge({ kind }: { kind: 'required' | 'optional' | 'office' }) {
  if (kind === 'required') {
    return (
      <span className="ml-1.5 inline-flex items-center rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-900">
        Required
      </span>
    );
  }
  if (kind === 'optional') {
    return (
      <span className="ml-1.5 inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-600">
        Optional
      </span>
    );
  }
  return (
    <span className="ml-1.5 inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
      Office default
    </span>
  );
}

function Legend() {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-slate-200/80 bg-slate-50/80 px-3 py-2.5 text-[11px] text-slate-600">
      <span className="font-semibold text-slate-700">Field types:</span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-blue-600" aria-hidden />
        Required for this estimate
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-slate-400" aria-hidden />
        Optional project adjustment
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-slate-300" aria-hidden />
        Usually matches office defaults
      </span>
    </div>
  );
}

export interface ProjectSetupWorkspaceProps {
  project: ProjectRecord;
  setProject: React.Dispatch<React.SetStateAction<ProjectRecord | null>>;
  jobConditions: ProjectJobConditions;
  patchJobConditions: (patch: Partial<ProjectJobConditions>) => void;
  showMaterial: boolean;
  scopeCategoryOptions: string[];
  selectedScopeCategories: string[];
  toggleScopeCategory: (category: string) => void;
  rooms: RoomRecord[];
  setActiveTab: (tab: 'overview' | 'setup' | 'takeoff' | 'estimate' | 'files' | 'proposal' | 'scope-review') => void;
  summary: SummaryLite | null;
  settings: SettingsRecord | null;
  distanceError: string | null;
  distanceCalculating: boolean;
}

export function ProjectSetupWorkspace({
  project,
  setProject,
  jobConditions,
  patchJobConditions,
  showMaterial,
  scopeCategoryOptions,
  selectedScopeCategories,
  toggleScopeCategory,
  rooms,
  setActiveTab,
  summary,
  settings,
  distanceError,
  distanceCalculating,
}: ProjectSetupWorkspaceProps) {
  const officeBurden = settings?.defaultLaborBurdenPercent;
  const officeOverhead = settings?.defaultOverheadPercent;
  const officeProfit = settings?.defaultProfitPercent;
  const officeTax = settings?.defaultTaxPercent;

  const matchesOffice = (field: 'burden' | 'materialOandP' | 'profit' | 'tax' | 'laborOverhead' | 'laborProfit'): boolean => {
    if (!settings) return false;
    if (field === 'burden') return project.laborBurdenPercent === officeBurden;
    if (field === 'materialOandP') return project.overheadPercent === officeOverhead && project.profitPercent === 0;
    if (field === 'profit') return project.profitPercent === officeProfit;
    if (field === 'tax') return project.taxPercent === officeTax;
    if (field === 'laborOverhead') return project.laborOverheadPercent === 0;
    if (field === 'laborProfit') return project.laborProfitPercent === 0;
    return false;
  };

  function resetAdvancedPricingToOfficeDefaults() {
    if (!settings) return;
    setProject((prev) =>
      prev
        ? {
            ...prev,
            laborBurdenPercent: settings.defaultLaborBurdenPercent,
            overheadPercent: settings.defaultOverheadPercent,
            profitPercent: 0,
            taxPercent: settings.defaultTaxPercent,
            laborOverheadPercent: settings.defaultLaborOverheadPercent,
            laborProfitPercent: 0,
          }
        : prev
    );
    patchJobConditions({
      ...OFFICE_FIELD_SCHEDULE_DEFAULTS,
      laborRateMultiplier: 1,
      installerCount: 1,
      estimateAdderPercent: 0,
      estimateAdderAmount: 0,
      performanceBondRequired: false,
      performanceBondPercent: 0,
    });
  }

  const deliveryOn = jobConditions.deliveryRequired;

  const suggestedJobSize = useMemo(() => {
    if (!summary?.durationDays && !summary?.baseBidTotal) return null;
    return suggestProjectJobSizeTier(summary.durationDays ?? 0, summary.baseBidTotal ?? 0);
  }, [summary?.durationDays, summary?.baseBidTotal]);
  const suggestedJobSizeLabel = suggestedJobSize
    ? PROJECT_JOB_SIZE_OPTIONS.find((o) => o.value === suggestedJobSize)?.label
    : null;

  return (
    <div className="w-full min-w-0 space-y-8 pb-2">
      {/* 1 — Project inputs */}
      <section className="rounded-2xl border border-slate-200/70 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">Section 1</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">Project inputs</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Core setup for this bid: how you price, what scope applies, and site context. Most estimates only need these fields.
          </p>
          <Legend />
        </div>
        <div className="space-y-6 px-5 py-5">
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-4">
            <p className="text-[11px] font-semibold text-slate-800">Identity &amp; site</p>
            <p className="mt-1 text-xs text-slate-500">Used on proposals, exports, and travel distance.</p>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="text-[11px] font-medium text-slate-700">
                Project name
                <input className="ui-input mt-1 h-9 w-full" value={project.projectName} onChange={(e) => setProject({ ...project, projectName: e.target.value })} />
              </label>
              <label className="text-[11px] font-medium text-slate-700">
                Client
                <div className="mt-1 flex items-center gap-2">
                  <input
                    className="ui-input h-9 w-full"
                    value={project.clientName || ''}
                    onChange={(e) => setProject({ ...project, clientName: e.target.value || null, clientNameSource: 'manual' })}
                  />
                  {project.clientName && project.clientNameSource === 'auto' ? (
                    <span className="ui-mono-chip ui-mono-chip--mute whitespace-nowrap">Auto</span>
                  ) : null}
                </div>
              </label>
              <label className="text-[11px] font-medium text-slate-700">
                Project #
                <div className="mt-1 flex items-center gap-2">
                  <input
                    className="ui-input h-9 w-full"
                    value={project.projectNumber || ''}
                    onChange={(e) => setProject({ ...project, projectNumber: e.target.value || null, projectNumberSource: 'manual' })}
                  />
                  {project.projectNumber && project.projectNumberSource === 'auto' ? (
                    <span className="ui-mono-chip ui-mono-chip--mute whitespace-nowrap">Auto</span>
                  ) : null}
                </div>
              </label>
              <label className="text-[11px] font-medium text-slate-700">
                Estimator
                <input className="ui-input mt-1 h-9 w-full" value={project.estimator || ''} onChange={(e) => setProject({ ...project, estimator: e.target.value || null })} />
              </label>
              <label className="text-[11px] font-medium text-slate-700 md:col-span-2">
                Address
              <div className="mt-1 flex items-center gap-2">
                <input
                  className="ui-input h-9 w-full"
                  value={project.address || ''}
                  onChange={(e) => setProject({ ...project, address: e.target.value || null, addressSource: 'manual' })}
                />
                {project.address && project.addressSource === 'auto' ? (
                  <span className="ui-mono-chip ui-mono-chip--mute whitespace-nowrap">Auto</span>
                ) : null}
              </div>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-[11px] font-medium text-slate-800">
              <span className="inline-flex items-center">
                Price mode
                <FieldBadge kind="required" />
              </span>
              <select
                className="ui-input mt-1.5 h-10"
                value={project.pricingMode || 'labor_and_material'}
                onChange={(e) => setProject({ ...project, pricingMode: e.target.value as ProjectRecord['pricingMode'] })}
              >
                <option value="material_only">Material only</option>
                <option value="labor_only">Install only</option>
                <option value="labor_and_material">Material + install</option>
                <option value="material_with_optional_install_quote">Material + install (quoted separately)</option>
              </select>
              <span className="mt-1 block text-[10px] text-slate-500">Controls whether material and/or labor appear in the estimate.</span>
            </label>

            <label className="text-[11px] font-medium text-slate-800 sm:col-span-2 lg:col-span-2">
              <span className="inline-flex items-center">
                Project size
                <FieldBadge kind="optional" />
              </span>
              <select
                className="ui-input mt-1.5 h-10"
                value={project.projectSize || 'Medium'}
                onChange={(e) => setProject({ ...project, projectSize: e.target.value })}
              >
                <option value="Small">Small</option>
                <option value="Medium">Medium</option>
                <option value="Large">Large</option>
              </select>
            </label>

            <label className="text-[11px] font-medium text-slate-800">
              <span className="inline-flex items-center">
                Floor level
                <FieldBadge kind="optional" />
              </span>
              <select
                className="ui-input mt-1.5 h-10"
                value={project.floorLevel || 'Ground'}
                onChange={(e) => setProject({ ...project, floorLevel: e.target.value })}
              >
                <option value="Ground">Ground</option>
                <option value="2-3">2–3</option>
                <option value="4+">4+</option>
              </select>
            </label>

            <label className="text-[11px] font-medium text-slate-800">
              <span className="inline-flex items-center">
                Floors (building)
                <FieldBadge kind="optional" />
              </span>
              <input
                type="number"
                min={1}
                className="ui-input mt-1.5 h-10"
                value={jobConditions.floors}
                onChange={(e) => patchJobConditions({ floors: Number(e.target.value) || 1 })}
              />
              <span className="mt-1 block text-[10px] text-slate-500">Stories or levels for vertical labor factors.</span>
            </label>

            <label className="text-[11px] font-medium text-slate-800">
              <span className="inline-flex items-center">
                Wall substrate
                <FieldBadge kind="optional" />
              </span>
              <select
                className="ui-input mt-1.5 h-10"
                value={project.wallSubstrate || 'Drywall'}
                onChange={(e) => setProject({ ...project, wallSubstrate: e.target.value })}
              >
                <option value="Drywall">Drywall</option>
                <option value="CMU">CMU</option>
                <option value="Concrete">Concrete</option>
                <option value="Tile">Tile</option>
              </select>
            </label>

            <label className="text-[11px] font-medium text-slate-800">
              <span className="inline-flex items-center">
                Location / region
                <FieldBadge kind="optional" />
              </span>
              <div className="mt-1.5 flex items-center gap-2">
                <input
                  className="ui-input h-10 w-full"
                  value={jobConditions.locationLabel}
                  onChange={(e) => patchJobConditions({ locationLabel: e.target.value, locationLabelSource: 'manual' })}
                  placeholder="e.g. Austin metro"
                />
                {jobConditions.locationLabel && jobConditions.locationLabelSource === 'auto' ? (
                  <span className="ui-mono-chip ui-mono-chip--mute whitespace-nowrap">Auto</span>
                ) : null}
              </div>
            </label>
          </div>

          <div>
            <p className="text-[11px] font-semibold text-slate-800">
              <span className="inline-flex items-center">
                Scope categories
                <FieldBadge kind="required" />
              </span>
            </p>
            <p className="mt-1 text-xs text-slate-500">Filter catalog and takeoff to the trades included on this job.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {scopeCategoryOptions.map((category) => {
                const active = selectedScopeCategories.includes(category);
                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => toggleScopeCategory(category)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                      active
                        ? 'border-blue-400 bg-blue-50 text-blue-900 shadow-sm'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {category}
                  </button>
                );
              })}
            </div>
            {scopeCategoryOptions.length === 0 ? <p className="mt-2 text-xs text-slate-500">Categories load after catalog sync.</p> : null}
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-800">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-slate-300"
                checked={deliveryOn}
                onChange={(e) => {
                  if (e.target.checked) {
                    const miles = jobConditions.travelDistanceMiles;
                    const fromDistance =
                      miles !== null && miles !== undefined && Number.isFinite(miles) && jobConditions.deliveryAutoCalculated
                        ? recommendDeliveryPlan(miles, jobConditions.deliveryDifficulty)
                        : {};
                    patchJobConditions({ deliveryRequired: true, ...fromDistance });
                  } else {
                    patchJobConditions({
                      deliveryRequired: false,
                      deliveryQuotedSeparately: false,
                      deliveryAutoCalculated: false,
                    });
                  }
                }}
              />
              <span>
                <span className="font-semibold">Delivery required / included in this estimate</span>
                <span className="mt-0.5 block text-xs font-normal text-slate-600">
                  Turn on when freight or jobsite delivery should be priced. Detail fields stay hidden until this is on.
                </span>
              </span>
            </label>

            {deliveryOn ? (
              <div className="mt-4 grid grid-cols-1 gap-3 border-t border-slate-200/80 pt-4 sm:grid-cols-3">
                <label className="text-[11px] font-medium text-slate-700">
                  Delivery mode
                  <select
                    className="ui-input mt-0.5 h-8 w-full max-w-[6.5rem]"
                    value={jobConditions.deliveryPricingMode}
                    onChange={(e) =>
                      patchJobConditions({
                        deliveryPricingMode: e.target.value as ProjectJobConditions['deliveryPricingMode'],
                        deliveryAutoCalculated: false,
                      })
                    }
                  >
                    <option value="included">Included / no charge</option>
                    <option value="flat">Flat amount</option>
                    <option value="percent">Percent of base</option>
                  </select>
                </label>
                <label className="text-[11px] font-medium text-slate-700">
                  Delivery $ or %
                  <input
                    type="number"
                    step="0.01"
                    className="ui-input mt-1 h-9 w-full max-w-[7rem]"
                    value={jobConditions.deliveryValue}
                    onChange={(e) => patchJobConditions({ deliveryValue: Number(e.target.value) || 0, deliveryAutoCalculated: false })}
                  />
                </label>
                <label className="text-[11px] font-medium text-slate-700">
                  Lead time (days)
                  <input
                    type="number"
                    min={0}
                    className="ui-input mt-1 h-9 w-full max-w-[7rem]"
                    value={jobConditions.deliveryLeadDays}
                    onChange={(e) => patchJobConditions({ deliveryLeadDays: Number(e.target.value) || 0 })}
                  />
                </label>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-slate-200 bg-white px-4 py-3">
            <div>
              <p className="text-sm font-medium text-slate-900">Rooms &amp; areas</p>
              <p className="text-xs text-slate-500">{rooms.length} room(s) — organize takeoff lines.</p>
            </div>
            <button type="button" onClick={() => setActiveTab('estimate')} className="ui-btn-secondary h-9 px-4 text-xs font-semibold">
              Open estimate
            </button>
          </div>
        </div>
      </section>

      {/* 2 — Job conditions (chips) */}
      <section className="rounded-2xl border border-slate-200/70 bg-white shadow-sm px-5 py-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">Section 2</p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">Job conditions</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Toggle only what applies. These adjust labor multipliers — they are not the same as company pricing defaults below.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {(
            [
              ['occupiedBuilding', 'Occupied building', jobConditions.occupiedBuilding],
              ['restrictedAccess', 'Restricted access', jobConditions.restrictedAccess],
              ['nightWork', 'Night work', jobConditions.nightWork],
              ['phasedWork', 'Phased work', jobConditions.phasedWork],
              ['remoteTravel', 'Remote travel', jobConditions.remoteTravel],
              ['scheduleCompression', 'Schedule compression', jobConditions.scheduleCompression],
              ['smallJobFactor', 'Small job factor', jobConditions.smallJobFactor],
            ] as const
          ).map(([key, label, on]) => (
            <button
              key={key}
              type="button"
              role="switch"
              aria-checked={on}
              onClick={() => patchJobConditions({ [key]: !on } as Partial<ProjectJobConditions>)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                on ? 'border-slate-800 bg-slate-900 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mt-4 flex items-start gap-2 text-[11px] text-slate-500">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
          Fine-tune per-condition multipliers and floor access in <strong className="font-medium text-slate-700">Advanced pricing defaults</strong> when needed.
        </p>
      </section>

      {/* 3 — Advanced pricing (collapsed by default — open when you need burden / O&P / adders) */}
      <details className="group rounded-2xl border border-slate-300/80 bg-slate-50/50 shadow-sm open:bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">Section 3</p>
            <h2 className="mt-0.5 text-xl font-semibold text-slate-900">Advanced pricing defaults</h2>
            <p className="mt-1 text-sm text-slate-600">Office-style markups, optional labor burden, and adders. Same grid as intake — collapse if you only need Section 1.</p>
          </div>
          <ChevronDown className="h-5 w-5 shrink-0 text-slate-500 transition group-open:rotate-180" />
        </summary>

        <div className="space-y-4 border-t border-slate-200 px-5 pb-4 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="max-w-3xl text-xs leading-snug text-slate-600">
              These fields mirror <strong className="font-medium text-slate-800">Settings → estimate defaults</strong> until you change them for this job.
              <span className="text-slate-500"> Office default</span> means the project still matches that saved profile for that field.
            </p>
            <button
              type="button"
              onClick={resetAdvancedPricingToOfficeDefaults}
              disabled={!settings}
              className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              Reset to office defaults
            </button>
          </div>

          <div className="grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-2 md:grid-cols-3">
            <label className="text-[11px] font-medium text-slate-700">
              Labor burden % (sub)
              {matchesOffice('burden') ? <FieldBadge kind="office" /> : <FieldBadge kind="optional" />}
              <input
                type="number"
                className="ui-input mt-0.5 h-8 w-full max-w-[6.5rem]"
                value={project.laborBurdenPercent}
                onChange={(e) => setProject({ ...project, laborBurdenPercent: Number(e.target.value) || 0 })}
              />
              <span className="mt-1 block max-w-md text-[10px] font-normal leading-snug text-slate-500">
                Use 0 when your $/hr already includes burden.
              </span>
            </label>
            <label className="text-[11px] font-medium text-slate-700 sm:col-span-2 md:col-span-1">
              Material O&amp;P % (after tax on material)
              {matchesOffice('materialOandP') ? <FieldBadge kind="office" /> : <FieldBadge kind="optional" />}
              <input
                type="number"
                className="ui-input mt-0.5 h-8 w-full max-w-[6.5rem]"
                value={project.overheadPercent}
                onChange={(e) =>
                  setProject({ ...project, overheadPercent: Number(e.target.value) || 0, profitPercent: 0 })
                }
              />
              <span className="mt-1 block max-w-md text-[10px] font-normal leading-snug text-slate-500">
                Single sell-side markup on material. Hourly install rate is already loaded with typical labor margin.
              </span>
            </label>
            {showMaterial ? (
              <label className="text-[11px] font-medium text-slate-700">
                Material tax %
                {matchesOffice('tax') ? <FieldBadge kind="office" /> : <FieldBadge kind="optional" />}
                <input
                  type="number"
                  className="ui-input mt-0.5 h-8 w-full max-w-[6.5rem]"
                  value={project.taxPercent}
                  onChange={(e) => setProject({ ...project, taxPercent: Number(e.target.value) || 0 })}
                />
              </label>
            ) : null}
            <label className="text-[11px] font-medium text-slate-700 sm:col-span-2 md:col-span-1">
              Location tax override %
              <FieldBadge kind="optional" />
              <input
                type="number"
                className="ui-input mt-0.5 h-8 w-full max-w-full md:max-w-[12rem]"
                value={jobConditions.locationTaxPercent ?? ''}
                onChange={(e) => patchJobConditions({ locationTaxPercent: e.target.value === '' ? null : Number(e.target.value) || 0 })}
                placeholder="Leave blank to use material tax"
              />
            </label>
            <label className="text-[11px] font-medium text-slate-700">
              Labor factor (multiplier)
              <FieldBadge kind="optional" />
              <input
                type="number"
                step="0.01"
                className="ui-input mt-0.5 h-8 w-full max-w-[6.5rem]"
                value={jobConditions.laborRateMultiplier}
                onChange={(e) => patchJobConditions({ laborRateMultiplier: Number(e.target.value) || 1 })}
              />
            </label>
            <label className="text-[11px] font-medium text-slate-700">
              Crew size (installers)
              <FieldBadge kind="optional" />
              <input
                type="number"
                min={1}
                className="ui-input mt-0.5 h-8 w-full max-w-[6.5rem]"
                value={jobConditions.installerCount}
                onChange={(e) => patchJobConditions({ installerCount: Number(e.target.value) || 1 })}
              />
            </label>
            <div className="sm:col-span-2 md:col-span-3 rounded-lg border border-slate-200/90 bg-slate-50/80 p-3">
              <p className="text-[11px] font-semibold text-slate-900">Field time (calendar duration)</p>
              <p className="mt-1 text-[10px] leading-snug text-slate-600">
                Line <strong>labor minutes</strong> are install work. Calendar <strong>days</strong> divide total install hours by crew capacity
                per day: (paid hours − breaks − setup/cleanup) × crew size. Does not change line $.
              </p>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <label className="text-[11px] font-medium text-slate-700">
                  Paid hrs / installer day
                  <input
                    type="number"
                    step="0.25"
                    min={4}
                    max={12}
                    className="ui-input mt-0.5 h-8 w-full"
                    value={jobConditions.installerPaidDayHours}
                    onChange={(e) => patchJobConditions({ installerPaidDayHours: Number(e.target.value) || 8 })}
                  />
                </label>
                <label className="text-[11px] font-medium text-slate-700">
                  Breaks + lunch (hr / installer)
                  <input
                    type="number"
                    step="0.25"
                    min={0}
                    className="ui-input mt-0.5 h-8 w-full"
                    value={jobConditions.dailyBreakHoursPerInstaller}
                    onChange={(e) => patchJobConditions({ dailyBreakHoursPerInstaller: Number(e.target.value) || 0 })}
                  />
                </label>
                <label className="text-[11px] font-medium text-slate-700">
                  Setup, cleanup, layout (hr / installer / day)
                  <input
                    type="number"
                    step="0.25"
                    min={0}
                    className="ui-input mt-0.5 h-8 w-full"
                    value={jobConditions.fieldSetupCleanupHoursPerInstallerDay}
                    onChange={(e) => patchJobConditions({ fieldSetupCleanupHoursPerInstallerDay: Number(e.target.value) || 0 })}
                    title="Not straight install: protect floors, tool setup, end-of-day cleanup, packing — default 0 for legacy; try 0.5–1.5 for typical field days"
                  />
                </label>
              </div>
            </div>
            <details className="group sm:col-span-2 md:col-span-3 rounded-xl border border-slate-200 bg-white/90 px-3 py-2">
              <summary className="cursor-pointer list-none text-[11px] font-semibold text-slate-800 [&::-webkit-details-marker]:hidden">
                Advanced: stacked material profit, sub labor markup (usually 0%)
              </summary>
              <div className="mt-3 grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-2 md:grid-cols-3">
                <label className="text-[11px] font-medium text-slate-700">
                  Material profit % (after material O&amp;P)
                  {matchesOffice('profit') ? <FieldBadge kind="office" /> : <FieldBadge kind="optional" />}
                  <input
                    type="number"
                    className="ui-input mt-0.5 h-8 w-full max-w-[6.5rem]"
                    value={project.profitPercent}
                    onChange={(e) => setProject({ ...project, profitPercent: Number(e.target.value) || 0 })}
                  />
                </label>
                <label className="text-[11px] font-medium text-slate-700">
                  Labor overhead % (sub)
                  {matchesOffice('laborOverhead') ? <FieldBadge kind="office" /> : <FieldBadge kind="optional" />}
                  <input
                    type="number"
                    className="ui-input mt-0.5 h-8 w-full max-w-[6.5rem]"
                    value={project.laborOverheadPercent}
                    onChange={(e) => setProject({ ...project, laborOverheadPercent: Number(e.target.value) || 0 })}
                  />
                </label>
                <label className="text-[11px] font-medium text-slate-700">
                  Labor profit % (sub)
                  {matchesOffice('laborProfit') ? <FieldBadge kind="office" /> : <FieldBadge kind="optional" />}
                  <input
                    type="number"
                    className="ui-input mt-0.5 h-8 w-full max-w-[6.5rem]"
                    value={project.laborProfitPercent}
                    onChange={(e) => setProject({ ...project, laborProfitPercent: Number(e.target.value) || 0 })}
                  />
                </label>
              </div>
            </details>
            <div className="sm:col-span-2 md:col-span-3 rounded-lg border border-amber-200/80 bg-amber-50/50 p-3">
              <p className="text-[13px] font-semibold text-slate-900">Performance / surety bond</p>
              <p className="mt-1 text-[12px] text-slate-600">
                If bonding is required, add an allowance as a percent of the base bid (catalog material + labor subtotals before job-wide tax and markups).
              </p>
              <label className="mt-2 flex items-center gap-2 text-[12px] font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={jobConditions.performanceBondRequired}
                  onChange={(e) => patchJobConditions({ performanceBondRequired: e.target.checked })}
                />
                Bond required on this project
              </label>
              <label className="mt-2 block text-[12px] font-medium text-slate-700">
                Bond allowance % of base bid
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  className="ui-input mt-1 h-8 max-w-[8rem]"
                  value={jobConditions.performanceBondPercent}
                  onChange={(e) => patchJobConditions({ performanceBondPercent: Number(e.target.value) || 0 })}
                  disabled={!jobConditions.performanceBondRequired}
                />
              </label>
            </div>
            <label className="text-[12px] font-medium text-slate-700">
              Project adder %
              <FieldBadge kind="optional" />
              <input
                type="number"
                step="0.01"
                className="ui-input mt-0.5 h-8 w-full max-w-[6.5rem]"
                value={jobConditions.estimateAdderPercent}
                onChange={(e) => patchJobConditions({ estimateAdderPercent: Number(e.target.value) || 0 })}
              />
            </label>
            <label className="text-[12px] font-medium text-slate-700">
              Project adder $
              <FieldBadge kind="optional" />
              <input
                type="number"
                step="0.01"
                className="ui-input mt-0.5 h-8 w-full max-w-[6.5rem]"
                value={jobConditions.estimateAdderAmount}
                onChange={(e) => patchJobConditions({ estimateAdderAmount: Number(e.target.value) || 0 })}
              />
            </label>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold text-slate-900">Sub labor management fee</p>
            <label className="mt-2 flex items-center gap-2 text-[11px] text-slate-700">
              <input
                type="checkbox"
                checked={project.subLaborManagementFeeEnabled}
                onChange={(e) => setProject({ ...project, subLaborManagementFeeEnabled: e.target.checked })}
              />
              Enable fee on loaded subcontractor labor
            </label>
            <label className="mt-2 block text-[11px] font-medium text-slate-700">
              Fee %
              <input
                type="number"
                step="0.01"
                className="ui-input mt-1 h-9 max-w-[200px]"
                value={project.subLaborManagementFeePercent}
                onChange={(e) => setProject({ ...project, subLaborManagementFeePercent: Number(e.target.value) || 0 })}
              />
            </label>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
            <p className="text-xs font-semibold text-slate-900">Site &amp; access (advanced)</p>
            <p className="mt-1 text-[11px] text-slate-600">Floors, elevator, mobilization, and delivery difficulty — use when vertical transport or logistics matter.</p>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
              <label className="text-[11px] font-medium text-slate-700">
                Floor labor add / floor
                <input
                  type="number"
                  step="0.01"
                  className="ui-input mt-0.5 h-8 w-full max-w-[6.5rem]"
                  value={jobConditions.floorMultiplierPerFloor}
                  onChange={(e) => patchJobConditions({ floorMultiplierPerFloor: Number(e.target.value) || 0 })}
                />
              </label>
              <label className="text-[11px] font-medium text-slate-700">
                Delivery difficulty
                <select
                  className="ui-input mt-0.5 h-8 w-full max-w-[12rem]"
                  value={jobConditions.deliveryDifficulty}
                  onChange={(e) => patchJobConditions({ deliveryDifficulty: e.target.value as ProjectJobConditions['deliveryDifficulty'] })}
                >
                  <option value="standard">Standard</option>
                  <option value="constrained">Constrained</option>
                  <option value="difficult">Difficult</option>
                </select>
              </label>
              <label className="text-[11px] font-medium text-slate-700">
                Mobilization
                <select
                  className="ui-input mt-0.5 h-8 w-full max-w-[12rem]"
                  value={jobConditions.mobilizationComplexity}
                  onChange={(e) => patchJobConditions({ mobilizationComplexity: e.target.value as ProjectJobConditions['mobilizationComplexity'] })}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-[11px] text-slate-700 md:col-span-3">
                <input type="checkbox" checked={jobConditions.elevatorAvailable} onChange={(e) => patchJobConditions({ elevatorAvailable: e.target.checked })} />
                Elevator available (uncheck to apply multi-floor labor lift when not using stairs only)
              </label>
            </div>
            <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3 text-[11px] text-slate-600">
              <p className="font-medium text-slate-800">Job distance from office</p>
              <p className="mt-1">
                {jobConditions.travelDistanceMiles !== null
                  ? `${formatNumberSafe(jobConditions.travelDistanceMiles, 1)} miles from office`
                  : 'No calculated distance yet — set address in Project details.'}
              </p>
              {distanceCalculating ? <p className="mt-1 text-blue-700">Calculating…</p> : null}
              {distanceError ? <p className="mt-1 text-red-600">{distanceError}</p> : null}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold text-slate-900">Condition multipliers (when toggles are on)</p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
              <label className="text-[11px] text-slate-700">
                Occupied building
                <input
                  type="number"
                  step="0.01"
                  className="ui-input mt-0.5 h-8 w-full max-w-[6.5rem]"
                  value={jobConditions.occupiedBuildingMultiplier}
                  onChange={(e) => patchJobConditions({ occupiedBuildingMultiplier: Number(e.target.value) || 0 })}
                />
              </label>
              <label className="text-[11px] text-slate-700">
                Restricted access
                <input
                  type="number"
                  step="0.01"
                  className="ui-input mt-0.5 h-8 w-full max-w-[6.5rem]"
                  value={jobConditions.restrictedAccessMultiplier}
                  onChange={(e) => patchJobConditions({ restrictedAccessMultiplier: Number(e.target.value) || 0 })}
                />
              </label>
              <label className="text-[11px] text-slate-700">
                Night work (labor $)
                <input
                  type="number"
                  step="0.01"
                  className="ui-input mt-0.5 h-8 w-full max-w-[6.5rem]"
                  value={jobConditions.nightWorkLaborCostMultiplier}
                  onChange={(e) => patchJobConditions({ nightWorkLaborCostMultiplier: Number(e.target.value) || 0 })}
                />
              </label>
              <label className="text-[11px] text-slate-700">
                Night work (labor min)
                <input
                  type="number"
                  step="0.01"
                  className="ui-input mt-0.5 h-8 w-full max-w-[6.5rem]"
                  value={jobConditions.nightWorkLaborMinutesMultiplier}
                  onChange={(e) => patchJobConditions({ nightWorkLaborMinutesMultiplier: Number(e.target.value) || 0 })}
                />
              </label>
              <label className="text-[11px] text-slate-700">
                Phased work
                <input
                  type="number"
                  step="0.01"
                  className="ui-input mt-0.5 h-8 w-full max-w-[6.5rem]"
                  value={jobConditions.phasedWorkMultiplier}
                  onChange={(e) => patchJobConditions({ phasedWorkMultiplier: Number(e.target.value) || 0 })}
                />
              </label>
              <label className="text-[11px] text-slate-700">
                Remote travel
                <input
                  type="number"
                  step="0.01"
                  className="ui-input mt-0.5 h-8 w-full max-w-[6.5rem]"
                  value={jobConditions.remoteTravelMultiplier}
                  onChange={(e) => patchJobConditions({ remoteTravelMultiplier: Number(e.target.value) || 0 })}
                />
              </label>
              <label className="text-[11px] text-slate-700">
                Schedule compression
                <input
                  type="number"
                  step="0.01"
                  className="ui-input mt-0.5 h-8 w-full max-w-[6.5rem]"
                  value={jobConditions.scheduleCompressionMultiplier}
                  onChange={(e) => patchJobConditions({ scheduleCompressionMultiplier: Number(e.target.value) || 0 })}
                />
              </label>
              <label className="text-[11px] text-slate-700">
                Small job
                <input
                  type="number"
                  step="0.01"
                  className="ui-input mt-0.5 h-8 w-full max-w-[6.5rem]"
                  value={jobConditions.smallJobMultiplier}
                  onChange={(e) => patchJobConditions({ smallJobMultiplier: Number(e.target.value) || 0 })}
                />
              </label>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
            <p className="text-xs font-semibold text-slate-900">Labor basis</p>
            <p className="mt-1 text-[11px] text-slate-600">Union baseline is the default for this workspace.</p>
            <input className="ui-input mt-2 h-9 max-w-md bg-slate-100" value="Union baseline (default)" readOnly />
          </div>
        </div>
      </details>

      {/* Notes */}
      <section className="rounded-2xl border border-slate-200/70 bg-white shadow-sm px-5 py-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">Notes</p>
        <h2 className="mt-1 text-lg font-semibold text-slate-900">Special notes</h2>
        <p className="mt-1 text-sm text-slate-600">Internal coordination — optional on the client proposal.</p>
        <label className="mt-3 block text-[11px] font-medium text-slate-700">
          Project notes
          <textarea
            className="ui-input mt-1 min-h-[100px] py-2"
            value={project.specialNotes || ''}
            onChange={(e) => setProject({ ...project, specialNotes: e.target.value || null })}
            placeholder="Coordination, exclusions clarifications, owner requests…"
          />
        </label>
        <label className="mt-3 flex cursor-pointer items-start gap-2 text-[11px] text-slate-700">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={project.proposalIncludeSpecialNotes}
            onChange={(e) => setProject({ ...project, proposalIncludeSpecialNotes: e.target.checked })}
          />
          <span>
            <span className="font-medium text-slate-800">Include on proposal</span>
            <span className="mt-0.5 block text-[10px] text-slate-500">When off, notes stay in setup only.</span>
          </span>
        </label>
        <label className="mt-3 flex cursor-pointer items-start gap-2 text-[11px] text-slate-700">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={project.proposalIncludeCatalogImages}
            onChange={(e) => setProject({ ...project, proposalIncludeCatalogImages: e.target.checked })}
          />
          <span>
            <span className="font-medium text-slate-800">Show catalog images on proposal</span>
            <span className="mt-0.5 block text-[10px] text-slate-500">
              Adds product thumbnails next to scope lines when takeoff rows are linked to catalog items with image URLs.
            </span>
          </span>
        </label>
      </section>

    </div>
  );
}
