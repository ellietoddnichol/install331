import type { ProjectJobConditions } from '../types/estimator';
import { extractLeadingPercentFromText } from './jobConditions';
import type {
  IntakeAiLineClassification,
  IntakeAiSuggestions,
  IntakeApplicationStatus,
  IntakeCatalogMatch,
  IntakeEstimateDraft,
  IntakeLineEstimateSuggestion,
  IntakeReviewLine,
  IntakeScopeBucket,
  IntakeSuggestedJobConditionPatch,
} from '../types/intake';

/** Match confidence: treat catalog `strong` as high for bulk accept. */
export const ESTIMATE_REVIEW_HIGH_CONFIDENCE: IntakeCatalogMatch['confidence'] = 'strong';

/** Below this score (when confidence is `none` or `possible`), bulk-ignore targets weak rows. */
export const ESTIMATE_REVIEW_LOW_SCORE_THRESHOLD = 0.45;

export type EstimateReviewLineState = {
  applicationStatus: IntakeApplicationStatus;
  selectedCatalogItemId: string | null;
};

export type EstimateReviewInitial = {
  lineByFingerprint: Record<string, EstimateReviewLineState>;
  jobConditionById: Record<string, IntakeApplicationStatus>;
  projectModifierById: Record<string, IntakeApplicationStatus>;
};

export function buildInitialEstimateReviewState(draft: IntakeEstimateDraft | null | undefined): EstimateReviewInitial {
  if (!draft) {
    return { lineByFingerprint: {}, jobConditionById: {}, projectModifierById: {} };
  }
  const lineByFingerprint: Record<string, EstimateReviewLineState> = {};
  for (const row of draft.lineSuggestions) {
    lineByFingerprint[row.reviewLineFingerprint] = {
      applicationStatus: row.applicationStatus,
      selectedCatalogItemId: row.suggestedCatalogItemId,
    };
  }
  /** Default UX: trust strong catalog matches so review starts closer to “exceptions only”. Server Tier-A / explicit accepts are unchanged. */
  for (const row of draft.lineSuggestions) {
    if (row.scopeBucket !== 'priced_base_scope') continue;
    const fp = row.reviewLineFingerprint;
    const st = lineByFingerprint[fp];
    if (st.applicationStatus !== 'suggested') continue;
    const m = getActiveCatalogMatchForRow(row, st);
    if (m?.confidence === 'strong') {
      lineByFingerprint[fp] = { ...st, applicationStatus: 'accepted' };
    }
  }
  const jobConditionById: Record<string, IntakeApplicationStatus> = {};
  for (const jc of draft.projectSuggestion.suggestedJobConditionsPatch ?? []) {
    jobConditionById[jc.id] = jc.applicationStatus;
  }
  const projectModifierById: Record<string, IntakeApplicationStatus> = {};
  for (const modId of draft.projectSuggestion.suggestedProjectModifierIds) {
    projectModifierById[modId] = 'suggested';
  }
  return { lineByFingerprint, jobConditionById, projectModifierById };
}

const SCOPE_BUCKET_ORDER: IntakeScopeBucket[] = [
  'priced_base_scope',
  'line_condition',
  'project_condition',
  'allowance',
  'deduction_alternate',
  'excluded_by_others',
  'informational_only',
  'unknown',
];

export function groupDraftLinesByScopeBucket(
  lines: IntakeLineEstimateSuggestion[]
): Map<IntakeScopeBucket, IntakeLineEstimateSuggestion[]> {
  const map = new Map<IntakeScopeBucket, IntakeLineEstimateSuggestion[]>();
  for (const b of SCOPE_BUCKET_ORDER) map.set(b, []);
  for (const row of lines) {
    const list = map.get(row.scopeBucket) || [];
    list.push(row);
    map.set(row.scopeBucket, list);
  }
  return map;
}

export function scopeBucketLabel(bucket: IntakeScopeBucket): string {
  const labels: Record<IntakeScopeBucket, string> = {
    priced_base_scope: 'Priced base scope',
    line_condition: 'Line condition',
    project_condition: 'Project condition',
    deduction_alternate: 'Deduction / alternate',
    excluded_by_others: 'Excluded / by others',
    allowance: 'Allowance',
    informational_only: 'Informational',
    unknown: 'Unknown / review',
  };
  return labels[bucket];
}

/** Compact labels for intake review UI (enum unchanged in code). */
export function scopeBucketShortLabel(bucket: IntakeScopeBucket): string {
  const labels: Record<IntakeScopeBucket, string> = {
    priced_base_scope: 'Base scope',
    line_condition: 'Line condition',
    project_condition: 'Project condition',
    deduction_alternate: 'Alternate / deduct',
    excluded_by_others: 'Excluded',
    allowance: 'Allowance',
    informational_only: 'Info only',
    unknown: 'Review',
  };
  return labels[bucket];
}

