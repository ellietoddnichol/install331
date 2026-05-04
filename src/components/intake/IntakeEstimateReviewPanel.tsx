import React, { useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, MoreHorizontal, Search, X } from 'lucide-react';
import type { ModifierRecord } from '../../shared/types/estimator';
import type {
  IntakeAiSuggestions,
  IntakeApplicationStatus,
  IntakeCatalogMatch,
  IntakeEstimateDraft,
  IntakeLineEstimateSuggestion,
  IntakeProposalClauseHint,
  IntakeReviewLine,
  IntakeScopeBucket,
  IntakeSuggestedJobConditionPatch,
} from '../../shared/types/intake';
import type { CatalogItem } from '../../types';
import {
  applicationStatusLabel,
  classifyBidBucketKind,
  compareBidBucketKeys,
  computeDraftBasisSummary,
  estimateReviewAcceptSourceLabel,
  ESTIMATE_REVIEW_LOW_SCORE_THRESHOLD,
  findAiClassificationForFingerprint,
  findReviewLineForFingerprint,
  formatParsingHintSubtitle,
  getActiveCatalogMatchForRow,
  groupDraftLinesByScopeBucket,
  isBidBucketIncludedByDefault,
  matchConfidenceTier,
  matchSignalTags,
  scopeBucketShortLabel,
  type BidBucketKind,
  type DraftBasisSummary,
  type EstimateReviewLineState,
} from '../../shared/utils/intakeEstimateReview';
import { formatCurrencySafe, formatNumberSafe } from '../../utils/numberFormat';

function StatusPill({ status }: { status: IntakeApplicationStatus }) {
  if (status === 'suggested') {
    return <span className="text-[12px] text-slate-500">Not confirmed</span>;
  }
  const cls =
    status === 'accepted'
      ? 'bg-emerald-600 text-white'
      : status === 'replaced'
        ? 'bg-sky-700 text-white'
        : 'bg-slate-400 text-white';
  return <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${cls}`}>{applicationStatusLabel(status)}</span>;
}

function ScopeChip({ bucket }: { bucket: IntakeScopeBucket }) {
  const muted =
    bucket === 'excluded_by_others' || bucket === 'informational_only'
      ? 'bg-violet-50 text-violet-900 ring-violet-200/60'
      : bucket === 'priced_base_scope'
        ? 'bg-sky-50 text-sky-900 ring-sky-200/60'
        : 'bg-slate-50 text-slate-700 ring-slate-200/60';
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[12px] font-medium ring-1 ${muted}`} title={bucket}>
      {scopeBucketShortLabel(bucket)}
    </span>
  );
}

const MATCH_GROUPS: { key: string; title: string; buckets: IntakeScopeBucket[]; defaultOpen: boolean }[] = [
  { key: 'base', title: 'Base scope', buckets: ['priced_base_scope'], defaultOpen: true },
  { key: 'alt', title: 'Alternate / deduct', buckets: ['deduction_alternate'], defaultOpen: false },
  { key: 'excluded', title: 'Excluded / by others', buckets: ['excluded_by_others'], defaultOpen: false },
  { key: 'allowance', title: 'Allowance', buckets: ['allowance'], defaultOpen: false },
  { key: 'conditions', title: 'Line / project condition', buckets: ['line_condition', 'project_condition'], defaultOpen: false },
  { key: 'info', title: 'Info only', buckets: ['informational_only'], defaultOpen: false },
  { key: 'unknown', title: 'Other / needs review', buckets: ['unknown'], defaultOpen: false },
];

function lineStateForRow(
  row: IntakeLineEstimateSuggestion,
  lineByFingerprint: Record<string, EstimateReviewLineState>
): EstimateReviewLineState {
  return (
    lineByFingerprint[row.reviewLineFingerprint] ?? {
      applicationStatus: row.applicationStatus,
      selectedCatalogItemId: row.suggestedCatalogItemId,
      ...(row.applicationStatus === 'accepted' ? { acceptSource: 'server' as const } : {}),
    }
  );
}

function rowNeedsEstimatorReview(
  row: IntakeLineEstimateSuggestion,
  st: EstimateReviewLineState,
  match: IntakeCatalogMatch | null
): boolean {
  if (row.scopeBucket !== 'priced_base_scope') return false;
  if (st.applicationStatus !== 'suggested') return false;
  if (match?.confidence === 'strong') return false;
  return true;
}

function sortBaseScopeRows(
  rows: IntakeLineEstimateSuggestion[],
  lineByFingerprint: Record<string, EstimateReviewLineState>
): IntakeLineEstimateSuggestion[] {
  return [...rows].sort((a, b) => {
    const sa = lineStateForRow(a, lineByFingerprint);
    const sb = lineStateForRow(b, lineByFingerprint);
    const ma = getActiveCatalogMatchForRow(a, sa);
    const mb = getActiveCatalogMatchForRow(b, sb);
    const ra = rowNeedsEstimatorReview(a, sa, ma) ? 0 : 1;
    const rb = rowNeedsEstimatorReview(b, sb, mb) ? 0 : 1;
    return ra - rb;
  });
}

export interface IntakeEstimateReviewPanelProps {
  draft: IntakeEstimateDraft;
  reviewLines: IntakeReviewLine[];
  catalog: CatalogItem[];
  aiSuggestions: IntakeAiSuggestions | null | undefined;
  modifiers: ModifierRecord[];
  lineByFingerprint: Record<string, EstimateReviewLineState>;
  onAcceptLine: (fingerprint: string) => void;
  onReplaceLineWithCatalogId: (fingerprint: string, catalogItemId: string) => void;
  onIgnoreLine: (fingerprint: string) => void;
  onBulkAcceptHighConfidence: () => void;
  /** Accept matcher Tier A rows and Tier B rows that already have a strong catalog match. */
  onBulkAcceptTierAStrongB: () => void;
  onBulkIgnoreLowConfidence: () => void;
  onBulkAcceptAllSuggestedProjectModifiers: () => void;
  onOpenCatalogPicker: (fingerprint: string) => void;
  jobConditionById: Record<string, IntakeApplicationStatus>;
  onSetJobConditionStatus: (id: string, status: IntakeApplicationStatus) => void;
  onApplyAllSuggestedJobConditions: () => void;
  projectModifierById: Record<string, IntakeApplicationStatus>;
  onSetProjectModifierStatus: (modifierId: string, status: IntakeApplicationStatus) => void;
  pricingModeDraft: string;
  onApplySuggestedPricingMode: () => void;
  /** Div 10 Brain — retrieved proposal clause snippets (advisory). */
  div10ProposalClauseHints?: IntakeProposalClauseHint[] | null;
}

