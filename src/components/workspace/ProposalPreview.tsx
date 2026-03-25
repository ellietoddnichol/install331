import React, { useMemo } from 'react';
import { EstimateSummary, ProjectRecord, SettingsRecord, TakeoffLineRecord } from '../../shared/types/estimator';
import { buildProjectConditionSummaryLines } from '../../shared/utils/jobConditions';
import { buildProposalScheduleSections, splitProposalTextLines } from '../../shared/utils/proposalDocument';
import { DEFAULT_PROPOSAL_ACCEPTANCE_LABEL, DEFAULT_PROPOSAL_CLARIFICATIONS, DEFAULT_PROPOSAL_EXCLUSIONS, DEFAULT_PROPOSAL_INTRO, DEFAULT_PROPOSAL_TERMS } from '../../shared/utils/proposalDefaults';
import { formatCurrencySafe, formatNumberSafe } from '../../utils/numberFormat';

interface Props {
  project: ProjectRecord;
  settings: SettingsRecord | null;
  website: string;
  lines: TakeoffLineRecord[];
  summary: EstimateSummary | null;
}

export function ProposalPreview({ project, settings, website, lines, summary }: Props) {
  if (!summary) return <div className="text-sm text-slate-500">No estimate data yet.</div>;

  const pricingMode = project.pricingMode || 'labor_and_material';
  const showMaterial = pricingMode !== 'labor_only';
  const showLabor = pricingMode !== 'material_only';
  const proposalVersion = `v${new Date(project.updatedAt).getTime().toString().slice(-5)}`;
  const activeProjectDate = project.bidDate || project.proposalDate || project.dueDate;
  const proposalDate = activeProjectDate
    ? new Date(activeProjectDate).toLocaleDateString()
    : new Date().toLocaleDateString();
  const conditionLines = buildProjectConditionSummaryLines(project.jobConditions);
  const termLines = splitProposalTextLines(settings?.proposalTerms || DEFAULT_PROPOSAL_TERMS);
  const exclusionLines = splitProposalTextLines(settings?.proposalExclusions || DEFAULT_PROPOSAL_EXCLUSIONS);
  const clarificationLines = splitProposalTextLines(settings?.proposalClarifications || DEFAULT_PROPOSAL_CLARIFICATIONS);

  const proposalSections = useMemo(
    () => buildProposalScheduleSections(lines, showMaterial, showLabor, summary.conditionLaborHoursMultiplier || 1),
    [lines, showLabor, showMaterial, summary.conditionLaborHoursMultiplier]
  );

  const introText = (settings?.proposalIntro || DEFAULT_PROPOSAL_INTRO)
    .split(/\n\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)[0] || DEFAULT_PROPOSAL_INTRO;

  const formatSchedule = (durationDays: number, totalLaborHours: number): string => {
    const resolvedDays = Number.isFinite(durationDays) && durationDays > 0
      ? durationDays
      : (Number.isFinite(totalLaborHours) && totalLaborHours > 0 ? totalLaborHours / 8 : 0);
    if (!resolvedDays) return 'TBD';
    if (resolvedDays >= 5) {
      const weeks = Math.floor(resolvedDays / 5);
      const days = Math.round((resolvedDays % 5) * 10) / 10;
      if (days <= 0) return `${formatNumberSafe(weeks, 0)} week${weeks === 1 ? '' : 's'}`;
      return `${formatNumberSafe(weeks, 0)} week${weeks === 1 ? '' : 's'} ${formatNumberSafe(days, 1)} day${days === 1 ? '' : 's'}`;
    }
    return `${formatNumberSafe(resolvedDays, 1)} day${resolvedDays === 1 ? '' : 's'}`;
  };

  const sectionHeadingClass =
    'text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500 after:block after:mt-2 after:h-px after:w-8 after:bg-slate-400';

  return (
    <article
      data-proposal-document="true"
      className="print-proposal proposal-document mx-auto min-h-[11in] w-full max-w-[8.25in] bg-white px-[0.55in] py-[0.6in] text-slate-900 shadow-[0_22px_56px_rgba(15,23,42,0.06)]"
    >
      <header className="proposal-avoid-break border-b border-slate-200/90 pb-8">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            {settings?.logoUrl ? (
              <img src={settings.logoUrl} alt="Company logo" className="h-12 w-12 shrink-0 object-contain opacity-95" />
            ) : null}
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">Proposal for bid</p>
              <h1 className="mt-1.5 text-[26px] font-semibold leading-tight tracking-[-0.03em] text-slate-950">
                {settings?.companyName || 'Brighten Builders, LLC'}
              </h1>
              <div className="mt-3 max-w-md space-y-0.5 text-[12.5px] leading-relaxed text-slate-600">
                {settings?.companyAddress ? <p>{settings.companyAddress}</p> : null}
                <p>
                  {[settings?.companyPhone, settings?.companyEmail].filter(Boolean).join(' · ')}
                  {website ? (
                    <>
                      {(settings?.companyPhone || settings?.companyEmail) && ' · '}
                      {website}
                    </>
                  ) : null}
                </p>
              </div>
            </div>
          </div>
          <div className="min-w-0 border-t border-slate-100 pt-6 text-[13px] text-slate-600 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0 lg:text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Prepared for</p>
            <p className="mt-2 text-[17px] font-semibold leading-snug text-slate-950">{project.projectName}</p>
            <p className="mt-1 text-slate-600">{project.clientName || 'Client'}</p>
            {project.address ? <p className="mt-1 max-w-xs leading-relaxed lg:ml-auto">{project.address}</p> : null}
            <p className="mt-3 text-[12px] text-slate-500">
              Ref. {project.projectNumber || project.id.slice(0, 8)}
              <span className="text-slate-300"> · </span>
              {proposalDate}
              <span className="text-slate-300"> · </span>
              {proposalVersion}
            </p>
          </div>
        </div>
      </header>

      <section className="mt-10 proposal-section">
        <h2 className={sectionHeadingClass}>Introduction</h2>
        <p className="mt-5 max-w-[42rem] text-[14px] leading-[1.65] text-slate-700">{introText}</p>
      </section>

      <section className="mt-10 proposal-section">
        <h2 className={sectionHeadingClass}>Scope &amp; pricing</h2>
        <p className="mt-4 max-w-[42rem] text-[13px] leading-relaxed text-slate-500">
          Each line lists a description, quantity, and{' '}
          {showMaterial && showLabor ? 'material and labor amounts' : showLabor ? 'labor amount' : 'material amount'}.
        </p>
        <div className="mt-8 space-y-12">
          {proposalSections.map((section) => (
            <div key={section.section} className="proposal-section proposal-avoid-break">
              <h3 className="border-b border-slate-300 pb-2 text-[15px] font-semibold tracking-tight text-slate-950">{section.section}</h3>
              <div className="divide-y divide-slate-100">
                {section.items.map((item) => (
                  <div key={item.id} className="proposal-line-item py-4 first:pt-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
                      <p className="min-w-0 flex-1 text-[14px] leading-relaxed text-slate-800">{item.description}</p>
                      <div className="flex w-full shrink-0 flex-col gap-1.5 text-[13px] tabular-nums sm:w-auto sm:min-w-[11.5rem] sm:text-right">
                        <p>
                          <span className="text-slate-400">Qty </span>
                          <span className="font-medium text-slate-800">
                            {formatNumberSafe(item.quantity, 2)} {item.unit}
                          </span>
                        </p>
                        {showMaterial ? (
                          <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 sm:flex-col sm:items-end sm:gap-1.5 sm:text-right">
                            <span className="text-slate-500">Material</span>
                            <span className="font-medium text-slate-900 tabular-nums">{formatCurrencySafe(item.materialCost)}</span>
                          </p>
                        ) : null}
                        {showLabor ? (
                          <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 sm:flex-col sm:items-end sm:gap-1.5 sm:text-right">
                            <span className="text-slate-500">Labor</span>
                            <span className="font-medium text-slate-900 tabular-nums">{formatCurrencySafe(item.laborCost)}</span>
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-5 border-t border-slate-200 pt-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Subtotal — {section.section}</p>
                <div className="mt-3 max-w-sm space-y-1.5 text-[13px] text-slate-700 sm:ml-auto">
                  {showMaterial ? (
                    <div className="flex justify-between gap-8 border-b border-transparent pb-1">
                      <span className="text-slate-500">Material</span>
                      <span className="tabular-nums font-medium text-slate-900">{formatCurrencySafe(section.totalMaterialCost)}</span>
                    </div>
                  ) : null}
                  {showLabor ? (
                    <div className="flex justify-between gap-8 border-b border-transparent pb-1">
                      <span className="text-slate-500">Labor</span>
                      <span className="tabular-nums font-medium text-slate-900">{formatCurrencySafe(section.totalLaborCost)}</span>
                    </div>
                  ) : null}
                  <div className="flex justify-between gap-8 border-t border-slate-200 pt-2 text-[14px] font-semibold text-slate-950">
                    <span>Section total</span>
                    <span className="tabular-nums">{formatCurrencySafe(section.sectionTotal)}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {conditionLines.length > 0 ? (
        <section className="mt-10 proposal-section proposal-avoid-break">
          <h2 className={sectionHeadingClass}>Project assumptions</h2>
          <ul className="mt-5 max-w-[42rem] space-y-3 border-l-2 border-slate-200 pl-4 text-[13px] leading-relaxed text-slate-600">
            {conditionLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {project.specialNotes?.trim() ? (
        <section className="mt-10 proposal-section proposal-avoid-break">
          <h2 className={sectionHeadingClass}>Additional notes</h2>
          <p className="mt-5 max-w-[42rem] whitespace-pre-wrap text-[14px] leading-[1.65] text-slate-600">{project.specialNotes}</p>
        </section>
      ) : null}

      <section className="proposal-totals mt-10 border-t border-slate-300 pt-8 proposal-section proposal-avoid-break">
        <h2 className={sectionHeadingClass}>Investment summary</h2>
        <div className="mt-6 max-w-md space-y-3 sm:ml-auto">
          {showMaterial ? (
            <div className="flex justify-between gap-6 text-[13px] text-slate-600">
              <span>Total material</span>
              <span className="tabular-nums font-medium text-slate-900">{formatCurrencySafe(summary.materialSubtotal)}</span>
            </div>
          ) : null}
          {showLabor ? (
            <div className="flex justify-between gap-6 text-[13px] text-slate-600">
              <span>Total labor</span>
              <span className="tabular-nums font-medium text-slate-900">
                {formatCurrencySafe(summary.adjustedLaborSubtotal || summary.laborSubtotal)}
              </span>
            </div>
          ) : null}
          <div className="flex justify-between gap-6 border-b border-slate-200 pb-3 text-[13px] text-slate-600">
            <span>Estimated duration</span>
            <span className="tabular-nums font-medium text-slate-900">{formatSchedule(summary.durationDays, summary.totalLaborHours)}</span>
          </div>
          <div className="flex justify-between gap-6 pt-1 text-[17px] font-semibold tracking-tight text-slate-950">
            <span>Total proposal</span>
            <span className="tabular-nums">{formatCurrencySafe(summary.baseBidTotal)}</span>
          </div>
        </div>
      </section>

      <section className="mt-12 border-t border-slate-200 pt-10 proposal-section">
        <div className="grid gap-10 md:grid-cols-3 md:gap-8">
          <div className="proposal-legal-col md:border-l md:border-slate-200 md:pl-6 first:md:border-l-0 first:md:pl-0">
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Terms</h2>
            <div className="mt-3 space-y-2.5 text-[12.5px] leading-relaxed text-slate-600">
              {termLines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </div>
          <div className="proposal-legal-col md:border-l md:border-slate-200 md:pl-6">
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Exclusions</h2>
            <div className="mt-3 space-y-2.5 text-[12.5px] leading-relaxed text-slate-600">
              {exclusionLines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </div>
          <div className="proposal-legal-col md:border-l md:border-slate-200 md:pl-6">
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Clarifications</h2>
            <div className="mt-3 space-y-2.5 text-[12.5px] leading-relaxed text-slate-600">
              {clarificationLines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mt-14 border-t border-slate-200 pt-10 text-[12px] text-slate-600 proposal-section proposal-avoid-break">
        <div className="grid gap-12 sm:grid-cols-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Acceptance</p>
            <div className="mt-10 min-h-[2.75rem] border-b border-slate-400" />
            <p className="mt-2 text-[11px] text-slate-500">{settings?.proposalAcceptanceLabel || DEFAULT_PROPOSAL_ACCEPTANCE_LABEL}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Date</p>
            <div className="mt-10 min-h-[2.75rem] border-b border-slate-400" />
            <p className="mt-2 text-[11px] text-slate-500">Authorized signature date</p>
          </div>
        </div>
      </section>
    </article>
  );
}
