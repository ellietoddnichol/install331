import type { ProjectRecord } from '../types/estimator';
import { normalizeProjectJobConditions } from './jobConditions';

/** Canonical JSON for autosave dirty checks — avoids missed saves when key order or nested shapes differ. */
export function fingerprintProjectStable(p: ProjectRecord): string {
  const { updatedAt: _u, createdAt: _c, ...rest } = p;
  const normalized = {
    ...rest,
    jobConditions: normalizeProjectJobConditions(rest.jobConditions),
    selectedScopeCategories: [...(rest.selectedScopeCategories || [])].sort(),
  };
  return stableStringify(normalized);
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}
