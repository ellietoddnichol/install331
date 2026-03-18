import React from 'react';
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
}

export function ModifierPanel({ modifiers, activeModifiers, selectedLinePresent, onApplyModifier, onRemoveModifier }: Props) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-[12px] font-semibold tracking-[-0.02em] text-slate-900 mb-1">Active On Item</p>
        <p className="text-[11px] text-slate-500 mb-2">Applied labor and material adjustments for the current line.</p>
        {activeModifiers.length === 0 ? (
          <div className="rounded-2xl bg-white/80 px-3 py-3 text-xs text-slate-500 shadow-sm ring-1 ring-slate-200/80">No active modifiers on selected line.</div>
        ) : (
          <div className="space-y-2">
            {activeModifiers.map((modifier) => (
              <div key={modifier.id} className="rounded-2xl bg-white/90 p-2.5 shadow-sm ring-1 ring-slate-200/80">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-[12px] font-semibold text-slate-800">{modifier.name}</span>
                    <p className="mt-1 text-[11px] text-slate-500">
                      +{formatCurrencySafe(modifier.addMaterialCost)} material, +{formatNumberSafe(modifier.addLaborMinutes, 1)} min, {formatPercentSafe(modifier.percentMaterial)} material, {formatPercentSafe(modifier.percentLabor)} labor
                    </p>
                  </div>
                  <button onClick={() => onRemoveModifier(modifier.id)} className="rounded-full border border-slate-200 px-2.5 py-1 text-[10px] font-medium text-slate-600 transition hover:bg-slate-50">Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="text-[12px] font-semibold tracking-[-0.02em] text-slate-900 mb-1">Apply Modifier</p>
        <p className="text-[11px] text-slate-500 mb-2">Stack add-ins and labor multipliers without leaving the line editor.</p>
        {!selectedLinePresent ? (
          <div className="rounded-2xl bg-white/80 px-3 py-3 text-xs text-slate-500 shadow-sm ring-1 ring-slate-200/80">Select an estimate row to apply modifiers.</div>
        ) : (
          <div className="space-y-2 max-h-52 overflow-y-auto pr-0.5">
            {modifiers.map((modifier) => (
              <button key={modifier.id} onClick={() => onApplyModifier(modifier.id)} className="w-full rounded-2xl bg-white/92 p-2.5 text-left shadow-sm ring-1 ring-slate-200/80 transition hover:-translate-y-0.5 hover:bg-white hover:ring-blue-200/90">
                <div className="flex justify-between items-center">
                  <p className="text-[12px] font-semibold text-slate-800">{modifier.name}</p>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">{modifier.modifierKey}</span>
                </div>
                <p className="mt-1 text-[11px] leading-4 text-slate-500">
                  +{formatCurrencySafe(modifier.addMaterialCost)} material, +{formatNumberSafe(modifier.addLaborMinutes, 1)} min, {formatPercentSafe(modifier.percentMaterial)} material, {formatPercentSafe(modifier.percentLabor)} labor
                </p>
              </button>
            ))}
            {modifiers.length === 0 && <p className="text-xs text-slate-500">No modifiers available.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
