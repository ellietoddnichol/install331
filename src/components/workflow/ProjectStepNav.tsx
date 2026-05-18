import React from 'react';
import { NavLink } from 'react-router-dom';
import type { WorkspaceTab } from '../../shared/types/projectWorkflow';
import { projectWorkspacePath } from '../../shared/utils/projectWorkspaceRoutes.ts';

export interface ProjectStepNavItem {
  id: WorkspaceTab;
  label: string;
  badge?: number;
  /** Secondary steps appear as lower-contrast mono tabs at the tail end. */
  tier?: 'primary' | 'secondary';
}

interface ProjectStepNavProps {
  projectId: string;
  items: ProjectStepNavItem[];
  /** Optional trailing action (e.g., Sync catalog button). Rendered to the right of the SESSION UUID chip. */
  trailing?: React.ReactNode;
}

/**
 * Primary project workspace tabs (Overview → Proposal).
 */
export function ProjectStepNav({ projectId, items, trailing }: ProjectStepNavProps) {
  // Keep secondary steps (Overview / Project meta) tucked to the left as lower
  // numbers, then main estimator workflow. Simpler — just respect order.
  const primary = items.filter((i) => i.tier !== 'secondary');
  const secondary = items.filter((i) => i.tier === 'secondary');
  const ordered = [...secondary, ...primary];

  return (
    <div className="z-10 mb-4 flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-1 pb-0 pt-1">
      <nav className="flex min-w-0 flex-1 flex-wrap items-center gap-1 overflow-x-auto" aria-label="Project workspace">
        {ordered.map((item) => (
          <NavLink
            key={item.id}
            to={projectWorkspacePath(projectId, item.id)}
            className={({ isActive }) =>
              `ui-fo-tab rounded-t-lg border-b-2 px-4 py-2 text-[13px] ${
                isActive ? 'ui-fo-tab-active border-orange-500 bg-orange-50/50' : 'border-transparent hover:bg-slate-50'
              }`
            }
          >
            <span>{item.label}</span>
            {item.badge != null && item.badge > 0 ? (
              <span className="ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-orange-100 px-1 text-[9px] font-bold tabular-nums text-orange-900">
                {item.badge}
              </span>
            ) : null}
          </NavLink>
        ))}
      </nav>
      {trailing ? <div className="flex shrink-0 items-center">{trailing}</div> : null}
    </div>
  );
}
