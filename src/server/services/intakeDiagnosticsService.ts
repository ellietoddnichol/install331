import type { IntakeConfidenceSummary, IntakeParseDiagnostics, IntakeProjectMetadata, IntakeReviewLine, IntakeSourceKind } from '../../shared/types/intake.ts';

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function buildConfidenceSummary(metadata: IntakeProjectMetadata, reviewLines: IntakeReviewLine[]): IntakeConfidenceSummary {
  const lineExtraction = average(reviewLines.map((line) => Number(line.confidence) || 0));
  const matching = reviewLines.length === 0
    ? 0
    : reviewLines.filter((line) => line.matchStatus !== 'needs_match').length / reviewLines.length;
  const overall = average([metadata.confidence || 0, lineExtraction, matching]);

  return {
    metadata: Number((metadata.confidence || 0).toFixed(2)),
    lineExtraction: Number(lineExtraction.toFixed(2)),
    matching: Number(matching.toFixed(2)),
    overall: Number(overall.toFixed(2)),
  };
}

export function buildIntakeDiagnostics(input: {
  sourceKind: IntakeSourceKind;
  parseStrategy: string;
  metadata: IntakeProjectMetadata;
  reviewLines: IntakeReviewLine[];
  warnings: string[];
  modelUsed: string;
  webEnrichmentUsed?: boolean;
}): IntakeParseDiagnostics {
  const matchedLines = input.reviewLines.filter((line) => line.matchStatus === 'matched').length;
  const needsMatchLines = input.reviewLines.filter((line) => line.matchStatus === 'needs_match').length;
  const confidenceSummary = buildConfidenceSummary(input.metadata, input.reviewLines);
  const metadataMap: Array<[string, string | undefined]> = [
    ['projectName', input.metadata.projectName],
    ['projectNumber', input.metadata.projectNumber],
    ['bidPackage', input.metadata.bidPackage],
    ['client', input.metadata.client],
    ['generalContractor', input.metadata.generalContractor],
    ['address', input.metadata.address],
    ['bidDate', input.metadata.bidDate],
    ['proposalDate', input.metadata.proposalDate],
    ['estimator', input.metadata.estimator],
  ];
  const metadataFound = metadataMap.filter(([, value]) => Boolean(String(value || '').trim())).map(([key]) => key);
  const metadataMissing = metadataMap.filter(([, value]) => !String(value || '').trim()).map(([key]) => key);
  const confidenceNarrative = confidenceSummary.overall >= 0.8
    ? 'High confidence parse with strong metadata and line coverage.'
    : confidenceSummary.overall >= 0.6
      ? 'Moderate confidence parse. Review unmatched lines and any missing metadata.'
      : 'Low confidence parse. Review metadata and parsed lines before creating records.';

  return {
    parserStrategy: input.parseStrategy,
    parseStrategy: input.parseStrategy,
    sourceKind: input.sourceKind,
    metadataSources: input.metadata.sources,
    metadataFound,
    metadataMissing,
    warnings: Array.from(new Set(input.warnings.filter(Boolean))),
    totalLines: input.reviewLines.length,
    completeLines: input.reviewLines.filter((line) => line.completeness === 'complete').length,
    matchedLines,
    needsMatchLines,
    modelUsed: input.modelUsed,
    confidenceSummary,
    confidenceNarrative,
    webEnrichmentUsed: Boolean(input.webEnrichmentUsed),
  };
}
