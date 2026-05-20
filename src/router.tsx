import { createBrowserRouter } from 'react-router-dom';
import { ProtectedShell } from './components/routing/ProtectedShell.tsx';
import { RequireAuthGate } from './components/routing/RequireAuthGate.tsx';
import { SignInRoute } from './components/routing/SignInRoute.tsx';
import { NotFound } from './pages/NotFound.tsx';
import { ProjectCreate } from './pages/ProjectCreate.tsx';
import { lazyPage } from './utils/lazyRoute.ts';

const Dashboard = lazyPage(() => import('./pages/Dashboard.tsx'), 'Dashboard');
const Projects = lazyPage(() => import('./pages/Projects.tsx'), 'Projects');
const ProjectWorkspace = lazyPage(() => import('./pages/ProjectWorkspace.tsx'), 'ProjectWorkspace');
const Catalog = lazyPage(() => import('./pages/Catalog.tsx'), 'Catalog');
const Help = lazyPage(() => import('./pages/Help.tsx'), 'Help');
const Settings = lazyPage(() => import('./pages/Settings.tsx'), 'Settings');
const Div10BrainAdmin = lazyPage(() => import('./pages/admin/Div10BrainAdmin.tsx'), 'Div10BrainAdmin');
const AdminHealthPage = lazyPage(() => import('./pages/admin/AdminHealthPage.tsx'), 'AdminHealthPage');
const ProjectWorkspaceIndexRedirect = lazyPage(
  () => import('./components/routing/ProjectWorkspaceIndexRedirect.tsx'),
  'ProjectWorkspaceIndexRedirect',
);

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
          { path: 'project/new', element: <ProjectCreate /> },
          { path: 'project/:id', element: <ProjectWorkspaceIndexRedirect /> },
          { path: 'project/:id/:workspaceStep', element: <ProjectWorkspace /> },
          { path: 'catalog', element: <Catalog /> },
          { path: 'help', element: <Help /> },
          { path: 'settings', element: <Settings /> },
          { path: 'admin/health', element: <AdminHealthPage /> },
          { path: 'admin/div10-brain', element: <Div10BrainAdmin /> },
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
]);
