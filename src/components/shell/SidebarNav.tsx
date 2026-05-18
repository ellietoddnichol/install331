import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Activity,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FolderOpen,
  HardHat,
  LayoutDashboard,
  LogOut,
  Settings,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useWorkspaceStore } from '../../stores/workspaceStore.ts';

const MAIN_NAV = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/projects', label: 'Projects', icon: FolderOpen },
];

const WORKFLOW_NAV = [
  { path: '/projects', label: 'Needs Review', icon: ClipboardList, match: 'project' as const },
  { path: '/projects', label: 'Ready to Import', icon: HardHat, match: 'project' as const },
];

const TOOLS_NAV = [
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

  const linkClass = (active: boolean, compact: boolean) => {
    const base = compact
      ? 'group relative flex h-9 w-9 items-center justify-center rounded-lg outline-none transition focus-visible:ring-2 focus-visible:ring-orange-500/50'
      : 'flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm transition outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50';
    if (active) {
      return `${base} bg-[var(--fo-sidebar-active-bg)] text-[var(--fo-sidebar-text-bright)] font-semibold ring-1 ring-orange-500/30`;
    }
    return `${base} text-[var(--fo-sidebar-text)] hover:bg-[var(--fo-sidebar-bg-hover)] hover:text-[var(--fo-sidebar-text-bright)]`;
  };

  const shellClass = isSidebarOpen
    ? 'w-[248px] shrink-0 flex flex-col overflow-hidden border-r border-[var(--fo-sidebar-border)] bg-[var(--fo-sidebar-bg)] text-[var(--fo-sidebar-text)]'
    : 'w-[56px] shrink-0 flex flex-col overflow-hidden border-r border-[var(--fo-sidebar-border)] bg-[var(--fo-sidebar-bg)] text-[var(--fo-sidebar-text)]';

  return (
    <aside className={shellClass} aria-label="Primary navigation">
      <div className={`border-b border-[var(--fo-sidebar-border)] ${isSidebarOpen ? 'px-4 py-4' : 'p-2 flex flex-col items-center gap-2'}`}>
        {isSidebarOpen ? (
          <>
            <div className="flex items-center gap-2.5">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-orange-600 text-xs font-bold text-white">FO</div>
              <div className="min-w-0 flex-1">
                <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">Field Ops</p>
                <p className="truncate text-sm font-semibold text-white">Estimating</p>
              </div>
              <button
                type="button"
                onClick={toggleSidebar}
                className="rounded-md border border-slate-600 p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white"
                aria-label="Collapse sidebar"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </div>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={toggleSidebar}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-600 text-slate-400 hover:bg-slate-700"
              aria-label="Expand sidebar"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-600 text-[10px] font-bold text-white">
              FO
            </div>
          </>
        )}
      </div>

      <nav className={`flex-1 overflow-y-auto ${isSidebarOpen ? 'px-2.5 py-3' : 'px-2 py-2'}`}>
        {MAIN_NAV.map((item) => {
          const active = isActivePath(location.pathname, item.path);
          return (
            <Link key={item.path} to={item.path} title={item.label} className={linkClass(active, !isSidebarOpen)}>
              {active && isSidebarOpen ? (
                <span className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full bg-orange-500" aria-hidden />
              ) : null}
              <item.icon className="h-4 w-4 shrink-0" />
              {isSidebarOpen ? <span>{item.label}</span> : null}
            </Link>
          );
        })}

        {isSidebarOpen ? (
          <p className="mb-1 mt-4 px-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500">Work queue</p>
        ) : null}
        {WORKFLOW_NAV.map((item) => (
          <Link
            key={item.label}
            to={item.path}
            title={item.label}
            className={`${linkClass(location.pathname.startsWith('/project'), !isSidebarOpen)} ${isSidebarOpen ? 'mt-0.5' : 'mt-1'}`}
          >
            <item.icon className="h-4 w-4 shrink-0 opacity-80" />
            {isSidebarOpen ? <span className="text-[13px]">{item.label}</span> : null}
          </Link>
        ))}

        {isSidebarOpen ? (
          <p className="mb-1 mt-4 px-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500">Tools</p>
        ) : null}
        {TOOLS_NAV.map((item) => {
          const active = isActivePath(location.pathname, item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              title={item.label}
              className={`${linkClass(active, !isSidebarOpen)} ${!isSidebarOpen ? 'mt-1' : 'mt-0.5'}`}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {isSidebarOpen ? <span>{item.label}</span> : null}
            </Link>
          );
        })}

        <div className={isSidebarOpen ? 'mt-4 border-t border-slate-700 pt-3' : 'mt-2 border-t border-slate-700 pt-2'}>
          <Link
            to={ADMIN_ITEM.path}
            title={ADMIN_ITEM.label}
            className={linkClass(isActivePath(location.pathname, ADMIN_ITEM.path), !isSidebarOpen)}
          >
            <ADMIN_ITEM.icon className="h-4 w-4 shrink-0" />
            {isSidebarOpen ? <span>{ADMIN_ITEM.label}</span> : null}
          </Link>
        </div>
      </nav>

      <div className={`border-t border-[var(--fo-sidebar-border)] ${isSidebarOpen ? 'p-3.5' : 'p-2 flex flex-col items-center'}`}>
        {isSidebarOpen ? (
          <>
            <p className="text-[10px] text-slate-500">Signed in</p>
            <p className="truncate text-sm font-medium text-slate-200">{userEmail || 'Estimator'}</p>
          </>
        ) : null}
        <button
          type="button"
          onClick={signOut}
          className={
            isSidebarOpen
              ? 'mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-slate-600 text-xs font-medium text-slate-300 hover:bg-slate-700'
              : 'mt-1 flex h-8 w-8 items-center justify-center rounded-lg border border-slate-600 text-slate-400 hover:bg-slate-700'
          }
          aria-label="Sign out"
        >
          <LogOut className="h-3.5 w-3.5" />
          {isSidebarOpen ? 'Sign out' : null}
        </button>
        {isSidebarOpen ? (
          <button
            type="button"
            onClick={toggleSidebar}
            className="mt-2 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] text-slate-500 hover:bg-slate-700 hover:text-slate-300"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Collapse
          </button>
        ) : null}
      </div>
    </aside>
  );
}

