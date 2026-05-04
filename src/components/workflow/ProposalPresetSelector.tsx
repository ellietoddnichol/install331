import React from 'react';
import type { ProposalFormat } from '../../shared/types/estimator';
import { PROPOSAL_FORMAT_OPTIONS } from '../../shared/utils/proposalDocument';

interface ProposalPresetSelectorProps {
  value: ProposalFormat;
  onChange: (value: ProposalFormat) => void;
}

export function ProposalPresetSelector({ value, onChange }: ProposalPresetSelectorProps) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {PROPOSAL_FORMAT_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          title={opt.hint}
          className={`rounded-xl border px-3 py-2.5 text-left transition ${
            value === opt.value ? 'border-blue-400 bg-blue-50/80 ring-1 ring-blue-200/80' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80'
          }`}
        >
          <p className="text-[11px] font-semibold text-slate-900">{opt.label}</p>
          <p className="mt-1 text-[10px] leading-snug text-slate-500">{opt.hint}</p>
        </button>
      ))}
    </div>
  );
}
