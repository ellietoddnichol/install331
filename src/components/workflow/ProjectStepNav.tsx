import React from 'react';
import { NavLink } from 'react-router-dom';
import type { WorkspaceTab } from '../../shared/types/projectWorkflow';
import { projectWorkspacePath } from '../../shared/utils/projectWorkspaceRoutes.ts';

export interface ProjectStepNavItem {
  id: WorkspaceTab;
  label: string;
  badge?: number;
  /** Secondary steps appear smaller under a "Project" group. */
  tier?: 'primary' | 'secondary';
}

interface ProjectStepNavProps {
  projectId: string;
  items: ProjectStepNavItem[];
  trailing?: React.ReactNode;
}

function stepClassName({ isActive }: { isActive: boolean }): string {
  return [
    'flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
    isActive
      ? 'border-blue-200 bg-blue-50/90 text-blue-950 shadow-sm'
      : 'border-transparent text-slate-700 hover:border-slate-200 hover:bg-white/80 hover:text-slate-900',
  ].join(' ');
}

export function ProjectStepNav({ projectId, items, trailing }: ProjectStepNavProps) {
  const secondary = items.filter((i) => i.tier === 'secondary');
  const primary = items.filter((i) => i.tier !== 'secondary');

  const renderLink = (t: ProjectStepNavItem) => (
    <NavLink
      key={t.id}
      to={projectWorkspacePath(projectId, t.id)}
      className={({ isActive }) => stepClassName({ isActive })}
    >
      <span className="min-w-0">{t.label}</span>
      {t.badge != null && t.badge > 0 ? (
        <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-amber-950">
          {t.badge}
        </span>
      ) : null}
    </NavLink>
  );

  return (
    <aside className="flex w-full shrink-0 flex-col gap-3 md:w-[220px]">
      <div className="rounded-xl border border-slate-200/90 bg-white/90 p-2 shadow-sm">
        <p className="px-1.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Project</p>
        <nav className="flex flex-col gap-0.5">{secondary.map(renderLink)}</nav>
      </div>
      <div className="rounded-xl border border-slate-200/90 bg-white/90 p-2 shadow-sm">
        <p className="px-1.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Estimate workflow</p>
        <nav className="flex flex-col gap-0.5">{primary.map(renderLink)}</nav>
      </div>
      {trailing ? <div className="flex flex-col gap-1.5 px-0.5">{trailing}</div> : null}
    </aside>
  );
}
