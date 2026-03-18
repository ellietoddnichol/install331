import React, { useMemo } from 'react';
import { ProjectRecord, SettingsRecord, TakeoffLineRecord } from '../../shared/types/estimator';
import { buildProjectConditionSummaryLines } from '../../shared/utils/jobConditions';
import { DEFAULT_PROPOSAL_CLARIFICATIONS, DEFAULT_PROPOSAL_EXCLUSIONS, DEFAULT_PROPOSAL_INTRO, DEFAULT_PROPOSAL_TERMS } from '../../shared/utils/proposalDefaults';
import { formatCurrencySafe } from '../../utils/numberFormat';

interface Props {
  project: ProjectRecord;
  settings: SettingsRecord | null;
  website: string;
  lines: TakeoffLineRecord[];
  summary: {
    materialSubtotal: number;
    laborSubtotal: number;
    adjustedLaborSubtotal: number;
    lineSubtotal: number;
    conditionAdjustmentAmount: number;
    conditionLaborMultiplier: number;
    burdenAmount: number;
    overheadAmount: number;
    profitAmount: number;
    taxAmount: number;
    baseBidTotal: number;
    conditionAssumptions: string[];
  } | null;
}

function isClientFacingLabel(label: string): boolean {
  const normalized = label.toLowerCase().trim();
  if (!normalized) return false;

  const blockedExact = new Set(['uncategorized', 'general scope', 'general', 'internal', 'test']);
  if (blockedExact.has(normalized)) return false;

  const blockedPattern = /(room|area|zone|test|internal|uncategorized|general scope)/i;
  return !blockedPattern.test(normalized);
}

