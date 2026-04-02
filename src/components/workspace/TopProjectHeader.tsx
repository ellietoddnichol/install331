import React from 'react';
import { ArrowUpRight, Cloud, FileDown, FileText, Save, Send, Trash2 } from 'lucide-react';
import { ProjectRecord } from '../../shared/types/estimator';
import { formatCurrencySafe } from '../../utils/numberFormat';

interface Props {
  project: ProjectRecord;
  baseBidTotal: number;
  syncState: 'idle' | 'syncing' | 'ok' | 'error';
  lastSavedAt: string | null;
  onSave: () => Promise<void> | void;
  onPreviewProposal: () => void;
  onExport: () => void;
  onSubmitBid: () => Promise<void> | void;
  onDeleteProject: () => Promise<void> | void;
  statusActionLabel: string;
}

export function TopProjectHeader({
  project,
  baseBidTotal,
  syncState,
  lastSavedAt,
  onSave,
  onPreviewProposal,
  onExport,
  onSubmitBid,
  onDeleteProject,
  statusActionLabel,
}: Props) {
  const syncLabel = syncState === 'syncing' ? 'Syncing...' : syncState === 'ok' ? 'Synced' : syncState === 'error' ? 'Sync Error' : 'Not Synced';
  const syncColor = syncState === 'ok' ? 'text-emerald-700 bg-emerald-50 border-emerald-100' : syncState === 'error' ? 'text-red-700 bg-red-50 border-red-100' : 'text-slate-600 bg-slate-50 border-slate-200';

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 px-3 py-2.5 md:px-4 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-white/90">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex items-start gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-[20px] font-semibold tracking-[-0.03em] text-slate-950 md:text-[24px]">{project.projectName}</p>
              <span className="ui-chip-soft">{project.status}</span>
              {project.projectNumber ? <span className="ui-chip-soft">#{project.projectNumber}</span> : null}
            </div>
            <p className="mt-1 text-[12px] text-slate-500 md:text-[13px]">
              {project.clientName || 'No client assigned'}
              {project.generalContractor ? ` · GC ${project.generalContractor}` : ''}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
              <span className={`px-2.5 py-1 rounded-full border ${syncColor} inline-flex items-center gap-1`}> 
                <Cloud className="w-3.5 h-3.5" /> {syncLabel}
              </span>
              <span className="ui-chip-soft">Last saved {lastSavedAt ? new Date(lastSavedAt).toLocaleTimeString() : 'n/a'}</span>
              {project.estimator ? <span className="ui-chip-soft">Estimator {project.estimator}</span> : null}
            </div>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <div className="hidden rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-right md:block">
            <p className="text-[9px] font-semibold tracking-[0.12em] text-slate-500 uppercase">Estimate</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">{formatCurrencySafe(baseBidTotal)}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-1 rounded-full bg-white/80 p-1 shadow-sm ring-1 ring-slate-200/80 backdrop-blur-sm">
              <button type="button" onClick={() => onSave()} className="h-8 rounded-full px-3 text-[11px] font-medium text-slate-700 outline-none hover:bg-slate-100 flex items-center gap-1 focus-visible:ring-2 focus-visible:ring-blue-400/40">
            <Save className="w-3.5 h-3.5" /> Save
          </button>
              <button type="button" onClick={onPreviewProposal} className="h-8 rounded-full px-3 text-[11px] font-medium text-slate-700 outline-none hover:bg-slate-100 flex items-center gap-1 focus-visible:ring-2 focus-visible:ring-blue-400/40">
            <FileText className="w-3.5 h-3.5" /> <span className="hidden lg:inline">Preview</span>
          </button>
              <button type="button" onClick={onExport} className="h-8 rounded-full px-3 text-[11px] font-medium text-slate-700 outline-none hover:bg-slate-100 flex items-center gap-1 focus-visible:ring-2 focus-visible:ring-blue-400/40">
            <FileDown className="w-3.5 h-3.5" /> Export PDF
          </button>
            </div>
            <button type="button" onClick={() => onDeleteProject()} className="hidden md:inline-flex ui-ghost-btn items-center gap-1.5 text-[11px] text-red-700 hover:bg-red-50 hover:text-red-700">
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
            <button type="button" onClick={() => onSave()} className="md:hidden h-8 px-3 rounded-full border border-slate-300 bg-white text-slate-700 text-[11px] font-medium outline-none hover:bg-slate-50 flex items-center gap-1 focus-visible:ring-2 focus-visible:ring-blue-400/40">
              <Save className="w-3.5 h-3.5" /> Save
            </button>
            <button type="button" onClick={() => onSubmitBid()} className="ui-btn-primary h-10 rounded-full px-4 text-[11px] font-semibold flex items-center gap-1.5">
              <Send className="w-3.5 h-3.5" /> {statusActionLabel}
              <ArrowUpRight className="w-3.5 h-3.5 opacity-80" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
