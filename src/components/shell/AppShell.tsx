import React, { useEffect } from 'react';
import { SidebarNav } from './SidebarNav';
import { maybeSyncCatalogInBackground } from '../../utils/catalogBackgroundSync';

export function AppShell({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    maybeSyncCatalogInBackground();
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--fo-workspace-bg)]">
      <SidebarNav />
      <main className="min-w-0 flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto scroll-smooth bg-[var(--fo-workspace-bg)]">{children}</div>
      </main>
    </div>
  );
}
