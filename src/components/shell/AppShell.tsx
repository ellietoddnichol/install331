import React from 'react';
import { SidebarNav } from './SidebarNav';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen bg-[var(--bg-canvas)] text-slate-900 flex overflow-hidden p-2 md:p-3">
      <SidebarNav />
      <main className="flex-1 min-w-0 overflow-hidden">
        <div className="h-full rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-app)] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
