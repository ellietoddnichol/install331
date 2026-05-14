import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Hammer, LoaderCircle, PlusCircle } from 'lucide-react';
import { api } from '../services/api';
import { projectWorkspacePath } from '../shared/utils/projectWorkspaceRoutes.ts';

type StartMode = 'quote' | 'manual';

export function ProjectCreate() {
  const navigate = useNavigate();
  const [projectName, setProjectName] = useState('');
  const [clientName, setClientName] = useState('');
  const [projectNumber, setProjectNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [startMode, setStartMode] = useState<StartMode>('quote');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createProject() {
    setSaving(true);
    setError(null);
    try {
      const project = await api.createV1Project({
        projectName: projectName.trim() || 'Untitled Project',
        clientName: clientName.trim() || null,
        projectNumber: projectNumber.trim() || null,
        notes: notes.trim() || null,
      });
      navigate(projectWorkspacePath(project.id, startMode === 'quote' ? 'quotes' : 'estimate'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create project.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ui-page max-w-5xl space-y-5">
      <section className="ui-panel px-5 py-5">
        <p className="ui-mono-kicker">New project</p>
        <h1 className="mt-1 text-[28px] font-semibold tracking-tight text-slate-950">Start a quote-driven estimate</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Create the project record first, then go straight into vendor quotes or manual estimate building. The app no longer requires a parser-heavy intake sequence before you can price work.
        </p>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="ui-surface space-y-4 p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-slate-700">Project name</span>
              <input className="ui-input" value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="Community Center Renovation" />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-slate-700">Customer</span>
              <input className="ui-input" value={clientName} onChange={(event) => setClientName(event.target.value)} placeholder="Owner, GC, or customer" />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="font-medium text-slate-700">Project number</span>
              <input className="ui-input" value={projectNumber} onChange={(event) => setProjectNumber(event.target.value)} placeholder="Optional" />
            </label>
            <div className="space-y-1.5 text-sm">
              <span className="font-medium text-slate-700">Primary path</span>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setStartMode('quote')}
                  className={`rounded-xl border px-4 py-3 text-left transition ${
                    startMode === 'quote'
                      ? 'border-blue-300 bg-blue-50 text-blue-950'
                      : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  <FileText className="h-4 w-4" />
                  <div className="mt-2 font-semibold">Vendor quote first</div>
                  <div className="mt-1 text-xs text-slate-500">Create a quote record, add/edit lines, then import selected rows into the estimate.</div>
                </button>
                <button
                  type="button"
                  onClick={() => setStartMode('manual')}
                  className={`rounded-xl border px-4 py-3 text-left transition ${
                    startMode === 'manual'
                      ? 'border-blue-300 bg-blue-50 text-blue-950'
                      : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  <Hammer className="h-4 w-4" />
                  <div className="mt-2 font-semibold">Manual estimate first</div>
                  <div className="mt-1 text-xs text-slate-500">Start directly in the estimate grid and add custom or catalog-backed lines.</div>
                </button>
              </div>
            </div>
          </div>
          <label className="space-y-1.5 text-sm">
            <span className="font-medium text-slate-700">Project notes</span>
            <textarea className="ui-input min-h-28" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional scope notes, exclusions, or estimator context" />
          </label>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => void createProject()} disabled={saving} className="ui-btn-cta inline-flex items-center gap-2 disabled:opacity-60">
              {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
              Create project
            </button>
            <button type="button" onClick={() => navigate('/projects')} className="ui-btn-secondary h-10 px-4 text-[11px] font-semibold uppercase tracking-[0.06em]">
              Cancel
            </button>
          </div>
        </section>

        <aside className="ui-surface space-y-4 p-5">
          <div>
            <p className="ui-mono-kicker">MVP workflow</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-950">One path, two starting points</h2>
          </div>
          <ol className="space-y-3 text-sm text-slate-700">
            <li className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">1. Create the project and choose whether you are starting from a vendor quote or custom estimate lines.</li>
            <li className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">2. Add quote records and editable quote lines, or go straight to the estimate builder.</li>
            <li className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">3. Price labor, markups, allowances, alternates, and visibility from the estimate grid.</li>
            <li className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">4. Generate the proposal directly from estimate data and proposal settings.</li>
          </ol>
        </aside>
      </div>
    </div>
  );
}