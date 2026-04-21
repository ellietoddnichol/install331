/** Primary workflow steps inside `/project/:id/<step>` (`?view=` only for estimate quantities). */
export type WorkspaceTab = 'overview' | 'setup' | 'scope-review' | 'estimate' | 'proposal';

export const WORKSPACE_TABS: WorkspaceTab[] = ['overview', 'setup', 'scope-review', 'estimate', 'proposal'];

/** Estimate tab: quantities (legacy takeoff) vs pricing (per-room dollars). */
export type EstimateWorkspaceView = 'quantities' | 'pricing';
