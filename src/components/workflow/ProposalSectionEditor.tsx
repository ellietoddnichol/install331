import React from 'react';
import type { SettingsRecord } from '../../shared/types/estimator';

interface ProposalSectionEditorProps {
  settings: SettingsRecord;
  setSettings: React.Dispatch<React.SetStateAction<SettingsRecord | null>>;
  onResetSection: (scope: 'intro' | 'terms' | 'exclusions' | 'clarifications' | 'acceptance') => void;
  onResetAll: () => void;
}

export function ProposalSectionEditor({ settings, setSettings, onResetSection, onResetAll }: ProposalSectionEditorProps) {
  return (
    <div className="space-y-3">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="ui-label">Proposal wording</p>
          <h4 className="mt-1 text-base font-semibold tracking-tight text-slate-900">Company defaults (Settings)</h4>
          <p className="mt-1 text-xs text-slate-500">Edits save to company profile via Save edits — same behavior as before this workflow refresh.</p>
        </div>
        <button type="button" onClick={onResetAll} className="text-[11px] font-medium text-slate-600 underline decoration-slate-300 underline-offset-2 hover:text-slate-900">
          Reset all to company defaults
        </button>
      </div>

      <label className="block rounded-[22px] border border-slate-200/80 bg-slate-50/65 p-3 text-xs text-slate-600">
        <span className="flex items-center justify-between gap-2">
          <span className="font-semibold text-slate-700">Scope Summary / Intro</span>
          <button type="button" onClick={() => onResetSection('intro')} className="text-[11px] font-semibold text-blue-700 hover:text-blue-800">
            Reset Default
          </button>
        </span>
        <textarea
          rows={6}
          className="mt-2 w-full rounded-[18px] border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
          value={settings.proposalIntro || ''}
          onChange={(e) => setSettings({ ...settings, proposalIntro: e.target.value })}
        />
      </label>

      <label className="block rounded-[22px] border border-slate-200/80 bg-slate-50/65 p-3 text-xs text-slate-600">
        <span className="flex items-center justify-between gap-2">
          <span className="font-semibold text-slate-700">Terms</span>
          <button type="button" onClick={() => onResetSection('terms')} className="text-[11px] font-semibold text-blue-700 hover:text-blue-800">
            Reset Default
          </button>
        </span>
        <textarea
          rows={5}
          className="mt-2 w-full rounded-[18px] border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
          value={settings.proposalTerms || ''}
          onChange={(e) => setSettings({ ...settings, proposalTerms: e.target.value })}
        />
      </label>

      <label className="block rounded-[22px] border border-slate-200/80 bg-slate-50/65 p-3 text-xs text-slate-600">
        <span className="flex items-center justify-between gap-2">
          <span className="font-semibold text-slate-700">Exclusions</span>
          <button type="button" onClick={() => onResetSection('exclusions')} className="text-[11px] font-semibold text-blue-700 hover:text-blue-800">
            Reset Default
          </button>
        </span>
        <textarea
          rows={5}
          className="mt-2 w-full rounded-[18px] border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
          value={settings.proposalExclusions || ''}
          onChange={(e) => setSettings({ ...settings, proposalExclusions: e.target.value })}
        />
      </label>

      <label className="block rounded-[22px] border border-slate-200/80 bg-slate-50/65 p-3 text-xs text-slate-600">
        <span className="flex items-center justify-between gap-2">
          <span className="font-semibold text-slate-700">Clarifications</span>
          <button type="button" onClick={() => onResetSection('clarifications')} className="text-[11px] font-semibold text-blue-700 hover:text-blue-800">
            Reset Default
          </button>
        </span>
        <textarea
          rows={5}
          className="mt-2 w-full rounded-[18px] border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
          value={settings.proposalClarifications || ''}
          onChange={(e) => setSettings({ ...settings, proposalClarifications: e.target.value })}
        />
      </label>

      <label className="block rounded-[22px] border border-slate-200/80 bg-slate-50/65 p-3 text-xs text-slate-600">
        <span className="flex items-center justify-between gap-2">
          <span className="font-semibold text-slate-700">Acceptance Label</span>
          <button type="button" onClick={() => onResetSection('acceptance')} className="text-[11px] font-semibold text-blue-700 hover:text-blue-800">
            Reset Default
          </button>
        </span>
        <input
          className="mt-2 h-10 w-full rounded-[16px] border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
          value={settings.proposalAcceptanceLabel || ''}
          onChange={(e) => setSettings({ ...settings, proposalAcceptanceLabel: e.target.value })}
        />
      </label>
    </div>
  );
}
