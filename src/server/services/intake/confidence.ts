import type { NormalizedIntakeItem, ParseConfidenceSummary, ValidationResult } from '../../../shared/types/intake.ts';
import { buildWarningPenaltyFromWarningStrings } from '../../../shared/utils/parseWarningPenalty.ts';

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value: number): number {
  return Number(Math.max(0, Math.min(1, value)).toFixed(2));
}

export function buildParseConfidenceSummary(items: NormalizedIntakeItem[], validation: ValidationResult): ParseConfidenceSummary {
  const requiresReview = items.some((item) => item.reviewRequired);
  const perItem = items.map((item) => {
    let score = Number(item.confidence) || 0;
    if (item.roomName) score += 0.04;
    if (item.category) score += 0.04;
    if (item.quantity !== null) score += 0.05;
    if (item.unit) score += 0.03;
    if (item.manufacturer || item.model || item.finish) score += 0.03;
    if (item.itemType === 'modifier') score -= 0.04;
    if (item.alternate || item.exclusion) score -= 0.03;
    const bestCatalogCandidate = item.catalogMatchCandidates?.[0];
    if (bestCatalogCandidate?.matchMethod === 'unmatched') score -= 0.08;
    else if (bestCatalogCandidate) {
      const c = bestCatalogCandidate.confidence;
      const method = bestCatalogCandidate.matchMethod;
      if (method === 'exact' || (c >= 0.88 && (method === 'model' || method === 'dimension'))) {
        score += 0.24;
      } else if (c >= 0.72 || method === 'model') {
        score += 0.17;
      } else if (c >= 0.48) {
        score += 0.11;
      } else {
        score += Math.min(0.09, c * 0.14);
      }
    }
    if (item.reviewRequired) {
      const best = item.catalogMatchCandidates?.[0];
      const catalogStrong =
        best &&
        best.matchMethod !== 'unmatched' &&
        !best.catalogCoverageGap &&
        best.confidence >= 0.78;
      if (!catalogStrong) score -= 0.05;
    }
    return clamp(score);
  });

  const itemConfidenceAverage = clamp(average(perItem));
  const warningPenalty = buildWarningPenaltyFromWarningStrings(validation.warnings, items.length);
  const overallConfidence = clamp(itemConfidenceAverage - warningPenalty - (validation.errors.length * 0.08));
  const lowConfidenceItems = items
    .filter((_item, index) => perItem[index] < 0.5)
    .map((item) => `${item.sourceRef.fileName}:${item.sourceRef.sheetName || item.sourceRef.pageNumber || item.sourceRef.chunkId || 'unknown'}`);

  const hasHardFailures = validation.errors.length > 0 || items.length === 0;
  const recommendedAction = overallConfidence >= 0.78 && validation.errors.length === 0 && !requiresReview
    ? 'auto-import'
    : !hasHardFailures && (requiresReview || overallConfidence >= 0.32)
      ? 'review-before-import'
      : 'manual-template';

  return {
    overallConfidence,
    itemConfidenceAverage,
    lowConfidenceItems,
    recommendedAction,
  };
}