/** Single-line parsing hint for subtitle; null when nothing useful to show. */
export function formatParsingHintSubtitle(ai: IntakeAiLineClassification | undefined): string | null {
  if (!ai) return null;
  const pr = (ai.pricingRole || '').trim();
  const dk = (ai.documentLineKind || '').trim();
  if (!pr && !dk) return null;
  const parts: string[] = [];
  if (dk) parts.push(dk.replace(/_/g, ' '));
  if (pr) parts.push(pr.replace(/_/g, ' '));
  return parts.length ? `Parsing hint: ${parts.join(' · ')}` : null;
}

/** Short scan-friendly tags derived from matcher reason text (not raw debug). */
export function matchSignalTags(reason: string, matcherSignals?: string[]): string[] {
  const r = String(reason || '').toLowerCase();
  const tags: string[] = [];
  if (/exact item code|exact alias/.test(r)) tags.push('Exact SKU');
  if (/manufacturer\/ model|manufacturer/.test(r)) tags.push('Mfr / model');
  if (/category alignment/.test(r)) tags.push('Category fit');
  if (/cross-line consistency/.test(r)) tags.push('Cross-line match');
  if (/search fields overlap|catalog fields share|search fields weakly/.test(r)) tags.push('Catalog text');
  if (/item name closely|item name strongly|item name partially/.test(r)) tags.push('Name match');
  if (/description tokens strongly|description tokens partially|description text closely/.test(r)) tags.push('Description');
  if (/item code family/.test(r)) tags.push('Code family');
  for (const s of matcherSignals || []) {
    if (s === 'cross_line_top_candidate' && !tags.includes('Cross-line match')) tags.push('Cross-line match');
  }
  return tags.slice(0, 6);
}

export function applicationStatusLabel(status: IntakeApplicationStatus): string {
  const m: Record<IntakeApplicationStatus, string> = {
    suggested: 'Suggested',
    accepted: 'Accepted',
    replaced: 'Replaced',
    ignored: 'Ignored',
  };
  return m[status];
}

export function matchConfidenceTier(confidence: IntakeCatalogMatch['confidence']): 'high' | 'medium' | 'low' {
  if (confidence === 'strong') return 'high';
  if (confidence === 'possible') return 'medium';
  return 'low';
}

export function findReviewLineForFingerprint(
  fingerprint: string,
  reviewLines: IntakeReviewLine[]
): IntakeReviewLine | undefined {
  return reviewLines.find((l) => l.reviewLineFingerprint === fingerprint);
}

