import React from 'react';

type Tone = 'neutral' | 'ok' | 'warn' | 'error' | 'brand';

const toneClass: Record<Tone, string> = {
  neutral: 'border-slate-200 bg-slate-50 text-slate-700',
  ok: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  warn: 'border-amber-200 bg-amber-50 text-amber-950',
  error: 'border-red-200 bg-red-50 text-red-900',
  brand: 'border-blue-200 bg-blue-50 text-blue-900',
};

interface StatusChipProps {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
}

export function StatusChip({ children, tone = 'neutral', className = '' }: StatusChipProps) {
  return (
    <span className={`inline-flex max-w-full items-center truncate rounded-full border px-2.5 py-1 text-[11px] font-medium ${toneClass[tone]} ${className}`}>
      {children}
    </span>
  );
}
