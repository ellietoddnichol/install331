import type { PricingMode, ProjectRecord } from '../types/estimator';
import { getCanonicalProjectDateTimestamp } from './projectDates';

/** UX-facing status for dashboard + project list filters (quote-driven workflow). */
export type DashboardDisplayStatus = 'draft' | 'estimate' | 'proposal_ready' | 'won' | 'archived';

function nonEmpty(s: string | null | undefined): boolean {
  return Boolean(String(s ?? '').trim());
}

/**
 * Setup completeness for splitting Draft → Draft vs Estimate (no quote/line APIs on dashboard).
 * Mirrors the conservative checks in `projectWorkspaceReadiness` (minus company labor rate).
 */
export function isDashboardSetupComplete(project: ProjectRecord): boolean {
  return nonEmpty(project.projectName) && nonEmpty(project.clientName) && nonEmpty(project.address);
}

export function getDashboardDisplayStatus(project: ProjectRecord): DashboardDisplayStatus {
  const s = project.status;
  if (s === 'Archived' || s === 'Lost') return 'archived';
  if (s === 'Awarded') return 'won';
  if (s === 'Submitted') return 'proposal_ready';
  if (s === 'Draft') {
    return isDashboardSetupComplete(project) ? 'estimate' : 'draft';
  }
  return 'estimate';
}

export function isDashboardActiveProject(project: ProjectRecord): boolean {
  return project.status !== 'Archived' && project.status !== 'Lost';
}

export function countByDashboardDisplayStatus(projects: ProjectRecord[], status: DashboardDisplayStatus): number {
  return projects.filter((p) => getDashboardDisplayStatus(p) === status).length;
}

export function formatDashboardProposalMode(mode: PricingMode | string | null | undefined): string {
  const m = String(mode || '');
  if (m === 'labor_and_material' || m === 'material_with_optional_install_quote') return 'Full';
  if (m === 'material_only') return 'Material Only';
  if (m === 'labor_only') return 'Install Only';
  return 'Full';
}

export function dashboardStatusLabel(status: DashboardDisplayStatus): string {
  switch (status) {
    case 'draft':
      return 'Draft';
    case 'estimate':
      return 'Estimate';
    case 'proposal_ready':
      return 'Proposal Ready';
    case 'won':
      return 'Won';
    case 'archived':
      return 'Archived';
  }
}

export function dashboardStatusBadgeTone(
  status: DashboardDisplayStatus,
): 'draft' | 'progress' | 'ready' | 'neutral' | 'imported' {
  switch (status) {
    case 'draft':
      return 'draft';
    case 'estimate':
      return 'progress';
    case 'proposal_ready':
      return 'ready';
    case 'won':
      return 'imported';
    case 'archived':
      return 'neutral';
  }
}

export function countBidsDueThisWeek(projects: ProjectRecord[]): number {
  const now = Date.now();
  const inSevenDays = now + 7 * 24 * 60 * 60 * 1000;
  return projects.filter((project) => {
    if (!isDashboardActiveProject(project)) return false;
    const due = getCanonicalProjectDateTimestamp(project);
    if (due === null) return false;
    return due >= now && due <= inSevenDays;
  }).length;
}

export function hasBidDueDateData(projects: ProjectRecord[]): boolean {
  return projects.some((p) => getCanonicalProjectDateTimestamp(p) !== null);
}

export interface NextActionLink {
  label: string;
  href: string;
}

/**
 * Heuristic next step when full workspace readiness inputs are not loaded.
 * Prefer wiring `computeNextBestAction` in workspace; refine when project list returns quote/estimate snapshots.
 */
export function getDashboardNextAction(project: ProjectRecord): NextActionLink {
  const id = project.id;
  if (project.status === 'Archived' || project.status === 'Lost') {
    return { label: 'Open project', href: `/project/${id}/overview` };
  }
  if (project.status === 'Awarded') {
    return { label: 'Open project', href: `/project/${id}/overview` };
  }
  if (project.status === 'Submitted') {
    return { label: 'Preview proposal', href: `/project/${id}/proposal` };
  }
  if (project.status === 'Draft' && !isDashboardSetupComplete(project)) {
    return { label: 'Finish setup', href: `/project/${id}/setup` };
  }
  return { label: 'Open quotes', href: `/project/${id}/quotes` };
}