export function IntakeEstimateReviewPanel({
  draft,
  reviewLines,
  catalog,
  aiSuggestions,
  modifiers,
  lineByFingerprint,
  onAcceptLine,
  onReplaceLineWithCatalogId,
  onIgnoreLine,
  onBulkAcceptHighConfidence,
  onBulkAcceptTierAStrongB,
  onBulkIgnoreLowConfidence,
  onBulkAcceptAllSuggestedProjectModifiers,
  onOpenCatalogPicker,
  jobConditionById,
  onSetJobConditionStatus,
  onApplyAllSuggestedJobConditions,
  projectModifierById,
  onSetProjectModifierStatus,
  pricingModeDraft,
  onApplySuggestedPricingMode,
  div10ProposalClauseHints,
}: IntakeEstimateReviewPanelProps) {
  const [openTechnicalFp, setOpenTechnicalFp] = useState<string | null>(null);
  const [openDiv10Fp, setOpenDiv10Fp] = useState<string | null>(null);
  /** Single open row actions menu (backdrop closes sibling rows). */
  const [openRowActionsFp, setOpenRowActionsFp] = useState<string | null>(null);
  /** Rows expanded inline to show alternatives / details. */
  const [expandedFps, setExpandedFps] = useState<Record<string, boolean>>({});
  const [matchDensity, setMatchDensity] = useState<'compact' | 'comfortable'>('compact');

  /**
   * Which bid buckets (keyed by label — `''` for unbucketed) should roll into the headline
   * draft totals. `null` means "use the built-in default" (base + unbucketed + allowance).
   */
  const [bidBucketsIncluded, setBidBucketsIncluded] = useState<ReadonlySet<string> | null>(null);

  function toggleExpanded(fp: string) {
    setExpandedFps((prev) => ({ ...prev, [fp]: !prev[fp] }));
  }

  const basisSummary: DraftBasisSummary = useMemo(
    () =>
      computeDraftBasisSummary(draft, lineByFingerprint, aiSuggestions ?? null, {
        pricingMode: pricingModeDraft,
        bidBucketsIncluded,
      }),
    [draft, lineByFingerprint, aiSuggestions, pricingModeDraft, bidBucketsIncluded]
  );

  /** The subset of base-scope rows for a given bucket key (empty string = unbucketed). */
  const baseScopeRowsByBucketKey = useMemo(() => {
    const out = new Map<string, IntakeLineEstimateSuggestion[]>();
    for (const row of draft.lineSuggestions) {
      if (row.scopeBucket !== 'priced_base_scope') continue;
      const key = (row.sourceBidBucket || '').trim();
      const bucket = out.get(key) || [];
      bucket.push(row);
      out.set(key, bucket);
    }
    return out;
  }, [draft.lineSuggestions]);

  function toggleBucketInclusion(key: string) {
    setBidBucketsIncluded((prev) => {
      // Materialize the default-inclusion set the first time the user toggles anything.
      const base = prev
        ? new Set(prev)
        : new Set(
            basisSummary.byBidBucket.filter((b) => isBidBucketIncludedByDefault(b.kind)).map((b) => b.key)
          );
      if (base.has(key)) base.delete(key);
      else base.add(key);
      return base;
    });
  }

  const grouped = useMemo(() => groupDraftLinesByScopeBucket(draft.lineSuggestions), [draft.lineSuggestions]);

  const installFamilyLaborSummary = useMemo(() => {
    const rows = draft.lineSuggestions.filter(
      (r) => r.pricingPreview?.laborFromInstallFamily || r.laborOrigin === 'install_family'
    );
    const totalMinutes = rows.reduce((sum, r) => sum + (r.pricingPreview?.laborMinutesEach ?? 0) * (r.pricingPreview?.qty ?? 1), 0);
    return { count: rows.length, totalMinutes };
  }, [draft.lineSuggestions]);
  const pricingModeLower = (pricingModeDraft || '').toLowerCase();
  const isMaterialOnlyPricingMode =
    pricingModeLower === 'material_only' ||
    pricingModeLower === 'material_with_optional_install_quote' ||
    pricingModeLower === 'material only';
  const isMaterialWithOptionalInstallQuote =
    pricingModeLower === 'material_with_optional_install_quote';

  const catalogById = useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog]);

  const sectionGroups = useMemo(() => {
    return MATCH_GROUPS.map((g) => {
      const rows: IntakeLineEstimateSuggestion[] = [];
      for (const b of g.buckets) {
        rows.push(...(grouped.get(b) || []));
      }
      const sorted =
        g.key === 'base' ? sortBaseScopeRows(rows, lineByFingerprint) : rows;
      return { ...g, rows: sorted };
    }).filter((g) => g.rows.length > 0);
  }, [grouped, lineByFingerprint, draft.lineSuggestions]);

  const bulkEligibleCounts = useMemo(() => {
    let strong = 0;
    let tierAOrB = 0;
    let weakOrNoMatch = 0;
    for (const row of draft.lineSuggestions) {
      if (row.scopeBucket !== 'priced_base_scope') continue;
      const st = lineStateForRow(row, lineByFingerprint);
      if (st.applicationStatus !== 'suggested') continue;
      const m = getActiveCatalogMatchForRow(row, st);
      const tier = row.catalogAutoApplyTier || 'C';
      if (m?.confidence === 'strong') strong += 1;
      if (tier === 'A' || (tier === 'B' && (m?.confidence === 'strong' || m?.confidence === 'possible' || row.topCatalogCandidates.length > 0))) {
        tierAOrB += 1;
      }
      const low = !m || m.confidence === 'none' || (typeof m.score === 'number' && m.score < ESTIMATE_REVIEW_LOW_SCORE_THRESHOLD);
      if (low) weakOrNoMatch += 1;
    }
    return { strong, tierAOrB, weakOrNoMatch };
  }, [draft.lineSuggestions, lineByFingerprint]);

  const jobPatches: IntakeSuggestedJobConditionPatch[] = draft.projectSuggestion.suggestedJobConditionsPatch ?? [];

  const modifierLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const mod of modifiers) m.set(mod.id, mod.name);
    return m;
  }, [modifiers]);

  const projectModIds = draft.projectSuggestion.suggestedProjectModifierIds;

  function linePreviewText(fp: string): string {
    const rl = findReviewLineForFingerprint(fp, reviewLines);
    if (!rl) return '—';
    return (rl.description || rl.itemName || '').trim() || '—';
  }

  function catalogItemForSelection(row: IntakeLineEstimateSuggestion, st: EstimateReviewLineState): CatalogItem | undefined {
    const id = st.selectedCatalogItemId ?? row.suggestedCatalogItemId;
    if (!id) return undefined;
    return catalogById.get(id);
  }

  function renderAlternativeOption(c: IntakeCatalogMatch, fp: string, isSelected: boolean) {
    const item = catalogById.get(c.catalogItemId);
    const meta = item
      ? [item.category, item.manufacturer].filter(Boolean).join(' · ')
      : c.category || '';
    return (
      <button
        key={c.catalogItemId}
        type="button"
        onClick={() => onReplaceLineWithCatalogId(fp, c.catalogItemId)}
        className={`w-full rounded-md border px-2 py-1.5 text-left transition hover:border-sky-400 hover:bg-sky-50/50 ${
          isSelected ? 'border-sky-400 bg-sky-50/80 ring-1 ring-sky-300/60' : 'border-slate-200 bg-white'
        }`}
      >
        <div className="font-mono text-[12px] font-semibold text-slate-900">{c.sku}</div>
        <div className="text-[12px] leading-snug text-slate-800 line-clamp-2">{c.description}</div>
        {meta ? <div className="mt-0.5 text-[12px] text-slate-500 line-clamp-1">{meta}</div> : null}
      </button>
    );
  }

  function renderExpandedDetails(row: IntakeLineEstimateSuggestion, st: EstimateReviewLineState, selectedId: string | null, match: IntakeCatalogMatch | null) {
    const fp = row.reviewLineFingerprint;
    const aiRow = findAiClassificationForFingerprint(fp, reviewLines, aiSuggestions ?? null);
    const hint = formatParsingHintSubtitle(aiRow);
    const tags = match ? matchSignalTags(match.reason, row.matcherSignals) : [];
    const alternatives = row.topCatalogCandidates.filter((c) => c.catalogItemId !== selectedId).slice(0, 4);

    return (
      <div className="space-y-2 border-t border-slate-100 bg-slate-50/60 px-3 py-2.5 text-[12px]">
        {hint ? (
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Parsing hint</span>
            <p className="mt-0.5 leading-snug text-slate-700">{hint}</p>
          </div>
        ) : null}
        {st.applicationStatus === 'accepted' && estimateReviewAcceptSourceLabel(st.acceptSource) ? (
          <p
            className={`text-[11px] font-medium ${
              st.acceptSource === 'auto_strong_match' ? 'text-sky-800' : st.acceptSource === 'server' ? 'text-slate-600' : 'text-emerald-800'
            }`}
            title={
              st.acceptSource === 'auto_strong_match'
                ? 'This line started accepted because the catalog match was strong.'
                : st.acceptSource === 'server'
                  ? 'Marked accepted when the import was built.'
                  : 'You confirmed this line in review.'
            }
          >
            Accepted via {estimateReviewAcceptSourceLabel(st.acceptSource)}
          </p>
        ) : null}
        {match ? (
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Why this match</span>
            <p className="mt-0.5 leading-snug text-slate-700">{shortMatchReason(match.reason)}</p>
            {tags.length > 0 ? (
              <div className="mt-1 flex flex-wrap gap-1">
                {tags.map((t) => (
                  <span key={t} className="rounded bg-slate-200/70 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-slate-700">
                    {t}
                  </span>
                ))}
              </div>
            ) : null}
            <button
              type="button"
              className="mt-1 text-[11px] font-medium text-sky-700 hover:underline"
              onClick={() => setOpenTechnicalFp((cur) => (cur === fp ? null : fp))}
            >
              {openTechnicalFp === fp ? 'Hide technical details' : 'Show score & full reason'}
            </button>
            {openTechnicalFp === fp ? (
              <div className="mt-1 rounded border border-slate-200 bg-white px-2 py-1.5 font-mono text-[11px] text-slate-600">
                <div>Score: {formatNumberSafe(match.score, 3)}</div>
                <div className="mt-0.5 whitespace-pre-wrap break-words">{match.reason}</div>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-amber-900">No catalog match — use <strong>Find</strong> to pick an item.</p>
        )}

        {alternatives.length > 0 ? (
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Other likely matches (click to replace)</span>
            <div className="mt-1 grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
              {alternatives.map((c) => renderAlternativeOption(c, fp, false))}
            </div>
          </div>
        ) : null}

        {row.div10Brain ? (
          <div className="rounded border border-violet-200/80 bg-violet-50/50 px-2 py-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-violet-900">Div 10 Brain (advisory)</span>
              <span className="text-[9px] font-medium text-violet-800">Does not change pricing</span>
            </div>
            {row.div10Brain.div10Error ? <p className="mt-1 text-red-800">{row.div10Brain.div10Error}</p> : null}
            {row.div10Brain.classify ? (
              <p className="mt-1 leading-snug text-slate-800">
                <span className="font-semibold text-violet-950">Classify:</span> {row.div10Brain.classify.line_kind} · {row.div10Brain.classify.scope_bucket} · {row.div10Brain.classify.category}
                {row.div10Brain.classify.needs_human_review ? (
                  <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-950">Review</span>
                ) : null}
                <span className="mt-0.5 block text-[11px] text-slate-600">{row.div10Brain.classify.reasoning_summary}</span>
              </p>
            ) : null}
            {row.div10Brain.catalogAssist ? (
              <p className="mt-1 text-slate-800">
                <span className="font-semibold text-violet-950">Catalog assist:</span> {row.div10Brain.catalogAssist.confidence} confidence — {row.div10Brain.catalogAssist.rationale}
              </p>
            ) : null}
            {row.div10Brain.modifierAssist ? (
              <p className="mt-1 text-slate-800">
                <span className="font-semibold text-violet-950">Modifier ideas:</span>{' '}
                {[...row.div10Brain.modifierAssist.suggested_line_modifier_keys, ...row.div10Brain.modifierAssist.suggested_project_modifier_keys].join(', ') || '—'}
              </p>
            ) : null}
            {row.div10Brain.retrieval && row.div10Brain.retrieval.length > 0 ? (
              <div className="mt-1">
                <button
                  type="button"
                  className="text-[11px] font-medium text-violet-800 hover:underline"
                  onClick={() => setOpenDiv10Fp((cur) => (cur === fp ? null : fp))}
                >
                  {openDiv10Fp === fp ? 'Hide sources' : 'Show retrieved sources'}
                </button>
                {openDiv10Fp === fp ? (
                  <ul className="mt-1 space-y-1 rounded border border-violet-100 bg-white/90 p-2 text-[11px] text-slate-700">
                    {row.div10Brain.retrieval.map((s) => (
                      <li key={s.id}>
                        <span className="font-mono text-[10px] text-violet-900">{s.source_label}</span>{' '}
                        <span className="text-slate-500">({s.score.toFixed(3)})</span>
                        <div className="line-clamp-3 text-slate-600">{s.text}</div>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  function renderLineRow(row: IntakeLineEstimateSuggestion) {
    const fp = row.reviewLineFingerprint;
    const st = lineStateForRow(row, lineByFingerprint);
    const match = getActiveCatalogMatchForRow(row, st);
    const tier = match ? matchConfidenceTier(match.confidence) : 'low';
    const needsReview = rowNeedsEstimatorReview(row, st, match);
    const catItem = catalogItemForSelection(row, st);
    const selectedId = st.selectedCatalogItemId ?? row.suggestedCatalogItemId;
    const isExpanded = !!expandedFps[fp];
    const isSuggested = st.applicationStatus === 'suggested';
    const rowStatusAccent =
      st.applicationStatus === 'accepted'
        ? 'border-l-emerald-400/90'
        : st.applicationStatus === 'replaced'
          ? 'border-l-sky-400/90'
          : st.applicationStatus === 'ignored'
            ? 'border-l-slate-300'
            : needsReview
              ? 'border-l-amber-400/90'
              : 'border-l-slate-200';
    const rowPadY = matchDensity === 'compact' ? 'py-1.5' : 'py-2.5';
    const sourceText = linePreviewText(fp);
    const suggestedSku = catItem?.sku ?? match?.sku ?? '—';
    const suggestedDesc = catItem?.description ?? match?.description ?? '';
    const suggestedMeta = catItem ? [catItem.category, catItem.manufacturer].filter(Boolean).join(' · ') : '';

    return (
      <div key={fp} className={`border-b border-slate-100 border-l-[3px] ${rowStatusAccent} last:border-b-0 hover:bg-slate-50/60`}>
        <div className={`grid grid-cols-[1.25rem_minmax(0,1.05fr)_minmax(0,1.35fr)_minmax(0,10rem)_auto] items-start gap-2 px-2 ${rowPadY} text-[12px] sm:gap-3 sm:px-3`}>
          <button
            type="button"
            aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
            onClick={() => toggleExpanded(fp)}
            className="mt-0.5 flex h-5 w-5 items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          >
            {isExpanded ? <ChevronDown className="h-3.5 w-3.5" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden />}
          </button>

          <div className="min-w-0">
            <div className="flex items-start gap-1.5">
              <p className={`min-w-0 ${matchDensity === 'compact' ? 'line-clamp-1' : 'line-clamp-2'} font-medium text-slate-900`} title={sourceText}>
                {sourceText}
              </p>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1">
              <ScopeChip bucket={row.scopeBucket} />
              {row.catalogAutoApplyTier ? (
                <span
                  className={`rounded px-1 py-0 text-[9px] font-bold uppercase tracking-wide ring-1 ${
                    row.catalogAutoApplyTier === 'A'
                      ? 'bg-emerald-50 text-emerald-900 ring-emerald-200/80'
                      : row.catalogAutoApplyTier === 'B'
                        ? 'bg-amber-50 text-amber-950 ring-amber-200/70'
                        : 'bg-slate-100 text-slate-600 ring-slate-200/80'
                  }`}
                  title="Automation tier"
                >
                  T{row.catalogAutoApplyTier}
                </span>
              ) : null}
              {needsReview ? (
                <span className="rounded-full bg-amber-100 px-1.5 py-0 text-[10px] font-semibold text-amber-950 ring-1 ring-amber-200/80">
                  Review
                </span>
              ) : null}
              {row.pricingPreview?.laborFromInstallFamily ? (
                <span
                  className="rounded-full bg-indigo-50 px-1.5 py-0 text-[10px] font-semibold text-indigo-900 ring-1 ring-indigo-200/80"
                  title={`Labor minutes (${row.pricingPreview.laborMinutesEach}) generated from install family "${row.pricingPreview.installFamilyKey ?? 'default'}" — source document did not provide labor pricing for this line.`}
                >
                  Labor from default
                </span>
              ) : null}
              {row.isInstallableScope && !row.pricingPreview?.laborFromInstallFamily && row.laborOrigin === 'install_family' ? (
                <span
                  className="rounded-full bg-indigo-50 px-1.5 py-0 text-[10px] font-semibold text-indigo-900 ring-1 ring-indigo-200/80"
                  title={`Installable scope (${row.installScopeType ?? 'generic'}) — labor minutes supplied by install-family fallback.`}
                >
                  Labor from default
                </span>
              ) : null}
            </div>
          </div>

          <div className="min-w-0">
            {match && selectedId ? (
              <>
                <div className="flex items-start gap-1.5">
                  <span className="min-w-0 shrink-0 truncate font-mono text-[12px] font-semibold text-slate-900" title={suggestedSku}>
                    {suggestedSku}
                  </span>
                  <span
                    className={`mt-0.5 inline-flex shrink-0 rounded-full px-1.5 py-0 text-[10px] font-semibold ${
                      tier === 'high'
                        ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/70'
                        : tier === 'medium'
                          ? 'bg-amber-50 text-amber-900 ring-1 ring-amber-200/70'
                          : 'bg-slate-100 text-slate-700 ring-1 ring-slate-200/80'
                    }`}
                    title={match.reason}
                  >
                    {tier === 'high' ? 'Strong' : tier === 'medium' ? 'Check' : 'Weak'}
                  </span>
                </div>
                <p className={`${matchDensity === 'compact' ? 'line-clamp-1' : 'line-clamp-2'} leading-snug text-slate-800`} title={suggestedDesc}>
                  {suggestedDesc}
                </p>
                {suggestedMeta && matchDensity !== 'compact' ? (
                  <p className="text-[11px] text-slate-500 line-clamp-1">{suggestedMeta}</p>
                ) : null}
              </>
            ) : (
              <p className="text-[12px] text-amber-900">No match — use <strong>Find</strong> to pick one.</p>
            )}
          </div>

          <div className="min-w-0">
            {isSuggested ? (
              <span className="text-[11px] text-slate-500">Not confirmed</span>
            ) : (
              <StatusPill status={st.applicationStatus} />
            )}
          </div>

          <div className="relative flex shrink-0 items-center gap-1">
            {isSuggested ? (
              <button
                type="button"
                className="inline-flex h-7 items-center gap-1 rounded-md bg-slate-900 px-2.5 text-[11px] font-semibold text-white shadow-sm hover:bg-slate-800"
                onClick={() => onAcceptLine(fp)}
                title="Accept this match"
              >
                <Check className="h-3 w-3" aria-hidden />
                Accept
              </button>
            ) : null}
            <button
              type="button"
              className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
              onClick={() => onOpenCatalogPicker(fp)}
              title="Find catalog item"
            >
              <Search className="h-3 w-3" aria-hidden />
              Find
            </button>
            {isSuggested ? (
              <button
                type="button"
                className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                onClick={() => onIgnoreLine(fp)}
                title="Ignore this line"
              >
                <X className="h-3 w-3" aria-hidden />
                Ignore
              </button>
            ) : (
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                aria-haspopup="menu"
                aria-expanded={openRowActionsFp === fp}
                aria-label="More actions"
                onClick={() => setOpenRowActionsFp((cur) => (cur === fp ? null : fp))}
              >
                <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
            {openRowActionsFp === fp ? (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-30 cursor-default bg-transparent"
                  aria-label="Close menu"
                  onClick={() => setOpenRowActionsFp(null)}
                />
                <div
                  role="menu"
                  className="absolute right-0 top-full z-40 mt-1 min-w-[11.5rem] rounded-lg border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-slate-900/5"
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="block w-full px-3 py-2 text-left text-[12px] text-red-700 hover:bg-red-50/80"
                    onClick={() => {
                      onIgnoreLine(fp);
                      setOpenRowActionsFp(null);
                    }}
                  >
                    Ignore line
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
        {isExpanded ? renderExpandedDetails(row, st, selectedId, match) : null}
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      {/* Prominent draft summary — always visible */}
      <div className="rounded-lg border border-slate-200/90 bg-gradient-to-r from-slate-50/95 to-white px-3 py-2.5 shadow-sm">
        <p className="text-[12px] font-bold uppercase tracking-[0.05em] text-slate-700">Pre-pricing review</p>
        <p className="text-[12px] text-slate-600">Confirm catalog links here; material and labor rollups fill in from accepted priced lines.</p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-slate-800">
          <span className="rounded-md bg-emerald-50/90 px-2 py-0.5 ring-1 ring-emerald-200/70">
            <span className="text-slate-600">Ready (strong match)</span>{' '}
            <span className="font-bold tabular-nums text-emerald-950">{basisSummary.suggestedStrongLines}</span>
          </span>
          <span className="rounded-md bg-amber-50/90 px-2 py-0.5 ring-1 ring-amber-200/70">
            <span className="text-slate-600">Quick review</span>{' '}
            <span className="font-bold tabular-nums text-amber-950">{basisSummary.suggestedWeakMatchLines}</span>
          </span>
          <span className="rounded-md bg-slate-100/90 px-2 py-0.5 ring-1 ring-slate-200/80">
            <span className="text-slate-600">Unmatched</span>{' '}
            <span className="font-bold tabular-nums text-slate-900">{basisSummary.suggestedUnmatchedLines}</span>
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 border-t border-slate-100 pt-2 text-[12px] text-slate-800">
          <span>
            <span className="text-slate-500">Accepted</span>{' '}
            <span className="font-bold tabular-nums text-slate-900">{basisSummary.acceptedPricedLines}</span>
          </span>
          <span>
            <span className="text-slate-500">Still open</span>{' '}
            <span className="font-semibold tabular-nums text-slate-800">{basisSummary.needsReviewPricedLines}</span>
          </span>
          <span>
            <span className="text-slate-500">Ignored</span>{' '}
            <span className="font-bold tabular-nums">{basisSummary.ignoredLines}</span>
          </span>
          <span>
            <span className="text-slate-500">Other scope</span>{' '}
            <span className="font-bold tabular-nums">{basisSummary.otherScopeLines}</span>
          </span>
          <span className="w-full sm:w-auto">
            <span className="text-slate-500">Suggested mode</span>{' '}
            <span className="font-semibold capitalize">{basisSummary.suggestedPricingModeLabel}</span>
          </span>
          {basisSummary.acceptedPricedLines > 0 ? (
            <>
              <span>
                <span className="text-slate-500">Draft material</span>{' '}
                <span className="font-semibold tabular-nums">{formatCurrencySafe(basisSummary.materialSubtotalPreview)}</span>
              </span>
              <span>
                <span className="text-slate-500">Draft labor (min)</span>{' '}
                <span className="font-semibold tabular-nums">{formatNumberSafe(basisSummary.laborMinutesSubtotalPreview, 1)}</span>
              </span>
            </>
          ) : (
            <span className="w-full text-[12px] text-slate-500">No draft pricing yet — totals appear after you accept priced lines.</span>
          )}
        </div>
        {aiSuggestions?.pricingModeSuggested ? (
          <button type="button" className="mt-2 h-7 rounded-md border border-amber-300/80 bg-white px-2 text-[12px] font-semibold text-amber-950 hover:bg-amber-50" onClick={onApplySuggestedPricingMode}>
            Apply suggested pricing mode to project draft
          </button>
        ) : null}
        {basisSummary.warnings.length > 0 ? (
          <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[12px] text-amber-950/90">
            {basisSummary.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        ) : null}
      </div>

      {installFamilyLaborSummary.count > 0 ? (
        <div className={`rounded-lg border px-3 py-2 text-[12px] ${isMaterialOnlyPricingMode ? 'border-amber-300/80 bg-amber-50/70 text-amber-950' : 'border-indigo-200/80 bg-indigo-50/60 text-indigo-950'}`}>
          <p className="font-semibold">
            {installFamilyLaborSummary.count} line{installFamilyLaborSummary.count === 1 ? '' : 's'} used install-family defaults for labor
            <span className="ml-1 font-normal text-[11px]">({Math.round(installFamilyLaborSummary.totalMinutes)} min total)</span>
          </p>
          <p className="mt-0.5 text-[11px] leading-snug">
            {isMaterialWithOptionalInstallQuote
              ? 'Material-led bid with install quoted separately. These labor minutes feed the companion install quote — the main bid still excludes labor.'
              : isMaterialOnlyPricingMode
                ? 'Project pricing mode is Material Only, but the source document includes installable scope. Labor minutes shown are estimator-generated fallbacks — review before pricing.'
                : 'Labor minutes for these lines came from the install-family registry because the catalog match had no explicit labor. Review or replace the catalog match to override.'}
          </p>
        </div>
      ) : null}

      {basisSummary.hasBidSplits ? (
        <div className="rounded-lg border border-sky-300/80 bg-sky-50/70 px-3 py-2.5 text-[12px] text-sky-950">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-[12px] font-bold uppercase tracking-[0.05em] text-sky-900">Bid splits detected</p>
              <p className="mt-0.5 text-[12px] leading-snug text-sky-950/90">
                The source document contains {basisSummary.byBidBucket.length} bid buckets. Primary draft totals include only the buckets highlighted below — click any bucket to include or exclude it.
              </p>
            </div>
            {bidBucketsIncluded ? (
              <button
                type="button"
                className="h-7 rounded-md border border-sky-300/80 bg-white px-2 text-[11px] font-semibold text-sky-900 hover:bg-sky-50"
                onClick={() => setBidBucketsIncluded(null)}
                title="Restore the default inclusion: base, allowance, and unbucketed rows contribute to the primary totals; alternates and deducts do not."
              >
                Reset to default
              </button>
            ) : null}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {basisSummary.byBidBucket.map((b) => {
              const chipBase =
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-medium ring-1 transition';
              const chipOn =
                b.kind === 'alternate'
                  ? 'bg-amber-100 text-amber-950 ring-amber-300/80 hover:bg-amber-50'
                  : b.kind === 'deduct'
                    ? 'bg-rose-100 text-rose-950 ring-rose-300/80 hover:bg-rose-50'
                    : 'bg-emerald-100 text-emerald-950 ring-emerald-300/80 hover:bg-emerald-50';
              const chipOff = 'bg-white text-slate-600 ring-slate-200/80 hover:bg-slate-50';
              return (
                <button
                  key={b.key}
                  type="button"
                  onClick={() => toggleBucketInclusion(b.key)}
                  className={`${chipBase} ${b.includedInPrimaryTotals ? chipOn : chipOff}`}
                  title={
                    b.includedInPrimaryTotals
                      ? `${b.label} is included in the primary draft total. Click to exclude.`
                      : `${b.label} is excluded from the primary draft total (conditional scope). Click to include.`
                  }
                >
                  <span className="font-semibold">{b.label}</span>
                  <span className="rounded-full bg-white/70 px-1.5 py-0 text-[10px] tabular-nums">
                    {b.totalLines}
                  </span>
                  {b.kind === 'alternate' ? (
                    <span className="rounded bg-amber-600/10 px-1 text-[9px] font-bold uppercase tracking-wide text-amber-900">
                      alt
                    </span>
                  ) : null}
                  {b.kind === 'deduct' ? (
                    <span className="rounded bg-rose-600/10 px-1 text-[9px] font-bold uppercase tracking-wide text-rose-900">
                      deduct
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          <div className="mt-2 overflow-hidden rounded border border-sky-200/70 bg-white/80">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-sky-50 text-left text-[10px] font-semibold uppercase tracking-wide text-sky-900">
                  <th className="px-2 py-1">Bucket</th>
                  <th className="px-2 py-1 text-right">Lines (accepted / total)</th>
                  <th className="px-2 py-1 text-right">Material (draft)</th>
                  <th className="px-2 py-1 text-right">Labor min (draft)</th>
                  <th className="px-2 py-1 text-right">In primary total?</th>
                </tr>
              </thead>
              <tbody>
                {basisSummary.byBidBucket.map((b) => (
                  <tr key={b.key} className="border-t border-sky-100 text-slate-800">
                    <td className="px-2 py-1 font-semibold">{b.label}</td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {b.acceptedPricedLines} / {b.totalLines}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {formatCurrencySafe(b.materialSubtotalPreview)}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {formatNumberSafe(b.laborMinutesSubtotalPreview, 1)}
                    </td>
                    <td className="px-2 py-1 text-right">
                      <span
                        className={`rounded-full px-1.5 py-0 text-[10px] font-bold uppercase tracking-wide ${
                          b.includedInPrimaryTotals
                            ? 'bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200/80'
                            : 'bg-slate-100 text-slate-600 ring-1 ring-slate-200/80'
                        }`}
                      >
                        {b.includedInPrimaryTotals ? 'yes' : 'no'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {div10ProposalClauseHints && div10ProposalClauseHints.length > 0 ? (
        <details className="rounded-lg border border-violet-200/80 bg-violet-50/50 px-3 py-2">
          <summary className="cursor-pointer text-[12px] font-semibold text-violet-950">Proposal clause ideas (Div 10 Brain)</summary>
          <ul className="mt-2 space-y-2 text-[12px] text-slate-800">
            {div10ProposalClauseHints.map((h) => (
              <li key={h.id} className="rounded border border-violet-100 bg-white/90 p-2">
                <span className="font-semibold">{h.clause_type}</span>
                {h.title ? <span className="text-slate-600"> — {h.title}</span> : null}
                <p className="mt-0.5 text-[11px] leading-snug text-slate-600">{h.body_preview}</p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <details className="group rounded-lg border border-slate-200 bg-white open:shadow-sm" open>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 [&::-webkit-details-marker]:hidden">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.05em] text-slate-600">Review suggested matches</p>
            <p className="text-[12px] text-slate-600">Scan top-to-bottom. Accept the suggestion or click the chevron for details.</p>
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-500 transition group-open:rotate-180" />
        </summary>
        <div className="border-t border-slate-100 px-3 pb-3 pt-2">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-slate-900 px-3 text-[12px] font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={onBulkAcceptHighConfidence}
              disabled={bulkEligibleCounts.strong === 0}
              title={bulkEligibleCounts.strong === 0 ? 'No suggested base-scope rows currently have a strong match.' : 'Accept every suggested base-scope row whose current match is strong.'}
            >
              Accept all strong matches
              <span className="rounded-full bg-white/15 px-1.5 py-0 text-[10px] font-bold tabular-nums">{bulkEligibleCounts.strong}</span>
            </button>
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-[12px] font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={onBulkAcceptTierAStrongB}
              disabled={bulkEligibleCounts.tierAOrB === 0}
              title={bulkEligibleCounts.tierAOrB === 0 ? 'No Tier A or Tier B rows are still awaiting confirmation. Tier A rows are often auto-accepted during import.' : 'Accept all Tier A rows and any Tier B rows that have a catalog candidate.'}
            >
              Accept Tier A + Tier B matches
              <span className="rounded-full bg-slate-900/10 px-1.5 py-0 text-[10px] font-bold tabular-nums text-slate-900">{bulkEligibleCounts.tierAOrB}</span>
            </button>
            <button
              type="button"
              className="ui-btn-secondary inline-flex h-8 items-center gap-1.5 px-3 text-[12px] disabled:cursor-not-allowed disabled:opacity-50"
              onClick={onBulkIgnoreLowConfidence}
              disabled={bulkEligibleCounts.weakOrNoMatch === 0}
              title={bulkEligibleCounts.weakOrNoMatch === 0 ? 'No weak / unmatched rows to ignore.' : `Ignore every row whose current match is weak, missing, or scored below ${ESTIMATE_REVIEW_LOW_SCORE_THRESHOLD}.`}
            >
              Ignore weak matches (score &lt; {ESTIMATE_REVIEW_LOW_SCORE_THRESHOLD})
              <span className="rounded-full bg-slate-900/10 px-1.5 py-0 text-[10px] font-bold tabular-nums text-slate-900">{bulkEligibleCounts.weakOrNoMatch}</span>
            </button>
            <div className="ml-auto flex items-center gap-2">
              <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5 text-[11px] font-semibold">
                <button
                  type="button"
                  className={`rounded-sm px-2 py-1 ${matchDensity === 'compact' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                  onClick={() => setMatchDensity('compact')}
                >
                  Compact
                </button>
                <button
                  type="button"
                  className={`rounded-sm px-2 py-1 ${matchDensity === 'comfortable' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                  onClick={() => setMatchDensity('comfortable')}
                >
                  Comfortable
                </button>
              </div>
              <button
                type="button"
                className="text-[11px] font-medium text-slate-600 underline decoration-slate-300 underline-offset-2 hover:text-slate-900"
                onClick={() => {
                  const allFps = draft.lineSuggestions.map((r) => r.reviewLineFingerprint);
                  const anyClosed = allFps.some((fp) => !expandedFps[fp]);
                  const next: Record<string, boolean> = {};
                  for (const fp of allFps) next[fp] = anyClosed;
                  setExpandedFps(next);
                }}
              >
                {draft.lineSuggestions.every((r) => expandedFps[r.reviewLineFingerprint]) ? 'Collapse all' : 'Expand all'}
              </button>
            </div>
          </div>
          <div className="max-h-[min(70vh,760px)] overflow-y-auto rounded-md border border-slate-200 bg-white pr-0.5">
            <div className="sticky top-0 z-10 grid grid-cols-[1.25rem_minmax(0,1.05fr)_minmax(0,1.35fr)_minmax(0,10rem)_auto] items-center gap-2 border-b border-slate-200 bg-slate-50/95 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 backdrop-blur sm:gap-3 sm:px-3">
              <span />
              <span>Source line</span>
              <span>Suggested catalog match</span>
              <span>Status</span>
              <span className="text-right">Action</span>
            </div>
            <div className="space-y-0">
              {sectionGroups.map((section) => {
                // Sub-group the base scope section by sourceBidBucket so estimators can see
                // Base Bid / Alt 1 clusters at a glance. Only kicks in when multiple buckets exist.
                const isBase = section.key === 'base';
                const bidGroups = (() => {
                  if (!isBase || !basisSummary.hasBidSplits) return null;
                  const groups = new Map<string, IntakeLineEstimateSuggestion[]>();
                  for (const row of section.rows) {
                    const key = (row.sourceBidBucket || '').trim();
                    const arr = groups.get(key) || [];
                    arr.push(row);
                    groups.set(key, arr);
                  }
                  return Array.from(groups.entries())
                    .map(([key, rows]) => ({
                      key,
                      label: key || '(no bucket)',
                      kind: classifyBidBucketKind(key) as BidBucketKind,
                      rows,
                    }))
                    .sort(compareBidBucketKeys);
                })();
                return (
                  <details key={section.key} className="group/sec" open={section.defaultOpen}>
                    <summary className="sticky top-[30px] z-[9] flex cursor-pointer list-none items-center justify-between gap-2 border-b border-slate-200 bg-slate-100/90 px-2 py-1.5 text-left backdrop-blur [&::-webkit-details-marker]:hidden sm:px-3">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-slate-700">
                        {section.title}
                        <span className="ml-1.5 font-normal text-slate-500">({section.rows.length})</span>
                      </span>
                      <ChevronDown className="h-3.5 w-3.5 text-slate-500 transition group-open/sec:rotate-180" />
                    </summary>
                    <div>
                      {bidGroups
                        ? bidGroups.map((g) => {
                            const included = basisSummary.byBidBucket.find((b) => b.key === g.key)?.includedInPrimaryTotals ?? true;
                            const accent =
                              g.kind === 'alternate'
                                ? 'border-amber-300/80 bg-amber-50/70'
                                : g.kind === 'deduct'
                                  ? 'border-rose-300/80 bg-rose-50/70'
                                  : 'border-sky-200/80 bg-sky-50/60';
                            return (
                              <div key={g.key || '(unbucketed)'}>
                                <div
                                  className={`flex items-center justify-between gap-2 border-y ${accent} px-3 py-1 text-[11px] font-semibold text-slate-700`}
                                  title={
                                    included
                                      ? `${g.label} — included in primary draft totals.`
                                      : `${g.label} — excluded from primary draft totals (click the bucket chip above to include).`
                                  }
                                >
                                  <span>
                                    <span className="uppercase tracking-wide">{g.label}</span>
                                    <span className="ml-1.5 font-normal text-slate-500">({g.rows.length})</span>
                                  </span>
                                  <span
                                    className={`rounded-full px-1.5 py-0 text-[9px] font-bold uppercase tracking-wide ${
                                      included
                                        ? 'bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200/80'
                                        : 'bg-slate-100 text-slate-600 ring-1 ring-slate-200/80'
                                    }`}
                                  >
                                    {included ? 'in primary total' : 'excluded from primary'}
                                  </span>
                                </div>
                                {g.rows.map((row) => renderLineRow(row))}
                              </div>
                            );
                          })
                        : section.rows.map((row) => renderLineRow(row))}
                    </div>
                  </details>
                );
              })}
            </div>
          </div>
        </div>
      </details>

      {jobPatches.length > 0 ? (
        <details className="group rounded-lg border border-slate-200 bg-white">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.05em] text-slate-600">Suggested job conditions</p>
              <p className="text-[12px] text-slate-600">Document-derived conditions — suggestion only until you accept.</p>
            </div>
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-500 transition group-open:rotate-180" />
          </summary>
          <div className="space-y-2 border-t border-slate-100 px-3 pb-3 pt-2">
            <button type="button" className="ui-btn-secondary mb-2 h-8 px-3 text-[12px]" onClick={onApplyAllSuggestedJobConditions}>
              Apply all suggested job conditions to draft
            </button>
            {jobPatches.map((jc) => {
              const st = jobConditionById[jc.id] ?? jc.applicationStatus;
              return (
                <div key={jc.id} className="flex flex-wrap items-start justify-between gap-2 rounded border border-slate-100 bg-slate-50/80 p-2">
                  <div className="min-w-0 flex-1">
                    <label className="flex items-start gap-2 text-[12px]">
                      <input type="checkbox" checked={jc.suggestedState} readOnly className="mt-0.5" aria-label="Suggested state" />
                      <span>
                        <span className="font-semibold text-slate-900">{jc.label}</span>
                        {jc.reason ? <span className="mt-0.5 block text-slate-600">{jc.reason}</span> : null}
                      </span>
                    </label>
                    <div className="mt-1">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${
                          st === 'accepted' ? 'bg-emerald-600 text-white' : st === 'ignored' ? 'bg-slate-300 text-slate-800' : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {applicationStatusLabel(st)}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button type="button" className="ui-btn-secondary h-7 px-2 text-[12px]" onClick={() => onSetJobConditionStatus(jc.id, 'accepted')}>
                      Accept
                    </button>
                    <button type="button" className="h-7 rounded border border-slate-200 bg-white px-2 text-[12px]" onClick={() => onSetJobConditionStatus(jc.id, 'ignored')}>
                      Ignore
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      ) : null}

      {projectModIds.length > 0 ? (
        <details className="group rounded-lg border border-emerald-200/80 bg-emerald-50/20">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.05em] text-emerald-900">Suggested project modifiers</p>
              <p className="text-[12px] text-emerald-950/80">Catalog modifiers (project scope) — not line-level pricing adders in this step.</p>
            </div>
            <ChevronDown className="h-4 w-4 shrink-0 text-emerald-800 transition group-open:rotate-180" />
          </summary>
          <div className="space-y-2 border-t border-emerald-100 px-3 pb-3 pt-2">
            <button type="button" className="ui-btn-secondary mb-2 h-8 px-3 text-[11px]" onClick={onBulkAcceptAllSuggestedProjectModifiers}>
              Accept all suggested project modifiers
            </button>
            {projectModIds.map((modId) => {
              const st = projectModifierById[modId] ?? 'suggested';
              const name = modifierLabel.get(modId) || modId;
              return (
                <div key={modId} className="flex flex-wrap items-center justify-between gap-2 rounded border border-emerald-100 bg-white p-2">
                  <div>
                    <p className="text-[12px] font-semibold text-slate-900">{name}</p>
                    <p className="text-[12px] text-slate-500">Matcher / catalog mapping</p>
                    <span
                      className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[9px] font-semibold ${
                        st === 'accepted' ? 'bg-emerald-600 text-white' : st === 'ignored' ? 'bg-slate-300 text-slate-800' : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {applicationStatusLabel(st)}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <button type="button" className="ui-btn-secondary h-7 px-2 text-[12px]" onClick={() => onSetProjectModifierStatus(modId, 'accepted')}>
                      Accept
                    </button>
                    <button type="button" className="h-7 rounded border border-slate-200 bg-white px-2 text-[12px]" onClick={() => onSetProjectModifierStatus(modId, 'ignored')}>
                      Ignore
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function shortMatchReason(reason: string): string {
  const r = String(reason || '').trim();
  if (!r) return '';
  const stripped = r.replace(/;\s*Cross-line consistency\s*\([^)]+\)\s*\.?/gi, '').trim();
  const first = stripped.split(';')[0]?.trim() || stripped;
  if (first.length <= 120) return first;
  return `${first.slice(0, 117)}…`;
}
