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
  const proposalDate = new Date().toLocaleDateString();
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

  return (
    <div className="print-proposal bg-white border border-slate-300 rounded-lg p-10 max-w-[8.5in] mx-auto text-slate-900 shadow-sm">
      <div className="flex justify-between items-start border-b border-slate-300 pb-5 mb-6">
        <div className="flex items-start gap-3">
          {settings?.logoUrl ? (
            <img src={settings.logoUrl} alt="Company logo" className="w-16 h-16 object-contain rounded" />
          ) : null}
          <div>
            <h2 className="text-[22px] font-semibold tracking-tight">{settings?.companyName || 'Brighten Builders, LLC'}</h2>
            <p className="text-sm text-slate-600">{settings?.companyAddress || ''}</p>
            <p className="text-sm text-slate-600">{website}</p>
            <p className="text-sm text-slate-600">{settings?.companyPhone || ''} {settings?.companyEmail ? `| ${settings.companyEmail}` : ''}</p>
          </div>
        </div>
        <div className="text-right text-sm">
          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Proposal</p>
          <p className="font-semibold text-base">{project.projectName}</p>
          <p className="text-slate-500">{project.clientName || 'Client'}</p>
          <p className="text-slate-500">Project #{project.projectNumber || project.id.slice(0, 8)}</p>
          <p className="text-slate-500">Date: {proposalDate}</p>
          <p className="text-slate-500">Version: {proposalVersion}</p>
        </div>
      </div>

      <section className="mb-5">
        <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 mb-2">Scope Summary</h3>
        <div className="text-sm leading-6 text-slate-700 whitespace-pre-wrap">
          {settings?.proposalIntro || DEFAULT_PROPOSAL_INTRO}
        </div>
      </section>

      <section className="mb-5">
        <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 mb-2">Pricing Summary</h3>
        <div className="space-y-2 text-sm border border-slate-200 rounded-md p-4 bg-slate-50">
          {showMaterial ? <div className="flex justify-between"><span>Material</span><span>{formatCurrencySafe(summary.materialSubtotal)}</span></div> : null}
          {showLabor ? <div className="flex justify-between"><span>Labor</span><span>{formatCurrencySafe(summary.laborSubtotal)}</span></div> : null}
          {showLabor && summary.conditionAdjustmentAmount !== 0 ? <div className="flex justify-between"><span>Project Labor / Condition Adjustments</span><span>{formatCurrencySafe(summary.conditionAdjustmentAmount)}</span></div> : null}
          {showOverhead && <div className="flex justify-between"><span>Overhead</span><span>{formatCurrencySafe(summary.overheadAmount)}</span></div>}
          <div className="flex justify-between"><span>Profit</span><span>{formatCurrencySafe(summary.profitAmount)}</span></div>
          {showMaterial ? <div className="flex justify-between"><span>Tax</span><span>{formatCurrencySafe(summary.taxAmount)}</span></div> : null}
          <div className="flex justify-between border-t border-slate-300 pt-2"><span>Subtotal</span><span>{formatCurrencySafe(summary.lineSubtotal)}</span></div>
        </div>
      </section>

      {conditionLines.length > 0 ? (
        <section className="mb-5">
          <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 mb-2">Pricing Assumptions</h3>
          <ul className="text-xs text-slate-700 space-y-1">
            {conditionLines.map((line) => (
              <li key={line}>- {line}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {project.specialNotes?.trim() ? (
        <section className="mb-5">
          <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 mb-2">Special Notes</h3>
          <p className="text-xs text-slate-700 whitespace-pre-wrap">{project.specialNotes}</p>
        </section>
      ) : null}

      <section className="mb-5">
        <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 mb-2">Included Scope By Category</h3>
        <div className="border border-slate-200 rounded-md overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-100">
              <tr>
                <th className="px-2 py-1 text-left">Proposal Section</th>
                <th className="px-2 py-1 text-right">Lines</th>
                {showMaterial ? <th className="px-2 py-1 text-right">Material</th> : null}
                {showLabor ? <th className="px-2 py-1 text-right">Labor</th> : null}
                <th className="px-2 py-1 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {scopeBreakout.map((entry) => (
                <tr key={entry.section} className="border-t border-slate-100 bg-white">
                  <td className="px-2 py-1.5">
                    <p className="font-semibold">{entry.section}</p>
                    {entry.highlights.length > 0 ? (
                      <p className="text-[11px] text-slate-500 mt-0.5">Includes: {entry.highlights.join(', ')}</p>
                    ) : null}
                  </td>
                  <td className="px-2 py-1.5 text-right">{entry.itemCount}</td>
                  {showMaterial ? <td className="px-2 py-1.5 text-right">{formatCurrencySafe(entry.material)}</td> : null}
                  {showLabor ? <td className="px-2 py-1.5 text-right">{formatCurrencySafe(entry.labor)}</td> : null}
                  <td className="px-2 py-1.5 text-right">{formatCurrencySafe(entry.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-5 pt-4 border-t border-slate-300 flex justify-between font-semibold text-base">
        <span>Total Proposal</span>
        <span className="text-[20px] text-slate-900">{formatCurrencySafe(summary.baseBidTotal)}</span>
      </div>

      <section className="mt-6 text-xs text-slate-600 space-y-4">
        <div>
          <h4 className="font-semibold uppercase tracking-wide text-slate-500 mb-1">Terms</h4>
          <p className="whitespace-pre-wrap">{settings?.proposalTerms || DEFAULT_PROPOSAL_TERMS}</p>
        </div>
        <div>
          <h4 className="font-semibold uppercase tracking-wide text-slate-500 mb-1">Exclusions</h4>
          <p className="whitespace-pre-wrap">{settings?.proposalExclusions || DEFAULT_PROPOSAL_EXCLUSIONS}</p>
        </div>
        <div>
          <h4 className="font-semibold uppercase tracking-wide text-slate-500 mb-1">Clarifications</h4>
          <p className="whitespace-pre-wrap">{settings?.proposalClarifications || DEFAULT_PROPOSAL_CLARIFICATIONS}</p>
        </div>
      </section>

      <section className="mt-8 border-t border-slate-300 pt-5 grid grid-cols-2 gap-8 text-xs">
        <div>
          <p className="text-slate-500 uppercase tracking-wide mb-2">Acceptance</p>
          <div className="h-10 border-b border-slate-400 mb-2" />
          <p>{settings?.proposalAcceptanceLabel || 'Accepted By'}</p>
        </div>
        <div>
          <p className="text-slate-500 uppercase tracking-wide mb-2">Date</p>
          <div className="h-10 border-b border-slate-400 mb-2" />
          <p>Authorized Signature Date</p>
        </div>
      </section>
    </div>
  );
}
