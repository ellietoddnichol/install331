import React, { useMemo } from 'react';
import { DollarSign, MapPin, Settings, Zap } from 'lucide-react';
import type { ProjectJobConditions, ProjectRecord, ProposalVisibility, SettingsRecord } from '../../shared/types/estimator';
import { formatNumberSafe } from '../../utils/numberFormat';

interface ProjectSetupPageProps {
  project: ProjectRecord | null;
  settings: SettingsRecord | null;
  setProject: React.Dispatch<React.SetStateAction<ProjectRecord | null>>;
  patchJobConditions: (patch: Partial<ProjectJobConditions>) => void;
}

interface AddressParts {
  address1: string;
  address2: string;
  city: string;
  state: string;
  zip: string;
}

function parseAddressParts(address: string | null | undefined): AddressParts {
  const raw = String(address || '').trim();
  if (!raw) return { address1: '', address2: '', city: '', state: '', zip: '' };
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
  const last = parts[parts.length - 1] || '';
  const stateZip = last.match(/^([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  return {
    address1: parts[0] || '',
    address2: parts.length > 3 ? parts[1] : '',
    city: parts.length > 1 ? (parts[parts.length - 2] || '') : '',
    state: stateZip?.[1] || '',
    zip: stateZip?.[2] || '',
  };
}

function composeAddress(parts: AddressParts): string | null {
  const left = [parts.address1, parts.address2].map((v) => v.trim()).filter(Boolean);
  const city = parts.city.trim();
  const state = parts.state.trim().toUpperCase();
  const zip = parts.zip.trim();
  const stateZip = [state, zip].filter(Boolean).join(' ').trim();
  const right = [city, stateZip].filter(Boolean);
  const full = [...left, ...right].join(', ').trim();
  return full || null;
}

function mapSourceRowDefault(value: string): 'replace_existing' | 'append' {
  return value === 'append' ? 'append' : 'replace_existing';
}

function mapProposalVisibility(value: string): ProposalVisibility {
  if (value === 'internal_only') return 'internal_only';
  if (value === 'optional_or_alt') return 'optional_or_alt';
  return 'customer_visible';
}

function sourceRowDefaultLabel(value: 'replace_existing' | 'append'): string {
  return value === 'replace_existing' ? 'Replace existing rows on re-parse' : 'Append rows on re-parse';
}

export function ProjectSetupPage({ project, settings, setProject, patchJobConditions }: ProjectSetupPageProps) {
  if (!project) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-slate-500">Loading setup...</p>
      </div>
    );
  }

  const addressParts = useMemo(() => parseAddressParts(project.address), [project.address]);
  const baseLaborRate = Number(settings?.defaultLaborRatePerHour || 100);
  const laborMultiplier = Number(project.jobConditions?.laborRateMultiplier || 1);
  const effectiveLaborRate = Number((baseLaborRate * laborMultiplier).toFixed(2));
  const effectiveTax = project.jobConditions?.locationTaxPercent ?? project.taxPercent;
  const activeModifiers = [
    project.jobConditions?.nightWork,
    project.jobConditions?.remoteTravel,
    project.jobConditions?.occupiedBuilding,
    project.jobConditions?.restrictedAccess,
    project.jobConditions?.scheduleCompression,
    project.jobConditions?.floors > 1,
  ].filter(Boolean).length;

  function updateProjectField<K extends keyof ProjectRecord>(field: K, value: ProjectRecord[K]) {
    setProject((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  function updateAddress(patch: Partial<AddressParts>) {
    const next = { ...addressParts, ...patch };
    updateProjectField('address', composeAddress(next));
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 pb-14">
      <section className="ui-surface p-5 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="ui-mono-kicker">Project setup</p>
            <h2 className="mt-1 text-[24px] font-semibold tracking-tight text-slate-950 sm:text-[28px]">Pricing and job defaults</h2>
            <p className="mt-1 text-sm text-slate-600">Define tax, labor, and project-level modifiers before quote import and estimate review.</p>
          </div>
          <span className="text-xs text-slate-500">Autosaved with project updates</span>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs text-slate-500">Address</p>
            <p className="mt-0.5 truncate text-sm font-semibold text-slate-950">{addressParts.address1 || 'Not set'}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs text-slate-500">Effective tax</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-950">{formatNumberSafe(effectiveTax || 0, 2)}%</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs text-slate-500">Effective labor</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-950">${formatNumberSafe(effectiveLaborRate, 2)}/hr</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs text-slate-500">Active modifiers</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-950">{activeModifiers}</p>
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="ui-surface p-5">
          <div className="mb-4 flex items-center gap-2">
            <Zap className="h-4 w-4 text-slate-600" />
            <p className="ui-mono-kicker">Section 1 - Project info</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm sm:col-span-2">
              <span className="font-medium text-slate-700">Project name</span>
              <input className="ui-input" value={project.projectName} onChange={(e) => updateProjectField('projectName', e.target.value)} />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-slate-700">Project number</span>
              <input className="ui-input" value={project.projectNumber || ''} onChange={(e) => updateProjectField('projectNumber', e.target.value || null)} />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-slate-700">Client</span>
              <input className="ui-input" value={project.clientName || ''} onChange={(e) => updateProjectField('clientName', e.target.value || null)} />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-slate-700">Status</span>
              <select className="ui-input" value={project.status} onChange={(e) => updateProjectField('status', e.target.value as ProjectRecord['status'])}>
                <option value="Draft">Draft</option>
                <option value="Submitted">Submitted</option>
                <option value="Awarded">Awarded</option>
                <option value="Lost">Lost</option>
                <option value="Archived">Archived</option>
              </select>
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-slate-700">Estimator / owner</span>
              <input className="ui-input" value={project.estimator || ''} onChange={(e) => updateProjectField('estimator', e.target.value || null)} />
            </label>
            <label className="space-y-1.5 text-sm sm:col-span-2">
              <span className="font-medium text-slate-700">Internal setup notes</span>
              <textarea className="ui-input min-h-24" value={project.notes || ''} onChange={(e) => updateProjectField('notes', e.target.value || null)} />
            </label>
          </div>
        </section>

        <section className="ui-surface p-5">
          <div className="mb-4 flex items-center gap-2">
            <MapPin className="h-4 w-4 text-slate-600" />
            <p className="ui-mono-kicker">Section 2 - Address and tax</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm sm:col-span-2">
              <span className="font-medium text-slate-700">Address 1</span>
              <input className="ui-input" value={addressParts.address1} onChange={(e) => updateAddress({ address1: e.target.value })} />
            </label>
            <label className="space-y-1.5 text-sm sm:col-span-2">
              <span className="font-medium text-slate-700">Address 2</span>
              <input className="ui-input" value={addressParts.address2} onChange={(e) => updateAddress({ address2: e.target.value })} />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-slate-700">City</span>
              <input className="ui-input" value={addressParts.city} onChange={(e) => updateAddress({ city: e.target.value })} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1.5 text-sm">
                <span className="font-medium text-slate-700">State</span>
                <input className="ui-input" value={addressParts.state} onChange={(e) => updateAddress({ state: e.target.value })} />
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-medium text-slate-700">ZIP</span>
                <input className="ui-input" value={addressParts.zip} onChange={(e) => updateAddress({ zip: e.target.value })} />
              </label>
            </div>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-slate-700">Tax jurisdiction</span>
              <input className="ui-input" value={project.jobConditions.locationLabel || ''} onChange={(e) => patchJobConditions({ locationLabel: e.target.value })} />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-slate-700">Project tax rate %</span>
              <input className="ui-input" type="number" min="0" step="0.01" value={project.taxPercent} onChange={(e) => updateProjectField('taxPercent', Number(e.target.value) || 0)} />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-slate-700">Tax override %</span>
              <input className="ui-input" type="number" min="0" step="0.01" value={project.jobConditions.locationTaxPercent ?? ''} onChange={(e) => patchJobConditions({ locationTaxPercent: e.target.value === '' ? null : Number(e.target.value) })} />
            </label>
            <div className="space-y-1.5 text-sm">
              <span className="font-medium text-slate-700">Effective tax %</span>
              <div className="ui-input flex h-10 items-center bg-slate-50 text-slate-700">{formatNumberSafe(effectiveTax || 0, 2)}%</div>
            </div>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
              <input
                type="checkbox"
                checked={(project.jobConditions.locationTaxPercent ?? project.taxPercent) <= 0}
                onChange={(e) => {
                  if (e.target.checked) {
                    updateProjectField('taxPercent', 0);
                    patchJobConditions({ locationTaxPercent: 0 });
                  } else {
                    patchJobConditions({ locationTaxPercent: null });
                    updateProjectField('taxPercent', Number(settings?.defaultTaxPercent || 8.25));
                  }
                }}
              />
              Tax exempt
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
              <input type="checkbox" checked={project.jobConditions.materialOnlyTax} onChange={(e) => patchJobConditions({ materialOnlyTax: e.target.checked })} />
              Material-only tax
            </label>
          </div>
        </section>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="ui-surface p-5">
          <div className="mb-4 flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-slate-600" />
            <p className="ui-mono-kicker">Section 3 - Labor and pricing defaults</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-slate-700">Effective labor rate $/hr</span>
              <input
                className="ui-input"
                type="number"
                min="0"
                step="0.5"
                value={effectiveLaborRate}
                onChange={(e) => {
                  const nextRate = Math.max(0, Number(e.target.value) || 0);
                  const base = baseLaborRate > 0 ? baseLaborRate : 100;
                  patchJobConditions({ laborRateMultiplier: nextRate > 0 ? Number((nextRate / base).toFixed(4)) : 1 });
                }}
              />
            </label>
            <div className="space-y-1.5 text-sm">
              <span className="font-medium text-slate-700">Base labor rate</span>
              <div className="ui-input flex h-10 items-center bg-slate-50 text-slate-700">${formatNumberSafe(baseLaborRate, 2)}/hr</div>
            </div>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-slate-700">Pricing mode</span>
              <select className="ui-input" value={project.pricingMode} onChange={(e) => updateProjectField('pricingMode', e.target.value as ProjectRecord['pricingMode'])}>
                <option value="labor_and_material">Material + labor</option>
                <option value="material_only">Material only</option>
                <option value="labor_only">Labor only</option>
                <option value="material_with_optional_install_quote">Material + optional install quote</option>
              </select>
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-slate-700">Labor basis</span>
              <select className="ui-input" value={project.jobConditions.laborRateBasis} onChange={(e) => patchJobConditions({ laborRateBasis: e.target.value as ProjectJobConditions['laborRateBasis'] })}>
                <option value="union">Union baseline</option>
                <option value="prevailing">Non-union / prevailing</option>
              </select>
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-slate-700">Labor burden %</span>
              <input className="ui-input" type="number" min="0" step="0.1" value={project.laborBurdenPercent} onChange={(e) => updateProjectField('laborBurdenPercent', Number(e.target.value) || 0)} />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-slate-700">Labor overhead %</span>
              <input className="ui-input" type="number" min="0" step="0.1" value={project.laborOverheadPercent} onChange={(e) => updateProjectField('laborOverheadPercent', Number(e.target.value) || 0)} />
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
              <input type="checkbox" checked={project.jobConditions.suppressAutoLaborForInstallServiceRows} onChange={(e) => patchJobConditions({ suppressAutoLaborForInstallServiceRows: e.target.checked })} />
              Installation/service rows include vendor labor by default (suppress extra internal labor)
            </label>
          </div>
        </section>

        <section className="ui-surface p-5">
          <div className="mb-4 flex items-center gap-2">
            <Settings className="h-4 w-4 text-slate-600" />
            <p className="ui-mono-kicker">Section 4 - Project modifiers</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={project.jobConditions.nightWork} onChange={(e) => patchJobConditions({ nightWork: e.target.checked })} />
              Overtime / night work
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-700">Night cost factor</span>
              <input className="ui-input" type="number" min="0" step="0.01" value={project.jobConditions.nightWorkLaborCostMultiplier} onChange={(e) => patchJobConditions({ nightWorkLaborCostMultiplier: Number(e.target.value) || 0 })} />
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={project.jobConditions.remoteTravel} onChange={(e) => patchJobConditions({ remoteTravel: e.target.checked })} />
              Travel
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-700">Travel factor</span>
              <input className="ui-input" type="number" min="0" step="0.01" value={project.jobConditions.remoteTravelMultiplier} onChange={(e) => patchJobConditions({ remoteTravelMultiplier: Number(e.target.value) || 0 })} />
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={project.jobConditions.floors > 1} onChange={(e) => patchJobConditions({ floors: e.target.checked ? Math.max(2, project.jobConditions.floors) : 1 })} />
              Height / multi-floor
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-700">Per-floor factor</span>
              <input className="ui-input" type="number" min="0" step="0.01" value={project.jobConditions.floorMultiplierPerFloor} onChange={(e) => patchJobConditions({ floorMultiplierPerFloor: Number(e.target.value) || 0 })} />
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={project.jobConditions.occupiedBuilding} onChange={(e) => patchJobConditions({ occupiedBuilding: e.target.checked })} />
              Demo / occupied building
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-700">Demo factor</span>
              <input className="ui-input" type="number" min="0" step="0.01" value={project.jobConditions.occupiedBuildingMultiplier} onChange={(e) => patchJobConditions({ occupiedBuildingMultiplier: Number(e.target.value) || 0 })} />
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={project.jobConditions.restrictedAccess} onChange={(e) => patchJobConditions({ restrictedAccess: e.target.checked })} />
              Access constraints
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-700">Access factor</span>
              <input className="ui-input" type="number" min="0" step="0.01" value={project.jobConditions.restrictedAccessMultiplier} onChange={(e) => patchJobConditions({ restrictedAccessMultiplier: Number(e.target.value) || 0 })} />
            </label>
          </div>
        </section>
      </div>

      <section className="ui-surface p-5">
        <p className="ui-mono-kicker">Section 5 - Parse and estimate behavior defaults</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="space-y-1.5 text-sm">
            <span className="font-medium text-slate-700">Default new line visibility</span>
            <select className="ui-input" value={project.jobConditions.defaultProposalVisibility} onChange={(e) => patchJobConditions({ defaultProposalVisibility: mapProposalVisibility(e.target.value) })}>
              <option value="customer_visible">Customer visible</option>
              <option value="internal_only">Internal only</option>
              <option value="optional_or_alt">Optional or alternate</option>
            </select>
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="font-medium text-slate-700">Default quote re-parse handling</span>
            <select className="ui-input" value={project.jobConditions.sourceQuoteExtractMode} onChange={(e) => patchJobConditions({ sourceQuoteExtractMode: mapSourceRowDefault(e.target.value) })}>
              <option value="replace_existing">Replace existing rows</option>
              <option value="append">Append rows</option>
            </select>
          </label>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <p className="font-semibold text-slate-700">Current defaults</p>
            <p className="mt-1">Visibility: {project.jobConditions.defaultProposalVisibility.replace('_', ' ')}</p>
            <p>{sourceRowDefaultLabel(project.jobConditions.sourceQuoteExtractMode)}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
