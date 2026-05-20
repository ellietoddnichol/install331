import React, { useMemo } from 'react';
import { BrickWall, Building2, Calculator, HardHat, MapPin, Save, Settings2, User } from 'lucide-react';
import type { ProjectJobConditions, ProjectRecord, PricingMode, ProposalVisibility, SettingsRecord } from '../../shared/types/estimator';
import { FieldOpsPageHeader } from '../../components/fieldops/FieldOpsPrimitives';
import {
  buildProjectBlockingAssumptions,
  buildSetupChecklist,
  ProjectSetupReadinessPanel,
  readProjectBlockingStatus,
} from '../../components/project/ProjectSetupReadiness';
import { ProjectWorkflowGuide } from '../../components/projects/ProjectWorkflowGuide';
import { projectDisplaySubtitle, projectDisplayTitle, proposalModeChipLabel } from '../../shared/utils/projectDisplay';
import { composeAddress, parseAddressParts, type AddressParts } from '../../shared/utils/addressParts.ts';
import { formatNumberSafe } from '../../utils/numberFormat';

interface ProjectSetupPageProps {
  project: ProjectRecord | null;
  settings: SettingsRecord | null;
  setProject: React.Dispatch<React.SetStateAction<ProjectRecord | null>>;
  patchJobConditions: (patch: Partial<ProjectJobConditions>) => void;
  onSave?: () => void | Promise<void>;
  saveBusy?: boolean;
}

function mapSourceRowDefault(value: string): 'replace_existing' | 'append' {
  return value === 'append' ? 'append' : 'replace_existing';
}

function mapProposalVisibility(value: string): ProposalVisibility {
  if (value === 'internal_only') return 'internal_only';
  if (value === 'optional_or_alt') return 'optional_or_alt';
  return 'customer_visible';
}

function pricingModeLabel(mode: PricingMode | string): string {
  const m = String(mode);
  if (m === 'material_only') return 'Material only';
  if (m === 'labor_only') return 'Labor only';
  if (m === 'material_with_optional_install_quote') return 'Material + optional install quote';
  return 'Detailed estimate (material + labor)';
}

