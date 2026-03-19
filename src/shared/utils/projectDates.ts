import { ProjectRecord } from '../types/estimator';

type ProjectDateLike = Pick<ProjectRecord, 'bidDate' | 'proposalDate' | 'dueDate'>;

export function getCanonicalProjectDate(project: ProjectDateLike): string | null {
  return project.bidDate || project.proposalDate || project.dueDate || null;
}

export function getCanonicalProjectDateTimestamp(project: ProjectDateLike): number | null {
  const value = getCanonicalProjectDate(project);
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}