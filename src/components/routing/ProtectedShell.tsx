import React, { Suspense, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { prefetchMainSidebarRoutes, prefetchProjectRoutesDeferred } from '../../lib/prefetchAppRoutes.ts';
import { CatalogAutoSync } from '../CatalogAutoSync.tsx';
import { ErrorBoundary } from '../ErrorBoundary.tsx';
import { RouteFallback } from '../RouteFallback.tsx';
import { AppShell } from '../shell/AppShell.tsx';

/**
 * Authenticated app chrome: sidebar + main region.
 * Child routes render in `<Outlet />` (React Router data-router pattern).
 */
export function ProtectedShell() {
  useEffect(() => {
    let cancelled = false;
    const t1 = window.setTimeout(() => {
      if (cancelled) return;
      prefetchMainSidebarRoutes();
      window.setTimeout(() => {
        if (!cancelled) prefetchProjectRoutesDeferred();
      }, 400);
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(t1);
    };
  }, []);

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
