import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  Settings,
  Wrench,
} from 'lucide-react';
import { prefetchNavPath } from '../../lib/prefetchAppRoutes.ts';
import { useAuth } from '../../context/AuthContext';
import { useWorkspaceStore } from '../../stores/workspaceStore.ts';

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/projects', label: 'Projects', icon: FolderOpen },
  { path: '/catalog', label: 'Catalog', icon: BookOpen },
  { path: '/help', label: 'Help', icon: CircleHelp },
  { path: '/settings', label: 'Settings', icon: Settings },
];

function isActivePath(pathname: string, target: string): boolean {
  if (target === '/') return pathname === '/';
  return pathname === target || pathname.startsWith(`${target}/`);
}

/**
 * Workstation shell sidebar.
 *
 * Two modes driven by `workspaceStore.isSidebarOpen`:
 *   - collapsed (default): slim 56px icon rail; tooltip-on-hover for each item.
 *   - expanded: 240px dark sidebar with labels, brand mark, and signed-in chip.
 *
 * The expand/collapse control is always visible at the top of the rail.
 */
export function SidebarNav() {
  const location = useLocation();
  const { signOut, userEmail } = useAuth();
  const isSidebarOpen = useWorkspaceStore((s) => s.isSidebarOpen);
  const toggleSidebar = useWorkspaceStore((s) => s.toggleSidebar);

  if (!isSidebarOpen) {
    return (
      <aside
        className="w-[56px] shrink-0 mr-2 md:mr-3 rounded-xl border border-[#1d2a3d] bg-[#101a2b] text-slate-200 flex flex-col overflow-hidden shadow-[0_12px_28px_rgba(15,23,42,0.22)]"
        aria-label="Primary navigation"
      >
        <button
          type="button"
          onClick={toggleSidebar}
          className="mx-2 mt-3 mb-2 flex h-9 w-9 items-center justify-center rounded-md border border-[#304261] text-slate-300 hover:bg-[#17263f] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[#101a2b]"
          aria-label="Expand sidebar"
          title="Expand sidebar"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <div className="mx-2 mb-2 flex h-9 w-9 items-center justify-center rounded-md bg-[#dce8ff] text-[#0b3d91]">
          <Wrench className="h-4 w-4" />
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-1 space-y-1">
          {NAV_ITEMS.map((item) => {
            const active = isActivePath(location.pathname, item.path);
            return (
              <Link
                key={`${item.label}-${item.path}`}
                to={item.path}
                title={item.label}
                aria-label={item.label}
                onMouseEnter={() => prefetchNavPath(item.path)}
                onFocus={() => prefetchNavPath(item.path)}
                className={`group relative flex h-9 w-9 items-center justify-center rounded-md border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-400/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[#101a2b] ${
                  active
                    ? 'border-[#3f69ab] bg-[#1f3558] text-white'
                    : 'border-transparent text-slate-400 hover:bg-[#17263f] hover:text-white'
                }`}
              >
                <item.icon className="h-4 w-4" />
                <span className="pointer-events-none absolute left-full top-1/2 z-20 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md border border-[#23334b] bg-[#0e1727] px-2 py-1 text-[11px] font-medium text-slate-100 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col items-center gap-1 border-t border-[#23334b] bg-[#0e1727] px-2 py-2">
          <span
            className="flex h-6 w-full items-center justify-center rounded-sm bg-[#17263f] px-1 text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-400"
            title={userEmail || 'Estimator User'}
            aria-hidden
          >
            {(userEmail || 'EN').slice(0, 2).toUpperCase()}
          </span>
          <button
            type="button"
            onClick={signOut}
            title="Sign Out"
            aria-label="Sign Out"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-[#304261] text-slate-300 outline-none hover:bg-[#17263f] hover:text-white focus-visible:ring-2 focus-visible:ring-blue-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0e1727]"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside
      className="w-[240px] shrink-0 mr-2 md:mr-3 rounded-xl border border-[#1d2a3d] bg-[#101a2b] text-slate-200 flex flex-col overflow-hidden shadow-[0_12px_28px_rgba(15,23,42,0.22)]"
      aria-label="Primary navigation"
    >
      <div className="px-4 py-4 border-b border-[#23334b] flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-md bg-[#dce8ff] text-[#0b3d91] grid place-items-center">
          <Wrench className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-[0.08em] text-slate-400">Brighten Builders</p>
          <p className="text-sm font-semibold leading-tight text-white">Estimator OS</p>
        </div>
        <button
          type="button"
          onClick={toggleSidebar}
          className="shrink-0 rounded-md border border-[#304261] p-1.5 text-slate-300 hover:bg-[#17263f] hover:text-white"
          title="Collapse sidebar"
          aria-label="Collapse sidebar"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      <div className="px-4 pt-3">
        <p className="text-[10px] uppercase tracking-[0.08em] text-slate-500">Workspace</p>
      </div>

      <nav className="p-2.5 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const active = isActivePath(location.pathname, item.path);
          return (
            <Link
              key={`${item.label}-${item.path}`}
              to={item.path}
              onMouseEnter={() => prefetchNavPath(item.path)}
              onFocus={() => prefetchNavPath(item.path)}
              className={`h-9 px-2.5 rounded-md flex items-center gap-2.5 text-sm transition-all outline-none focus-visible:ring-2 focus-visible:ring-blue-400/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[#101a2b] ${
                active ? 'bg-[#1f3558] text-white border border-[#3f69ab]' : 'text-slate-300 border border-transparent hover:bg-[#17263f] hover:text-white'
              }`}
            >
              <item.icon className={`w-4 h-4 ${active ? 'text-[#dce8ff]' : 'text-slate-400'}`} />
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-[#23334b] p-3.5 bg-[#0e1727]">
        <p className="text-[11px] text-slate-400">Signed in</p>
        <p className="text-sm font-medium truncate text-slate-100">{userEmail || 'Estimator User'}</p>
        <button
          type="button"
          onClick={signOut}
          className="mt-2 h-8 w-full rounded-md border border-[#304261] text-slate-200 text-xs font-medium outline-none hover:bg-[#17263f] flex items-center justify-center gap-1.5 focus-visible:ring-2 focus-visible:ring-blue-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0e1727]"
        >
          <LogOut className="w-3.5 h-3.5" /> Sign Out
        </button>
      </div>
    </aside>
  );
}
