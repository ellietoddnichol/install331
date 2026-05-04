import { buildWarningPenaltyFromWarningStrings } from './parseWarningPenalty.ts';

function clamp(value: number): number {
  return Number(Math.max(0, Math.min(1, value)).toFixed(2));
}

/** Minimal line shape for step-5 review (ProjectIntake `LineSuggestion`). */
export interface ReviewLineConfidenceInput {
  include: boolean;
  roomName: string;
  category: string | null;
  qty: number | null;
  unit: string;
  matched: boolean;
  sku: string | null;
  catalogItemId: string | null;
  matchConfidence?: 'strong' | 'possible' | 'none';
}

function scoreReviewLine(line: ReviewLineConfidenceInput): number {
  let score = 0.42;
  if (String(line.roomName || '').trim()) score += 0.04;
  if (String(line.category || '').trim()) score += 0.04;
  if (line.qty !== null && Number(line.qty) > 0) score += 0.05;
  if (String(line.unit || '').trim()) score += 0.03;

  if (line.catalogItemId) {
    if (line.matchConfidence === 'strong') score += 0.30;
    else if (line.matchConfidence === 'possible') score += 0.18;
    else score += 0.22;
  } else if (line.matched && String(line.sku || '').trim()) {
    score += 0.14;
  } else if (line.matched) {
    score += 0.06;
  } else {
    score -= 0.08;
  }

  return clamp(score);
}

export interface ReviewStepConfidenceParams {
  validationWarnings: string[];
  parseWarnings: string[];
  intakeWarnings: string[];
  validationErrors: string[];
  /** Server parse overall; used when there are no included lines. */
  baseline: number | null;
}

/**
 * Recompute overall confidence from the current review grid so fixing catalog matches updates the %.
 * Mirrors server weighting loosely; uses the same warning penalty as `buildParseConfidenceSummary`.
 */
export function computeReviewStepOverallConfidence(
  lines: ReviewLineConfidenceInput[],
  params: ReviewStepConfidenceParams
): number {
  const included = lines.filter((l) => l.include);
  if (included.length === 0) {
    return typeof params.baseline === 'number' && Number.isFinite(params.baseline) ? clamp(params.baseline) : 0;
  }

  const itemAvg = clamp(included.reduce((sum, line) => sum + scoreReviewLine(line), 0) / included.length);

  const mergedWarnings = [
    ...params.validationWarnings,
    ...params.parseWarnings,
    ...params.intakeWarnings,
  ];
  const warningPenalty = buildWarningPenaltyFromWarningStrings(mergedWarnings, included.length);
  const errorPenalty = params.validationErrors.length * 0.08;

  return clamp(itemAvg - warningPenalty - errorPenalty);
}
