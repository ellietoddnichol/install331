import React, { lazy } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { ProtectedShell } from './components/routing/ProtectedShell.tsx';
import { RequireAuthGate } from './components/routing/RequireAuthGate.tsx';
import { SignInRoute } from './components/routing/SignInRoute.tsx';
import { NotFound } from './pages/NotFound.tsx';

const Dashboard = lazy(() => import('./pages/Dashboard.tsx').then((m) => ({ default: m.Dashboard })));
const Projects = lazy(() => import('./pages/Projects.tsx').then((m) => ({ default: m.Projects })));
const ProjectWorkspace = lazy(() => import('./pages/ProjectWorkspace.tsx').then((m) => ({ default: m.ProjectWorkspace })));
const ProjectIntake = lazy(() => import('./pages/ProjectIntake.tsx').then((m) => ({ default: m.ProjectIntake })));
const Catalog = lazy(() => import('./pages/Catalog.tsx').then((m) => ({ default: m.Catalog })));
const Help = lazy(() => import('./pages/Help.tsx').then((m) => ({ default: m.Help })));
const Settings = lazy(() => import('./pages/Settings.tsx').then((m) => ({ default: m.Settings })));

/**
 * Nested routes + `<Outlet />` enable loaders/actions (Phase 1+).
 * Add `loader` / `action` on route objects as you migrate data off components.
 */
export const appRouter = createBrowserRouter([
  {
    path: '/signin',
    element: <SignInRoute />,
  },
  {
    path: '/',
    element: <RequireAuthGate />,
    children: [
      {
        element: <ProtectedShell />,
        children: [
          { index: true, element: <Dashboard /> },
          { path: 'projects', element: <Projects /> },
          { path: 'project/new', element: <ProjectIntake /> },
          { path: 'project/:id', element: <ProjectWorkspace /> },
          { path: 'catalog', element: <Catalog /> },
          { path: 'help', element: <Help /> },
          { path: 'settings', element: <Settings /> },
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
]);
