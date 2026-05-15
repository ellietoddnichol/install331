import React, { useMemo } from 'react';
import type { EstimateSummary, ProjectRecord, SettingsRecord, SourceQuoteRecord } from '../../shared/types/estimator';
import type { WorkspaceTab } from '../../shared/types/projectWorkflow';
import type { NextBestAction } from '../../shared/utils/projectWorkspaceReadiness';
import { formatCurrencySafe } from '../../utils/numberFormat';
import { overviewTotalsFromSummary } from '../../components/workflow/ProjectWorkspaceTabSummaries';

export interface ProjectQuoteRollup {
  stagedRowCount: number;
  quotesNeedingReview: number;
  quotesReadyToImport: number;
  quotesImported: number;
}

export interface ProjectOverviewMvpPageProps {
  project: ProjectRecord;
  summary: EstimateSummary | null;
  quotes: SourceQuoteRecord[];
  settings: SettingsRecord | null;
  quoteRollup: ProjectQuoteRollup;
  nextBestAction: NextBestAction;
  effectiveLaborRatePerHour: number;
  lineModifierRowCount: number;
  estimateLinesCount: number;
  importedFromQuoteLineCount: number;
  alternatesCount: number;
  clarificationsCount: number;
  exclusionsCount: number;
  onGoToTab: (tab: WorkspaceTab) => void;
}

function pricingModeLabel(mode: ProjectRecord['pricingMode']): string {
  switch (mode) {
    case 'labor_only':
      return 'Install only';
    case 'material_only':
      return 'Material only';
    default:
      return 'Full';
  }
}

export function ProjectOverviewMvpPage({
  project,
  summary,
  quotes,
  settings: _settings,
  quoteRollup,
  nextBestAction,
  effectiveLaborRatePerHour,
  lineModifierRowCount,
  estimateLinesCount,
  importedFromQuoteLineCount,
  alternatesCount,
  clarificationsCount,
  exclusionsCount,
  onGoToTab,
}: ProjectOverviewMvpPageProps) {
  void _settings;
  const totals = useMemo(() => overviewTotalsFromSummary(summary), [summary]);
  const taxLocation = String(project.jobConditions.locationLabel || '').trim() || '—';

  const proposalReadiness =
    estimateLinesCount > 0 && totals.total > 0 ? 'Proposal ready' : totals.total > 0 ? 'Review scope' : 'Build estimate first';

  const setupComplete =
    Boolean(project.projectName?.trim()) && Boolean(project.clientName?.trim()) && Boolean(project.address?.trim());

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Next best action</h2>
        <p className="mt-1 text-sm text-slate-600">Start with the step that unlocks the rest of your workflow.</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => onGoToTab(nextBestAction.tab)} className="ui-btn-primary h-10 px-4 text-sm font-semibold">
            {nextBestAction.label}
          </button>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <OverviewCard title="Project setup">
          <OverviewRow label="Project" value={project.projectName?.trim() || '—'} />
          <OverviewRow label="Customer" value={project.clientName?.trim() || '—'} />
          <OverviewRow label="Address" value={project.address?.trim() || '—'} />
          <OverviewRow label="Tax location" value={taxLocation} />
          <OverviewRow label="Proposal mode" value={pricingModeLabel(project.pricingMode)} />
          <OverviewRow
            label="Labor rate"
            value={effectiveLaborRatePerHour > 0 ? `${formatCurrencySafe(effectiveLaborRatePerHour)}/hr` : '—'}
          />
          <OverviewRow label="Setup status" value={setupComplete ? 'Complete' : 'Missing details'} />
          <div className="mt-4">
            <button type="button" className="ui-btn-secondary h-9 px-3 text-sm font-medium" onClick={() => onGoToTab('setup')}>
              Go to setup
            </button>
          </div>
        </OverviewCard>

        <OverviewCard title="Quotes">
          <OverviewRow label="Quotes uploaded" value={String(quotes.length)} />
          <OverviewRow label="Rows staged" value={String(quoteRollup.stagedRowCount)} />
          <OverviewRow label="Needs review" value={quoteRollup.quotesNeedingReview ? String(quoteRollup.quotesNeedingReview) : '—'} />
          <OverviewRow label="Ready to import" value={quoteRollup.quotesReadyToImport ? String(quoteRollup.quotesReadyToImport) : '—'} />
          <OverviewRow label="Imported" value={importedFromQuoteLineCount ? String(importedFromQuoteLineCount) : '—'} />
          <div className="mt-4">
            <button type="button" className="ui-btn-secondary h-9 px-3 text-sm font-medium" onClick={() => onGoToTab('quotes')}>
              Go to quotes
            </button>
          </div>
        </OverviewCard>

        <OverviewCard title="Estimate">
          <OverviewRow label="Material" value={formatCurrencySafe(totals.material)} />
          <OverviewRow label="Labor" value={formatCurrencySafe(totals.labor)} />
          <OverviewRow label="Add-ins" value={lineModifierRowCount ? `${lineModifierRowCount} on lines` : '—'} />
          <OverviewRow label="Modifiers" value="See estimate" />
          <OverviewRow label="Proposal total" value={formatCurrencySafe(totals.total)} />
          <div className="mt-4">
            <button type="button" className="ui-btn-secondary h-9 px-3 text-sm font-medium" onClick={() => onGoToTab('estimate')}>
              Go to estimate
            </button>
          </div>
        </OverviewCard>

        <OverviewCard title="Proposal">
          <OverviewRow label="Clarifications" value={String(clarificationsCount)} />
          <OverviewRow label="Exclusions" value={String(exclusionsCount)} />
          <OverviewRow label="Alternates" value={alternatesCount ? String(alternatesCount) : '—'} />
          <OverviewRow label="Proposal readiness" value={proposalReadiness} />
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="ui-btn-primary h-9 px-3 text-sm font-medium" onClick={() => onGoToTab('proposal')}>
              Preview proposal
            </button>
            <button type="button" className="ui-btn-secondary h-9 px-3 text-sm font-medium" onClick={() => onGoToTab('proposal')}>
              Go to proposal
            </button>
          </div>
        </OverviewCard>
      </div>
    </div>
  );
}

function OverviewCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <div className="mt-3 space-y-0">{children}</div>
    </section>
  );
}

function OverviewRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 py-2 last:border-0">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <span className="max-w-[60%] text-right text-sm font-medium text-slate-900">
        {value}
        {hint ? <span className="mt-0.5 block text-[11px] font-normal text-slate-500">{hint}</span> : null}
      </span>
    </div>
  );
}
