import React, { useMemo } from 'react';
import { EstimateSummary, ProjectRecord, SettingsRecord, TakeoffLineRecord } from '../../shared/types/estimator';
import { buildProposalScheduleSections, splitProposalTextLines } from '../../shared/utils/proposalDocument';
import { DEFAULT_PROPOSAL_ACCEPTANCE_LABEL, DEFAULT_PROPOSAL_CLARIFICATIONS, DEFAULT_PROPOSAL_EXCLUSIONS, DEFAULT_PROPOSAL_INTRO, DEFAULT_PROPOSAL_TERMS } from '../../shared/utils/proposalDefaults';
import { formatCurrencySafe, formatNumberSafe } from '../../utils/numberFormat';

interface Props {
  project: ProjectRecord;
  settings: SettingsRecord | null;
  lines: TakeoffLineRecord[];
  summary: EstimateSummary | null;
}

export function ProposalPreview({ project, settings, lines, summary }: Props) {
  if (!summary) return <div className="text-sm text-slate-500">No estimate data yet.</div>;

  const pricingMode = project.pricingMode || 'labor_and_material';
  const showMaterial = pricingMode !== 'labor_only';
  const showLabor = pricingMode !== 'material_only';
  const proposalVersion = `v${new Date(project.updatedAt).getTime().toString().slice(-5)}`;
  const activeProjectDate = project.bidDate || project.proposalDate || project.dueDate;
  const proposalDate = activeProjectDate
    ? new Date(activeProjectDate).toLocaleDateString()
    : new Date().toLocaleDateString();
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

  const contactLine = [settings?.companyPhone, settings?.companyEmail].filter(Boolean).join(' · ');

  return (
    <article
      data-proposal-document="true"
      className="print-proposal proposal-document mx-auto min-h-[11in] w-full max-w-[8.25in] bg-white px-[0.55in] py-[0.55in] text-slate-900 shadow-[0_22px_56px_rgba(15,23,42,0.06)]"
    >
      <header className="proposal-avoid-break border-b border-slate-200/90 pb-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-stretch lg:justify-between lg:gap-6">
          <div className="flex min-w-0 flex-1 gap-4 sm:gap-5">
            {settings?.logoUrl ? (
              <div className="flex shrink-0 flex-col items-center justify-start sm:items-start">
                <div className="flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-xl border border-slate-200/90 bg-slate-50/80 p-2 shadow-sm sm:h-[4.75rem] sm:w-[4.75rem]">
                  <img src={settings.logoUrl} alt="" className="max-h-full max-w-full object-contain" />
                </div>
              </div>
            ) : null}
            <div
              className={`min-w-0 flex flex-1 flex-col justify-center border-slate-100 sm:pl-5 ${settings?.logoUrl ? 'sm:border-l' : ''}`}
            >
              <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-slate-400">Proposal for bid</p>
              <h1 className="mt-1 text-[1.35rem] font-semibold leading-[1.2] tracking-tight text-slate-950 sm:text-[1.5rem]">
                {settings?.companyName || 'Company name'}
              </h1>
              <div className="mt-2 space-y-1 text-[12px] leading-snug text-slate-600">
                {settings?.companyAddress ? <p>{settings.companyAddress}</p> : null}
                {contactLine ? <p className="text-slate-600">{contactLine}</p> : null}
              </div>
            </div>
          </div>
          <div className="min-w-0 border-t border-slate-100 pt-4 text-[12px] text-slate-600 lg:w-[min(100%,13.5rem)] lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0 lg:text-right xl:w-[14rem]">
            <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-400">Prepared for</p>
            <p className="mt-1.5 text-[15px] font-semibold leading-snug text-slate-950">{project.projectName}</p>
            <p className="mt-0.5 text-slate-600">{project.clientName || 'Client'}</p>
            {project.address ? <p className="mt-1 max-w-xs leading-relaxed text-slate-600 lg:ml-auto">{project.address}</p> : null}
            <p className="mt-2 text-[11px] text-slate-500">
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
          Quantities and descriptions are listed by scope. Dollar amounts appear only as scope rollups and in the investment summary — not per line item.
        </p>
        <div className="mt-8 space-y-10">
          {proposalSections.map((section) => (
            <div key={section.section} className="proposal-section proposal-avoid-break">
              <div className="flex flex-col gap-1 border-b border-slate-300 pb-2 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
                <h3 className="text-[15px] font-semibold tracking-tight text-slate-950">{section.section}</h3>
                <p className="text-[13px] font-semibold tabular-nums text-slate-800 sm:text-right">
                  Scope total{' '}
                  <span className="text-[16px] text-slate-950">{formatCurrencySafe(section.sectionTotal)}</span>
                </p>
              </div>
              <div className="mt-1 text-[13px]">
                <div className="mt-3 grid grid-cols-[1fr_auto] gap-x-6 border-b border-slate-100 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  <span>Item</span>
                  <span className="text-right">Qty</span>
                </div>
                {section.items.map((item) => (
                  <div key={item.id} className="proposal-line-item grid grid-cols-[1fr_auto] gap-x-6 border-b border-slate-100 py-2.5">
                    <div className="min-w-0 pr-2 leading-snug text-slate-800">
                      <p className="font-medium text-slate-900">{item.description}</p>
                      {item.subtitle ? (
                        <p className="mt-0.5 text-[11px] leading-snug tracking-wide text-slate-500">{item.subtitle}</p>
                      ) : null}
                    </div>
                    <p className="shrink-0 self-start text-right tabular-nums text-slate-700">
                      <span className="font-medium text-slate-900">{formatNumberSafe(item.quantity, 2)}</span>
                      <span className="text-slate-500"> {item.unit}</span>
                    </p>
                  </div>
                ))}
              </div>
              {(showMaterial && section.totalMaterialCost > 0) || (showLabor && section.totalLaborCost > 0) ? (
                <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 border-t border-slate-200 pt-3 text-[11px] text-slate-500">
                  {showMaterial && section.totalMaterialCost > 0 ? (
                    <span>
                      Scope material: <span className="font-medium tabular-nums text-slate-800">{formatCurrencySafe(section.totalMaterialCost)}</span>
                    </span>
                  ) : null}
                  {showLabor && section.totalLaborCost > 0 ? (
                    <span>
                      Scope labor: <span className="font-medium tabular-nums text-slate-800">{formatCurrencySafe(section.totalLaborCost)}</span>
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      {project.proposalIncludeSpecialNotes && project.specialNotes?.trim() ? (
        <section className="mt-10 proposal-section proposal-avoid-break">
          <h2 className={sectionHeadingClass}>Additional notes</h2>
          <p className="mt-5 max-w-[42rem] whitespace-pre-wrap text-[14px] leading-[1.65] text-slate-600">{project.specialNotes}</p>
        </section>
      ) : null}

      {pricingMode === 'material_only' && (summary.laborCompanionProposalTotal ?? 0) > 0 && summary.totalLaborHours > 0 ? (
        <section className="mt-10 proposal-section proposal-avoid-break">
          <h2 className={sectionHeadingClass}>Subcontractor labor (separate scope)</h2>
          <p className="mt-4 max-w-[42rem] text-[13px] leading-relaxed text-slate-600">
            This proposal total reflects <strong>material scope only</strong>. For the same quantities, loaded subcontractor installation is estimated at{' '}
            <strong className="tabular-nums text-slate-900">{formatCurrencySafe(summary.laborCompanionProposalTotal)}</strong>
            {' '}
            ({formatNumberSafe(summary.totalLaborHours, 1)} hr), including sub burden, labor overhead, and labor profit on labor only.
          </p>
        </section>
      ) : null}

      <section className="proposal-totals mt-10 border-t border-slate-300 pt-8 proposal-section proposal-avoid-break">
        <h2 className={sectionHeadingClass}>Investment summary</h2>
        <div className="mt-6 max-w-md space-y-3 sm:ml-auto">
          {showMaterial ? (
            <div className="flex justify-between gap-6 text-[13px] text-slate-600">
              <span>Material scope (incl. tax, O&amp;P)</span>
              <span className="tabular-nums font-medium text-slate-900">
                {formatCurrencySafe(summary.materialLoadedSubtotal ?? summary.materialSubtotal)}
              </span>
            </div>
          ) : null}
          {showLabor ? (
            <div className="flex justify-between gap-6 text-[13px] text-slate-600">
              <span>Subcontractor labor (loaded)</span>
              <span className="tabular-nums font-medium text-slate-900">
                {formatCurrencySafe(summary.laborLoadedSubtotal ?? summary.adjustedLaborSubtotal ?? summary.laborSubtotal)}
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
