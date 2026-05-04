/**
 * Dynamic imports aligned with `router.tsx` lazy routes — warms Vite chunk cache so sidebar
 * navigations skip Suspense waits when possible.
 */
export function prefetchMainSidebarRoutes(): void {
  void import('../pages/Dashboard.tsx');
  void import('../pages/Projects.tsx');
  void import('../pages/Catalog.tsx');
  void import('../pages/Help.tsx');
  void import('../pages/Settings.tsx');
}

/** Heavier bundles — fetch after primary routes to avoid competing with first paint. */
export function prefetchProjectRoutesDeferred(): void {
  void import('../pages/ProjectWorkspace.tsx');
  void import('../pages/ProjectIntake.tsx');
}

export function prefetchNavPath(path: string): void {
  switch (path) {
    case '/':
      void import('../pages/Dashboard.tsx');
      break;
    case '/projects':
      void import('../pages/Projects.tsx');
      break;
    case '/catalog':
      void import('../pages/Catalog.tsx');
      break;
    case '/help':
      void import('../pages/Help.tsx');
      break;
    case '/settings':
      void import('../pages/Settings.tsx');
      break;
    default:
      break;
  }
}
