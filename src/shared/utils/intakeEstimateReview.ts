import type { ProjectJobConditions } from '../types/estimator';
import { extractLeadingPercentFromText } from './jobConditions';
import type {
  IntakeAiLineClassification,
  IntakeAiSuggestions,
  IntakeApplicationStatus,
  IntakeCatalogMatch,
  IntakeEstimateDraft,
  IntakeMatchConfidence,
  IntakeLineEstimateSuggestion,
  IntakeReviewLine,
  IntakeScopeBucket,
  IntakeSuggestedJobConditionPatch,
} from '../types/intake';

/** Match confidence: treat catalog `strong` as high for bulk accept. */
export const ESTIMATE_REVIEW_HIGH_CONFIDENCE: IntakeCatalogMatch['confidence'] = 'strong';

/** Below this score (when confidence is `none` or `possible`), bulk-ignore targets weak rows. */
export const ESTIMATE_REVIEW_LOW_SCORE_THRESHOLD = 0.45;

/** How a priced line reached `accepted` in intake review (audit + UI labels). */
export type EstimateReviewAcceptSource = 'server' | 'auto_strong_match' | 'manual';

export type EstimateReviewLineState = {
  applicationStatus: IntakeApplicationStatus;
  selectedCatalogItemId: string | null;
  acceptSource?: EstimateReviewAcceptSource;
};

export function estimateReviewAcceptSourceLabel(source: EstimateReviewAcceptSource | undefined): string | null {
  if (!source) return null;
  if (source === 'auto_strong_match') return 'Auto-accepted: strong catalog match';
  if (source === 'server') return 'Accepted on import';
  if (source === 'manual') return 'Confirmed by you';
  return null;
}

/** Optional catalog list: when provided, auto-accept only if the resolved item exists and is active. */
export type IntakeCatalogEligibilityEntry = Readonly<{ id: string; active?: boolean }>;

export function isCatalogIdEligibleForIntakeAutoAccept(
  catalogItemId: string | null | undefined,
  catalog?: ReadonlyArray<IntakeCatalogEligibilityEntry>
): boolean {
  if (!catalogItemId) return false;
  if (!catalog?.length) return true;
  const item = catalog.find((c) => c.id === catalogItemId);
  if (!item) return false;
  return item.active !== false;
}

export type EstimateReviewInitial = {
  lineByFingerprint: Record<string, EstimateReviewLineState>;
  jobConditionById: Record<string, IntakeApplicationStatus>;
  projectModifierById: Record<string, IntakeApplicationStatus>;
};