export function ProposalPreview({ project, settings, website, lines, summary }: Props) {
  if (!summary) return <div className="text-sm text-slate-500">No estimate data yet.</div>;

  const showOverhead = project.overheadPercent > 0;
  const pricingMode = project.pricingMode || 'labor_and_material';
  const showMaterial = pricingMode !== 'labor_only';
  const showLabor = pricingMode !== 'material_only';
  const proposalVersion = `v${new Date(project.updatedAt).getTime().toString().slice(-5)}`;
  const proposalDate = project.proposalDate
    ? new Date(project.proposalDate).toLocaleDateString()
    : new Date().toLocaleDateString();
  const conditionLines = buildProjectConditionSummaryLines(project.jobConditions);

  const scopeBreakout = useMemo(() => {
    const sectionMap = new Map<string, {
      section: string;
      itemCount: number;
      material: number;
      labor: number;
      total: number;
      highlights: string[];
    }>();

    const cleanSectionLabel = (line: TakeoffLineRecord): string => {
      const rawCategory = (line.category || '').trim();
      const rawSubcategory = (line.subcategory || '').trim();
      const rawBaseType = (line.baseType || '').trim();

      if (isClientFacingLabel(rawCategory)) return rawCategory;
      if (isClientFacingLabel(rawSubcategory)) return rawSubcategory;
      if (isClientFacingLabel(rawBaseType)) return rawBaseType;
      return 'Additional Scope';
    };

    lines.forEach((line) => {
      const section = cleanSectionLabel(line);
      const existing = sectionMap.get(section) || {
        section,
        itemCount: 0,
        material: 0,
        labor: 0,
        total: 0,
        highlights: [],
      };

      existing.itemCount += 1;
      const material = showMaterial ? line.materialCost * line.qty : 0;
      const labor = showLabor ? line.laborCost * line.qty : 0;
      existing.material += material;
      existing.labor += labor;
      existing.total += material + labor;

      if (existing.highlights.length < 4 && line.description) {
        const description = line.description.trim();
        if (description && !existing.highlights.includes(description) && description.length <= 120) {
          existing.highlights.push(description);
        }
      }

      sectionMap.set(section, existing);
    });

    return Array.from(sectionMap.values()).sort((a, b) => b.total - a.total);
  }, [lines, showLabor, showMaterial]);

  const topHighlights = scopeBreakout.slice(0, 3);

  return (
    <div className="print-proposal mx-auto max-w-[8.5in] rounded-[30px] border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-10 text-slate-900 shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
      <div className="mb-6 overflow-hidden rounded-[28px] border border-slate-200/40 bg-[linear-gradient(135deg,#0a224d_0%,#0b3d91_52%,#164fa8_100%)] px-6 py-6 text-white shadow-[0_18px_42px_rgba(10,34,77,0.24)]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            {settings?.logoUrl ? (
              <img src={settings.logoUrl} alt="Company logo" className="h-16 w-16 rounded-2xl bg-white/95 object-contain p-2 shadow-sm" />
            ) : null}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-blue-100">Client Proposal</p>
              <h2 className="mt-2 text-[24px] font-semibold tracking-[-0.03em] text-white">{settings?.companyName || 'Brighten Builders, LLC'}</h2>
              <p className="mt-2 text-sm text-blue-100">{settings?.companyAddress || ''}</p>
              <p className="text-sm text-blue-100">{website}</p>
              <p className="text-sm text-blue-100">{settings?.companyPhone || ''} {settings?.companyEmail ? `| ${settings.companyEmail}` : ''}</p>
            </div>
          </div>
          <div className="rounded-[24px] border border-white/15 bg-white/10 px-4 py-3 text-right text-sm backdrop-blur">
            <p className="text-[10px] uppercase tracking-[0.18em] text-blue-100">Proposal</p>
            <p className="mt-2 text-lg font-semibold text-white">{project.projectName}</p>
            <p className="mt-1 text-blue-100">{project.clientName || 'Client'}</p>
            <p className="text-blue-100">Project #{project.projectNumber || project.id.slice(0, 8)}</p>
            <p className="text-blue-100">Date: {proposalDate}</p>
            <p className="text-blue-100">Version: {proposalVersion}</p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-[22px] bg-white/10 px-4 py-3 backdrop-blur">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-100">Lines Included</p>
            <p className="mt-2 text-[24px] font-semibold tracking-[-0.04em] text-white">{lines.length}</p>
          </div>
          <div className="rounded-[22px] bg-white/10 px-4 py-3 backdrop-blur">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-100">Scope Sections</p>
            <p className="mt-2 text-[24px] font-semibold tracking-[-0.04em] text-white">{scopeBreakout.length}</p>
          </div>
          <div className="rounded-[22px] bg-white/10 px-4 py-3 backdrop-blur">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-100">Assumptions</p>
            <p className="mt-2 text-[24px] font-semibold tracking-[-0.04em] text-white">{conditionLines.length}</p>
          </div>
          <div className="rounded-[22px] bg-white px-4 py-3 text-slate-900 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Proposal Total</p>
            <p className="mt-2 text-[24px] font-semibold tracking-[-0.04em] text-slate-950">{formatCurrencySafe(summary.baseBidTotal)}</p>
          </div>
        </div>
      </div>

      {topHighlights.length > 0 ? (
        <div className="mb-6 grid gap-3 md:grid-cols-3">
          {topHighlights.map((entry) => (
            <div key={entry.section} className="rounded-[24px] border border-slate-200/80 bg-white/85 p-4 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Featured Scope</p>
              <h3 className="mt-2 text-base font-semibold tracking-tight text-slate-950">{entry.section}</h3>
              <p className="mt-1 text-xs text-slate-500">{entry.itemCount} lines included</p>
              {entry.highlights.length > 0 ? <p className="mt-3 text-sm leading-6 text-slate-700">{entry.highlights.join(', ')}</p> : null}
            </div>
          ))}
        </div>
      ) : null}

      <section className="mb-5 rounded-[24px] border border-slate-200/80 bg-white/85 p-5 shadow-sm">
        <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Scope Summary</h3>
        <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">
          {settings?.proposalIntro || DEFAULT_PROPOSAL_INTRO}
        </div>
      </section>

      <section className="mb-5 rounded-[24px] border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#f6f9fd_100%)] p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Pricing Summary</h3>
          <span className="rounded-full bg-[var(--brand-soft)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-blue-800">Client-facing pricing</span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {showMaterial ? <div className="rounded-[20px] border border-slate-200/80 bg-white/90 p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Material</p><p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">{formatCurrencySafe(summary.materialSubtotal)}</p></div> : null}
          {showLabor ? <div className="rounded-[20px] border border-emerald-200/80 bg-emerald-50/70 p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">Labor</p><p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">{formatCurrencySafe(summary.laborSubtotal)}</p></div> : null}
          {showLabor && summary.conditionAdjustmentAmount !== 0 ? <div className="rounded-[20px] border border-blue-200/80 bg-blue-50/70 p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-700">Conditions</p><p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">{formatCurrencySafe(summary.conditionAdjustmentAmount)}</p><p className="mt-1 text-[11px] text-slate-500">Project labor and job-condition adjustments</p></div> : null}
          <div className="rounded-[20px] border border-amber-200/80 bg-amber-50/70 p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700">Markup + Tax</p><p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">{formatCurrencySafe((summary.overheadAmount || 0) + (summary.profitAmount || 0) + (summary.taxAmount || 0) + (summary.burdenAmount || 0))}</p></div>
        </div>
        <div className="mt-4 space-y-2 rounded-[20px] border border-slate-200/80 bg-white/85 p-4 text-sm">
          {showOverhead && <div className="flex justify-between"><span>Overhead</span><span>{formatCurrencySafe(summary.overheadAmount)}</span></div>}
          <div className="flex justify-between"><span>Profit</span><span>{formatCurrencySafe(summary.profitAmount)}</span></div>
          {showMaterial ? <div className="flex justify-between"><span>Tax</span><span>{formatCurrencySafe(summary.taxAmount)}</span></div> : null}
          <div className="flex justify-between border-t border-slate-200 pt-2 font-semibold text-slate-900"><span>Total Proposal</span><span>{formatCurrencySafe(summary.baseBidTotal)}</span></div>
        </div>
      </section>

      {conditionLines.length > 0 ? (
        <section className="mb-5 rounded-[24px] border border-slate-200/80 bg-white/85 p-5 shadow-sm">
          <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Pricing Assumptions</h3>
          <ul className="mt-3 space-y-2 text-xs text-slate-700">
            {conditionLines.map((line) => (
              <li key={line} className="rounded-2xl bg-slate-50/80 px-3 py-2">{line}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {project.specialNotes?.trim() ? (
        <section className="mb-5 rounded-[24px] border border-slate-200/80 bg-white/85 p-5 shadow-sm">
          <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Special Notes</h3>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">{project.specialNotes}</p>
        </section>
      ) : null}

      <section className="mb-5 rounded-[24px] border border-slate-200/80 bg-white/85 p-5 shadow-sm">
        <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Included Scope By Category</h3>
        <div className="mt-4 overflow-hidden rounded-[20px] border border-slate-200/80">
          <table className="w-full text-xs">
            <thead className="bg-slate-100/90">
              <tr>
                <th className="px-3 py-2 text-left">Proposal Section</th>
                <th className="px-3 py-2 text-right">Lines</th>
                {showMaterial ? <th className="px-3 py-2 text-right">Material</th> : null}
                {showLabor ? <th className="px-3 py-2 text-right">Labor</th> : null}
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {scopeBreakout.map((entry, index) => (
                <tr key={entry.section} className={`border-t border-slate-100 ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                  <td className="px-3 py-3">
                    <p className="font-semibold text-slate-900">{entry.section}</p>
                    {entry.highlights.length > 0 ? (
                      <p className="mt-1 text-[11px] leading-5 text-slate-500">Includes: {entry.highlights.join(', ')}</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 text-right text-slate-700">{entry.itemCount}</td>
                  {showMaterial ? <td className="px-3 py-3 text-right text-slate-700">{formatCurrencySafe(entry.material)}</td> : null}
                  {showLabor ? <td className="px-3 py-3 text-right text-slate-700">{formatCurrencySafe(entry.labor)}</td> : null}
                  <td className="px-3 py-3 text-right font-semibold text-slate-900">{formatCurrencySafe(entry.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 grid gap-4 text-xs text-slate-600 md:grid-cols-3">
        <div className="rounded-[22px] border border-slate-200/80 bg-white/85 p-4 shadow-sm">
          <h4 className="font-semibold uppercase tracking-wide text-slate-500">Terms</h4>
          <p className="mt-3 whitespace-pre-wrap leading-6">{settings?.proposalTerms || DEFAULT_PROPOSAL_TERMS}</p>
        </div>
        <div className="rounded-[22px] border border-slate-200/80 bg-white/85 p-4 shadow-sm">
          <h4 className="font-semibold uppercase tracking-wide text-slate-500">Exclusions</h4>
          <p className="mt-3 whitespace-pre-wrap leading-6">{settings?.proposalExclusions || DEFAULT_PROPOSAL_EXCLUSIONS}</p>
        </div>
        <div className="rounded-[22px] border border-slate-200/80 bg-white/85 p-4 shadow-sm">
          <h4 className="font-semibold uppercase tracking-wide text-slate-500">Clarifications</h4>
          <p className="mt-3 whitespace-pre-wrap leading-6">{settings?.proposalClarifications || DEFAULT_PROPOSAL_CLARIFICATIONS}</p>
        </div>
      </section>

      <section className="mt-8 grid grid-cols-2 gap-8 border-t border-slate-300 pt-5 text-xs">
        <div>
          <p className="mb-2 text-slate-500 uppercase tracking-wide">Acceptance</p>
          <div className="mb-2 h-10 border-b border-slate-400" />
          <p>{settings?.proposalAcceptanceLabel || 'Accepted By'}</p>
        </div>
        <div>
          <p className="mb-2 text-slate-500 uppercase tracking-wide">Date</p>
          <div className="mb-2 h-10 border-b border-slate-400" />
          <p>Authorized Signature Date</p>
        </div>
      </section>
    </div>
  );
}