export function findAiClassificationForFingerprint(
  fingerprint: string,
  reviewLines: IntakeReviewLine[],
  ai: IntakeAiSuggestions | null | undefined
): IntakeAiLineClassification | undefined {
  const list = ai?.lineClassifications;
  if (!list?.length) return undefined;
  const idx = reviewLines.findIndex((l) => l.reviewLineFingerprint === fingerprint);
  if (idx < 0) return undefined;
  const exact = list.find((c) => c.lineIndex === idx);
  if (exact) return exact;
  const line = reviewLines[idx];
  const d = (line.description || line.itemName || '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!d) return undefined;
  let best: IntakeAiLineClassification | undefined;
  let bestLen = 0;
  for (const c of list) {
    const p = c.descriptionPreview.replace(/\s+/g, ' ').trim().toLowerCase();
    if (!p) continue;
    const head = Math.min(24, p.length, d.length);
    if (head < 4) continue;
    if (d.includes(p.slice(0, head)) || p.includes(d.slice(0, head))) {
      if (p.length > bestLen) {
        bestLen = p.length;
        best = c;
      }
    }
  }
  return best;
}

export function getActiveCatalogMatchForRow(
  row: IntakeLineEstimateSuggestion,
  lineState: EstimateReviewLineState | undefined
): IntakeCatalogMatch | null {
  const id = lineState?.selectedCatalogItemId ?? row.suggestedCatalogItemId;
  if (!id) return null;
  const fromTop = row.topCatalogCandidates.find((c) => c.catalogItemId === id);
  if (fromTop) return fromTop;
  return null;
}

/** Line shape used at project creation (intake review step). */
export type IntakeCreationLineLike = {
  reviewLineFingerprint?: string;
  include: boolean;
  catalogItemId: string | null;
  sku: string | null;
  matched: boolean;
};

export function resolveLineForProjectCreation<T extends IntakeCreationLineLike>(
  line: T,
  draft: IntakeEstimateDraft | undefined,
  lineByFingerprint: Record<string, EstimateReviewLineState>,
  createConfirmedOnly: boolean
): T {
  if (!line.reviewLineFingerprint || !draft) return line;
  const row = draft.lineSuggestions.find((r) => r.reviewLineFingerprint === line.reviewLineFingerprint);
  const st = lineByFingerprint[line.reviewLineFingerprint];
  if (!st) return line;

  if (st.applicationStatus === 'ignored') {
    return {
      ...line,
      include: false,
      catalogItemId: null,
      sku: null,
      matched: false,
    };
  }

  if (row.scopeBucket === 'priced_base_scope' && st.applicationStatus === 'suggested') {
    const m = getActiveCatalogMatchForRow(row, st);
    const weak =
      !m || m.confidence === 'none' || (typeof m.score === 'number' && m.score < ESTIMATE_REVIEW_LOW_SCORE_THRESHOLD);
    if (weak && createConfirmedOnly) {
      return { ...line, include: false };
    }
  }

  return line;
}

export function inferJobConditionPatchesFromText(
  patch: IntakeSuggestedJobConditionPatch
): Partial<ProjectJobConditions> {
  const t = `${patch.label} ${patch.reason || ''}`.toLowerCase();
  const out: Partial<ProjectJobConditions> = {};
  if (/\b(night work|after hours|after-hours|evening work)\b/.test(t)) {
    out.nightWork = true;
    out.afterHoursWork = true;
  }
  if (/\bprevailing\b/.test(t)) out.prevailingWage = true;
  if (/\bunion\b/.test(t)) out.unionWage = true;
  if (/\boccupied\b/.test(t)) out.occupiedBuilding = true;
  if (/\belevator\b/.test(t)) out.elevatorAvailable = true;
  if (/\bphased\b|\bmultiple phase\b/.test(t)) out.phasedWork = true;
  if (/\bremote\b|\blong distance travel\b/.test(t)) out.remoteTravel = true;
  if (/\bdeliver(y|ies)\b|\bship(ping)?\b/.test(t)) out.deliveryRequired = true;
  if (/\brestricted access\b/.test(t)) out.restrictedAccess = true;
  if (/\bcompress(ed)? schedule\b|\bfast track\b/.test(t)) out.scheduleCompression = true;
  if (/\b(bond|bonding|performance bond|surety|bid bond)\b/.test(t)) {
    out.performanceBondRequired = true;
    const pct = extractLeadingPercentFromText(`${patch.label} ${patch.reason || ''}`);
    if (pct !== null) out.performanceBondPercent = pct;
  }
  return out;
}

export type DraftBasisSummary = {
  acceptedPricedLines: number;
  needsReviewPricedLines: number;
  /** Priced base scope, still suggested, catalog match is strong — one bulk action can clear most. */
  suggestedStrongLines: number;
  /** Has a catalog pick but not strong confidence — quick scan. */
  suggestedWeakMatchLines: number;
  /** No usable catalog candidate — needs replace or ignore. */
  suggestedUnmatchedLines: number;
  ignoredLines: number;
  otherScopeLines: number;
  suggestedPricingModeLabel: string;
  materialSubtotalPreview: number;
  laborMinutesSubtotalPreview: number;
  warnings: string[];
};

export function computeDraftBasisSummary(
  draft: IntakeEstimateDraft,
  lineByFingerprint: Record<string, EstimateReviewLineState>,
  ai: IntakeAiSuggestions | null | undefined
): DraftBasisSummary {
  const warnings: string[] = [];
  let acceptedPricedLines = 0;
  let needsReviewPricedLines = 0;
  let suggestedStrongLines = 0;
  let suggestedWeakMatchLines = 0;
  let suggestedUnmatchedLines = 0;
  let ignoredLines = 0;
  let otherScopeLines = 0;
  let materialSubtotalPreview = 0;
  let laborMinutesSubtotalPreview = 0;

  for (const row of draft.lineSuggestions) {
    const st = lineByFingerprint[row.reviewLineFingerprint]?.applicationStatus ?? row.applicationStatus;

    if (st === 'ignored') {
      ignoredLines += 1;
      continue;
    }

    if (row.scopeBucket !== 'priced_base_scope') {
      otherScopeLines += 1;
      continue;
    }

    const lineState = lineByFingerprint[row.reviewLineFingerprint];
    const preview = row.pricingPreview;

    if (st === 'accepted' || st === 'replaced') {
      acceptedPricedLines += 1;
      const selId = lineState?.selectedCatalogItemId ?? row.suggestedCatalogItemId;
      if (preview && selId) {
        materialSubtotalPreview += preview.materialEach * preview.qty;
        laborMinutesSubtotalPreview += preview.laborMinutesEach * preview.qty;
      }
    } else if (st === 'suggested') {
      needsReviewPricedLines += 1;
      const m = getActiveCatalogMatchForRow(row, lineState);
      if (!m) warnings.push(`Priced-scope line (${row.reviewLineFingerprint.slice(0, 8)}…) has no catalog candidate.`);
      else if (m.confidence === 'none' || (m.score ?? 0) < ESTIMATE_REVIEW_LOW_SCORE_THRESHOLD) {
        warnings.push(`Weak catalog match for a priced-scope line (${m.sku || m.description.slice(0, 40)}).`);
      }
    }
  }

  const suggestedPricingModeLabel = ai?.pricingModeSuggested
    ? ai.pricingModeSuggested.replace(/_/g, ' ')
    : '(not suggested)';

  return {
    acceptedPricedLines,
    needsReviewPricedLines,
    suggestedStrongLines,
    suggestedWeakMatchLines,
    suggestedUnmatchedLines,
    ignoredLines,
    otherScopeLines,
    suggestedPricingModeLabel,
    materialSubtotalPreview,
    laborMinutesSubtotalPreview,
    warnings,
  };
}
