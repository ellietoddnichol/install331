import React from 'react';
import { BundleRecord } from '../../shared/types/estimator';

interface Props {
  bundles: BundleRecord[];
  onApplyBundle: (bundleId: string) => void;
}

export function BundleSelector({ bundles, onApplyBundle }: Props) {
  return (
    <div className="space-y-1.5 max-h-44 overflow-y-auto pr-0.5">
      {bundles.map((bundle) => (
        <button key={bundle.id} onClick={() => onApplyBundle(bundle.id)} className="w-full text-left rounded border border-slate-300 p-1.5 hover:border-blue-400 hover:bg-blue-50/50">
          <p className="text-xs font-medium leading-4">{bundle.bundleName}</p>
          <p className="text-[11px] text-slate-500">{bundle.category || 'General'}</p>
        </button>
      ))}
      {bundles.length === 0 && <p className="text-xs text-slate-500">No bundles available.</p>}
    </div>
  );
}
