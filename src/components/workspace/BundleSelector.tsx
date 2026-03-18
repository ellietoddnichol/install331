import React from 'react';
import { BundleRecord } from '../../shared/types/estimator';

interface Props {
  bundles: BundleRecord[];
  onApplyBundle: (bundleId: string) => void;
}

export function BundleSelector({ bundles, onApplyBundle }: Props) {
  return (
    <div className="space-y-2 max-h-44 overflow-y-auto pr-0.5">
      {bundles.map((bundle) => (
        <button key={bundle.id} onClick={() => onApplyBundle(bundle.id)} className="w-full rounded-2xl bg-white/92 p-2.5 text-left shadow-sm ring-1 ring-slate-200/80 transition hover:-translate-y-0.5 hover:bg-white hover:ring-blue-200/90">
          <p className="text-[12px] font-semibold leading-4 text-slate-800">{bundle.bundleName}</p>
          <p className="mt-1 text-[11px] text-slate-500">{bundle.category || 'General'}</p>
        </button>
      ))}
      {bundles.length === 0 && <p className="text-xs text-slate-500">No bundles available.</p>}
    </div>
  );
}
