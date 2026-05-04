import type { WorkspaceTab } from '../types/projectWorkflow';

/** URL segment for each workspace step (`/project/:id/:workspaceStep`). */
export const WORKSPACE_STEP_PATHS: WorkspaceTab[] = [
  'overview',
  'setup',
  'scope-review',
  'estimate',
  'proposal',
];

const STEP_SET = new Set<string>(WORKSPACE_STEP_PATHS);

export function isValidWorkspaceStep(segment: string | undefined): segment is WorkspaceTab {
  return segment != null && STEP_SET.has(segment);
}

export function workspaceTabFromPathSegment(segment: string | undefined): WorkspaceTab | null {
  if (!segment) return null;
  return isValidWorkspaceStep(segment) ? segment : null;
}

export function projectWorkspacePath(projectId: string, tab: WorkspaceTab): string {
  return `/project/${projectId}/${tab}`;
}
