import type { ProjectStructuredAssumption } from '../types/estimator.ts';

export const PROJECT_BLOCKING_RULE_ID = 'blocking_status';

/** Install-intelligence values for `blocking_status`. */
export type InstallBlockingStatus = 'included' | 'by_others' | 'unknown';

export function normalizeBlockingStatusForInstall(
  raw: string | null | undefined,
): InstallBlockingStatus | undefined {
  const text = String(raw ?? '').trim().toLowerCase();
  if (!text) return undefined;
  if (text === 'included' || text.includes('included')) return 'included';
  if (
    text === 'by_others'
    || text === 'by others'
    || text.includes('by other')
    || text.includes('by_other')
  ) {
    return 'by_others';
  }
  if (text === 'unknown' || text.includes('unknown')) return 'unknown';
  return undefined;
}

export function readBlockingStatusFromStructuredAssumptions(
  structuredAssumptions?: ProjectStructuredAssumption[] | null,
): InstallBlockingStatus | undefined {
  if (!Array.isArray(structuredAssumptions)) return undefined;
  const row = structuredAssumptions.find((a) => a?.ruleId === PROJECT_BLOCKING_RULE_ID);
  if (!row) return undefined;
  return normalizeBlockingStatusForInstall(row.text);
}

export function buildProjectAssumptionsForInstall(input: {
  wallSubstrate?: string | null;
  structuredAssumptions?: ProjectStructuredAssumption[] | null;
  blockingStatus?: InstallBlockingStatus | null;
}): Record<string, string | undefined> {
  const wallSubstrate = normalizeWallSubstrateForInstall(input.wallSubstrate);
  const blockingStatus =
    input.blockingStatus ?? readBlockingStatusFromStructuredAssumptions(input.structuredAssumptions);
  return {
    ...(wallSubstrate ? { wallSubstrate } : {}),
    ...(blockingStatus ? { blocking_status: blockingStatus } : {}),
  };
}

function normalizeWallSubstrateForInstall(value: string | null | undefined): string | undefined {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return undefined;
  if (raw.includes('tile')) return 'tile';
  if (raw.includes('gypsum') || raw.includes('drywall')) return 'gypsum';
  return raw;
}
