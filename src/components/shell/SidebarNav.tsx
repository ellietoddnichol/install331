import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BookOpen, FolderOpen, LayoutDashboard, LogOut, Settings, Wrench } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/projects', label: 'Projects', icon: FolderOpen },
  { path: '/catalog', label: 'Catalog', icon: BookOpen },
  { path: '/settings', label: 'Settings', icon: Settings },
];

export function SidebarNav() {
  const location = useLocation();
  const { signOut, userEmail } = useAuth();

  return (
    <aside className="w-[248px] shrink-0 mr-2 md:mr-3 rounded-2xl border border-[#1d2a3d] bg-[#101a2b] text-slate-200 flex flex-col overflow-hidden shadow-[0_18px_35px_rgba(15,23,42,0.24)]">
      <div className="px-4 py-4 border-b border-[#23334b] flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-md bg-[#dce8ff] text-[#0b3d91] grid place-items-center">
          <Wrench className="w-4 h-4" />
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Brighten Builders</p>
          <p className="text-sm font-semibold leading-tight text-white">Estimator OS</p>
        </div>
      </div>

      <div className="px-4 pt-3">
        <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Workspace</p>
      </div>

      <nav className="p-2.5 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const active = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
          return (
            <Link
              key={`${item.label}-${item.path}`}
              to={item.path}
              className={`h-9 px-2.5 rounded-md flex items-center gap-2.5 text-sm transition-all ${
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
          onClick={signOut}
          className="mt-2 h-8 w-full rounded-md border border-[#304261] text-slate-200 text-xs font-medium hover:bg-[#17263f] flex items-center justify-center gap-1.5"
        >
          <LogOut className="w-3.5 h-3.5" /> Sign Out
        </button>
      </div>
    </aside>
  );
}
