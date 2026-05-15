import React from 'react';
import { ChevronRight } from 'lucide-react';
import type { WorkflowBarState, WorkflowBarStep } from '../../shared/utils/projectWorkspaceReadiness';
import type { WorkspaceTab } from '../../shared/types/projectWorkflow';

interface ProjectWorkflowReadinessBarProps {
  steps: WorkflowBarStep[];
  onSelectStep: (tab: WorkspaceTab) => void;
}

function stateClasses(state: WorkflowBarState): { bar: string; dot: string; text: string } {
  switch (state) {
    case 'complete':
    case 'ready':
      return {
        bar: 'bg-emerald-500/90',
        dot: 'bg-emerald-500 ring-emerald-200',
        text: 'text-emerald-800',
      };
    case 'needs_review':
      return {
        bar: 'bg-amber-400',
        dot: 'bg-amber-500 ring-amber-200',
        text: 'text-amber-900',
      };
    case 'blocked':
      return {
        bar: 'bg-rose-500',
        dot: 'bg-rose-600 ring-rose-200',
        text: 'text-rose-900',
      };
    case 'missing':
    default:
      return {
        bar: 'bg-slate-200',
        dot: 'bg-slate-300 ring-slate-200',
        text: 'text-slate-600',
      };
  }
}

const TAB_FOR_STEP: Record<WorkflowBarStep['key'], WorkspaceTab> = {
  setup: 'setup',
  quotes: 'quotes',
  estimate: 'estimate',
  proposal: 'proposal',
};

export function ProjectWorkflowReadinessBar({ steps, onSelectStep }: ProjectWorkflowReadinessBarProps) {
  return (
    <section
      className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm md:px-4 md:py-4"
      aria-label="Project workflow"
    >
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Workflow</p>
      <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-stretch">
        {steps.map((step, i) => {
          const styles = stateClasses(step.state);
          const tab = TAB_FOR_STEP[step.key];
          return (
            <React.Fragment key={step.key}>
              {i > 0 ? (
                <div className="hidden items-center justify-center md:flex md:px-1">
                  <ChevronRight className="h-4 w-4 text-slate-300" aria-hidden />
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => onSelectStep(tab)}
                className="flex min-w-0 flex-1 flex-col rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2.5 text-left transition hover:border-slate-200 hover:bg-white md:max-w-[14rem]"
              >
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 shrink-0 rounded-full ring-2 ${styles.dot}`} aria-hidden />
                  <span className="text-sm font-semibold text-slate-900">{step.title}</span>
                </div>
                <p className={`mt-1 text-xs font-medium ${styles.text}`}>{step.detail}</p>
                <div className={`mt-2 h-1 w-full rounded-full ${styles.bar}`} aria-hidden />
              </button>
            </React.Fragment>
          );
        })}
      </div>
    </section>
  );
}
