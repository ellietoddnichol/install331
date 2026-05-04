import React from 'react';
import { StatCard } from './StatCard';
import { ProposalPresetSelector } from './ProposalPresetSelector';
import type { ProposalFormat } from '../../shared/types/estimator';
import { formatCurrencySafe, formatNumberSafe } from '../../utils/numberFormat';

interface ProposalSettingsRailProps {
  proposalFormat: ProposalFormat;
  onProposalFormatChange: (value: ProposalFormat) => void;
  proposalIncludeCatalogImages: boolean;
  onProposalIncludeCatalogImagesChange: (value: boolean) => void;
  baseBidTotal: number | undefined;
  lineCount: number;
  durationDays: number | undefined;
  statsSlot?: React.ReactNode;
}

export function ProposalSettingsRail({
  proposalFormat,
  onProposalFormatChange,
  proposalIncludeCatalogImages,
  onProposalIncludeCatalogImagesChange,
  baseBidTotal,
  lineCount,
  durationDays,
  statsSlot,
}: ProposalSettingsRailProps) {
  return (
    <aside className="space-y-4 lg:sticky lg:top-[88px]">
      {statsSlot ?? (
        <div className="grid gap-2.5">
          <StatCard label="Proposal total" value={formatCurrencySafe(baseBidTotal)} hint="From current estimate" />
          <StatCard label="Included lines" value={lineCount} hint="In this bid" />
          <StatCard
            label="Duration (est.)"
            value={durationDays != null && durationDays > 0 ? `${formatNumberSafe(durationDays, 1)} d` : '—'}
            hint="Schedule model"
          />
        </div>
      )}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
        <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">Layout preset</p>
        <p className="mt-1 text-xs text-slate-600">Pick a format; preview updates live.</p>
        <div className="mt-3">
          <ProposalPresetSelector value={proposalFormat} onChange={onProposalFormatChange} />
        </div>
        <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-[11px] text-slate-700">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={proposalIncludeCatalogImages}
            onChange={(e) => onProposalIncludeCatalogImagesChange(e.target.checked)}
          />
          <span>
            <span className="font-medium text-slate-800">Show catalog images on scope lines</span>
            <span className="mt-0.5 block text-[10px] leading-snug text-slate-500">
              Uses each line’s matched catalog photo when a URL is set. Print and export include the same preview.
            </span>
          </span>
        </label>
      </section>
    </aside>
  );
}
