import React from 'react';

const STEPS = [
  { id: 'basics', label: 'Basics' },
  { id: 'conditions', label: 'Job conditions' },
  { id: 'advanced', label: 'Advanced pricing' },
  { id: 'notes', label: 'Notes' },
] as const;

interface SetupStepperProps {
  /** 0–3 visual step; does not hide sections — guides scanning only. */
  activeStep?: number;
}

export function SetupStepper({ activeStep = 0 }: SetupStepperProps) {
  return (
    <nav aria-label="Setup progress" className="rounded-xl border border-slate-200/80 bg-white px-3 py-3 shadow-sm">
      <ol className="flex flex-wrap items-center gap-2">
        {STEPS.map((step, i) => {
          const done = i < activeStep;
          const current = i === activeStep;
          return (
            <li key={step.id} className="flex items-center gap-2">
              {i > 0 ? <span className="hidden text-slate-300 sm:inline" aria-hidden>/</span> : null}
              <span
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold ${
                  current ? 'bg-[var(--brand-soft)] text-[var(--brand-strong)] ring-1 ring-blue-200/80' : done ? 'bg-slate-100 text-slate-600' : 'bg-slate-50 text-slate-500'
                }`}
              >
                <span className="tabular-nums opacity-70">{i + 1}</span>
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-[10px] text-slate-500">Scroll the page for full controls — advanced pricing stays collapsed until you open it.</p>
    </nav>
  );
}
