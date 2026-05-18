import React from 'react';
import { CheckCircle2, Circle } from 'lucide-react';
import type { ProjectRecord, SettingsRecord, TakeoffLineRecord } from '../../shared/types/estimator';
import { filterLinesForClientProposal } from '../../shared/utils/proposalDocument';
import { DEFAULT_PROPOSAL_CLARIFICATIONS, DEFAULT_PROPOSAL_TERMS } from '../../shared/utils/proposalDefaults';

export type ProposalReadinessStatus = 'complete' | 'incomplete';

export interface ProposalReadinessItem {
  id: string;
  label: string;
  status: ProposalReadinessStatus;
  detail?: string;
}

function nonEmpty(s: string | null | undefined): boolean {
  return Boolean(String(s ?? '').trim());
}

export function buildProposalReadinessItems(
  project: ProjectRecord,
  settings: SettingsRecord | null,
  lines: TakeoffLineRecord[],
): ProposalReadinessItem[] {
  const clientLines = filterLinesForClientProposal(lines);
  const terms = settings?.proposalTerms || DEFAULT_PROPOSAL_TERMS;
  const clarifications = settings?.proposalClarifications || DEFAULT_PROPOSAL_CLARIFICATIONS;

  return [
    {
      id: 'customer',
      label: 'Customer & Project Information',
      status: nonEmpty(project.clientName) && nonEmpty(project.projectName) ? 'complete' : 'incomplete',
    },
    {
      id: 'scope',
      label: 'Scope of Work',
      status: clientLines.length > 0 ? 'complete' : 'incomplete',
      detail: clientLines.length > 0 ? `${clientLines.length} customer-facing lines` : 'Add estimate lines or import quotes',
    },
    {
      id: 'pricing',
      label: 'Pricing Summary',
      status: clientLines.length > 0 ? 'complete' : 'incomplete',
    },
    {
      id: 'clarifications',
      label: 'Clarifications',
      status: nonEmpty(clarifications) ? 'complete' : 'incomplete',
    },
    {
      id: 'terms',
      label: 'Terms & Conditions',
      status: nonEmpty(terms) ? 'complete' : 'incomplete',
    },
    {
      id: 'document',
      label: 'Document Settings',
      status: nonEmpty(project.proposalFormat) ? 'complete' : 'incomplete',
      detail: project.proposalFormat?.replace(/_/g, ' ') || 'standard',
    },
  ];
}

function StatusIcon({ status }: { status: ProposalReadinessStatus }) {
  if (status === 'complete') return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />;
  return <Circle className="h-4 w-4 shrink-0 text-slate-300" aria-hidden />;
}

export function ProposalReadinessRail(props: { items: ProposalReadinessItem[] }) {
  const { items } = props;
  const complete = items.filter((i) => i.status === 'complete').length;
  const ready = complete === items.length;

  return (
    <aside className="space-y-4 xl:sticky xl:top-4">
      <section className="ui-fo-card p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Proposal readiness</h2>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
              ready ? 'bg-emerald-100 text-emerald-900' : 'bg-orange-100 text-orange-900'
            }`}
          >
            {ready ? 'Ready to send' : 'Needs review'}
          </span>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div
            className={`flex h-14 w-14 items-center justify-center rounded-full text-sm font-bold tabular-nums ${
              ready ? 'bg-emerald-100 text-emerald-800' : 'bg-orange-50 text-orange-800'
            }`}
          >
            {Math.round((complete / items.length) * 100)}%
          </div>
        </div>
        <ul className="mt-4 space-y-2">
          {items.map((item) => (
            <li key={item.id} className="flex gap-2 rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-2">
              <StatusIcon status={item.status} />
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-semibold text-slate-900">{item.label}</p>
                {item.detail ? <p className="mt-0.5 text-[11px] text-slate-600">{item.detail}</p> : null}
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section className="ui-fo-card border-slate-200 bg-slate-50/80 p-4 text-[12px] leading-relaxed text-slate-600">
        <p className="font-semibold text-slate-800">What&apos;s included</p>
        <p className="mt-2">Only customer-facing content appears on the proposal. Internal notes, install review flags, and parser details stay in the estimate workspace.</p>
      </section>
    </aside>
  );
}

