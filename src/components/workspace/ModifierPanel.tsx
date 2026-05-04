import React from 'react';
import { X } from 'lucide-react';
import { ModifierRecord } from '../../shared/types/estimator';
import { formatCurrencySafe, formatNumberSafe, formatPercentSafe } from '../../utils/numberFormat';

interface Props {
  modifiers: ModifierRecord[];
  activeModifiers: Array<{
    id: string;
    lineId: string;
    modifierId: string;
    name: string;
    addMaterialCost: number;
    addLaborMinutes: number;
    percentMaterial: number;
    percentLabor: number;
    createdAt: string;
  }>;
  selectedLinePresent: boolean;
  onApplyModifier: (modifierId: string) => void;
  onRemoveModifier: (lineModifierId: string) => void;
  /** Optional — when true, suppresses the top PROPERTIES CONTEXT kicker so the
   *  callsite can control the heading (e.g. when the panel is embedded in a
   *  larger inspector that already has its own label). */
  hideKicker?: boolean;
}

/**
 * Workstation "PROPERTIES CONTEXT" inspector — applied modifiers as green
 * accent cards, dashed empty slot for quick library insertion, and a compact
 * library picker below. Keeps the existing semantics (apply / remove) but
 * adopts the new token palette.
 */
export function ModifierPanel({ modifiers, activeModifiers, selectedLinePresent, onApplyModifier, onRemoveModifier, hideKicker }: Props) {
  const appliedIds = new Set(activeModifiers.map((m) => m.modifierId));
  const libraryCandidates = modifiers.filter((m) => !appliedIds.has(m.id));

  return (
    <div className="space-y-4">
      {hideKicker ? null : (
        <div className="flex items-center justify-between">
          <p className="ui-mono-kicker">Properties Context</p>
          <span className="font-mono text-[10px] font-medium uppercase tracking-[0.06em] text-slate-400">
            Modifiers · {activeModifiers.length}
          </span>
        </div>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <p className="ui-mono-kicker">Applied Modifiers</p>
        </div>
        {activeModifiers.length === 0 ? (
          <div className="ui-dashed-card">
            No modifiers applied
          </div>
        ) : (
          <div className="space-y-1.5">
            {activeModifiers.map((modifier) => (
              <div
                key={modifier.id}
                className="ui-accent-card ui-accent-card--green flex items-start gap-2 pl-3.5 pr-2 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-900">
                    {modifier.name}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] leading-snug text-slate-500">
                    +{formatCurrencySafe(modifier.addMaterialCost)} MAT · +{formatNumberSafe(modifier.addLaborMinutes, 1)} MIN ·{' '}
                    {formatPercentSafe(modifier.percentMaterial)} MAT% · {formatPercentSafe(modifier.percentLabor)} LAB%
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveModifier(modifier.id)}
                  className="mt-0.5 shrink-0 rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/40"
                  aria-label={`Remove ${modifier.name}`}
                  title={`Remove ${modifier.name}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <p className="ui-mono-kicker">Apply Add-in From Library</p>
          <span className="font-mono text-[10px] font-medium uppercase tracking-[0.06em] text-slate-400">
            {libraryCandidates.length} available
          </span>
        </div>
        {!selectedLinePresent ? (
          <div className="ui-dashed-card">
            Select a row to apply modifiers
          </div>
        ) : libraryCandidates.length === 0 ? (
          <div className="ui-dashed-card">No library modifiers left</div>
        ) : (
          <div className="max-h-60 space-y-1.5 overflow-y-auto pr-0.5">
            {libraryCandidates.map((modifier) => (
              <button
                key={modifier.id}
                type="button"
                onClick={() => onApplyModifier(modifier.id)}
                className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-2 text-left shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/40"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-[12px] font-semibold text-slate-900">{modifier.name}</p>
                  <span className="shrink-0 font-mono text-[9.5px] font-semibold uppercase tracking-[0.05em] text-slate-500">
                    {modifier.modifierKey}
                  </span>
                </div>
                <p className="mt-0.5 font-mono text-[10px] leading-snug text-slate-500">
                  +{formatCurrencySafe(modifier.addMaterialCost)} MAT · +{formatNumberSafe(modifier.addLaborMinutes, 1)} MIN ·{' '}
                  {formatPercentSafe(modifier.percentMaterial)} MAT% · {formatPercentSafe(modifier.percentLabor)} LAB%
                </p>
                {modifier.description?.trim() ? (
                  <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-slate-500">
                    {modifier.description.trim()}
                  </p>
                ) : null}
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
