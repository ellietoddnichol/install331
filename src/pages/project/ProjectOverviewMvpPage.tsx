import React, { useMemo } from 'react';
import type { EstimateSummary, ProjectJobConditions, ProjectRecord, SettingsRecord, SourceQuoteRecord } from '../../shared/types/estimator';
import type { WorkspaceTab } from '../../shared/types/projectWorkflow';
import { formatCurrencySafe } from '../../utils/numberFormat';

interface ProjectOverviewMvpPageProps {
  project: ProjectRecord;
  summary: EstimateSummary | null;
  quotes: SourceQuoteRecord[];
  settings: SettingsRecord | null;
  setProject: React.Dispatch<React.SetStateAction<ProjectRecord | null>>;
  patchJobConditions: (patch: Partial<ProjectJobConditions>) => void;
  onGoToTab: (tab: WorkspaceTab) => void;
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

export function ProjectOverviewMvpPage({
  project,
  summary,
  quotes,
  settings,
  setProject,
  patchJobConditions,
  onGoToTab,
}: ProjectOverviewMvpPageProps) {
  const recentQuotes = quotes.slice(0, 4);
  const proposalStatus = project.status === 'Submitted' || project.status === 'Awarded' ? 'ready to send' : 'in progress';
  const openQuoteCount = quotes.filter((q) => q.importStatus !== 'imported').length;
  const addressParts = useMemo(() => parseAddressParts(project.address), [project.address]);

  const defaultLaborRate = Number(settings?.defaultLaborRatePerHour || 100);
  const currentLaborRate = Number((defaultLaborRate * (project.jobConditions?.laborRateMultiplier || 1)).toFixed(2));

  function updateAddress(patch: Partial<AddressParts>) {
    const next = { ...addressParts, ...patch };
    const formatted = composeAddress(next);
    setProject((prev) => (prev ? { ...prev, address: formatted } : prev));
  }

  return (
    <div className="space-y-4">
      <section className="ui-surface p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="ui-mono-kicker">Project overview</p>
            <h2 className="mt-1 text-[24px] font-semibold tracking-tight text-slate-950 sm:text-[28px]">{project.projectName}</h2>
            <p className="mt-1.5 max-w-3xl text-sm text-slate-600">
              Quick project context, setup controls, and next actions. Intake starts in Quotes; pricing happens in Estimate.
            </p>
          </div>
          <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-3">
            <button type="button" onClick={() => onGoToTab('quotes')} className="ui-btn-cta w-full">Add quote</button>
            <button type="button" onClick={() => onGoToTab('estimate')} className="ui-btn-secondary h-10 px-4 text-[11px] font-semibold uppercase tracking-[0.06em]">Open estimate</button>
            <button type="button" onClick={() => onGoToTab('proposal')} className="ui-btn-secondary h-10 px-4 text-[11px] font-semibold uppercase tracking-[0.06em]">Preview proposal</button>
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs text-slate-500">Quote intake</p>
            <p className="mt-0.5 text-base font-semibold text-slate-950">{quotes.length} total · {openQuoteCount} open</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs text-slate-500">Estimate total</p>
            <p className="mt-0.5 text-base font-semibold text-slate-950">{formatCurrencySafe(summary?.baseBidTotal)}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs text-slate-500">Tax rate</p>
            <p className="mt-0.5 text-base font-semibold text-slate-950">{project.taxPercent.toFixed(2)}%</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs text-slate-500">Proposal</p>
            <p className="mt-0.5 text-base font-semibold capitalize text-slate-950">{proposalStatus}</p>
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <section className="ui-surface space-y-4 p-5">
          <div className="flex items-center justify-between">
            <p className="ui-mono-kicker">Project setup</p>
            <span className="text-xs text-slate-500">Saved with project autosave</span>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-slate-700">Project name</span>
              <input className="ui-input" value={project.projectName} onChange={(event) => setProject((prev) => (prev ? { ...prev, projectName: event.target.value } : prev))} />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-slate-700">Customer</span>
              <input className="ui-input" value={project.clientName || ''} onChange={(event) => setProject((prev) => (prev ? { ...prev, clientName: event.target.value || null } : prev))} />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-slate-700">Address 1</span>
              <input className="ui-input" value={addressParts.address1} onChange={(event) => updateAddress({ address1: event.target.value })} />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-slate-700">Address 2</span>
              <input className="ui-input" value={addressParts.address2} onChange={(event) => updateAddress({ address2: event.target.value })} />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-slate-700">City</span>
              <input className="ui-input" value={addressParts.city} onChange={(event) => updateAddress({ city: event.target.value })} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1.5 text-sm">
                <span className="font-medium text-slate-700">State</span>
                <input className="ui-input" value={addressParts.state} onChange={(event) => updateAddress({ state: event.target.value })} />
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-medium text-slate-700">Zip</span>
                <input className="ui-input" value={addressParts.zip} onChange={(event) => updateAddress({ zip: event.target.value })} />
              </label>
            </div>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-slate-700">Tax jurisdiction</span>
              <input className="ui-input" value={project.jobConditions.locationLabel || ''} onChange={(event) => patchJobConditions({ locationLabel: event.target.value })} placeholder="County / city jurisdiction" />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-slate-700">Tax override %</span>
              <input className="ui-input" type="number" step="0.01" value={project.jobConditions.locationTaxPercent ?? ''} onChange={(event) => patchJobConditions({ locationTaxPercent: event.target.value === '' ? null : Number(event.target.value) })} />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-slate-700">Project tax rate %</span>
              <input className="ui-input" type="number" step="0.01" value={project.taxPercent} onChange={(event) => setProject((prev) => (prev ? { ...prev, taxPercent: Number(event.target.value) || 0 } : prev))} />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-slate-700">Labor rate $/hr</span>
              <input
                className="ui-input"
                type="number"
                step="0.5"
                value={currentLaborRate}
                onChange={(event) => {
                  const nextRate = Math.max(0, Number(event.target.value) || 0);
                  const base = defaultLaborRate > 0 ? defaultLaborRate : 100;
                  patchJobConditions({ laborRateMultiplier: nextRate > 0 ? Number((nextRate / base).toFixed(4)) : 1 });
                }}
              />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-slate-700">Pricing mode</span>
              <select className="ui-input" value={project.pricingMode} onChange={(event) => setProject((prev) => (prev ? { ...prev, pricingMode: event.target.value as ProjectRecord['pricingMode'] } : prev))}>
                <option value="labor_and_material">Labor + material</option>
                <option value="material_only">Material only</option>
                <option value="labor_only">Labor only</option>
                <option value="material_with_optional_install_quote">Material + optional install quote</option>
              </select>
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={project.taxPercent <= 0} onChange={(event) => setProject((prev) => (prev ? { ...prev, taxPercent: event.target.checked ? 0 : 8.25 } : prev))} />
              Tax exempt
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={project.jobConditions.materialOnlyTax} onChange={(event) => patchJobConditions({ materialOnlyTax: event.target.checked })} />
              Material-only tax
            </label>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.06em] text-slate-600">Project modifiers</p>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={project.jobConditions.afterHoursWork} onChange={(e) => patchJobConditions({ afterHoursWork: e.target.checked, afterHoursMultiplier: e.target.checked ? 0.12 : 0 })} />Overtime</label>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={project.jobConditions.nightWork} onChange={(e) => patchJobConditions({ nightWork: e.target.checked })} />Night work</label>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={project.jobConditions.remoteTravel} onChange={(e) => patchJobConditions({ remoteTravel: e.target.checked })} />Travel</label>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={project.jobConditions.floors > 1} onChange={(e) => patchJobConditions({ floors: e.target.checked ? Math.max(2, project.jobConditions.floors) : 1 })} />Height / floors</label>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={project.jobConditions.occupiedBuilding} onChange={(e) => patchJobConditions({ occupiedBuilding: e.target.checked })} />Demo / occupied</label>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={project.jobConditions.restrictedAccess} onChange={(e) => patchJobConditions({ restrictedAccess: e.target.checked })} />Access constraints</label>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={project.jobConditions.scheduleCompression} onChange={(e) => patchJobConditions({ scheduleCompression: e.target.checked })} />Schedule compression</label>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={project.jobConditions.performanceBondRequired} onChange={(e) => patchJobConditions({ performanceBondRequired: e.target.checked })} />Bond</label>
            </div>
          </div>

          <label className="space-y-1.5 text-sm">
            <span className="font-medium text-slate-700">Notes</span>
            <textarea className="ui-input min-h-24" value={project.notes || ''} onChange={(event) => setProject((prev) => (prev ? { ...prev, notes: event.target.value || null } : prev))} placeholder="Estimator notes, scope reminders, or customer context" />
          </label>
        </section>

        <aside className="space-y-4">
          <section className="ui-surface p-5">
            <p className="ui-mono-kicker">Quick totals</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs text-slate-500">Estimate total</p>
                <p className="mt-1 text-lg font-semibold text-slate-950">{formatCurrencySafe(summary?.baseBidTotal)}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs text-slate-500">Material subtotal</p>
                <p className="mt-1 text-lg font-semibold text-slate-950">{formatCurrencySafe(summary?.materialSubtotal)}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs text-slate-500">Labor subtotal</p>
                <p className="mt-1 text-lg font-semibold text-slate-950">{formatCurrencySafe(summary?.adjustedLaborSubtotal ?? summary?.laborSubtotal)}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs text-slate-500">Quotes on file</p>
                <p className="mt-1 text-lg font-semibold text-slate-950">{quotes.length}</p>
              </div>
            </div>
          </section>

          <section className="ui-surface p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="ui-mono-kicker">Latest quote activity</p>
              <button type="button" onClick={() => onGoToTab('quotes')} className="text-[11px] font-semibold uppercase tracking-[0.06em] text-blue-700 hover:text-blue-800">
                Manage
              </button>
            </div>
            {recentQuotes.length > 0 ? (
              <div className="mt-3 space-y-2">
                {recentQuotes.map((quote) => (
                  <button key={quote.id} type="button" onClick={() => onGoToTab('quotes')} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left hover:bg-slate-100">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">{quote.vendorName}</p>
                        <p className="mt-1 text-xs text-slate-500">{quote.quoteNumber || 'No quote number'} · {quote.quoteDate || 'No date'}</p>
                      </div>
                      <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-slate-600">
                        {quote.importStatus.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">No vendor quotes recorded yet. Start on Quotes to upload a quote file or enter rows manually.</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
