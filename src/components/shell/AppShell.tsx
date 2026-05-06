import React, { useEffect } from 'react';
import { SidebarNav } from './SidebarNav';
import { maybeSyncCatalogInBackground } from '../../utils/catalogBackgroundSync';

export function AppShell({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    maybeSyncCatalogInBackground();
  }, []);

  return (
    <div className="h-screen w-screen flex overflow-hidden p-0 m-0 bg-white">
      <SidebarNav />
      <main className="flex-1 min-w-0 overflow-hidden">
        <div className="h-full rounded-xl border border-app-line-soft bg-app-bg shadow-[inset_0_1px_0_rgba(255,255,255,0.75),0_1px_3px_rgba(15,23,42,0.04)] overflow-y-auto scroll-smooth">
          {children}
        </div>
      </main>
    </div>
  );
}
