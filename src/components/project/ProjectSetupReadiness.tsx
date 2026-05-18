import React from 'react';
import { AlertTriangle, CheckCircle2, Circle } from 'lucide-react';
import type { ProjectRecord } from '../../shared/types/estimator';
import { formatNumberSafe } from '../../utils/numberFormat';

export type SetupReadinessStatus = 'complete' | 'incomplete' | 'attention';

export interface SetupChecklistItem {
  id: string;
  label: string;
  status: SetupReadinessStatus;
  detail?: string;
}

const BLOCKING_RULE_ID = 'blocking_status';

export function readProjectBlockingStatus(project: ProjectRecord): '' | 'included' | 'by_others' | 'unknown' {
  const row = project.structuredAssumptions.find((a) => a.ruleId === BLOCKING_RULE_ID);
  const text = (row?.text || '').toLowerCase();
  if (text.includes('included')) return 'included';
  if (text.includes('by other') || text.includes('by_other')) return 'by_others';
  if (text.includes('unknown')) return 'unknown';
  return '';
}

export function buildProjectBlockingAssumptions(
  project: ProjectRecord,
  value: '' | 'included' | 'by_others' | 'unknown',
): ProjectRecord['structuredAssumptions'] {
  const rest = project.structuredAssumptions.filter((a) => a.ruleId !== BLOCKING_RULE_ID);
  if (!value) return rest;
  const label =
    value === 'included' ? 'Blocking / backing included' : value === 'by_others' ? 'Blocking by others' : 'Blocking unknown';
  return [
    ...rest,
    {
      id: `blocking-${project.id}`,
      source: 'manual',
      ruleId: BLOCKING_RULE_ID,
      text: label,
      appliedFields: ['blocking_status'],
      confidence: 1,
      createdAt: new Date().toISOString(),
    },
  ];
}

function nonEmpty(s: string | null | undefined): boolean {
  return Boolean(String(s ?? '').trim());
}

export function buildSetupChecklist(
  project: ProjectRecord,
  effectiveLaborRate: number,
  addressLine1: string,
): SetupChecklistItem[] {
  const blocking = readProjectBlockingStatus(project);
  const wallSet = nonEmpty(project.wallSubstrate);

  return [
    {
      id: 'customer',
      label: 'Customer Information',
      status: nonEmpty(project.clientName) && nonEmpty(project.projectName) ? 'complete' : 'incomplete',
      detail: nonEmpty(project.clientName) ? project.clientName! : 'Add customer and project name',
    },
    {
      id: 'address',
      label: 'Project Address',
      status: nonEmpty(project.address) && nonEmpty(addressLine1) ? 'complete' : 'incomplete',
    },
    {
      id: 'mode',
      label: 'Proposal / Estimate Mode',
      status: nonEmpty(project.pricingMode) ? 'complete' : 'incomplete',
    },
    {
      id: 'labor',
      label: 'Labor & Productivity',
      status: effectiveLaborRate > 0 ? 'complete' : 'attention',
      detail: effectiveLaborRate > 0 ? `$${formatNumberSafe(effectiveLaborRate, 2)}/hr effective` : 'Set labor rate',
    },
    {
      id: 'wall',
      label: 'Wall Substrate',
      status: wallSet ? 'complete' : 'attention',
      detail: wallSet ? project.wallSubstrate! : 'Required for install intelligence modifiers',
    },
    {
      id: 'blocking',
      label: 'Blocking / Backing',
      status: blocking === 'unknown' || !blocking ? 'attention' : 'complete',
      detail:
        blocking === 'included'
          ? 'Included in scope'
          : blocking === 'by_others'
            ? 'By others'
            : 'Confirm before estimating grab bars & accessories',
    },
    {
      id: 'tax',
      label: 'Tax & Location',
      status: nonEmpty(project.jobConditions.locationLabel) || project.taxPercent > 0 ? 'complete' : 'incomplete',
    },
    {
      id: 'additional',
      label: 'Additional Settings',
      status: project.bidDate || project.dueDate ? 'complete' : 'incomplete',
      detail: project.bidDate || project.dueDate ? 'Dates on file' : 'Add bid or due date',
    },
  ];
}

function StatusIcon({ status }: { status: SetupReadinessStatus }) {
  if (status === 'complete') return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />;
  if (status === 'attention') return <AlertTriangle className="h-4 w-4 shrink-0 text-orange-600" aria-hidden />;
  return <Circle className="h-4 w-4 shrink-0 text-slate-300" aria-hidden />;
}

export function ProjectSetupReadinessPanel(props: {
  items: SetupChecklistItem[];
  project: ProjectRecord;
  effectiveLaborRate: number;
  effectiveTax: number;
  pricingModeLabel: string;
  addressLine1: string;
}) {
  const { items, project, effectiveLaborRate, effectiveTax, pricingModeLabel, addressLine1 } = props;
  const completeCount = items.filter((i) => i.status === 'complete').length;
  const attentionCount = items.filter((i) => i.status === 'attention').length;

  return (
    <div className="space-y-4 xl:sticky xl:top-4">
      <section className="ui-fo-card p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Project readiness</h2>
          <span className="text-[11px] font-semibold tabular-nums text-slate-500">
            {completeCount}/{items.length}
          </span>
        </div>
        {attentionCount > 0 ? (
          <p className="mt-2 rounded-lg border border-orange-200 bg-orange-50/80 px-3 py-2 text-[12px] leading-snug text-orange-950">
            {attentionCount} item{attentionCount === 1 ? '' : 's'} need attention before labor can be estimated reliably.
          </p>
        ) : null}
        <ul className="mt-3 space-y-2">
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

      <section className="ui-fo-card p-4">
        <h2 className="text-sm font-semibold text-slate-900">Project summary</h2>
        <dl className="mt-3 space-y-2 text-[12px]">
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Project</dt>
            <dd className="max-w-[58%] text-right font-medium text-slate-900">{project.projectName || '—'}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Customer</dt>
            <dd className="max-w-[58%] text-right font-medium text-slate-900">{project.clientName || '—'}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Location</dt>
            <dd className="max-w-[58%] text-right text-slate-800">{addressLine1 || '—'}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Proposal mode</dt>
            <dd className="font-medium text-slate-900">{pricingModeLabel}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Wall substrate</dt>
            <dd className="font-medium text-slate-900">{project.wallSubstrate || 'Not set'}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Blocking</dt>
            <dd className="font-medium text-slate-900">
              {readProjectBlockingStatus(project) === 'included'
                ? 'Included'
                : readProjectBlockingStatus(project) === 'by_others'
                  ? 'By others'
                  : readProjectBlockingStatus(project) === 'unknown'
                    ? 'Unknown'
                    : 'Not set'}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Labor rate</dt>
            <dd className="font-medium tabular-nums text-slate-900">${formatNumberSafe(effectiveLaborRate, 2)}/hr</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Tax</dt>
            <dd className="font-medium tabular-nums text-slate-900">{formatNumberSafe(effectiveTax, 2)}%</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
