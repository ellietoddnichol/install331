import React from 'react';
import { CatalogAutoSync } from './CatalogAutoSync';
import { AppShell } from './shell/AppShell';

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <CatalogAutoSync />
      {children}
    </AppShell>
  );
}
