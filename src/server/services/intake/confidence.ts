import type { NormalizedIntakeItem, ParseConfidenceSummary, ValidationResult } from '../../../shared/types/intake.ts';

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value: number): number {
  return Number(Math.max(0, Math.min(1, value)).toFixed(2));
}

function normalizeWarningSignature(warning: string): string {
  return String(warning || '')
    .toLowerCase()
    .replace(/item\s+[a-z0-9 _./:-]+/g, 'item <source>')
    .replace(/from header\s+"[^"]+"/g, 'from header <header>')
    .replace(/\([^\)]*\)/g, '(<detail>)')
    .replace(/\b\d+(?:\.\d+)?\b/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildWarningPenalty(validation: ValidationResult, itemCount: number): number {
  if (!validation.warnings.length) return 0;

  const uniqueWarningSignatures = new Set(validation.warnings.map(normalizeWarningSignature)).size;
  const repeatedWarningCount = Math.max(0, validation.warnings.length - uniqueWarningSignatures);
  const uniquePenalty = uniqueWarningSignatures * 0.025;
  const repeatedPenalty = Math.min(0.08, repeatedWarningCount * 0.0015);
  const coveragePenalty = itemCount > 0
    ? Math.min(0.06, (uniqueWarningSignatures / Math.max(itemCount, 1)) * 0.35)
    : 0.06;

  return Math.min(0.22, uniquePenalty + repeatedPenalty + coveragePenalty);
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
    else if (bestCatalogCandidate) score += Math.min(0.08, bestCatalogCandidate.confidence * 0.08);
    if (item.reviewRequired) score -= 0.05;
    return clamp(score);
  });

  const itemConfidenceAverage = clamp(average(perItem));
  const warningPenalty = buildWarningPenalty(validation, items.length);
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