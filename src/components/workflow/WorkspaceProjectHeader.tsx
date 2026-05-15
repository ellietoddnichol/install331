import React from 'react';
import { ChevronLeft, FileDown, Printer, Save, Eye, Send } from 'lucide-react';
import type { PricingMode, ProjectRecord, ProjectStatus } from '../../shared/types/estimator';
import { formatCurrencySafe } from '../../utils/numberFormat';

export interface WorkspaceProjectHeaderProps {
  project: ProjectRecord;
  estimateLineCount: number;
  /** Main proposal / bid total */
  proposalTotal: number;
  lastUpdatedLabel: string | null;
  lastSavedLabel: string | null;
  saveBusy: boolean;
  onBackToProjects: () => void;
  onSave: () => void | Promise<void>;
  onPreviewProposal: () => void;
  onExportPdf: () => void | Promise<void>;
  onPrint: () => void | Promise<void>;
  onStatusAction: () => void | Promise<void>;
  statusActionLabel: string;
  onDeleteProject?: () => void | Promise<void>;
}

function statusBadgeLabel(status: ProjectStatus, estimateLineCount: number): string {
  if (status === 'Draft' && estimateLineCount > 0) return 'Estimate';
  switch (status) {
    case 'Draft':
      return 'Draft';
    case 'Submitted':
      return 'Proposal ready';
    case 'Awarded':
      return 'Won';
    case 'Lost':
      return 'Not awarded';
    case 'Archived':
      return 'Archived';
    default:
      return 'Draft';
  }
}

function proposalModeLabel(mode: PricingMode): string {
  switch (mode) {
    case 'labor_only':
      return 'Install only';
    case 'material_only':
      return 'Material only';
    case 'labor_and_material':
    case 'material_with_optional_install_quote':
    default:
      return 'Full';
  }
}

export function WorkspaceProjectHeader({
  project,
  estimateLineCount,
  proposalTotal,
  lastUpdatedLabel,
  lastSavedLabel,
  saveBusy,
  onBackToProjects,
  onSave,
  onPreviewProposal,
  onExportPdf,
  onPrint,
  onStatusAction,
  statusActionLabel,
  onDeleteProject,
}: WorkspaceProjectHeaderProps) {
  const customer = String(project.clientName || '').trim() || '—';
  const address = String(project.address || '').trim() || '—';

  return (
    <header className="sticky top-0 z-30 rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm md:px-5 md:py-5 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBackToProjects}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          All projects
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void onSave()}
            disabled={saveBusy}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            <Save className="h-4 w-4 text-slate-600" aria-hidden />
            {saveBusy ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={onPreviewProposal}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            <Eye className="h-4 w-4 text-slate-600" aria-hidden />
            Preview proposal
          </button>
          <button
            type="button"
            onClick={() => void onExportPdf()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            <FileDown className="h-4 w-4 text-slate-600" aria-hidden />
            Export PDF
          </button>
          <button
            type="button"
            onClick={() => void onPrint()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            <Printer className="h-4 w-4 text-slate-600" aria-hidden />
            Print
          </button>
          <button
            type="button"
            onClick={() => void onStatusAction()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <Send className="h-4 w-4" aria-hidden />
            {statusActionLabel}
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-slate-950 md:text-2xl">{project.projectName || 'Project'}</h1>
          <p className="mt-1 text-sm text-slate-600">
            <span className="font-medium text-slate-800">{customer}</span>
            {address !== '—' ? <span className="text-slate-500"> · {address}</span> : null}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200/80">
              {statusBadgeLabel(project.status, estimateLineCount)}
            </span>
            <span className="rounded-full bg-slate-50 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200/80">
              {proposalModeLabel(project.pricingMode)}
            </span>
          </div>
        </div>
        <div className="shrink-0 text-right lg:pt-0.5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Proposal total</p>
          <p className="mt-0.5 text-xl font-semibold tabular-nums text-slate-900">{formatCurrencySafe(proposalTotal)}</p>
          <p className="mt-2 text-[11px] text-slate-500">
            {lastSavedLabel ? <span className="block">Last saved {lastSavedLabel}</span> : null}
            {lastUpdatedLabel ? <span className="block">Updated {lastUpdatedLabel}</span> : null}
          </p>
        </div>
      </div>
      {onDeleteProject ? (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={() => void onDeleteProject()}
            className="text-xs font-medium text-rose-600 hover:text-rose-700"
          >
            Delete project…
          </button>
        </div>
      ) : null}
    </header>
  );
}
