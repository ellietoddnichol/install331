import React from 'react';
import { formatCurrencySafe } from '../../utils/numberFormat';
import type { EstimateSummary, SettingsRecord } from '../../shared/types/estimator';
import { splitProposalTextLines } from '../../shared/utils/proposalDocument';
import {
  DEFAULT_PROPOSAL_CLARIFICATIONS,
  DEFAULT_PROPOSAL_EXCLUSIONS,
  ensureProposalDefaults,
} from '../../shared/utils/proposalDefaults';

export function SetupTabSummaryCard(props: {
  projectName: string;
  customer: string;
  address: string;
  taxLocation: string;
  laborRate: number;
  proposalModeLabel: string;
}) {
  const { projectName, customer, address, taxLocation, laborRate, proposalModeLabel } = props;
  return (
    <section className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Project setup</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryPill label="Project" value={projectName || '—'} />
        <SummaryPill label="Customer" value={customer || '—'} />
        <SummaryPill label="Address" value={address || '—'} />
        <SummaryPill label="Tax location" value={taxLocation || '—'} />
        <SummaryPill label="Pricing" value={proposalModeLabel} />
        <SummaryPill label="Labor rate" value={laborRate > 0 ? `${formatCurrencySafe(laborRate)}/hr` : '—'} />
      </div>
    </section>
  );
}

export function QuotesTabSummaryCard(props: {
  quoteCount: number;
  stagedRows: number;
  needingReviewQuotes: number;
  readyToImportQuotes: number;
  importedQuoteCount: number;
}) {
  const { quoteCount, stagedRows, needingReviewQuotes, readyToImportQuotes, importedQuoteCount } = props;
  return (
    <section className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Quotes</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <SummaryPill label="Upload / paste quote" value="Below" hint="Files or manual rows" />
        <SummaryPill label="Source quotes" value={String(quoteCount)} />
        <SummaryPill label="Needs review" value={needingReviewQuotes ? String(needingReviewQuotes) : '—'} />
        <SummaryPill label="Ready to import" value={readyToImportQuotes ? String(readyToImportQuotes) : '—'} />
        <SummaryPill label="Imported" value={importedQuoteCount ? String(importedQuoteCount) : '—'} hint={`${stagedRows} rows on file`} />
      </div>
    </section>
  );
}

export function EstimateTabSummaryCard(props: {
  material: number;
  labor: number;
  modifierAddOnCount: number;
  total: number;
}) {
  const { material, labor, modifierAddOnCount, total } = props;
  return (
    <section className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Estimate</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <SummaryPill label="Material" value={formatCurrencySafe(material)} />
        <SummaryPill label="Labor" value={formatCurrencySafe(labor)} />
        <SummaryPill label="Add-ins" value={modifierAddOnCount ? String(modifierAddOnCount) : '—'} hint="Line add-ins" />
        <SummaryPill label="Modifiers" value="In grid" hint="Per-line adjustments" />
        <SummaryPill label="Total" value={formatCurrencySafe(total)} />
      </div>
    </section>
  );
}

export function ProposalTabSummaryCard(props: { settings: SettingsRecord | null }) {
  const s = ensureProposalDefaults(props.settings);
  const clar = splitProposalTextLines(s.proposalClarifications || DEFAULT_PROPOSAL_CLARIFICATIONS).length;
  const excl = splitProposalTextLines(s.proposalExclusions || DEFAULT_PROPOSAL_EXCLUSIONS).length;
  return (
    <section className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Proposal</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <SummaryPill label="Scope" value="From estimate" />
        <SummaryPill label="Clarifications" value={String(clar)} />
        <SummaryPill label="Exclusions" value={String(excl)} />
        <SummaryPill label="Alternates" value="—" hint="When present in estimate" />
        <SummaryPill label="Preview / export" value="Header actions" />
      </div>
    </section>
  );
}

function SummaryPill({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/90 px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-slate-900">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function overviewTotalsFromSummary(summary: EstimateSummary | null): {
  material: number;
  labor: number;
  total: number;
} {
  if (!summary) return { material: 0, labor: 0, total: 0 };
  return {
    material: summary.materialLoadedSubtotal ?? summary.materialSubtotal,
    labor: summary.laborLoadedSubtotal ?? summary.adjustedLaborSubtotal ?? summary.laborSubtotal,
    total: summary.baseBidTotal,
  };
}
