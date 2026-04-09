import React, { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { ModifierRecord } from '../../shared/types/estimator';
import type {
  IntakeAiSuggestions,
  IntakeApplicationStatus,
  IntakeCatalogMatch,
  IntakeEstimateDraft,
  IntakeLineEstimateSuggestion,
  IntakeReviewLine,
  IntakeScopeBucket,
  IntakeSuggestedJobConditionPatch,
} from '../../shared/types/intake';
import type { CatalogItem } from '../../types';
import {
  applicationStatusLabel,
  computeDraftBasisSummary,
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
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${cls}`}>{label}</span>;
}

function StatusPill({ status }: { status: IntakeApplicationStatus }) {
  if (status === 'suggested') {
    return <span className="text-[10px] text-slate-500">Not confirmed</span>;
  }
  const cls =
    status === 'accepted'
      ? 'bg-emerald-600 text-white'
      : status === 'replaced'
        ? 'bg-sky-700 text-white'
        : 'bg-slate-400 text-white';
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>{applicationStatusLabel(status)}</span>;
}

function ScopeChip({ bucket }: { bucket: IntakeScopeBucket }) {
  const muted =
    bucket === 'excluded_by_others' || bucket === 'informational_only'
      ? 'bg-violet-50 text-violet-900 ring-violet-200/60'
      : bucket === 'priced_base_scope'
        ? 'bg-sky-50 text-sky-900 ring-sky-200/60'
        : 'bg-slate-50 text-slate-700 ring-slate-200/60';
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${muted}`} title={bucket}>
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
  onBulkIgnoreLowConfidence: () => void;
  onOpenCatalogPicker: (fingerprint: string) => void;
  jobConditionById: Record<string, IntakeApplicationStatus>;
  onSetJobConditionStatus: (id: string, status: IntakeApplicationStatus) => void;
  onApplyAllSuggestedJobConditions: () => void;
  projectModifierById: Record<string, IntakeApplicationStatus>;
  onSetProjectModifierStatus: (modifierId: string, status: IntakeApplicationStatus) => void;
  pricingModeDraft: string;
  onApplySuggestedPricingMode: () => void;
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
  onBulkIgnoreLowConfidence,
  onOpenCatalogPicker,
  jobConditionById,
  onSetJobConditionStatus,
  onApplyAllSuggestedJobConditions,
  projectModifierById,
  onSetProjectModifierStatus,
  pricingModeDraft,
  onApplySuggestedPricingMode,
}: IntakeEstimateReviewPanelProps) {
  const [openTechnicalFp, setOpenTechnicalFp] = useState<string | null>(null);

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
        <div className="font-mono text-[11px] font-semibold text-slate-900">{c.sku}</div>
        <div className="text-[11px] leading-snug text-slate-800 line-clamp-2">{c.description}</div>
        {meta ? <div className="mt-0.5 text-[10px] text-slate-500 line-clamp-1">{meta}</div> : null}
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
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Source line</p>
            <p className="mt-0.5 text-sm font-medium leading-snug text-slate-900">{linePreviewText(fp)}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <ScopeChip bucket={row.scopeBucket} />
              {needsReview ? (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-950 ring-1 ring-amber-200/80">
                  Review needed
                </span>
              ) : null}
            </div>
            {hint ? <p className="mt-1 text-[10px] leading-snug text-slate-500">{hint}</p> : null}
            <p className="mt-1 font-mono text-[9px] text-slate-400" title={fp}>
              {fp.slice(0, 12)}…
            </p>
          </div>

          {/* Middle: match */}
          <div className="min-w-0 flex-[1.4] border-t border-slate-100 pt-2 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Current choice</p>
              {st.applicationStatus === 'accepted' || st.applicationStatus === 'replaced' ? (
                <StatusPill status={st.applicationStatus} />
              ) : (
                <span className="text-[10px] text-slate-500">Not confirmed</span>
              )}
            </div>
            {match && selectedId ? (
              <>
                <div className="mt-1 font-mono text-sm font-semibold text-slate-900">{catItem?.sku ?? match.sku}</div>
                <div className="text-[12px] leading-snug text-slate-800">{catItem?.description ?? match.description}</div>
                {catItem ? (
                  <p className="mt-0.5 text-[10px] text-slate-500">
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
                <p className="mt-1 text-[11px] leading-snug text-slate-600 line-clamp-2">{shortMatchReason(match.reason)}</p>
                <button
                  type="button"
                  className="mt-1 text-[10px] font-medium text-sky-700 hover:underline"
                  onClick={() => setOpenTechnicalFp((cur) => (cur === fp ? null : fp))}
                >
                  {openTechnicalFp === fp ? 'Hide technical details' : 'Technical details (score, full reason)'}
                </button>
                {openTechnicalFp === fp ? (
                  <div className="mt-1 rounded border border-slate-100 bg-slate-50/90 px-2 py-1.5 font-mono text-[10px] text-slate-600">
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
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Other likely matches</p>
                <div className="mt-1 grid gap-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  {row.topCatalogCandidates
                    .filter((c) => c.catalogItemId !== selectedId)
                    .slice(0, 3)
                    .map((c) => renderAlternativeOption(c, fp, false))}
                </div>
              </div>
            ) : null}
          </div>

          {/* Right: actions */}
          <div className="flex shrink-0 flex-col gap-1.5 border-t border-slate-100 pt-2 lg:w-[140px] lg:border-l lg:border-t-0 lg:pl-3 lg:pt-0">
            <button
              type="button"
              className="h-8 rounded-md bg-slate-900 px-3 text-center text-[11px] font-semibold text-white shadow-sm hover:bg-slate-800"
              onClick={() => onAcceptLine(fp)}
            >
              Accept
            </button>
            <details className="group/replace rounded-md border border-slate-200 bg-slate-50/80">
              <summary className="flex h-8 cursor-pointer list-none items-center justify-center gap-1 rounded-md px-2 text-[11px] font-medium text-slate-800 hover:bg-slate-100 [&::-webkit-details-marker]:hidden">
                Replace
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500 transition group-open/replace:rotate-180" />
              </summary>
              <div className="space-y-1.5 border-t border-slate-200 bg-white px-2 py-2">
                <p className="text-[9px] font-semibold uppercase text-slate-500">Pick from shortlist</p>
                <div className="max-h-40 space-y-1 overflow-y-auto">
                  {row.topCatalogCandidates.map((c) => renderAlternativeOption(c, fp, c.catalogItemId === selectedId))}
                </div>
                <button
                  type="button"
                  className="w-full rounded border border-slate-200 bg-white py-1.5 text-[10px] font-medium text-slate-700 hover:bg-slate-50"
                  onClick={() => {
                    onOpenCatalogPicker(fp);
                  }}
                >
                  Find different item…
                </button>
              </div>
            </details>
            <button
              type="button"
              className="py-1.5 text-center text-[11px] font-medium text-red-700/90 hover:text-red-800 hover:underline"
              onClick={() => onIgnoreLine(fp)}
            >
              Ignore
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      {/* Prominent draft summary — always visible */}
      <div className="rounded-lg border border-amber-200/90 bg-gradient-to-r from-amber-50/90 to-white px-3 py-2.5 shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-amber-950/90">Draft estimate basis</p>
        <p className="text-[10px] text-amber-900/80">Preliminary only — not final bid pricing.</p>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-slate-800">
          <span>
            <span className="text-slate-500">Accepted lines</span>{' '}
            <span className="font-bold tabular-nums text-slate-900">{basisSummary.acceptedPricedLines}</span>
          </span>
          <span>
            <span className="text-slate-500">Review needed</span>{' '}
            <span className="font-bold tabular-nums text-amber-900">{basisSummary.needsReviewPricedLines}</span>
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
          <span>
            <span className="text-slate-500">Draft material</span>{' '}
            <span className="font-semibold tabular-nums">{formatCurrencySafe(basisSummary.materialSubtotalPreview)}</span>
          </span>
          <span>
            <span className="text-slate-500">Draft labor (min)</span>{' '}
            <span className="font-semibold tabular-nums">{formatNumberSafe(basisSummary.laborMinutesSubtotalPreview, 1)}</span>
          </span>
        </div>
        {aiSuggestions?.pricingModeSuggested ? (
          <button type="button" className="mt-2 h-7 rounded-md border border-amber-300/80 bg-white px-2 text-[10px] font-semibold text-amber-950 hover:bg-amber-50" onClick={onApplySuggestedPricingMode}>
            Apply suggested pricing mode to project draft
          </button>
        ) : null}
        {basisSummary.warnings.length > 0 ? (
          <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[10px] text-amber-950/90">
            {basisSummary.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        ) : null}
      </div>

      <details className="group rounded-lg border border-slate-200 bg-white open:shadow-sm" open>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 [&::-webkit-details-marker]:hidden">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600">Review suggested matches</p>
            <p className="text-[11px] text-slate-600">Confirm or change each catalog link before creating the project.</p>
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-500 transition group-open:rotate-180" />
        </summary>
        <div className="border-t border-slate-100 px-3 pb-3 pt-2">
          <div className="mb-2 flex flex-wrap gap-2">
            <button type="button" className="h-8 rounded-md bg-slate-900 px-3 text-[11px] font-semibold text-white hover:bg-slate-800" onClick={onBulkAcceptHighConfidence}>
              Accept all strong matches
            </button>
            <button type="button" className="ui-btn-secondary h-8 px-3 text-[11px]" onClick={onBulkIgnoreLowConfidence}>
              Ignore weak matches (score &lt; {ESTIMATE_REVIEW_LOW_SCORE_THRESHOLD})
            </button>
          </div>
          <div className="max-h-[min(60vh,640px)] space-y-3 overflow-y-auto pr-0.5">
            {sectionGroups.map((section) => (
              <details key={section.key} className="group/sec rounded-md border border-slate-100 bg-slate-50/40" open={section.defaultOpen}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2 py-1.5 text-left [&::-webkit-details-marker]:hidden">
                  <span className="text-[11px] font-bold text-slate-800">
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
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600">Suggested job conditions</p>
              <p className="text-[11px] text-slate-600">Document-derived conditions — suggestion only until you accept.</p>
            </div>
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-500 transition group-open:rotate-180" />
          </summary>
          <div className="space-y-2 border-t border-slate-100 px-3 pb-3 pt-2">
            <button type="button" className="ui-btn-secondary mb-2 h-8 px-3 text-[11px]" onClick={onApplyAllSuggestedJobConditions}>
              Apply all suggested job conditions to draft
            </button>
            {jobPatches.map((jc) => {
              const st = jobConditionById[jc.id] ?? jc.applicationStatus;
              return (
                <div key={jc.id} className="flex flex-wrap items-start justify-between gap-2 rounded border border-slate-100 bg-slate-50/80 p-2">
                  <div className="min-w-0 flex-1">
                    <label className="flex items-start gap-2 text-[11px]">
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
                    <button type="button" className="ui-btn-secondary h-7 px-2 text-[10px]" onClick={() => onSetJobConditionStatus(jc.id, 'accepted')}>
                      Accept
                    </button>
                    <button type="button" className="h-7 rounded border border-slate-200 bg-white px-2 text-[10px]" onClick={() => onSetJobConditionStatus(jc.id, 'ignored')}>
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
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-900">Suggested project modifiers</p>
              <p className="text-[11px] text-emerald-950/80">Catalog modifiers (project scope) — not line-level pricing adders in this step.</p>
            </div>
            <ChevronDown className="h-4 w-4 shrink-0 text-emerald-800 transition group-open:rotate-180" />
          </summary>
          <div className="space-y-2 border-t border-emerald-100 px-3 pb-3 pt-2">
            {projectModIds.map((modId) => {
              const st = projectModifierById[modId] ?? 'suggested';
              const name = modifierLabel.get(modId) || modId;
              return (
                <div key={modId} className="flex flex-wrap items-center justify-between gap-2 rounded border border-emerald-100 bg-white p-2">
                  <div>
                    <p className="text-[11px] font-semibold text-slate-900">{name}</p>
                    <p className="text-[10px] text-slate-500">Matcher / catalog mapping</p>
                    <span
                      className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[9px] font-semibold ${
                        st === 'accepted' ? 'bg-emerald-600 text-white' : st === 'ignored' ? 'bg-slate-300 text-slate-800' : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {applicationStatusLabel(st)}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <button type="button" className="ui-btn-secondary h-7 px-2 text-[10px]" onClick={() => onSetProjectModifierStatus(modId, 'accepted')}>
                      Accept
                    </button>
                    <button type="button" className="h-7 rounded border border-slate-200 bg-white px-2 text-[10px]" onClick={() => onSetProjectModifierStatus(modId, 'ignored')}>
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
