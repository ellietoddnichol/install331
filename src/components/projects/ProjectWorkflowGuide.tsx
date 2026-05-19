import React from 'react';
import { ChevronRight } from 'lucide-react';

const WORKFLOW_LABELS = ['Setup', 'Quotes', 'Estimate', 'Proposal'] as const;

interface ProjectWorkflowGuideProps {
  className?: string;
}

/** Compact Setup → Quotes → Estimate → Proposal path for intake and setup screens. */
export function ProjectWorkflowGuide({ className = '' }: ProjectWorkflowGuideProps) {
  return (
    <nav
      aria-label="Estimating workflow"
      className={`flex flex-wrap items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 ${className}`.trim()}
    >
      {WORKFLOW_LABELS.map((label, index) => (
        <React.Fragment key={label}>
          {index > 0 ? <ChevronRight className="h-3.5 w-3.5 text-slate-300" aria-hidden /> : null}
          <span className={index === 0 ? 'text-slate-800' : undefined}>{label}</span>
        </React.Fragment>
      ))}
    </nav>
  );
}
