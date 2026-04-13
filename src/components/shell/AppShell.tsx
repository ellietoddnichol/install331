import React from 'react';
import { ChevronRight } from 'lucide-react';
import { useWorkspaceStore } from '../../stores/workspaceStore.ts';
import { SidebarNav } from './SidebarNav';

export function AppShell({ children }: { children: React.ReactNode }) {
  const isSidebarOpen = useWorkspaceStore((s) => s.isSidebarOpen);
  const toggleSidebar = useWorkspaceStore((s) => s.toggleSidebar);

  return (
    <div className="h-screen bg-[var(--bg-canvas)] text-slate-900 flex overflow-hidden p-2 md:p-3">
      {isSidebarOpen ? (
        <SidebarNav />
      ) : (
        <button
          type="button"
          onClick={toggleSidebar}
          className="mr-2 shrink-0 self-start rounded-lg border border-[var(--line-soft)] bg-[var(--bg-app)] p-2 text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900"
          aria-label="Show sidebar"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      )}
      <main className="flex-1 min-w-0 overflow-hidden">
        <div className="h-full rounded-xl border border-[var(--line-soft)] bg-[var(--bg-app)] shadow-[inset_0_1px_0_rgba(255,255,255,0.75),0_1px_3px_rgba(15,23,42,0.04)] overflow-y-auto scroll-smooth">
          {children}
        </div>
      </main>
    </div>
  );
}