export function buildInitialEstimateReviewState(
  draft: IntakeEstimateDraft | null | undefined,
  catalog?: ReadonlyArray<IntakeCatalogEligibilityEntry>
): EstimateReviewInitial {
  if (!draft) {
    return { lineByFingerprint: {}, jobConditionById: {}, projectModifierById: {} };
  }
  const lineByFingerprint: Record<string, EstimateReviewLineState> = {};
  for (const row of draft.lineSuggestions) {
    const base: EstimateReviewLineState = {
      applicationStatus: row.applicationStatus,
      selectedCatalogItemId: row.suggestedCatalogItemId,
    };
    if (row.applicationStatus === 'accepted') {
      base.acceptSource = 'server';
    }
    lineByFingerprint[row.reviewLineFingerprint] = base;
  }
  /**
   * Default UX: trust strong catalog matches so review starts closer to “exceptions only”.
   * Only when still `suggested`, match is the selected candidate in `topCatalogCandidates`, confidence is strong,
   * and (when catalog is passed) the catalog item exists and is active — does not override server accept/replace/ignore.
   */
  for (const row of draft.lineSuggestions) {
    if (row.scopeBucket !== 'priced_base_scope') continue;
    const fp = row.reviewLineFingerprint;
    const st = lineByFingerprint[fp];
    if (!st || st.applicationStatus !== 'suggested') continue;
    const m = getActiveCatalogMatchForRow(row, st);
    if (m?.confidence !== 'strong') continue;
    const catId = st.selectedCatalogItemId ?? row.suggestedCatalogItemId;
    if (!isCatalogIdEligibleForIntakeAutoAccept(catId, catalog)) continue;
    lineByFingerprint[fp] = { ...st, applicationStatus: 'accepted', acceptSource: 'auto_strong_match' };
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

/**
 * Match row for the **currently selected** catalog id, but only if that id appears in `topCatalogCandidates`
 * (the shortlist produced for this line). Manual picks not yet reflected in the shortlist return null so callers
 * do not treat stale matcher rows as “active” for automation.
 */
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

/** Persist intake scope + catalog confidence onto takeoff lines at project creation. */
export function resolveIntakePersistFieldsForTakeoffLine(input: {
  draft: IntakeEstimateDraft | undefined;
  fingerprint: string | undefined;
  lineByFingerprint: Record<string, EstimateReviewLineState>;
  catalogItemId: string | null;
}): {
  intakeScopeBucket: IntakeScopeBucket | null;
  intakeMatchConfidence: IntakeMatchConfidence | null;
  isInstallableScope: boolean | null;
  installScopeType: string | null;
  installLaborFamily: string | null;
  sourceManufacturer: string | null;
  sourceBidBucket: string | null;
  sourceSectionHeader: string | null;
  generatedLaborMinutes: number | null;
  laborOrigin: 'source' | 'catalog' | 'install_family' | null;
} {
  const { draft, fingerprint, lineByFingerprint, catalogItemId } = input;
  const empty = {
    intakeScopeBucket: null,
    intakeMatchConfidence: null,
    isInstallableScope: null,
    installScopeType: null,
    installLaborFamily: null,
    sourceManufacturer: null,
    sourceBidBucket: null,
    sourceSectionHeader: null,
    generatedLaborMinutes: null,
    laborOrigin: null,
  } as const;
  if (!draft || !fingerprint) return { ...empty };
  const row = draft.lineSuggestions.find((r) => r.reviewLineFingerprint === fingerprint);
  if (!row) return { ...empty };
  const st = lineByFingerprint[fingerprint];
  const m = st ? getActiveCatalogMatchForRow(row, st) : null;
  let confidence: IntakeMatchConfidence | null = m?.confidence ?? null;
  if (!confidence && catalogItemId) {
    const alt = row.topCatalogCandidates.find((c) => c.catalogItemId === catalogItemId);
    confidence = alt?.confidence ?? null;
  }
  const generatedLaborMinutes = row.pricingPreview?.laborFromInstallFamily
    ? row.pricingPreview?.laborMinutesEach ?? null
    : null;
  const installLaborFamily = row.pricingPreview?.installFamilyKey ?? null;
  return {
    intakeScopeBucket: row.scopeBucket ?? null,
    intakeMatchConfidence: confidence,
    isInstallableScope: row.isInstallableScope ?? null,
    installScopeType: row.installScopeType ?? null,
    installLaborFamily,
    sourceManufacturer: row.sourceManufacturer ?? null,
    sourceBidBucket: row.sourceBidBucket ?? null,
    sourceSectionHeader: row.sourceSectionHeader ?? null,
    generatedLaborMinutes,
    laborOrigin: row.laborOrigin ?? null,
  };
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
  /**
   * Per–bid-bucket breakdown of priced-scope rows. Empty when the source document had no bid
   * splits (i.e. all rows share the same bucket or none at all). Order: base first, then
   * alternates (numeric sort), then allowance/unit-price, then unbucketed.
   */
  byBidBucket: BidBucketBreakdown[];
  /** True when the source document contains >1 bid bucket among priced-scope rows. */
  hasBidSplits: boolean;
};

export type BidBucketKind = 'base' | 'alternate' | 'deduct' | 'allowance' | 'unit_price' | 'unbucketed' | 'other';

export interface BidBucketBreakdown {
  /** Display label, e.g. `Base Bid`, `Alt 1`, `(no bucket)`. */
  label: string;
  /** Normalized key for stable maps/toggles. Empty string for unbucketed. */
  key: string;
  kind: BidBucketKind;
  totalLines: number;
  acceptedPricedLines: number;
  needsReviewPricedLines: number;
  materialSubtotalPreview: number;
  laborMinutesSubtotalPreview: number;
  /** True when this bucket's totals contributed to the headline draft totals in this summary. */
  includedInPrimaryTotals: boolean;
}

/**
 * Classify a bid-bucket label into a canonical kind used for ordering and default-inclusion.
 *
 * Defaults:
 * - `base` (`Base Bid`, empty bucket when no splits exist) → included in primary totals
 * - `alternate` (`Alt 1`, `Voluntary Alt 1`) → excluded from primary totals (conditional scope)
 * - `deduct` (`Deduct Alt 1`) → excluded from primary totals (conditional credit)
 * - `allowance` → included; the estimator intended to carry it
 * - `unit_price` → excluded; priced separately
 * - `unbucketed` → included (no signal that it's conditional)
 */
export function classifyBidBucketKind(raw: string | null | undefined): BidBucketKind {
  const label = (raw || '').trim();
  if (!label) return 'unbucketed';
  const lower = label.toLowerCase();
  if (/\bbase\s*bid\b/.test(lower) || lower === 'base') return 'base';
  if (/\bdeduct/.test(lower)) return 'deduct';
  if (/\balt(?:ernate)?\b/.test(lower)) return 'alternate';
  if (/\ballowance/.test(lower)) return 'allowance';
  if (/\bunit\s*price/.test(lower)) return 'unit_price';
  if (/\bexclud/.test(lower)) return 'other';
  return 'other';
}

/** Sort keys: base first, then numeric-sorted alternates, deducts, allowance, unit prices, other, unbucketed last. */
export function compareBidBucketKeys(
  a: { key: string; kind: BidBucketKind; label: string },
  b: { key: string; kind: BidBucketKind; label: string }
): number {
  const kindOrder: Record<BidBucketKind, number> = {
    base: 0,
    alternate: 1,
    deduct: 2,
    allowance: 3,
    unit_price: 4,
    other: 5,
    unbucketed: 6,
  };
  const ko = kindOrder[a.kind] - kindOrder[b.kind];
  if (ko !== 0) return ko;
  // Within a kind, sort by trailing number (Alt 1 before Alt 2) then by label.
  const numA = Number((a.label.match(/\b(\d+)\b/) || [, ''])[1] || '0');
  const numB = Number((b.label.match(/\b(\d+)\b/) || [, ''])[1] || '0');
  if (numA !== numB) return numA - numB;
  return a.label.localeCompare(b.label);
}

/** Bid buckets included by default in headline draft totals. */
export function isBidBucketIncludedByDefault(kind: BidBucketKind): boolean {
  return kind === 'base' || kind === 'unbucketed' || kind === 'allowance';
}

export function computeDraftBasisSummary(
  draft: IntakeEstimateDraft,
  lineByFingerprint: Record<string, EstimateReviewLineState>,
  ai: IntakeAiSuggestions | null | undefined,
  options?: {
    pricingMode?: string | null;
    /**
     * Explicit inclusion set keyed by normalized bid-bucket key (empty string = unbucketed).
     * When omitted, defaults to: base + unbucketed + allowance included; alternates/deducts excluded.
     */
    bidBucketsIncluded?: ReadonlySet<string> | null;
  }
): DraftBasisSummary {
  const pricingMode = (options?.pricingMode || '').toLowerCase();
  // Both `material_only` and `material_with_optional_install_quote` exclude labor from the
  // draft *primary* total; the latter still generates companion install minutes for a quote.
  const isMaterialOnly =
    pricingMode === 'material_only' ||
    pricingMode === 'material_with_optional_install_quote' ||
    pricingMode === 'material only';
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

  // Per-bucket accumulators keyed by normalized bucket key ('' = unbucketed).
  type BucketAcc = {
    label: string;
    key: string;
    kind: BidBucketKind;
    totalLines: number;
    acceptedPricedLines: number;
    needsReviewPricedLines: number;
    materialSubtotalPreview: number;
    laborMinutesSubtotalPreview: number;
  };
  const bucketMap = new Map<string, BucketAcc>();
  function getBucket(rawLabel: string | null | undefined): BucketAcc {
    const label = (rawLabel || '').trim();
    const key = label;
    const existing = bucketMap.get(key);
    if (existing) return existing;
    const kind = classifyBidBucketKind(label);
    const acc: BucketAcc = {
      label: label || '(no bucket)',
      key,
      kind,
      totalLines: 0,
      acceptedPricedLines: 0,
      needsReviewPricedLines: 0,
      materialSubtotalPreview: 0,
      laborMinutesSubtotalPreview: 0,
    };
    bucketMap.set(key, acc);
    return acc;
  }

  for (const row of draft.lineSuggestions) {
    const st = lineByFingerprint[row.reviewLineFingerprint]?.applicationStatus ?? row.applicationStatus;

    if (st === 'ignored') {
      ignoredLines += 1;
      continue;
    }

    // Install-family-only rows (installable scope, generated labor, no catalog item) don't have
    // scopeBucket === 'priced_base_scope' until a catalog match is picked, but their generated
    // labor should still roll into the draft totals (and be gated by material-only mode).
    const hasInstallFamilyLabor = Boolean(row.pricingPreview?.laborFromInstallFamily);
    if (row.scopeBucket !== 'priced_base_scope' && !hasInstallFamilyLabor) {
      otherScopeLines += 1;
      continue;
    }

    const lineState = lineByFingerprint[row.reviewLineFingerprint];
    const preview = row.pricingPreview;
    const bucket = getBucket(row.sourceBidBucket ?? null);
    bucket.totalLines += 1;

    if (st === 'accepted' || st === 'replaced') {
      acceptedPricedLines += 1;
      bucket.acceptedPricedLines += 1;
      const selId = lineState?.selectedCatalogItemId ?? row.suggestedCatalogItemId;
      if (preview && (selId || hasInstallFamilyLabor)) {
        const materialDelta = selId ? preview.materialEach * preview.qty : 0;
        const excludeGeneratedLabor = isMaterialOnly && preview.laborFromInstallFamily;
        const laborDelta = excludeGeneratedLabor ? 0 : preview.laborMinutesEach * preview.qty;
        bucket.materialSubtotalPreview += materialDelta;
        bucket.laborMinutesSubtotalPreview += laborDelta;
      }
    } else if (st === 'suggested') {
      needsReviewPricedLines += 1;
      bucket.needsReviewPricedLines += 1;
      const m = getActiveCatalogMatchForRow(row, lineState);
      if (!m) warnings.push(`Priced-scope line (${row.reviewLineFingerprint.slice(0, 8)}…) has no catalog candidate.`);
      else if (m.confidence === 'none' || (m.score ?? 0) < ESTIMATE_REVIEW_LOW_SCORE_THRESHOLD) {
        warnings.push(`Weak catalog match for a priced-scope line (${m.sku || m.description.slice(0, 40)}).`);
      }
    }
  }

  // Decide inclusion per bucket. Explicit filter wins; otherwise default per-kind.
  const explicit = options?.bidBucketsIncluded ?? null;
  const byBidBucket: BidBucketBreakdown[] = Array.from(bucketMap.values())
    .sort(compareBidBucketKeys)
    .map((acc) => {
      const included = explicit ? explicit.has(acc.key) : isBidBucketIncludedByDefault(acc.kind);
      if (included) {
        materialSubtotalPreview += acc.materialSubtotalPreview;
        laborMinutesSubtotalPreview += acc.laborMinutesSubtotalPreview;
      }
      return {
        label: acc.label,
        key: acc.key,
        kind: acc.kind,
        totalLines: acc.totalLines,
        acceptedPricedLines: acc.acceptedPricedLines,
        needsReviewPricedLines: acc.needsReviewPricedLines,
        materialSubtotalPreview: acc.materialSubtotalPreview,
        laborMinutesSubtotalPreview: acc.laborMinutesSubtotalPreview,
        includedInPrimaryTotals: included,
      };
    });
  const hasBidSplits = bucketMap.size > 1;

  const suggestedPricingModeLabel = ai?.pricingModeSuggested
    ? ai.pricingModeSuggested.replace(/_/g, ' ')
    : '(not suggested)';

  // Flag when alternates exist but are being excluded from primary totals.
  const excludedAltCount = byBidBucket.filter(
    (b) => !b.includedInPrimaryTotals && (b.kind === 'alternate' || b.kind === 'deduct') && b.totalLines > 0
  ).length;
  if (excludedAltCount > 0) {
    warnings.push(
      `${excludedAltCount} alternate / deduct bucket${excludedAltCount === 1 ? '' : 's'} not included in primary totals. Toggle them on to include.`
    );
  }

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
    byBidBucket,
    hasBidSplits,
  };
}
