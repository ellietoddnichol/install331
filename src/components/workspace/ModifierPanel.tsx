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
    <div className="space-y-2">
      <div>
        <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">Active On Item</p>
        {activeModifiers.length === 0 ? (
          <p className="text-xs text-slate-500">No active modifiers on selected line.</p>
        ) : (
          <div className="space-y-1">
            {activeModifiers.map((modifier) => (
              <div key={modifier.id} className="rounded border border-slate-200 bg-slate-50 p-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-slate-700">{modifier.name}</span>
                  <button onClick={() => onRemoveModifier(modifier.id)} className="text-[10px] px-1.5 py-0.5 rounded border border-slate-300 hover:bg-white">Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">Apply Modifier</p>
        {!selectedLinePresent ? (
          <p className="text-xs text-slate-500">Select an estimate row to apply modifiers.</p>
        ) : (
          <div className="space-y-1.5 max-h-44 overflow-y-auto pr-0.5">
            {modifiers.map((modifier) => (
              <button key={modifier.id} onClick={() => onApplyModifier(modifier.id)} className="w-full text-left rounded border border-slate-300 p-1.5 hover:border-blue-400 hover:bg-blue-50/50">
                <div className="flex justify-between items-center">
                  <p className="text-xs font-medium">{modifier.name}</p>
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{modifier.modifierKey}</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-4">
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
