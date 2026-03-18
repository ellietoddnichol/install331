import { IntakeConfidenceSummary, IntakeParseDiagnostics, IntakeProjectMetadata, IntakeReviewLine, IntakeSourceKind } from '../../shared/types/intake.ts';

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

  return {
    parserStrategy: input.parseStrategy,
    parseStrategy: input.parseStrategy,
    sourceKind: input.sourceKind,
    metadataSources: input.metadata.sources,
    warnings: Array.from(new Set(input.warnings.filter(Boolean))),
    totalLines: input.reviewLines.length,
    completeLines: input.reviewLines.filter((line) => line.completeness === 'complete').length,
    matchedLines,
    needsMatchLines,
    modelUsed: input.modelUsed,
    confidenceSummary,
    webEnrichmentUsed: Boolean(input.webEnrichmentUsed),
  };
}
