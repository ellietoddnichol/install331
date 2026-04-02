import React from 'react';
import { SidebarNav } from './SidebarNav';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen bg-[var(--bg-canvas)] text-slate-900 flex overflow-hidden p-2 md:p-3">
      <SidebarNav />
      <main className="flex-1 min-w-0 overflow-hidden">
        <div className="h-full rounded-xl border border-[var(--line-soft)] bg-[var(--bg-app)] shadow-[inset_0_1px_0_rgba(255,255,255,0.75),0_1px_3px_rgba(15,23,42,0.04)] overflow-y-auto scroll-smooth">
          {children}
        </div>
      </main>
    </div>
  );
}
