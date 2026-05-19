import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronDown, FileDown, MoreHorizontal, Printer, Save, Eye, Send } from 'lucide-react';
import type { ProjectRecord } from '../../shared/types/estimator';
import {
  projectDisplaySubtitle,
  projectDisplayTitle,
  projectNeedsSetupDetails,
  projectReadinessChip,
  proposalModeChipLabel,
} from '../../shared/utils/projectDisplay';
import { formatCurrencySafe } from '../../utils/numberFormat';

export interface WorkspaceProjectHeaderProps {
  project: ProjectRecord;
  estimateLineCount: number;
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
  onContinueSetup?: () => void;
  onRequestDelete?: () => void;
}

function readinessChipClass(key: ReturnType<typeof projectReadinessChip>['key']): string {
  switch (key) {
    case 'ready_for_proposal':
      return 'bg-emerald-50 text-emerald-900 ring-emerald-200/80';
    case 'ready_for_quotes':
      return 'bg-sky-50 text-sky-900 ring-sky-200/80';
    case 'setup_needed':
      return 'bg-amber-50 text-amber-950 ring-amber-200/80';
    default:
      return 'bg-slate-100 text-slate-700 ring-slate-200/80';
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
  onContinueSetup,
  onRequestDelete,
}: WorkspaceProjectHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const title = projectDisplayTitle(project.projectName);
  const subtitle = projectDisplaySubtitle(project);
  const needsSetup = projectNeedsSetupDetails(project);
  const proposalReady = estimateLineCount > 0 && proposalTotal > 0;
  const readiness = projectReadinessChip({ project, estimateLineCount, proposalReady });

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-30 rounded-xl border border-slate-200 bg-white shadow-sm md:px-0 print:hidden">
      <div className="border-b border-slate-100 px-4 py-3 md:px-5">
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
              className="hidden h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 hover:bg-slate-50 sm:inline-flex"
            >
              <FileDown className="h-4 w-4 text-slate-600" aria-hidden />
              Export PDF
            </button>
            <button
              type="button"
              onClick={() => void onPrint()}
              className="hidden h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 hover:bg-slate-50 sm:inline-flex"
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
      </div>

      <div className="px-4 py-5 md:px-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Project</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-950 md:text-2xl">{title}</h1>
            {subtitle ? (
              <p className="mt-1.5 text-sm text-slate-600">{subtitle}</p>
            ) : (
              <p className="mt-1.5 text-sm text-slate-500">Add project details to continue.</p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-800 ring-1 ring-slate-200/80">
                {proposalModeChipLabel(project.pricingMode)}
              </span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${readinessChipClass(readiness.key)}`}
              >
                {readiness.label}
              </span>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {needsSetup && onContinueSetup ? (
                <button type="button" onClick={onContinueSetup} className="ui-fo-btn-primary h-10 px-4 text-sm">
                  Continue setup
                </button>
              ) : null}
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => setMenuOpen((open) => !open)}
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 hover:bg-slate-50"
                  aria-expanded={menuOpen}
                  aria-haspopup="menu"
                >
                  <MoreHorizontal className="h-4 w-4" aria-hidden />
                  More actions
                  <ChevronDown className={`h-4 w-4 transition ${menuOpen ? 'rotate-180' : ''}`} aria-hidden />
                </button>
                {menuOpen ? (
                  <div
                    role="menu"
                    className="absolute left-0 z-20 mt-1 min-w-[11rem] rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
                  >
                    {onRequestDelete ? (
                      <button
                        type="button"
                        role="menuitem"
                        className="block w-full px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50"
                        onClick={() => {
                          setMenuOpen(false);
                          onRequestDelete();
                        }}
                      >
                        Delete project
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          <div className="shrink-0 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-right lg:min-w-[10rem]">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Proposal total</p>
            <p className="mt-0.5 text-xl font-semibold tabular-nums text-slate-900">{formatCurrencySafe(proposalTotal)}</p>
            <p className="mt-2 text-[11px] text-slate-500">
              {lastSavedLabel ? <span className="block">Last saved {lastSavedLabel}</span> : null}
              {lastUpdatedLabel ? <span className="block">Updated {lastUpdatedLabel}</span> : null}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}
