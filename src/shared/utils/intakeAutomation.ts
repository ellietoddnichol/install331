import type { IntakeCatalogAutoApplyTier, IntakeReviewLine } from '../types/intake';

export type { IntakeCatalogAutoApplyTier };

/** Normalize UOM for Tier A unit compatibility (strict). */
export function normalizeIntakeUom(u: string | null | undefined): string {
  const x = String(u || 'EA')
    .trim()
    .toUpperCase();
  if (x === 'EACH' || x === 'UNIT' || x === 'UNIT(S)') return 'EA';
  return x || 'EA';
}

export function intakeLineUnitsCompatible(lineUnit: string | null | undefined, catalogUom: string | null | undefined): boolean {
  return normalizeIntakeUom(lineUnit) === normalizeIntakeUom(catalogUom);
}

/**
 * Tier A: strong catalog match, score floor, compatible units.
 * Tier B: has catalog or suggested match but not Tier A, or incomplete.
 * Tier C: no usable match.
 */
export function computeCatalogAutoApplyTier(
  line: Pick<IntakeReviewLine, 'catalogMatch' | 'suggestedMatch' | 'unit' | 'warnings' | 'matchStatus'>,
  tierAMinScore: number
): IntakeCatalogAutoApplyTier {
  const minScore = Number.isFinite(tierAMinScore) ? Math.min(1, Math.max(0.3, tierAMinScore)) : 0.82;
  const cm = line.catalogMatch;
  if (
    cm &&
    cm.confidence === 'strong' &&
    typeof cm.score === 'number' &&
    cm.score >= minScore &&
    intakeLineUnitsCompatible(line.unit, cm.unit)
  ) {
    return 'A';
  }
  if (cm || line.suggestedMatch) return 'B';
  if (line.matchStatus === 'needs_match') return 'C';
  return 'C';
}
