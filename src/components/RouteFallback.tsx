import React from 'react';
import { Loader2 } from 'lucide-react';

export function RouteFallback({ label = 'Loading…' }: { label?: string }) {
  return (
    <div
      className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-slate-600"
      role="status"
      aria-live="polite"
    >
      <Loader2 className="h-8 w-8 animate-spin text-blue-600" aria-hidden />
      <p className="text-sm font-medium">{label}</p>
    </div>
  );
}
