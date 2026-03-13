import React from 'react';
import { Cloud, FileDown, FileText, Save, Send } from 'lucide-react';
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
  statusActionLabel,
}: Props) {
  const syncLabel = syncState === 'syncing' ? 'Syncing...' : syncState === 'ok' ? 'Synced' : syncState === 'error' ? 'Sync Error' : 'Not Synced';
  const syncColor = syncState === 'ok' ? 'text-emerald-700 bg-emerald-50 border-emerald-100' : syncState === 'error' ? 'text-red-700 bg-red-50 border-red-100' : 'text-slate-600 bg-slate-50 border-slate-200';

  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-slate-200/80 h-14 px-4 flex items-center justify-between gap-3 shadow-sm">
      <div className="min-w-0 flex items-center gap-3">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold tracking-tight text-slate-900 truncate">{project.projectName}</p>
          <p className="text-[11px] text-slate-500 truncate">
            {project.projectNumber ? `#${project.projectNumber} · ` : ''}
            {project.clientName || 'No client'} · {project.status}
          </p>
        </div>
        <div className="hidden lg:flex items-center gap-1.5 text-[11px]">
          <span className={`px-2 py-1 rounded-full border ${syncColor} inline-flex items-center gap-1`}>
            <Cloud className="w-3.5 h-3.5" /> {syncLabel}
          </span>
          <span className="px-2 py-1 rounded-full border border-slate-200 text-slate-600 bg-slate-50">
            Last Saved: {lastSavedAt ? new Date(lastSavedAt).toLocaleTimeString() : 'n/a'}
          </span>
          <span className="px-2 py-1 rounded-full border border-blue-100 text-blue-700 bg-blue-50 font-medium">
            Total: {formatCurrencySafe(baseBidTotal)}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="hidden md:flex items-center gap-1 p-1 rounded-lg border border-slate-200 bg-slate-50/70">
          <button onClick={() => onSave()} className="h-7 px-2 rounded-md border border-slate-300 text-slate-700 text-[11px] font-medium hover:bg-white flex items-center gap-1">
            <Save className="w-3.5 h-3.5" /> Save
          </button>
          <button onClick={onPreviewProposal} className="h-7 px-2 rounded-md border border-slate-300 text-slate-700 text-[11px] font-medium hover:bg-white flex items-center gap-1">
            <FileText className="w-3.5 h-3.5" /> <span className="hidden lg:inline">Preview</span>
          </button>
          <button onClick={onExport} className="h-7 px-2 rounded-md border border-slate-300 text-slate-700 text-[11px] font-medium hover:bg-white flex items-center gap-1">
            <FileDown className="w-3.5 h-3.5" /> Export
          </button>
        </div>
        <button onClick={() => onSave()} className="md:hidden h-7 px-2 rounded-md border border-slate-300 text-slate-700 text-[11px] font-medium hover:bg-slate-50 flex items-center gap-1">
          <Save className="w-3.5 h-3.5" /> Save
        </button>
        <button onClick={() => onSubmitBid()} className="h-8 px-3 rounded-md bg-[var(--brand)] text-white text-[11px] font-semibold hover:bg-[var(--brand-strong)] shadow-sm flex items-center gap-1">
          <Send className="w-3.5 h-3.5" /> {statusActionLabel}
        </button>
      </div>
    </header>
  );
}
