import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Activity,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  Settings,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useWorkspaceStore } from '../../stores/workspaceStore.ts';

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/projects', label: 'Projects', icon: FolderOpen },
  { path: '/catalog', label: 'Catalog', icon: BookOpen },
  { path: '/settings', label: 'Settings', icon: Settings },
];

const ADMIN_ITEM = { path: '/admin/health', label: 'Admin', icon: Activity };

function isActivePath(pathname: string, target: string): boolean {
  if (target === '/') return pathname === '/';
  return pathname === target || pathname.startsWith(`${target}/`);
}

export function SidebarNav() {
  const location = useLocation();
  const { signOut, userEmail } = useAuth();
  const isSidebarOpen = useWorkspaceStore((s) => s.isSidebarOpen);
  const toggleSidebar = useWorkspaceStore((s) => s.toggleSidebar);

  const linkClass = (active: boolean, compact: boolean) =>
    compact
      ? `group relative flex h-9 w-9 items-center justify-center rounded-lg outline-none transition focus-visible:ring-2 focus-visible:ring-emerald-500/40 ${
          active
            ? 'bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200'
            : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
        }`
      : `h-9 px-2.5 rounded-lg flex items-center gap-2.5 text-sm transition outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 ${
          active
            ? 'bg-emerald-50 text-emerald-950 font-semibold ring-1 ring-emerald-200'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
        }`;

  const shellClass = isSidebarOpen
    ? 'w-[240px] shrink-0 mr-2 md:mr-3 rounded-xl border border-slate-200 bg-white flex flex-col overflow-hidden shadow-sm'
    : 'w-[56px] shrink-0 mr-2 md:mr-3 rounded-xl border border-slate-200 bg-white flex flex-col overflow-hidden shadow-sm';

  return (
    <aside className={shellClass} aria-label="Primary navigation">
      <div className={`border-b border-slate-100 ${isSidebarOpen ? 'px-4 py-4 flex items-center gap-2.5' : 'p-2 flex flex-col items-center gap-2'}`}>
        {isSidebarOpen ? (
          <>
            <div className="w-9 h-9 rounded-lg bg-slate-900 text-white grid place-items-center text-xs font-bold">BB</div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Brighten Builders</p>
              <p className="text-sm font-semibold text-slate-900">Install App</p>
            </div>
            <button type="button" onClick={toggleSidebar} className="rounded-md border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50" aria-label="Collapse sidebar">
              <ChevronLeft className="h-4 w-4" />
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={toggleSidebar} className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50" aria-label="Expand sidebar">
              <ChevronRight className="h-4 w-4" />
            </button>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-[10px] font-bold text-white">BB</div>
          </>
        )}
      </div>

      <nav className={`flex-1 overflow-y-auto ${isSidebarOpen ? 'p-2.5 space-y-0.5' : 'px-2 py-2 space-y-1'}`}>
        {NAV_ITEMS.map((item) => {
          const active = isActivePath(location.pathname, item.path);
          return (
            <Link key={item.path} to={item.path} title={item.label} className={linkClass(active, !isSidebarOpen)}>
              <item.icon className="w-4 h-4 shrink-0" />
              {isSidebarOpen ? <span>{item.label}</span> : null}
            </Link>
          );
        })}
        <div className={isSidebarOpen ? 'pt-3 mt-2 border-t border-slate-100' : 'pt-2 mt-1 border-t border-slate-100'}>
          <Link
            to={ADMIN_ITEM.path}
            title={ADMIN_ITEM.label}
            className={linkClass(isActivePath(location.pathname, ADMIN_ITEM.path), !isSidebarOpen)}
          >
            <ADMIN_ITEM.icon className="w-4 h-4 shrink-0" />
            {isSidebarOpen ? <span>{ADMIN_ITEM.label}</span> : null}
          </Link>
        </div>
      </nav>

      <div className={`border-t border-slate-100 ${isSidebarOpen ? 'p-3.5' : 'p-2 flex flex-col items-center gap-1'}`}>
        {isSidebarOpen ? (
          <>
            <p className="text-[11px] text-slate-400">Signed in</p>
            <p className="text-sm font-medium truncate text-slate-800">{userEmail || 'Estimator'}</p>
          </>
        ) : null}
        <button
          type="button"
          onClick={signOut}
          className={isSidebarOpen ? 'mt-2 h-8 w-full rounded-lg border border-slate-200 text-slate-700 text-xs font-medium hover:bg-slate-50 flex items-center justify-center gap-1.5' : 'flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50'}
          aria-label="Sign out"
        >
          <LogOut className="w-3.5 h-3.5" />
          {isSidebarOpen ? 'Sign out' : null}
        </button>
      </div>
    </aside>
  );
}


