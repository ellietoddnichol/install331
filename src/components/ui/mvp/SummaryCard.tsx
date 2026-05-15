import React from 'react';

export function SummaryCard({
  label,
  value,
  hint,
  onClick,
}: {
  label: string;
  value: string | number;
  hint?: string;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-slate-500">{hint}</p> : null}
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="rounded-xl border border-slate-200/90 bg-white p-4 text-left shadow-sm transition hover:border-slate-300 hover:shadow-md"
      >
        {inner}
      </button>
    );
  }
  return <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm">{inner}</div>;
}
