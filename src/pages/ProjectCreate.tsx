import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LoaderCircle, PlusCircle } from 'lucide-react';
import { api } from '../services/api';
import type { PricingMode } from '../shared/types/estimator';
import { projectWorkspacePath } from '../shared/utils/projectWorkspaceRoutes.ts';

const WORKFLOW_STEPS = [
  { step: 1, title: 'Setup project', detail: 'Customer, site, labor defaults, and install assumptions.' },
  { step: 2, title: 'Add vendor quotes', detail: 'Import or enter quote lines, then import selected scope.' },
  { step: 3, title: 'Review estimate', detail: 'Price labor, adjust visibility, and confirm install assumptions.' },
  { step: 4, title: 'Generate proposal', detail: 'Preview and print a customer-facing proposal.' },
] as const;

export function ProjectCreate() {
  const navigate = useNavigate();
  const [projectName, setProjectName] = useState('');
  const [clientName, setClientName] = useState('');
  const [address, setAddress] = useState('');
  const [projectNumber, setProjectNumber] = useState('');
  const [bidDueDate, setBidDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [pricingMode, setPricingMode] = useState<PricingMode>('labor_and_material');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createProject() {
    setSaving(true);
    setError(null);
    try {
      const trimmedName = projectName.trim();
      const project = await api.createV1Project({
        projectName: trimmedName || 'New project draft',
        clientName: clientName.trim() || null,
        address: address.trim() || null,
        projectNumber: projectNumber.trim() || null,
        bidDate: bidDueDate || null,
        notes: notes.trim() || null,
        pricingMode,
      });
      navigate(projectWorkspacePath(project.id, 'setup'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create project.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ui-page max-w-5xl space-y-6 pb-10">
      <section>
        <p className="ui-mono-kicker">Create project</p>
        <h1 className="mt-1 text-[28px] font-semibold tracking-tight text-slate-950">Create project</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
          Start with the basics. You can add quotes, assumptions, estimate details, and proposal options next.
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="ui-surface space-y-5 p-5 md:p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1.5 text-sm sm:col-span-2">
              <span className="font-medium text-slate-700">Project name</span>
              <input
                className="ui-input"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="Community Center Renovation"
              />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-slate-700">Customer / client</span>
              <input
                className="ui-input"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Owner, GC, or customer"
              />
            </label>
            <label className="space-y-1.5 text-sm sm:col-span-2">
              <span className="font-medium text-slate-700">Project address</span>
              <input
                className="ui-input"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Street, city, state"
              />
            </label>
            <fieldset className="space-y-2 sm:col-span-2">
              <legend className="text-sm font-medium text-slate-700">Proposal mode</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {(
                  [
                    { id: 'labor_and_material' as const, label: 'Full', detail: 'Material and labor' },
                    { id: 'labor_only' as const, label: 'Install only', detail: 'Labor-focused estimate' },
                    { id: 'material_only' as const, label: 'Material only', detail: 'Supply-only proposal' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setPricingMode(opt.id)}
                    className={`rounded-xl border px-3 py-3 text-left transition ${
                      pricingMode === opt.id
                        ? 'border-blue-300 bg-blue-50 text-blue-950 ring-1 ring-blue-200'
                        : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <span className="block text-sm font-semibold">{opt.label}</span>
                    <span className="mt-0.5 block text-[11px] text-slate-500">{opt.detail}</span>
                  </button>
                ))}
              </div>
            </fieldset>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-slate-700">Project number</span>
              <input
                className="ui-input"
                value={projectNumber}
                onChange={(e) => setProjectNumber(e.target.value)}
                placeholder="Optional"
              />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-slate-700">Bid due date</span>
              <input
                className="ui-input"
                type="date"
                value={bidDueDate}
                onChange={(e) => setBidDueDate(e.target.value)}
              />
            </label>
          </div>
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium text-slate-700">Notes</span>
            <textarea
              className="ui-input min-h-24"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional scope notes or estimator context"
            />
          </label>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => void createProject()}
              disabled={saving}
              className="ui-btn-cta inline-flex items-center gap-2 disabled:opacity-60"
            >
              {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
              Create project
            </button>
            <button type="button" onClick={() => navigate('/projects')} className="ui-btn-secondary h-10 px-4 text-sm">
              Cancel
            </button>
          </div>
        </section>

        <aside className="ui-surface p-5 md:p-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Next steps</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-950">Your estimating workflow</h2>
          <ol className="mt-4 space-y-3">
            {WORKFLOW_STEPS.map((item) => (
              <li key={item.step} className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-bold text-slate-700 ring-1 ring-slate-200">
                  {item.step}
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                  <p className="mt-0.5 text-[12px] leading-snug text-slate-600">{item.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  );
}
