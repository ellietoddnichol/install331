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
 * Horizontal numbered mono tabs. Matches the workstation aesthetic:
 *   01 OVERVIEW   02 INTAKE   03 SCOPE REVIEW   04 SCOPE TABLE   05 PROPOSAL
 *
 * On the right, a mono SESSION UUID chip shows a short form of the project id
 * so the estimator always knows which record they are editing.
 */
export function ProjectStepNav({ projectId, items, trailing }: ProjectStepNavProps) {
  // Keep secondary steps (Overview / Project meta) tucked to the left as lower
  // numbers, then main estimator workflow. Simpler — just respect order.
  const primary = items.filter((i) => i.tier !== 'secondary');
  const secondary = items.filter((i) => i.tier === 'secondary');
  const ordered = [...secondary, ...primary];

  const uuidShort = projectId.length > 10 ? `${projectId.slice(0, 8).toUpperCase()}` : projectId.toUpperCase();

  return (
    <div className="sticky top-[calc(var(--workspace-header-h,88px)-1px)] z-20 -mx-4 mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-slate-200/80 bg-white/95 px-4 pb-1 pt-2 backdrop-blur-md supports-[backdrop-filter]:bg-white/85 md:-mx-6 md:px-6">
      <nav className="flex min-w-0 flex-1 flex-wrap items-center gap-x-5 gap-y-1 overflow-x-auto">
        {ordered.map((item, idx) => (
          <NavLink
            key={item.id}
            to={projectWorkspacePath(projectId, item.id)}
            className={({ isActive }) =>
              `ui-tab-numbered ${isActive ? 'ui-tab-numbered-active' : ''}`
            }
          >
            <span className="ui-tab-numbered-num">{String(idx + 1).padStart(2, '0')}</span>
            <span>{item.label}</span>
            {item.badge != null && item.badge > 0 ? (
              <span className="ml-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-100 px-1 text-[9px] font-bold tabular-nums text-amber-900">
                {item.badge}
              </span>
            ) : null}
          </NavLink>
        ))}
      </nav>
      <div className="flex shrink-0 items-center gap-2">
        <span className="ui-mono-id whitespace-nowrap text-slate-500">
          SESSION UUID: {uuidShort}
        </span>
        {trailing ? <div className="flex items-center">{trailing}</div> : null}
      </div>
    </div>
  );
}
