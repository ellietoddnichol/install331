import React, { useMemo, useState } from 'react';
import { ChevronDown, MoreHorizontal } from 'lucide-react';
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
  computeDraftBasisSummary,
  estimateReviewAcceptSourceLabel,
  ESTIMATE_REVIEW_LOW_SCORE_THRESHOLD,
  findAiClassificationForFingerprint,
  findReviewLineForFingerprint,
  formatParsingHintSubtitle,
  getActiveCatalogMatchForRow,
  groupDraftLinesByScopeBucket,
  matchConfidenceTier,
  matchSignalTags,
  scopeBucketShortLabel,
  type DraftBasisSummary,
  type EstimateReviewLineState,
} from '../../shared/utils/intakeEstimateReview';
import { formatCurrencySafe, formatNumberSafe } from '../../utils/numberFormat';

function ConfidencePill({ tier }: { tier: 'high' | 'medium' | 'low' }) {
  const cls =
    tier === 'high'
      ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/80'
      : tier === 'medium'
        ? 'bg-amber-50 text-amber-900 ring-1 ring-amber-200/70'
        : 'bg-slate-100 text-slate-700 ring-1 ring-slate-200/80';
  const label = tier === 'high' ? 'High confidence' : tier === 'medium' ? 'Medium' : 'Low';
  return <span className={`rounded-full px-2 py-0.5 text-[12px] font-medium ${cls}`}>{label}</span>;
}

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

  const basisSummary: DraftBasisSummary = useMemo(
    () => computeDraftBasisSummary(draft, lineByFingerprint, aiSuggestions ?? null),
    [draft, lineByFingerprint, aiSuggestions]
  );

  const grouped = useMemo(() => groupDraftLinesByScopeBucket(draft.lineSuggestions), [draft.lineSuggestions]);

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

  function renderLineCard(row: IntakeLineEstimateSuggestion) {
    const fp = row.reviewLineFingerprint;
    const st = lineStateForRow(row, lineByFingerprint);
    const match = getActiveCatalogMatchForRow(row, st);
    const tier = match ? matchConfidenceTier(match.confidence) : 'low';
    const aiRow = findAiClassificationForFingerprint(fp, reviewLines, aiSuggestions ?? null);
    const hint = formatParsingHintSubtitle(aiRow);
    const needsReview = rowNeedsEstimatorReview(row, st, match);
    const tags = match ? matchSignalTags(match.reason, row.matcherSignals) : [];
    const catItem = catalogItemForSelection(row, st);
    const selectedId = st.selectedCatalogItemId ?? row.suggestedCatalogItemId;

    return (
      <div
        key={fp}
        className="rounded-lg border border-slate-200/90 bg-white px-3 py-2 shadow-sm"
      >
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:gap-4">
          {/* Left: source */}
          <div className="min-w-0 flex-1 lg:max-w-[min(100%,280px)]">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">Source line</p>
            <p className="mt-0.5 text-sm font-medium leading-snug text-slate-900">{linePreviewText(fp)}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <ScopeChip bucket={row.scopeBucket} />
              {row.catalogAutoApplyTier ? (
                <span
                  className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ring-1 ${
                    row.catalogAutoApplyTier === 'A'
                      ? 'bg-emerald-50 text-emerald-900 ring-emerald-200/80'
                      : row.catalogAutoApplyTier === 'B'
                        ? 'bg-amber-50 text-amber-950 ring-amber-200/70'
                        : 'bg-slate-100 text-slate-600 ring-slate-200/80'
                  }`}
                  title="Automation tier: A = eligible for auto-link / pre-accept; B = suggest; C = needs review"
                >
                  Tier {row.catalogAutoApplyTier}
                </span>
              ) : null}
              {needsReview ? (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[12px] font-semibold text-amber-950 ring-1 ring-amber-200/80">
                  Review needed
                </span>
              ) : null}
            </div>
            {hint ? <p className="mt-1 text-[12px] leading-snug text-slate-500">{hint}</p> : null}
            <p className="mt-1 font-mono text-[9px] text-slate-400" title={fp}>
              {fp.slice(0, 12)}…
            </p>
          </div>

          {/* Middle: match */}
          <div className="min-w-0 flex-[1.4] border-t border-slate-100 pt-2 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">Current choice</p>
              {st.applicationStatus === 'accepted' || st.applicationStatus === 'replaced' ? (
                <StatusPill status={st.applicationStatus} />
              ) : (
                <span className="text-[12px] text-slate-500">Not confirmed</span>
              )}
            </div>
            {st.applicationStatus === 'accepted' && estimateReviewAcceptSourceLabel(st.acceptSource) ? (
              <p
                className={`mt-1 max-w-xl text-[10px] font-medium leading-snug ${
                  st.acceptSource === 'auto_strong_match' ? 'text-sky-800' : st.acceptSource === 'server' ? 'text-slate-600' : 'text-emerald-800'
                }`}
                title={
                  st.acceptSource === 'auto_strong_match'
                    ? 'This line started accepted because the catalog match was strong. You can still Replace or Ignore.'
                    : st.acceptSource === 'server'
                      ? 'Marked accepted when the import was built (e.g. Tier A or parser).'
                      : 'You confirmed this line in review.'
                }
              >
                {estimateReviewAcceptSourceLabel(st.acceptSource)}
              </p>
            ) : null}
            {match && selectedId ? (
              <>
                <div className="mt-1 font-mono text-sm font-semibold text-slate-900">{catItem?.sku ?? match.sku}</div>
                <div className="text-[12px] leading-snug text-slate-800">{catItem?.description ?? match.description}</div>
                {catItem ? (
                  <p className="mt-0.5 text-[12px] text-slate-500">
                    {[catItem.category, catItem.manufacturer].filter(Boolean).join(' · ') || null}
                  </p>
                ) : null}
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <ConfidencePill tier={tier} />
                  {tags.map((t) => (
                    <span
                      key={t}
                      className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-slate-600"
                    >
                      {t}
                    </span>
                  ))}
                </div>
                <p className="mt-1 text-[12px] leading-snug text-slate-600 line-clamp-2">{shortMatchReason(match.reason)}</p>
                <button
                  type="button"
                  className="mt-1 text-[12px] font-medium text-sky-700 hover:underline"
                  onClick={() => setOpenTechnicalFp((cur) => (cur === fp ? null : fp))}
                >
                  {openTechnicalFp === fp ? 'Hide technical details' : 'Technical details (score, full reason)'}
                </button>
                {openTechnicalFp === fp ? (
                  <div className="mt-1 rounded border border-slate-100 bg-slate-50/90 px-2 py-1.5 font-mono text-[12px] text-slate-600">
                    <div>Score: {formatNumberSafe(match.score, 3)}</div>
                    <div className="mt-0.5 whitespace-pre-wrap break-words">{match.reason}</div>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="mt-1 text-sm text-amber-900">No catalog match — use Replace to pick an item.</p>
            )}

            {row.topCatalogCandidates.filter((c) => c.catalogItemId !== selectedId).length > 0 ? (
              <div className="mt-2 border-t border-slate-100 pt-2">
                <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">Other likely matches</p>
                <div className="mt-1 grid gap-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  {row.topCatalogCandidates
                    .filter((c) => c.catalogItemId !== selectedId)
                    .slice(0, 3)
                    .map((c) => renderAlternativeOption(c, fp, false))}
                </div>
              </div>
            ) : null}

            {row.div10Brain ? (
              <div className="mt-2 border-t border-violet-100 bg-violet-50/40 pt-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[12px] font-semibold uppercase tracking-wide text-violet-900">Div 10 Brain (advisory)</p>
                  <span className="text-[10px] font-medium text-violet-800">Does not change pricing or auto-accept</span>
                </div>
                {row.div10Brain.div10Error ? (
                  <p className="mt-1 text-[12px] text-red-800">{row.div10Brain.div10Error}</p>
                ) : null}
                {row.div10Brain.classify ? (
                  <p className="mt-1 text-[12px] leading-snug text-slate-800">
                    <span className="font-semibold text-violet-950">Classify:</span> {row.div10Brain.classify.line_kind} ·{' '}
                    {row.div10Brain.classify.scope_bucket} · {row.div10Brain.classify.category}
                    {row.div10Brain.classify.needs_human_review ? (
                      <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-950">Review</span>
                    ) : null}
                    <span className="mt-0.5 block text-[11px] text-slate-600">{row.div10Brain.classify.reasoning_summary}</span>
                  </p>
                ) : null}
                {row.div10Brain.catalogAssist ? (
                  <p className="mt-1 text-[12px] text-slate-800">
                    <span className="font-semibold text-violet-950">Catalog assist:</span> {row.div10Brain.catalogAssist.confidence} confidence —{' '}
                    {row.div10Brain.catalogAssist.rationale}
                    {row.div10Brain.catalogAssist.needs_human_review ? (
                      <span className="ml-1 text-[11px] font-medium text-amber-900">Estimator review suggested.</span>
                    ) : null}
                  </p>
                ) : null}
                {row.div10Brain.modifierAssist ? (
                  <p className="mt-1 text-[12px] text-slate-800">
                    <span className="font-semibold text-violet-950">Modifier ideas (keys):</span>{' '}
                    {[...row.div10Brain.modifierAssist.suggested_line_modifier_keys, ...row.div10Brain.modifierAssist.suggested_project_modifier_keys].join(', ') ||
                      '—'}
                    <span className="mt-0.5 block text-[11px] text-slate-600">{row.div10Brain.modifierAssist.confidence_notes}</span>
                  </p>
                ) : null}
                {row.div10Brain.retrieval && row.div10Brain.retrieval.length > 0 ? (
                  <div className="mt-1">
                    <button
                      type="button"
                      className="text-[12px] font-medium text-violet-800 hover:underline"
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

          {/* Right: primary Accept + overflow for catalog / ignore (shortlist stays in the match column). */}
          <div className="relative flex shrink-0 flex-row items-start gap-1.5 border-t border-slate-100 pt-2 lg:w-[152px] lg:flex-col lg:border-l lg:border-t-0 lg:pl-3 lg:pt-0">
            {st.applicationStatus === 'suggested' ? (
              <button
                type="button"
                className="min-h-10 min-w-0 flex-1 rounded-md bg-slate-900 px-3 py-2 text-center text-[12px] font-semibold text-white shadow-sm hover:bg-slate-800 lg:flex-none lg:min-h-0 lg:h-10"
                onClick={() => onAcceptLine(fp)}
              >
                Accept
              </button>
            ) : (
              <div className="flex min-h-10 flex-1 items-center rounded-md border border-slate-200/80 bg-slate-50/90 px-2 text-[11px] font-medium text-slate-700 lg:flex-none lg:min-h-8">
                {applicationStatusLabel(st.applicationStatus)}
              </div>
            )}
            <div className="relative shrink-0">
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900 lg:h-8 lg:w-8"
                aria-haspopup="menu"
                aria-expanded={openRowActionsFp === fp}
                aria-label="Line actions"
                onClick={() => setOpenRowActionsFp((cur) => (cur === fp ? null : fp))}
              >
                <MoreHorizontal className="h-4 w-4" aria-hidden />
              </button>
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
                    {st.applicationStatus === 'suggested' ? (
                      <button
                        type="button"
                        role="menuitem"
                        className="block w-full px-3 py-3 text-left text-[12px] text-slate-800 hover:bg-slate-50 sm:py-2 lg:hidden"
                        onClick={() => {
                          onAcceptLine(fp);
                          setOpenRowActionsFp(null);
                        }}
                      >
                        Accept line
                      </button>
                    ) : null}
                    <button
                      type="button"
                      role="menuitem"
                      className="block w-full px-3 py-3 text-left text-[12px] text-slate-800 hover:bg-slate-50 sm:py-2"
                      onClick={() => {
                        onOpenCatalogPicker(fp);
                        setOpenRowActionsFp(null);
                      }}
                    >
                      Find catalog item…
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="block w-full px-3 py-3 text-left text-[12px] text-red-700 hover:bg-red-50/80 sm:py-2"
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
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      {/* Prominent draft summary — always visible */}
      <div className="rounded-lg border border-slate-200/90 bg-gradient-to-r from-slate-50/95 to-white px-3 py-2.5 shadow-sm">
        <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-slate-700">Pre-pricing review</p>
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
            <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-slate-600">Review suggested matches</p>
            <p className="text-[12px] text-slate-600">Confirm or change each catalog link before creating the project.</p>
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-500 transition group-open:rotate-180" />
        </summary>
        <div className="border-t border-slate-100 px-3 pb-3 pt-2">
          <div className="mb-2 flex flex-wrap gap-2">
            <button type="button" className="h-8 rounded-md bg-slate-900 px-3 text-[12px] font-semibold text-white hover:bg-slate-800" onClick={onBulkAcceptHighConfidence}>
              Accept all strong matches
            </button>
            <button
              type="button"
              className="h-8 rounded-md border border-slate-300 bg-white px-3 text-[12px] font-semibold text-slate-800 hover:bg-slate-50"
              onClick={onBulkAcceptTierAStrongB}
            >
              Accept Tier A + strong Tier B
            </button>
            <button type="button" className="ui-btn-secondary h-8 px-3 text-[12px]" onClick={onBulkIgnoreLowConfidence}>
              Ignore weak matches (score &lt; {ESTIMATE_REVIEW_LOW_SCORE_THRESHOLD})
            </button>
          </div>
          <div className="max-h-[min(60vh,640px)] space-y-3 overflow-y-auto pr-0.5">
            {sectionGroups.map((section) => (
              <details key={section.key} className="group/sec rounded-md border border-slate-100 bg-slate-50/40" open={section.defaultOpen}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2 py-1.5 text-left [&::-webkit-details-marker]:hidden">
                  <span className="text-[12px] font-bold text-slate-800">
                    {section.title}
                    <span className="ml-1.5 font-normal text-slate-500">({section.rows.length})</span>
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-slate-500 transition group-open/sec:rotate-180" />
                </summary>
                <div className="space-y-2 border-t border-slate-100 bg-white/80 p-2">{section.rows.map((row) => renderLineCard(row))}</div>
              </details>
            ))}
          </div>
        </div>
      </details>

      {jobPatches.length > 0 ? (
        <details className="group rounded-lg border border-slate-200 bg-white">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-slate-600">Suggested job conditions</p>
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
              <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-emerald-900">Suggested project modifiers</p>
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
