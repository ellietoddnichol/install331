import React from 'react';
import { ArrowRight, BookOpenText, Calculator, FileText, FolderOpen, Settings, Upload } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const WORKFLOW_STEPS = [
  {
    title: 'Start a Project',
    description: 'Create a new project, enter the client and project identity details, then upload takeoff or scope files if you have them.',
    icon: Upload,
    actionLabel: 'Open Intake',
    actionPath: '/project/new',
  },
  {
    title: 'Confirm Project Setup',
    description: 'Set pricing basis, labor assumptions, included catalog categories, delivery, and project-wide adders before refining line pricing.',
    icon: Calculator,
    actionLabel: 'View Projects',
    actionPath: '/projects',
  },
  {
    title: 'Build the Estimate',
    description: 'Use rooms, bundles, manual lines, and modifiers to finalize the estimate. The workspace keeps totals, labor, and adders synchronized.',
    icon: FolderOpen,
    actionLabel: 'Open Catalog',
    actionPath: '/catalog',
  },
  {
    title: 'Generate the Proposal',
    description: 'Review the proposal tab, refine wording, print the client-ready document, or export a PDF with detailed line-by-line scope.',
    icon: FileText,
    actionLabel: 'Open Settings',
    actionPath: '/settings',
  },
];

const KEY_NOTES = [
  'Keep company defaults current in Settings so new projects start with the right labor rate, burden, overhead, profit, and proposal text.',
  'Use Project Setup before adjusting estimate lines. Job conditions and labor multipliers affect the entire estimate, not just one room.',
  'Store source files in the Files tab so parser inputs, reference drawings, and support documents stay attached to the project.',
  'Proposal PDF export is intended for client handoff. Browser print remains available for quick physical copies or print-to-PDF workflows.',
];

export function Help() {
  const navigate = useNavigate();

  return (
    <div className="ui-page space-y-4">
      <section className="overflow-hidden rounded-[30px] border border-slate-200/80 bg-[radial-gradient(circle_at_top_left,rgba(191,219,254,0.35),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,250,252,0.96)_100%)] px-6 py-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="ui-label">How To Use</p>
            <h1 className="ui-title mt-1">Estimator workflow guide</h1>
            <p className="ui-subtitle mt-2">A practical sequence for moving from intake through estimate and into a clean client-ready proposal.</p>
          </div>
          <button onClick={() => navigate('/project/new')} className="ui-btn-primary inline-flex items-center gap-2 self-start lg:self-auto">
            Start New Project <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          {WORKFLOW_STEPS.map((step, index) => (
            <article key={step.title} className="ui-surface p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand)] ring-1 ring-blue-200/80">
                    <step.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Step {index + 1}</p>
                    <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-950">{step.title}</h2>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{step.description}</p>
                  </div>
                </div>
                <button onClick={() => navigate(step.actionPath)} className="ui-btn-secondary inline-flex h-10 items-center gap-2 px-4 text-[11px]">
                  {step.actionLabel}
                </button>
              </div>
            </article>
          ))}
        </div>

        <div className="space-y-4">
          <section className="rounded-[28px] border border-slate-200/80 bg-white/90 p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                <BookOpenText className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Key Notes</p>
                <h2 className="text-base font-semibold text-slate-950">What to keep in mind</h2>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {KEY_NOTES.map((note) => (
                <div key={note} className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm leading-6 text-slate-600">
                  {note}
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,#10284f_0%,#0a224d_100%)] p-5 text-white shadow-[0_18px_44px_rgba(10,34,77,0.18)]">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-300">Default Setup</p>
            <h2 className="mt-2 text-lg font-semibold tracking-tight">Settings control your baseline</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">If new estimates or proposals look off, check global settings first. Base labor rate, markup defaults, and proposal wording all flow into the project workspace.</p>
            <button onClick={() => navigate('/settings')} className="mt-4 inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-[11px] font-semibold text-slate-900">
              <Settings className="h-4 w-4" /> Open Settings
            </button>
          </section>
        </div>
      </section>
    </div>
  );
}