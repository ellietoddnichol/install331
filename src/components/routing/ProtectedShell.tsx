import React, { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { CatalogAutoSync } from '../CatalogAutoSync.tsx';
import { ErrorBoundary } from '../ErrorBoundary.tsx';
import { RouteFallback } from '../RouteFallback.tsx';
import { AppShell } from '../shell/AppShell.tsx';

/**
 * Authenticated app chrome: sidebar + main region.
 * Child routes render in `<Outlet />` (React Router data-router pattern).
 */
export function ProtectedShell() {
  return (
    <AppShell>
      <CatalogAutoSync />
      <ErrorBoundary variant="page">
        <Suspense fallback={<RouteFallback label="Loading page…" />}>
          <Outlet />
        </Suspense>
      </ErrorBoundary>
    </AppShell>
  );
}