function SetupSectionCard(props: {
  step: number;
  title: string;
  icon: React.ReactNode;
  highlight?: boolean;
  children: React.ReactNode;
}) {
  const { step, title, icon, highlight, children } = props;
  return (
    <section
      className={`ui-fo-card p-5 ${highlight ? 'ring-2 ring-orange-200' : ''}`}
      id={`setup-section-${step}`}
    >
      <div className="mb-4 flex items-center gap-2.5">
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-lg ${highlight ? 'bg-orange-100 text-orange-800' : 'bg-slate-100 text-slate-700'}`}
        >
          {icon}
        </span>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Step {step}</p>
          <h2 className="text-base font-semibold text-slate-950">{title}</h2>
        </div>
      </div>
      {children}
    </section>
  );
}

export function ProjectSetupPage({ project, settings, setProject, patchJobConditions, onSave, saveBusy }: ProjectSetupPageProps) {
  if (!project) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-slate-500">Loading setup…</p>
      </div>
    );
  }

  const addressParts = useMemo(() => parseAddressParts(project.address), [project.address]);
  const baseLaborRate = Number(settings?.defaultLaborRatePerHour || 100);
  const laborMultiplier = Number(project.jobConditions?.laborRateMultiplier || 1);
  const effectiveLaborRate = Number((baseLaborRate * laborMultiplier).toFixed(2));
  const effectiveTax = project.jobConditions?.locationTaxPercent ?? project.taxPercent;
  const blockingStatus = readProjectBlockingStatus(project);
  const checklist = useMemo(
    () => buildSetupChecklist(project, effectiveLaborRate, addressParts.address1),
    [project, effectiveLaborRate, addressParts.address1],
  );

  function updateProjectField<K extends keyof ProjectRecord>(field: K, value: ProjectRecord[K]) {
    setProject((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  function updateAddress(patch: Partial<AddressParts>) {
    const next = { ...addressParts, ...patch };
    updateProjectField('address', composeAddress(next));
  }

  function setBlockingStatus(value: '' | 'included' | 'by_others' | 'unknown') {
    setProject((prev) =>
      prev
        ? {
            ...prev,
            structuredAssumptions: buildProjectBlockingAssumptions(prev, value),
          }
        : prev,
    );
  }

  return (
    <div className="pb-24">
      <section className="ui-fo-card mb-5 p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Project setup</p>
        <ProjectWorkflowGuide className="mt-2" />
        <h1 className="mt-3 text-xl font-semibold text-slate-950">{projectDisplayTitle(project.projectName)}</h1>
        {projectDisplaySubtitle(project) ? (
          <p className="mt-1 text-sm text-slate-600">{projectDisplaySubtitle(project)}</p>
        ) : (
          <p className="mt-1 text-sm text-slate-500">Add customer and site details to continue.</p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-800 ring-1 ring-slate-200/80">
            {proposalModeChipLabel(project.pricingMode)}
          </span>
          <span className="text-[11px] text-slate-500">Proposal mode</span>
        </div>
      </section>

      <FieldOpsPageHeader
        kicker="Estimate readiness"
        title="Setup checklist"
        subtitle="Configure customer, site, labor, and install assumptions before quote import and estimate review."
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_minmax(17rem,20rem)]">
        <div className="space-y-5">
          <SetupSectionCard step={1} title="Customer Information" icon={<User className="h-4 w-4" />}>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm sm:col-span-2">
                <span className="font-medium text-slate-700">Customer name</span>
                <input className="ui-input" value={project.clientName || ''} onChange={(e) => updateProjectField('clientName', e.target.value || null)} />
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-medium text-slate-700">Contact / estimator</span>
                <input className="ui-input" value={project.estimator || ''} onChange={(e) => updateProjectField('estimator', e.target.value || null)} />
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-medium text-slate-700">Project name</span>
                <input className="ui-input" value={project.projectName} onChange={(e) => updateProjectField('projectName', e.target.value)} />
              </label>
              <label className="space-y-1.5 text-sm sm:col-span-2">
                <span className="font-medium text-slate-700">Internal setup notes</span>
                <textarea className="ui-input min-h-20" value={project.notes || ''} onChange={(e) => updateProjectField('notes', e.target.value || null)} />
              </label>
            </div>
          </SetupSectionCard>

          <SetupSectionCard step={2} title="Project Address" icon={<MapPin className="h-4 w-4" />}>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm sm:col-span-2">
                <span className="font-medium text-slate-700">Street address</span>
                <input className="ui-input" value={addressParts.address1} onChange={(e) => updateAddress({ address1: e.target.value })} />
              </label>
              <label className="space-y-1.5 text-sm sm:col-span-2">
                <span className="font-medium text-slate-700">Address line 2</span>
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
              <label className="space-y-1.5 text-sm sm:col-span-2">
                <span className="font-medium text-slate-700">County / region label</span>
                <input
                  className="ui-input"
                  value={project.jobConditions.locationLabel || ''}
                  onChange={(e) => patchJobConditions({ locationLabel: e.target.value })}
                  placeholder="e.g. Travis County"
                />
              </label>
            </div>
          </SetupSectionCard>

          <SetupSectionCard step={3} title="Proposal / Estimate Mode" icon={<Calculator className="h-4 w-4" />}>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm sm:col-span-2">
                <span className="font-medium text-slate-700">Pricing mode</span>
                <select className="ui-input" value={project.pricingMode} onChange={(e) => updateProjectField('pricingMode', e.target.value as PricingMode)}>
                  <option value="labor_and_material">Detailed estimate — material + labor</option>
                  <option value="material_only">Material only</option>
                  <option value="labor_only">Install / labor only</option>
                  <option value="material_with_optional_install_quote">Material + optional install quote</option>
                </select>
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-medium text-slate-700">Proposal format</span>
                <select className="ui-input" value={project.proposalFormat || 'standard'} onChange={(e) => updateProjectField('proposalFormat', e.target.value as ProjectRecord['proposalFormat'])}>
                  <option value="standard">Full proposal</option>
                  <option value="condensed">Condensed</option>
                  <option value="executive_summary">Executive summary</option>
                  <option value="schedule_with_amounts">Schedule with amounts</option>
                </select>
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-medium text-slate-700">Default line visibility</span>
                <select
                  className="ui-input"
                  value={project.jobConditions.defaultProposalVisibility}
                  onChange={(e) => patchJobConditions({ defaultProposalVisibility: mapProposalVisibility(e.target.value) })}
                >
                  <option value="customer_visible">Customer visible</option>
                  <option value="internal_only">Internal only</option>
                  <option value="optional_or_alt">Optional / alternate</option>
                </select>
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={project.proposalIncludeCatalogImages}
                  onChange={(e) => updateProjectField('proposalIncludeCatalogImages', e.target.checked)}
                />
                Include catalog images on customer proposal
              </label>
            </div>
          </SetupSectionCard>

          <SetupSectionCard step={4} title="Labor & Productivity" icon={<HardHat className="h-4 w-4" />}>
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
                <span className="font-medium text-slate-700">Base rate (workbook)</span>
                <div className="ui-input flex h-10 items-center bg-slate-50 text-slate-700">${formatNumberSafe(baseLaborRate, 2)}/hr</div>
              </div>
              <label className="space-y-1.5 text-sm">
                <span className="font-medium text-slate-700">Labor basis</span>
                <select className="ui-input" value={project.jobConditions.laborRateBasis} onChange={(e) => patchJobConditions({ laborRateBasis: e.target.value as ProjectJobConditions['laborRateBasis'] })}>
                  <option value="union">Union baseline</option>
                  <option value="prevailing">Non-union / prevailing</option>
                </select>
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-medium text-slate-700">Crew size (installers)</span>
                <input
                  className="ui-input"
                  type="number"
                  min="1"
                  step="1"
                  value={project.jobConditions.installerCount}
                  onChange={(e) => patchJobConditions({ installerCount: Math.max(1, Number(e.target.value) || 1) })}
                />
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-medium text-slate-700">Labor burden %</span>
                <input className="ui-input" type="number" min="0" step="0.1" value={project.laborBurdenPercent} onChange={(e) => updateProjectField('laborBurdenPercent', Number(e.target.value) || 0)} />
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-medium text-slate-700">Labor overhead %</span>
                <input className="ui-input" type="number" min="0" step="0.1" value={project.laborOverheadPercent} onChange={(e) => updateProjectField('laborOverheadPercent', Number(e.target.value) || 0)} />
              </label>
            </div>
            <p className="mt-3 rounded-lg border border-sky-200 bg-sky-50/80 px-3 py-2 text-[12px] text-sky-950">
              Loaded labor from catalog and install intelligence uses these defaults when quote lines do not specify vendor labor.
            </p>
          </SetupSectionCard>

          <SetupSectionCard step={5} title="Wall & Construction Details" icon={<BrickWall className="h-4 w-4" />} highlight>
            <p className="mb-3 text-[13px] leading-relaxed text-orange-950/90">
              Wall substrate and blocking drive install intelligence — grab bars, mirrors, and dispensers may stay labor-blocked until these are set.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm">
                <span className="font-semibold text-slate-800">Wall substrate</span>
                <select className="ui-input ring-1 ring-orange-100" value={project.wallSubstrate || ''} onChange={(e) => updateProjectField('wallSubstrate', e.target.value || null)}>
                  <option value="">Select substrate…</option>
                  <option value="Drywall">Drywall</option>
                  <option value="Tile">Tile</option>
                  <option value="CMU">CMU / block</option>
                  <option value="Concrete">Concrete</option>
                  <option value="Metal panels">Metal panels</option>
                  <option value="Other">Other</option>
                </select>
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-semibold text-slate-800">Wall height / floors</span>
                <input className="ui-input" value={project.installHeight || ''} onChange={(e) => updateProjectField('installHeight', e.target.value || null)} placeholder="e.g. 9 ft typical" />
              </label>
              <fieldset className="space-y-2 sm:col-span-2">
                <legend className="text-sm font-semibold text-slate-800">Blocking / backing</legend>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      { id: 'included', label: 'Included' },
                      { id: 'by_others', label: 'By others' },
                      { id: 'unknown', label: 'Unknown' },
                    ] as const
                  ).map((opt) => {
                    const active = blockingStatus === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setBlockingStatus(opt.id)}
                        className={`rounded-lg border px-4 py-2 text-sm font-semibold transition ${
                          active
                            ? 'border-orange-400 bg-orange-50 text-orange-950 ring-1 ring-orange-200'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              <label className="space-y-1.5 text-sm sm:col-span-2">
                <span className="font-medium text-slate-700">Construction notes</span>
                <textarea className="ui-input min-h-20" value={project.specialNotes || ''} onChange={(e) => updateProjectField('specialNotes', e.target.value || null)} placeholder="Site constraints, phasing, or backing details for the crew" />
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={project.jobConditions.occupiedBuilding} onChange={(e) => patchJobConditions({ occupiedBuilding: e.target.checked })} />
                Occupied space
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={project.jobConditions.restrictedAccess} onChange={(e) => patchJobConditions({ restrictedAccess: e.target.checked })} />
                Access constraints
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={project.jobConditions.nightWork} onChange={(e) => patchJobConditions({ nightWork: e.target.checked })} />
                After-hours / night work
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={project.jobConditions.floors > 1} onChange={(e) => patchJobConditions({ floors: e.target.checked ? Math.max(2, project.jobConditions.floors) : 1 })} />
                Stairs / multi-floor
              </label>
            </div>
          </SetupSectionCard>

          <SetupSectionCard step={6} title="Tax & Location" icon={<Building2 className="h-4 w-4" />}>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm">
                <span className="font-medium text-slate-700">Tax region label</span>
                <input className="ui-input" value={project.jobConditions.locationLabel || ''} onChange={(e) => patchJobConditions({ locationLabel: e.target.value })} />
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-medium text-slate-700">Project tax rate %</span>
                <input className="ui-input" type="number" min="0" step="0.01" value={project.taxPercent} onChange={(e) => updateProjectField('taxPercent', Number(e.target.value) || 0)} />
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-medium text-slate-700">Tax override %</span>
                <input
                  className="ui-input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={project.jobConditions.locationTaxPercent ?? ''}
                  onChange={(e) => patchJobConditions({ locationTaxPercent: e.target.value === '' ? null : Number(e.target.value) })}
                />
              </label>
              <div className="space-y-1.5 text-sm">
                <span className="font-medium text-slate-700">Effective tax</span>
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
            </div>
          </SetupSectionCard>

          <SetupSectionCard step={7} title="Additional Settings" icon={<Settings2 className="h-4 w-4" />}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="space-y-1.5 text-sm">
                <span className="font-medium text-slate-700">Bid / proposal date</span>
                <input className="ui-input" type="date" value={project.bidDate || ''} onChange={(e) => updateProjectField('bidDate', e.target.value || null)} />
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-medium text-slate-700">Due date</span>
                <input className="ui-input" type="date" value={project.dueDate || ''} onChange={(e) => updateProjectField('dueDate', e.target.value || null)} />
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-medium text-slate-700">Default markup (O/H) %</span>
                <input className="ui-input" type="number" min="0" step="0.1" value={project.overheadPercent} onChange={(e) => updateProjectField('overheadPercent', Number(e.target.value) || 0)} />
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-medium text-slate-700">Profit %</span>
                <input className="ui-input" type="number" min="0" step="0.1" value={project.profitPercent} onChange={(e) => updateProjectField('profitPercent', Number(e.target.value) || 0)} />
              </label>
              <label className="space-y-1.5 text-sm sm:col-span-2">
                <span className="font-medium text-slate-700">Quote re-parse default</span>
                <select className="ui-input" value={project.jobConditions.sourceQuoteExtractMode} onChange={(e) => patchJobConditions({ sourceQuoteExtractMode: mapSourceRowDefault(e.target.value) })}>
                  <option value="replace_existing">Replace existing rows</option>
                  <option value="append">Append rows</option>
                </select>
              </label>
            </div>
          </SetupSectionCard>
        </div>

        <ProjectSetupReadinessPanel
          items={checklist}
          project={project}
          effectiveLaborRate={effectiveLaborRate}
          effectiveTax={effectiveTax}
          pricingModeLabel={pricingModeLabel(project.pricingMode)}
          addressLine1={addressParts.address1}
        />
      </div>

      {onSave ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-700 bg-slate-800 px-4 py-3">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
            <p className="text-sm text-slate-300">Changes autosave — use Save Setup to persist immediately.</p>
            <button type="button" className="ui-fo-btn-primary gap-2" onClick={() => void onSave()} disabled={saveBusy}>
              <Save className="h-4 w-4" />
              {saveBusy ? 'Saving…' : 'Save Setup'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

