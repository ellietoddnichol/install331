import React, { useMemo } from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { projectWorkspacePath } from '../../shared/utils/projectWorkspaceRoutes.ts';
import { tabFromSearchParam } from '../../shared/utils/projectWorkspaceSession.ts';

/**
 * `/project/:id` → `/project/:id/estimate` (legacy default).
 * `/project/:id?tab=…` → `/project/:id/<tab>` preserving other query keys (`view`, `scopeChecked`, …).
 */
export function ProjectWorkspaceIndexRedirect() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const target = useMemo(() => {
    if (!id) return '/projects';
    const tabQ = searchParams.get('tab');
    const step = tabFromSearchParam(tabQ);
    const nextQs = new URLSearchParams(searchParams);
    nextQs.delete('tab');
    const suffix = nextQs.toString() ? `?${nextQs.toString()}` : '';
    return `${projectWorkspacePath(id, step)}${suffix}`;
  }, [id, searchParams]);

  if (!id) return <Navigate to="/projects" replace />;
  return <Navigate to={target} replace />;
}
