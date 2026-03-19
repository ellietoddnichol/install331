import React, { useMemo } from 'react';
import { EstimateSummary, ProjectRecord, SettingsRecord, TakeoffLineRecord } from '../../shared/types/estimator';
import { buildProjectConditionSummaryLines } from '../../shared/utils/jobConditions';
import { buildProposalScheduleSections, splitProposalTextLines } from '../../shared/utils/proposalDocument';
import { DEFAULT_PROPOSAL_ACCEPTANCE_LABEL, DEFAULT_PROPOSAL_CLARIFICATIONS, DEFAULT_PROPOSAL_EXCLUSIONS, DEFAULT_PROPOSAL_INTRO, DEFAULT_PROPOSAL_TERMS } from '../../shared/utils/proposalDefaults';
import { formatCurrencySafe } from '../../utils/numberFormat';

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

  return (
    <article data-proposal-document="true" className="print-proposal proposal-document mx-auto min-h-[11in] w-full max-w-[8.5in] bg-white px-[0.6in] py-[0.65in] text-slate-900 shadow-[0_22px_56px_rgba(15,23,42,0.08)]">
      <header className="border-b border-slate-200 pb-6">
        <div className="flex items-start justify-between gap-6">
          <div className="flex items-start gap-4">
            {settings?.logoUrl ? (
              <img src={settings.logoUrl} alt="Company logo" className="h-14 w-14 object-contain" />
            ) : null}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Proposal</p>
              <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.04em] text-slate-950">{settings?.companyName || 'Brighten Builders, LLC'}</h1>
              <div className="mt-3 space-y-1 text-[13px] text-slate-600">
                <p>{settings?.companyAddress || ''}</p>
                <p>{settings?.companyPhone || ''} {settings?.companyEmail ? `| ${settings.companyEmail}` : ''}</p>
                <p>{website}</p>
              </div>
            </div>
          </div>
          <div className="min-w-[240px] text-right text-[13px] text-slate-600">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Client / Project</p>
            <div className="mt-3 space-y-1">
              <p className="text-[18px] font-semibold text-slate-950">{project.projectName}</p>
              <p>{project.clientName || 'Client'}</p>
              {project.address ? <p>{project.address}</p> : null}
              <p>Project #{project.projectNumber || project.id.slice(0, 8)}</p>
              <p>Date {proposalDate}</p>
              <p className="text-[11px] text-slate-500">Version {proposalVersion}</p>
            </div>
          </div>
        </div>
      </header>

      <section className="mt-8 proposal-section">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Introduction</h2>
        <p className="mt-3 text-[15px] leading-7 text-slate-700">{introText}</p>
      </section>

      <section className="mt-8 proposal-section">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Bid Schedule</h2>
        <div className="mt-4 space-y-6">
          {proposalSections.map((section) => (
            <div key={section.section} className="proposal-section proposal-avoid-break rounded-[18px] border border-slate-200 overflow-hidden">
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                <h3 className="text-[16px] font-semibold text-slate-950">{section.section}</h3>
              </div>
              <table className="w-full text-[12px]">
                <thead className="bg-white">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Item / Description</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-600">Qty</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-600">Material Cost</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-600">Labor Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {section.items.map((item) => (
                    <tr key={item.id} className="border-t border-slate-100 align-top">
                      <td className="px-4 py-3 text-slate-900">{item.description}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{item.quantity}</td>
                      <td className="px-4 py-3 text-right text-slate-900">{formatCurrencySafe(item.materialCost)}</td>
                      <td className="px-4 py-3 text-right text-slate-900">{formatCurrencySafe(item.laborCost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="border-t border-slate-200 bg-slate-50 px-4 py-4">
                <h4 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{section.section} Totals</h4>
                <div className="mt-3 grid gap-2 text-[13px] text-slate-700 sm:grid-cols-2">
                  <p>Total Material Cost <span className="float-right font-semibold text-slate-950">{formatCurrencySafe(section.totalMaterialCost)}</span></p>
                  <p>Total Labor Cost <span className="float-right font-semibold text-slate-950">{formatCurrencySafe(section.totalLaborCost)}</span></p>
                  <p>Total Estimated Time <span className="float-right font-semibold text-slate-950">{section.totalLaborHours.toFixed(1)} hrs</span></p>
                  <p>Section Total <span className="float-right font-semibold text-slate-950">{formatCurrencySafe(section.sectionTotal)}</span></p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {conditionLines.length > 0 ? (
        <section className="mt-8 proposal-section proposal-avoid-break">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Project Assumptions</h2>
          <ul className="mt-3 space-y-2 text-[13px] leading-6 text-slate-600">
            {conditionLines.map((line) => (
              <li key={line} className="flex gap-2"><span className="text-slate-400">•</span><span>{line}</span></li>
            ))}
          </ul>
        </section>
      ) : null}

      {project.specialNotes?.trim() ? (
        <section className="mt-8 proposal-section proposal-avoid-break">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Additional Notes</h2>
          <p className="mt-3 whitespace-pre-wrap text-[14px] leading-7 text-slate-600">{project.specialNotes}</p>
        </section>
      ) : null}

      <section className="mt-8 proposal-section proposal-avoid-break rounded-[18px] border border-slate-200 overflow-hidden">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Project Totals</h2>
        </div>
        <div className="px-4 py-4">
          <div className="grid gap-2 text-[14px] text-slate-700 sm:grid-cols-2">
            <p>Total Material <span className="float-right font-semibold text-slate-950">{formatCurrencySafe(showMaterial ? summary.materialSubtotal : 0)}</span></p>
            <p>Total Labor <span className="float-right font-semibold text-slate-950">{formatCurrencySafe(showLabor ? summary.adjustedLaborSubtotal || summary.laborSubtotal : 0)}</span></p>
            <p>Total Estimated Time <span className="float-right font-semibold text-slate-950">{summary.totalLaborHours.toFixed(1)} hrs</span></p>
            <p>Total Proposal Amount <span className="float-right font-semibold text-slate-950">{formatCurrencySafe(summary.baseBidTotal)}</span></p>
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-8 md:grid-cols-3 proposal-section proposal-page-break">
        <div>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Terms</h2>
          <ul className="mt-3 space-y-2 text-[13px] leading-6 text-slate-600">
            {termLines.map((line) => (
              <li key={line} className="flex gap-2"><span className="text-slate-400">•</span><span>{line}</span></li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Exclusions</h2>
          <ul className="mt-3 space-y-2 text-[13px] leading-6 text-slate-600">
            {exclusionLines.map((line) => (
              <li key={line} className="flex gap-2"><span className="text-slate-400">•</span><span>{line}</span></li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Clarifications</h2>
          <ul className="mt-3 space-y-2 text-[13px] leading-6 text-slate-600">
            {clarificationLines.map((line) => (
              <li key={line} className="flex gap-2"><span className="text-slate-400">•</span><span>{line}</span></li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mt-12 grid grid-cols-2 gap-10 border-t border-slate-300 pt-8 text-[12px] proposal-section proposal-avoid-break">
        <div>
          <p className="mb-2 text-slate-500 uppercase tracking-[0.18em]">Acceptance</p>
          <div className="mb-2 h-12 border-b border-slate-400" />
          <p>{settings?.proposalAcceptanceLabel || DEFAULT_PROPOSAL_ACCEPTANCE_LABEL}</p>
        </div>
        <div>
          <p className="mb-2 text-slate-500 uppercase tracking-[0.18em]">Date</p>
          <div className="mb-2 h-12 border-b border-slate-400" />
          <p>Authorized Signature Date</p>
        </div>
      </section>
    </article>
  );
}
