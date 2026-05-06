import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowUpDown, Clipboard, Database, ExternalLink, Package, Plus, RefreshCw, Search, ShieldCheck, Trash2 } from 'lucide-react';
import { api } from '../services/api';
import { useCatalogWorkspaceQuery } from '../hooks/api/useCatalogWorkspaceQuery.ts';
import { queryKeys } from '../lib/queryKeys.ts';
import { CatalogSyncStatusRecord, BundleRecord, ModifierRecord } from '../shared/types/estimator';
import { CatalogItem } from '../types';
import { formatCurrencySafe, formatNumberSafe, formatPercentSafe } from '../utils/numberFormat';
import { isDisplayableCatalogImageUrl } from '../shared/utils/catalogImageUrl';
import { getErrorMessage } from '../shared/utils/errorMessage';
import { INSTALL_LABOR_FAMILY_OPTIONS } from '../shared/utils/installLaborFamilyOptions';
import {
  CATALOG_REVIEW_QUEUE_KEYS,
  catalogCuratorPath,
  catalogCuratorPathDeep,
  guessCatalogReviewSkuToken,
  mergeCatalogReviewSources,
  resolveCatalogReviewExportLines,
  type CatalogReviewQueueKey,
} from '../shared/catalogReviewQueues.ts';

function CatalogItemThumb({ url }: { url: string | undefined }) {
  const [broken, setBroken] = useState(false);
  if (!url || !isDisplayableCatalogImageUrl(url) || broken) {
    return (
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-dashed border-app-line bg-app-surface-soft text-[9px] text-app-muted"
        title={url && !isDisplayableCatalogImageUrl(url) ? 'URL not shown as image' : undefined}
      >
        —
      </div>
    );
  }
  return (
    <img
      src={url}
      alt=""
      className="h-10 w-10 shrink-0 rounded border border-app-line bg-app-surface object-contain"
      loading="lazy"
      onError={() => setBroken(true)}
    />
  );
}

type SortKey = 'sku-asc' | 'sku-desc' | 'name-asc' | 'name-desc' | 'category-asc' | 'material-desc' | 'labor-desc';
type CatalogTab = 'items' | 'modifiers' | 'bundles';

function parseCatalogTabParam(raw: string | null): CatalogTab {
  return raw === 'modifiers' || raw === 'bundles' ? raw : 'items';
}

function parseCanonFilterParam(raw: string | null): 'all' | 'canonical' | 'non-canonical' {
  if (raw === 'canonical' || raw === 'non-canonical') return raw;
  return 'all';
}

function parseActiveFilterParam(raw: string | null): 'all' | 'active' | 'inactive' {
  if (raw === 'active' || raw === 'inactive') return raw;
  return 'all';
}

function isSortKeyParam(raw: string | null): raw is SortKey {
  return (
    raw === 'sku-asc' ||
    raw === 'sku-desc' ||
    raw === 'name-asc' ||
    raw === 'name-desc' ||
    raw === 'category-asc' ||
    raw === 'material-desc' ||
    raw === 'labor-desc'
  );
}

function catalogFiltersFromSearchParams(sp: URLSearchParams) {
  const sortRaw = sp.get('sort');
  return {
    activeTab: parseCatalogTabParam(sp.get('tab')),
    search: sp.get('q') ?? '',
    categoryFilter: sp.get('cat')?.trim() || 'all',
    typeFilter: sp.get('itype')?.trim() || 'all',
    activeFilter: parseActiveFilterParam(sp.get('act')),
    sourceTabFilter: sp.get('sheet')?.trim() || 'all',
    sortBy: isSortKeyParam(sortRaw) ? sortRaw : 'sku-asc',
    canonFilter: parseCanonFilterParam(sp.get('canon')),
    duplicatesOnly: sp.get('dup') === '1',
    deprecatedOnly: sp.get('dep') === '1',
    showDuplicateReview: sp.get('drev') === '1',
    showQualityReport: sp.get('qual') === '1',
    imageSprintOnly: sp.get('img') === '1',
    catalogItemId: sp.get('catalogItem')?.trim() || null,
  };
}

function buildCatalogWorkspaceSearchParams(input: {
  activeTab: CatalogTab;
  search: string;
  categoryFilter: string;
  typeFilter: string;
  activeFilter: 'all' | 'active' | 'inactive';
  sourceTabFilter: string;
  sortBy: SortKey;
  canonFilter: 'all' | 'canonical' | 'non-canonical';
  duplicatesOnly: boolean;
  deprecatedOnly: boolean;
  showDuplicateReview: boolean;
  showQualityReport: boolean;
  imageSprintOnly: boolean;
  catalogItemId: string | null;
}): URLSearchParams {
  const p = new URLSearchParams();
  if (input.activeTab !== 'items') p.set('tab', input.activeTab);
  if (input.search.trim()) p.set('q', input.search.trim());
  if (input.categoryFilter !== 'all') p.set('cat', input.categoryFilter);
  if (input.typeFilter !== 'all') p.set('itype', input.typeFilter);
  if (input.activeFilter !== 'all') p.set('act', input.activeFilter);
  if (input.sourceTabFilter !== 'all') p.set('sheet', input.sourceTabFilter);
  if (input.sortBy !== 'sku-asc') p.set('sort', input.sortBy);
  if (input.canonFilter !== 'all') p.set('canon', input.canonFilter);
  if (input.duplicatesOnly) p.set('dup', '1');
  if (input.deprecatedOnly) p.set('dep', '1');
  if (input.showDuplicateReview) p.set('drev', '1');
  if (input.showQualityReport) p.set('qual', '1');
  if (input.imageSprintOnly) p.set('img', '1');
  if (input.catalogItemId) p.set('catalogItem', input.catalogItemId);
  return p;
}

async function copyTextToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
}

function catalogRowTypeLabel(item: CatalogItem): string {
  const t = String(item.itemType || '').trim();
  if (t) return t;
  return String(item.family || item.subcategory || 'Standard').trim() || 'Standard';
}

function catalogItemSourceTab(item: CatalogItem): string | null {
  const tab = String(item.catalogSourceTab || '').trim();
  if (tab) return tab;
  const src = String(item.catalogSource || '').trim();
  return src || null;
}

/** Labels + values already on `CatalogItem` that we surface read-only in the editor (no API change). */
function catalogItemReadOnlyRows(item: CatalogItem): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];
  const add = (label: string, raw: unknown) => {
    if (raw === null || raw === undefined) return;
    if (typeof raw === 'boolean') {
      rows.push({ label, value: raw ? 'Yes' : 'No' });
      return;
    }
    if (Array.isArray(raw)) {
      const joined = raw.map((x) => String(x).trim()).filter(Boolean).join(', ');
      if (!joined) return;
      rows.push({ label, value: joined });
      return;
    }
    const s = String(raw).trim();
    if (!s) return;
    rows.push({ label, value: s });
  };

  add('catalogSource', item.catalogSource);
  add('catalogSourceTab', item.catalogSourceTab);
  if (item.catalogSourceRow != null) add('catalogSourceRow', String(item.catalogSourceRow));
  add('catalogSyncBatchId', item.catalogSyncBatchId);
  add('skuNormalized', item.skuNormalized);
  add('manufacturerNormalized', item.manufacturerNormalized);
  add('categoryMain', item.categoryMain);
  add('materialFamily', item.materialFamily);
  add('systemSeries', item.systemSeries);
  add('privacyLevel', item.privacyLevel);
  add('defaultUnit', item.defaultUnit);
  add('laborUnitType', item.laborUnitType);
  add('laborBasis', item.laborBasis);
  add('defaultMountingType', item.defaultMountingType);
  add('attributeGroup', item.attributeGroup);
  add('manufacturerConfiguredItem', item.manufacturerConfiguredItem);
  add('canonicalMatchAnchor', item.canonicalMatchAnchor);
  add('exactComponentSku', item.exactComponentSku);
  add('requiresProjectConfiguration', item.requiresProjectConfiguration);
  add('notes', item.notes);
  add('estimatorNotes', item.estimatorNotes);
  add('tags', item.tags);

  return rows;
}

function catalogImageHref(url: string | undefined | null): string | null {
  const raw = String(url || '').trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  return null;
}

function statusClass(status: CatalogSyncStatusRecord['status']): string {
  if (status === 'success') return 'ui-status-ok';
  if (status === 'running') return 'ui-status-info';
  if (status === 'failed') return 'ui-status-error';
  return 'ui-chip-soft text-app-muted';
}

const CATALOG_SYNC_UI_REVIEW_CAP = 50;

const MANUAL_REVIEW_TABLE_CAP = 8;

const MANUAL_REVIEW_QUEUE_LABELS: Record<CatalogReviewQueueKey, string> = {
  duplicate_sku_groups: 'Duplicate SKU groups',
  alias_collisions: 'Alias collisions',
  labor_outliers: 'Labor outliers',
  orphan_bundle_skus: 'Orphan bundle SKUs',
  unknown_modifiers: 'Unknown modifiers',
  orphan_attribute_skus: 'Orphan attribute canonical SKUs',
  orphan_alias_skus: 'Orphan alias canonical SKUs',
};


function CatalogSyncReviewPanel({ syncStatus }: { syncStatus: CatalogSyncStatusRecord }) {
  const review = syncStatus.syncAudit?.catalogReview;
  const warn = syncStatus.warnings || [];
  const sum = syncStatus.lastAttemptSummary;
  const hist = syncStatus.historicalSyncRunContext;

  const warnDup = warn.filter((w) => /duplicate canonical sku/i.test(w));
  const warnAlias = warn.filter((w) => /ALIASES: alias key/i.test(w));
  const warnLabor = warn.filter((w) => /suspicious labor/i.test(w));
  const warnBundleOrphan = warn.filter((w) => /BUNDLES row .*:\s*(included SKU|unknown modifier)/i.test(w));
  const warnAttrOrphan = warn.filter((w) => /^(ATTRIBUTES row|ALIASES row).*not found in ITEMS/i.test(w));

  const dupCount = review?.duplicateSkuConflictCount ?? warnDup.length;
  const aliasCount = review?.aliasMultiTargetCount ?? warnAlias.length;
  const laborCount = review?.laborOutlierCount ?? warnLabor.length;
  const bundleSkuCount =
    review?.orphanBundleSkuReferenceCount ?? warnBundleOrphan.filter((w) => /included SKU/i.test(w)).length;
  const bundleModCount =
    review?.orphanBundleModifierReferenceCount ??
    warnBundleOrphan.filter((w) => /unknown modifier/i.test(w)).length;
  const orphanAttrCount =
    review?.orphanAttributeCanonicalCount ?? warnAttrOrphan.filter((w) => /^ATTRIBUTES row/i.test(w)).length;
  const orphanAliasCount =
    review?.orphanAliasCanonicalCount ?? warnAttrOrphan.filter((w) => /^ALIASES row/i.test(w)).length;

  function renderList(label: string, items: string[], emptyHint: string) {
    if (!items.length) {
      return emptyHint ? <p className="text-app-muted">{emptyHint}</p> : null;
    }
    return (
      <ul className="mt-1 list-inside list-disc space-y-1 text-[11px] leading-snug">
        {items.slice(0, CATALOG_SYNC_UI_REVIEW_CAP).map((line, i) => (
          <li key={`${label}-${i}`} className="break-words font-mono">
            {line}
          </li>
        ))}
      </ul>
    );
  }

  const dupItems = review?.duplicateSkuConflictSampleKeys?.length ? review.duplicateSkuConflictSampleKeys : warnDup;
  const aliasItems = review?.aliasMultiTargetSampleKeys?.length ? review.aliasMultiTargetSampleKeys : warnAlias;
  const laborItems = review?.laborOutlierSampleLines?.length ? review.laborOutlierSampleLines : warnLabor;
  const skuS =
    review?.orphanBundleSkuSample?.length && review.orphanBundleSkuSample.some(Boolean)
      ? review.orphanBundleSkuSample.map((s) => `Unknown bundle SKU ref: ${s}`)
      : warnBundleOrphan.filter((w) => /included SKU/i.test(w));
  const modS =
    review?.orphanBundleModifierSample?.length && review.orphanBundleModifierSample.some(Boolean)
      ? review.orphanBundleModifierSample.map((s) => `Unknown bundle modifier: ${s}`)
      : warnBundleOrphan.filter((w) => /unknown modifier/i.test(w));
  const attrS =
    review?.orphanAttributeCanonicalSample?.length && review.orphanAttributeCanonicalSample.some(Boolean)
      ? review.orphanAttributeCanonicalSample.map((s) => `Orphan attribute canonical: ${s}`)
      : warnAttrOrphan.filter((w) => /^ATTRIBUTES row/i.test(w));
  const aliasS =
    review?.orphanAliasCanonicalSample?.length && review.orphanAliasCanonicalSample.some(Boolean)
      ? review.orphanAliasCanonicalSample.map((s) => `Orphan alias canonical: ${s}`)
      : warnAttrOrphan.filter((w) => /^ALIASES row/i.test(w));

  const mergedReviewLines = mergeCatalogReviewSources(syncStatus.warnings || [], syncStatus.message);

  return (
    <details className="rounded-lg border border-dashed border-app-line bg-app-surface px-3 py-2">
      <summary className="cursor-pointer select-none text-xs font-semibold text-slate-800">
        Sync publish review
      </summary>
      <div className="mt-2 space-y-2 border-t border-app-line pt-2">
        <div className="flex flex-wrap items-center gap-2">
          {hist ? (
            <span className="ui-mono-chip ui-mono-chip--ok text-[10px]">Historical workbook</span>
          ) : (
            <span className="ui-mono-chip ui-mono-chip--mute text-[10px]">Current server workbook</span>
          )}
          {hist ? (
            <span className="text-[10px] text-app-muted">
              Review sample cap at run: {hist.validation.catalogSyncReviewMaxSamples} · Preflight blocking cap:{' '}
              {hist.validation.preflightMaxBlockingIssues}
            </span>
          ) : null}
        </div>
        {syncStatus.workbook ? (
          <div className="rounded bg-app-surface-soft px-2 py-1.5 text-[10px] font-mono text-slate-700">
            <div>
              Spreadsheet ID:{' '}
              {syncStatus.workbook.spreadsheetIdConfigured && syncStatus.workbook.spreadsheetId
                ? syncStatus.workbook.spreadsheetId
                : '(not configured)'}
            </div>
            <div className="mt-0.5 text-app-muted">
              Tabs — items read: {syncStatus.workbook.tabs.itemsFetch}
              {syncStatus.workbook.tabs.itemsConfigured !== syncStatus.workbook.tabs.itemsFetch
                ? ` (GOOGLE_SHEETS_TAB_ITEMS ${syncStatus.workbook.tabs.itemsConfigured})`
                : ''}{' '}
              · CLEAN_ITEMS env: {syncStatus.workbook.tabs.cleanItemsTabEnv ?? '—'} · modifiers read:{' '}
              {syncStatus.workbook.tabs.modifiersFetch}
              {syncStatus.workbook.tabs.modifiersConfigured !== syncStatus.workbook.tabs.modifiersFetch
                ? ` (GOOGLE_SHEETS_TAB_MODIFIERS ${syncStatus.workbook.tabs.modifiersConfigured})`
                : ''}{' '}
              · CLEAN_MODIFIERS env: {syncStatus.workbook.tabs.cleanModifiersTabEnv ?? '—'} · bundles:{' '}
              {syncStatus.workbook.tabs.bundles} · aliases: {syncStatus.workbook.tabs.aliases} · attributes:{' '}
              {syncStatus.workbook.tabs.attributes}
            </div>
            {syncStatus.serverConfigNow ? (
              <details className="mt-1.5">
                <summary className="cursor-pointer text-[10px] text-slate-600">Live server config (now)</summary>
                <div className="mt-1 text-[9px] text-slate-600">
                  Items read: {syncStatus.serverConfigNow.tabs.itemsFetch} · legacy ITEMS tab:{' '}
                  {syncStatus.serverConfigNow.importEnv.catalogSyncAllowLegacyItemsTab ? 'yes' : 'no'} · modifiers read:{' '}
                  {syncStatus.serverConfigNow.tabs.modifiersFetch} · legacy MODIFIERS tab:{' '}
                  {syncStatus.serverConfigNow.importEnv.catalogSyncAllowLegacyModifiersTab ? 'yes' : 'no'} · replace mode:{' '}
                  {syncStatus.serverConfigNow.importEnv.catalogSyncReplaceMode ? 'yes' : 'no'} · skip staging rows:{' '}
                  {syncStatus.serverConfigNow.importEnv.catalogSyncSkipStagingSheetImportRows ? 'yes' : 'no'}
                </div>
              </details>
            ) : null}
          </div>
        ) : null}
        {sum ? (
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] sm:grid-cols-3">
            {sum.skippedDuplicateItemRows != null ? (
              <>
                <dt className="text-app-muted">Skipped dup rows</dt>
                <dd className="font-mono">{sum.skippedDuplicateItemRows}</dd>
              </>
            ) : null}
            {sum.failedValidationRows != null ? (
              <>
                <dt className="text-app-muted">Failed cell validation</dt>
                <dd className="font-mono">{sum.failedValidationRows}</dd>
              </>
            ) : null}
            {sum.bundleUnknownSkuReferences != null ? (
              <>
                <dt className="text-app-muted">Unknown bundle SKUs (preflight)</dt>
                <dd className="font-mono">{sum.bundleUnknownSkuReferences}</dd>
              </>
            ) : null}
            {sum.bundleUnknownModifierReferences != null ? (
              <>
                <dt className="text-app-muted">Unknown bundle modifiers</dt>
                <dd className="font-mono">{sum.bundleUnknownModifierReferences}</dd>
              </>
            ) : null}
            {sum.persistedSyncCounts ? (
              <>
                <dt className="text-app-muted">Last persisted rows</dt>
                <dd className="col-span-2 font-mono text-[9px] leading-tight">
                  items {sum.persistedSyncCounts.itemsSynced} · mod {sum.persistedSyncCounts.modifiersSynced} · bnd{' '}
                  {sum.persistedSyncCounts.bundlesSynced} · bi {sum.persistedSyncCounts.bundleItemsSynced} · al{' '}
                  {sum.persistedSyncCounts.aliasesSynced} · at {sum.persistedSyncCounts.attributesSynced}
                </dd>
              </>
            ) : null}
          </dl>
        ) : null}
        {syncStatus.status === 'failed' && syncStatus.message?.trim() ? (
          <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-950">
            <span className="font-semibold">Blocking failure: </span>
            <span className="whitespace-pre-wrap">{syncStatus.message.trim()}</span>
          </div>
        ) : null}

        <div className="rounded-lg border border-app-line bg-app-surface-soft px-2 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-semibold text-slate-800">Manual review queues</p>
            <p className="max-w-[28rem] text-[10px] text-app-muted">
              Preview matches the latest sync snapshot below. CSV exports read the selected sync run (
              <span className="font-mono">{syncStatus.latestCatalogSyncRunId ?? 'latest row'}</span>
              ); open items via curator links (
              <span className="font-mono">/catalog?q=…&amp;catalogItem=…</span> — tab, filters, and editor sync in the URL).
            </p>
          </div>
          <div className="mt-2 space-y-3">
            {CATALOG_REVIEW_QUEUE_KEYS.map((queue) => {
              const lines = resolveCatalogReviewExportLines(queue, mergedReviewLines, syncStatus.syncAudit);
              const preview = lines.slice(0, MANUAL_REVIEW_TABLE_CAP);
              const runIdArg = syncStatus.latestCatalogSyncRunId ?? undefined;
              return (
                <div key={queue} className="rounded border border-app-line bg-app-surface px-2 py-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-slate-800">
                      {MANUAL_REVIEW_QUEUE_LABELS[queue]} ({lines.length})
                    </span>
                    <button
                      type="button"
                      className="ui-btn-secondary px-2 py-1 text-[10px]"
                      onClick={() =>
                        void api.downloadCatalogSyncReviewCsv(queue, runIdArg ?? null).catch((err: unknown) =>
                          alert(getErrorMessage(err, 'CSV download failed.'))
                        )
                      }
                    >
                      Download CSV
                    </button>
                  </div>
                  {preview.length ? (
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full border-collapse text-left text-[10px]">
                        <thead>
                          <tr className="border-b border-app-line text-app-muted">
                            <th className="py-1 pr-2 font-medium">Detail</th>
                            <th className="py-1 pr-2 font-medium">Open in Catalog</th>
                            <th className="py-1 font-medium">Copy link</th>
                          </tr>
                        </thead>
                        <tbody>
                          {preview.map((line, idx) => {
                            const token = guessCatalogReviewSkuToken(line);
                            const to = catalogCuratorPath(token, queue);
                            return (
                              <tr key={`${queue}-${idx}`} className="border-b border-app-line last:border-b-0">
                                <td className="max-w-[min(420px,55vw)] py-1 pr-2 align-top">
                                  <span className="block truncate font-mono" title={line}>
                                    {line}
                                  </span>
                                </td>
                                <td className="whitespace-nowrap py-1 pr-2 align-top">
                                  {token ? (
                                    <Link to={to} className="text-app-brand-strong underline">
                                      Search &quot;{token}&quot;
                                    </Link>
                                  ) : (
                                    <span className="text-app-muted">—</span>
                                  )}
                                </td>
                                <td className="py-1 align-top">
                                  {token ? (
                                    <button
                                      type="button"
                                      className="inline-flex items-center gap-1 text-[10px] font-medium text-app-brand-strong underline"
                                      onClick={() =>
                                        void copyTextToClipboard(
                                          typeof window !== 'undefined' ? `${window.location.origin}${to}` : to,
                                        )
                                      }
                                    >
                                      <Clipboard className="h-3 w-3 shrink-0" aria-hidden />
                                      Copy
                                    </button>
                                  ) : (
                                    <span className="text-app-muted">—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {lines.length > preview.length ? (
                        <p className="mt-1 text-[10px] text-app-muted">
                          Showing first {preview.length} of {lines.length}. Use CSV for the full queue.
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-1 text-[10px] text-app-muted">No rows in this queue for the current snapshot.</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          <details className="rounded border border-app-line bg-app-surface px-2 py-1.5" open>
            <summary className="cursor-pointer text-[11px] font-medium text-slate-800">
              Duplicate SKU hints ({dupCount})
            </summary>
            <div className="mt-1 pl-1">
              {renderList(
                'dup',
                dupItems.map((s) => String(s)),
                'Run sync to populate structured review, or export the "Duplicate SKU groups" CSV from Manual review queues above. For repo-wide blocker CSV, see workbook-first-sync docs (`npm run catalog:publish:blockers`).'
              )}
            </div>
          </details>
          <details className="rounded border border-app-line bg-app-surface px-2 py-1.5">
            <summary className="cursor-pointer text-[11px] font-medium text-slate-800">
              Alias conflicts ({aliasCount})
            </summary>
            <div className="mt-1 pl-1">{renderList('alias', aliasItems.map(String), 'No alias conflict samples for this sync.')}</div>
          </details>
          <details className="rounded border border-app-line bg-app-surface px-2 py-1.5">
            <summary className="cursor-pointer text-[11px] font-medium text-slate-800">
              Labor outliers ({laborCount})
            </summary>
            <div className="mt-1 pl-1">{renderList('labor', laborItems.map(String), 'No suspicious labor hints for this sync.')}</div>
          </details>
          <details className="rounded border border-app-line bg-app-surface px-2 py-1.5">
            <summary className="cursor-pointer text-[11px] font-medium text-slate-800">
              Orphan bundles — SKUs ({bundleSkuCount}) / modifiers ({bundleModCount})
            </summary>
            <div className="mt-1 space-y-1 pl-1">
              {skuS.length ? renderList('bsku', skuS, '') : null}
              {modS.length ? renderList('bmod', modS, '') : null}
              {!skuS.length && !modS.length
                ? renderList('empty', [], 'No orphan bundle hints for this sync.')
                : null}
            </div>
          </details>
          <details className="rounded border border-app-line bg-app-surface px-2 py-1.5">
            <summary className="cursor-pointer text-[11px] font-medium text-slate-800">
              Orphan attrs / aliases ({orphanAttrCount + orphanAliasCount})
            </summary>
            <div className="mt-1 space-y-1 pl-1">
              {attrS.length ? renderList('attr', attrS, '') : null}
              {aliasS.length ? renderList('als', aliasS, '') : null}
              {!attrS.length && !aliasS.length
                ? renderList('empty', [], 'No orphan attribute/alias hints for this sync.')
                : null}
            </div>
          </details>
          <details className="rounded border border-app-line bg-app-surface px-2 py-1.5">
            <summary className="cursor-pointer text-[11px] font-medium text-slate-800">Raw audit JSON</summary>
            <div className="mt-1 pl-1">
              {syncStatus.syncAudit ? (
                <pre className="max-h-56 overflow-auto rounded border border-app-line bg-app-surface-soft p-2 text-[10px] leading-tight">
                  {JSON.stringify(syncStatus.syncAudit, null, 2)}
                </pre>
              ) : (
                <p className="text-app-muted">No structured audit on the last attempt. Run sync again.</p>
              )}
            </div>
          </details>
        </div>
      </div>
    </details>
  );
}
export function Catalog() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialUrlFilters = useMemo(
    () => catalogFiltersFromSearchParams(new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')),
    [],
  );
  const catalogSearchInputRef = useRef<HTMLInputElement>(null);
  const { data, isLoading, isError, error, refetch } = useCatalogWorkspaceQuery();
  const items = data?.items ?? [];
  const modifiers = data?.modifiers ?? [];
  const bundles = data?.bundles ?? [];
  const syncStatus = data?.syncStatus ?? null;
  const inventory = data?.inventory ?? null;

  const invalidateWorkspace = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.catalog.workspace });
  }, [queryClient]);

  const [activeTab, setActiveTab] = useState<CatalogTab>(initialUrlFilters.activeTab);
  const [activatingAll, setActivatingAll] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncActionError, setSyncActionError] = useState<string | null>(null);

  const [search, setSearch] = useState(initialUrlFilters.search);
  const [categoryFilter, setCategoryFilter] = useState(initialUrlFilters.categoryFilter);
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>(initialUrlFilters.activeFilter);
  const [typeFilter, setTypeFilter] = useState(initialUrlFilters.typeFilter);
  /** Resolved sheet tab name (`catalogSourceTab` or legacy `catalogSource`). */
  const [sourceTabFilter, setSourceTabFilter] = useState(initialUrlFilters.sourceTabFilter);
  const [sortBy, setSortBy] = useState<SortKey>(initialUrlFilters.sortBy);
  const [canonFilter, setCanonFilter] = useState<'all' | 'canonical' | 'non-canonical'>(initialUrlFilters.canonFilter);
  const [duplicatesOnly, setDuplicatesOnly] = useState(initialUrlFilters.duplicatesOnly);
  const [deprecatedOnly, setDeprecatedOnly] = useState(initialUrlFilters.deprecatedOnly);
  const [showDuplicateReview, setShowDuplicateReview] = useState(initialUrlFilters.showDuplicateReview);
  const [showQualityReport, setShowQualityReport] = useState(initialUrlFilters.showQualityReport);
  /** Forward-facing rows that are manufacturer-backed but still missing ImageURL (image sprint). */
  const [imageSprintOnly, setImageSprintOnly] = useState(initialUrlFilters.imageSprintOnly);
  const [duplicateCanonicalSelection, setDuplicateCanonicalSelection] = useState<Record<string, string>>({});
  const [duplicateResolvingKey, setDuplicateResolvingKey] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null);
  const [editingModifier, setEditingModifier] = useState<ModifierRecord | null>(null);

  const closeItemEditor = useCallback(() => {
    setEditingItem(null);
    const next = new URLSearchParams(searchParams);
    next.delete('catalogItem');
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const [editingBundle, setEditingBundle] = useState<BundleRecord | null>(null);
  const [savingModifier, setSavingModifier] = useState(false);
  const [savingBundle, setSavingBundle] = useState(false);

  const [itemAliases, setItemAliases] = useState<Record<string, import('../types').CatalogItemAlias[]>>({});
  const [aliasesLoadingItemId, setAliasesLoadingItemId] = useState<string | null>(null);
  const [aliasDraftType, setAliasDraftType] = useState<import('../types').CatalogAliasType>('legacy_sku');
  const [aliasDraftValue, setAliasDraftValue] = useState('');

  const [itemAttributes, setItemAttributes] = useState<Record<string, import('../types').CatalogItemAttribute[]>>({});
  const [attrsLoadingItemId, setAttrsLoadingItemId] = useState<string | null>(null);
  const [attrDraftType, setAttrDraftType] = useState<import('../types').CatalogAttributeType>('finish');
  const [attrDraftValue, setAttrDraftValue] = useState('');
  const [attrDraftMaterialDeltaType, setAttrDraftMaterialDeltaType] = useState<import('../types').CatalogDeltaType | ''>('');
  const [attrDraftMaterialDeltaValue, setAttrDraftMaterialDeltaValue] = useState<string>('');
  const [attrDraftLaborDeltaType, setAttrDraftLaborDeltaType] = useState<import('../types').CatalogDeltaType | ''>('');
  const [attrDraftLaborDeltaValue, setAttrDraftLaborDeltaValue] = useState<string>('');

  const normalizePercentForDisplay = useCallback((raw: number) => {
    if (!Number.isFinite(raw)) return 0;
    // Backward compatible: allow legacy storage as 0.10 (=10%), but display in percent points.
    return Math.abs(raw) > 0 && Math.abs(raw) <= 1 ? raw * 100 : raw;
  }, []);

  const describeAttributeEffect = useCallback(
    (a: import('../types').CatalogItemAttribute) => {
      const parts: string[] = [];
      if (a.materialDeltaType && a.materialDeltaValue != null) {
        const raw = Number(a.materialDeltaValue || 0);
        if (a.materialDeltaType === 'absolute') parts.push(`Material ${raw >= 0 ? '+' : ''}${formatCurrencySafe(raw)}`);
        if (a.materialDeltaType === 'percent') {
          const pct = normalizePercentForDisplay(raw);
          parts.push(`Material ${pct >= 0 ? '+' : ''}${formatPercentSafe(pct / 100)}`);
        }
      }
      if (a.laborDeltaType && a.laborDeltaValue != null) {
        const raw = Number(a.laborDeltaValue || 0);
        if (a.laborDeltaType === 'minutes' || a.laborDeltaType === 'absolute') {
          parts.push(`Labor ${raw >= 0 ? '+' : ''}${formatNumberSafe(raw, 1)} min`);
        }
        if (a.laborDeltaType === 'percent') {
          const pct = normalizePercentForDisplay(raw);
          parts.push(`Labor ${pct >= 0 ? '+' : ''}${formatPercentSafe(pct / 100)}`);
        }
      }
      return parts.length ? parts.join(' • ') : 'No pricing effect';
    },
    [normalizePercentForDisplay]
  );

  useEffect(() => {
    const onSynced = () => {
      invalidateWorkspace();
    };
    window.addEventListener('catalog-synced', onSynced);
    return () => window.removeEventListener('catalog-synced', onSynced);
  }, [invalidateWorkspace]);

  useLayoutEffect(() => {
    const f = catalogFiltersFromSearchParams(searchParams);
    setActiveTab(f.activeTab);
    setSearch(f.search);
    setCategoryFilter(f.categoryFilter);
    setTypeFilter(f.typeFilter);
    setActiveFilter(f.activeFilter);
    setSourceTabFilter(f.sourceTabFilter);
    setSortBy(f.sortBy);
    setCanonFilter(f.canonFilter);
    setDuplicatesOnly(f.duplicatesOnly);
    setDeprecatedOnly(f.deprecatedOnly);
    setShowDuplicateReview(f.showDuplicateReview);
    setShowQualityReport(f.showQualityReport);
    setImageSprintOnly(f.imageSprintOnly);
  }, [searchParams]);

  useEffect(() => {
    const idInUrl = searchParams.get('catalogItem')?.trim() || null;

    if (items.length > 0 && idInUrl) {
      const found = items.find((i) => i.id === idInUrl);
      if (!found) {
        const next = new URLSearchParams(searchParams);
        next.delete('catalogItem');
        if (next.toString() !== searchParams.toString()) {
          setSearchParams(next, { replace: true });
        }
        return;
      }
      if (editingItem?.id !== found.id) {
        setEditingItem(found);
        return;
      }
    }

    const catalogItemIdForUrl = editingItem?.id || (items.length === 0 ? idInUrl : null);

    const next = buildCatalogWorkspaceSearchParams({
      activeTab,
      search,
      categoryFilter,
      typeFilter,
      activeFilter,
      sourceTabFilter,
      sortBy,
      canonFilter,
      duplicatesOnly,
      deprecatedOnly,
      showDuplicateReview,
      showQualityReport,
      imageSprintOnly,
      catalogItemId: catalogItemIdForUrl,
    });
    if (next.toString() === searchParams.toString()) return;
    setSearchParams(next, { replace: true });
  }, [
    items,
    editingItem?.id,
    searchParams,
    setSearchParams,
    activeTab,
    search,
    categoryFilter,
    typeFilter,
    activeFilter,
    sourceTabFilter,
    sortBy,
    canonFilter,
    duplicatesOnly,
    deprecatedOnly,
    showDuplicateReview,
    showQualityReport,
    imageSprintOnly,
  ]);

  useEffect(() => {
    if (!editingItem && !editingModifier && !editingBundle) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (editingItem) closeItemEditor();
      else if (editingModifier) setEditingModifier(null);
      else if (editingBundle) setEditingBundle(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [editingItem, editingModifier, editingBundle, closeItemEditor]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable) return;
      e.preventDefault();
      catalogSearchInputRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  async function handleActivateAllCatalogItems() {
    if (!inventory || inventory.inactive === 0) return;
    const ok = window.confirm(
      `Set all ${inventory.total} catalog rows to Active? This fixes items hidden after a Google Sheet sync that listed fewer rows than your database.`
    );
    if (!ok) return;
    setActivatingAll(true);
    try {
      await api.activateAllV1CatalogItems();
      invalidateWorkspace();
    } catch (error) {
      console.error('Activate all failed', error);
      alert(error instanceof Error ? error.message : 'Could not activate catalog items.');
    } finally {
      setActivatingAll(false);
    }
  }

  async function handleSyncCatalog() {
    setSyncActionError(null);
    setSyncing(true);
    try {
      await api.syncV1Catalog();
      await invalidateWorkspace();
    } catch (error) {
      console.error('Catalog sync failed', error);
      setSyncActionError(getErrorMessage(error, 'Catalog sync failed.'));
      await invalidateWorkspace();
    } finally {
      setSyncing(false);
    }
  }

  const categories = useMemo(() => ['all', ...Array.from(new Set(items.map((i) => i.category))).sort()], [items]);
  const itemTypes = useMemo(
    () => ['all', ...Array.from(new Set(items.map((i) => catalogRowTypeLabel(i)))).sort((a, b) => a.localeCompare(b))],
    [items]
  );

  const sheetSourceTabOptions = useMemo(() => {
    const set = new Set<string>();
    let anyMissing = false;
    for (const item of items) {
      const t = catalogItemSourceTab(item);
      if (t) set.add(t);
      else anyMissing = true;
    }
    const tabs = Array.from(set).sort((a, b) => a.localeCompare(b));
    return (anyMissing ? (['all', '__none__', ...tabs] as const) : (['all', ...tabs] as const)) as readonly string[];
  }, [items]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items
      .filter((item) => {
        const textMatch =
          !query ||
          item.description.toLowerCase().includes(query) ||
          item.sku.toLowerCase().includes(query) ||
          item.category.toLowerCase().includes(query) ||
          (item.family || '').toLowerCase().includes(query) ||
          (item.subcategory || '').toLowerCase().includes(query) ||
          (item.manufacturer || '').toLowerCase().includes(query) ||
          (item.brand || '').toLowerCase().includes(query) ||
          (item.model || '').toLowerCase().includes(query) ||
          (item.modelNumber || '').toLowerCase().includes(query) ||
          (item.series || '').toLowerCase().includes(query) ||
          (item.itemType || '').toLowerCase().includes(query) ||
          (item.catalogSourceTab || '').toLowerCase().includes(query) ||
          (item.catalogSource || '').toLowerCase().includes(query);

        const categoryMatch = categoryFilter === 'all' || item.category === categoryFilter;
        const activeMatch =
          activeFilter === 'all' ||
          (activeFilter === 'active' && item.active) ||
          (activeFilter === 'inactive' && !item.active);

        const currentType = catalogRowTypeLabel(item);
        const typeMatch = typeFilter === 'all' || currentType === typeFilter;

        const itemTab = catalogItemSourceTab(item);
        const sourceTabMatch =
          sourceTabFilter === 'all' ||
          (sourceTabFilter === '__none__' ? !itemTab : itemTab === sourceTabFilter);

        const isCanonical = item.isCanonical !== false;
        const canonMatch =
          canonFilter === 'all' ||
          (canonFilter === 'canonical' && isCanonical) ||
          (canonFilter === 'non-canonical' && !isCanonical);

        const hasDupKey = Boolean(item.duplicateGroupKey && String(item.duplicateGroupKey).trim());
        const duplicatesMatch = !duplicatesOnly || hasDupKey;

        const isDeprecated = Boolean(item.deprecated);
        const deprecatedMatch = !deprecatedOnly || isDeprecated;

        const forwardFacing = item.active && !isDeprecated && isCanonical;
        const mfrBacked =
          Boolean(String(item.manufacturer || '').trim()) &&
          (Boolean(String(item.model || '').trim()) || Boolean(String(item.series || '').trim()));
        const missingImage = !String(item.imageUrl || '').trim();
        const imageSprintMatch = !imageSprintOnly || (forwardFacing && mfrBacked && missingImage);

        return textMatch && categoryMatch && activeMatch && typeMatch && sourceTabMatch && canonMatch && duplicatesMatch && deprecatedMatch && imageSprintMatch;
      })
      .sort((a, b) => {
        if (sortBy === 'sku-asc') return a.sku.localeCompare(b.sku);
        if (sortBy === 'sku-desc') return b.sku.localeCompare(a.sku);
        if (sortBy === 'name-asc') return a.description.localeCompare(b.description);
        if (sortBy === 'name-desc') return b.description.localeCompare(a.description);
        if (sortBy === 'category-asc') return a.category.localeCompare(b.category);
        if (sortBy === 'material-desc') return b.baseMaterialCost - a.baseMaterialCost;
        if (sortBy === 'labor-desc') return b.baseLaborMinutes - a.baseLaborMinutes;
        return 0;
      });
  }, [items, search, categoryFilter, activeFilter, typeFilter, sourceTabFilter, sortBy, canonFilter, duplicatesOnly, deprecatedOnly, imageSprintOnly]);

  const curatorEditorContextBadges = useMemo(() => {
    const tags: string[] = [];
    if (duplicatesOnly) tags.push('Duplicates-only');
    if (deprecatedOnly) tags.push('Deprecated-only');
    if (showDuplicateReview) tags.push('Duplicate review');
    if (showQualityReport) tags.push('Quality report');
    if (imageSprintOnly) tags.push('Image sprint');
    if (sourceTabFilter !== 'all') {
      tags.push(`Sheet tab: ${sourceTabFilter === '__none__' ? 'none / unknown' : sourceTabFilter}`);
    }
    if (canonFilter !== 'all') {
      tags.push(canonFilter === 'canonical' ? 'Canonical only' : 'Non-canonical only');
    }
    if (search.trim()) tags.push(`Search: '${search.trim()}'`);
    return tags;
  }, [
    duplicatesOnly,
    deprecatedOnly,
    showDuplicateReview,
    showQualityReport,
    imageSprintOnly,
    sourceTabFilter,
    canonFilter,
    search,
  ]);

  const catalogQualityByCategory = useMemo(() => {
    const byCat = new Map<string, {
      category: string;
      total: number;
      active: number;
      canonical: number;
      deprecated: number;
      missingManufacturer: number;
      missingModelSeries: number;
      missingImage: number;
      missingRealSku: number;
      missingDescription: number;
      missingMaterialCost: number;
      missingLaborMinutes: number;
      missingInstallLaborFamily: number;
    }>();

    const skuLooksReal = (sku: string) => {
      const s = String(sku || '').trim();
      if (!s) return false;
      if (/^(temp|tbd|unknown|null|none|na)$/i.test(s)) return false;
      if (s.length < 3) return false;
      // "GENERIC-XYZ" is allowed for canonicals, but treat as "not real" for cleanup reporting.
      if (/^generic[-_]/i.test(s)) return false;
      return true;
    };

    for (const item of items) {
      const category = String(item.category || 'Uncategorized').trim() || 'Uncategorized';
      const row = byCat.get(category) || {
        category,
        total: 0,
        active: 0,
        canonical: 0,
        deprecated: 0,
        missingManufacturer: 0,
        missingModelSeries: 0,
        missingImage: 0,
        missingRealSku: 0,
        missingDescription: 0,
        missingMaterialCost: 0,
        missingLaborMinutes: 0,
        missingInstallLaborFamily: 0,
      };
      row.total += 1;
      if (item.active) row.active += 1;
      if (item.isCanonical !== false) row.canonical += 1;
      if (item.deprecated) row.deprecated += 1;
      if (!String(item.manufacturer || '').trim()) row.missingManufacturer += 1;
      if (!String(item.model || '').trim() && !String(item.series || '').trim()) row.missingModelSeries += 1;
      if (!String(item.imageUrl || '').trim()) row.missingImage += 1;
      if (!skuLooksReal(item.sku)) row.missingRealSku += 1;
      if (!String(item.description || '').trim()) row.missingDescription += 1;
      if (!Number.isFinite(item.baseMaterialCost) || item.baseMaterialCost <= 0) row.missingMaterialCost += 1;
      if (!Number.isFinite(item.baseLaborMinutes) || item.baseLaborMinutes <= 0) row.missingLaborMinutes += 1;
      if ((!String(item.installLaborFamily || '').trim()) && (!Number.isFinite(item.baseLaborMinutes) || item.baseLaborMinutes <= 0)) {
        row.missingInstallLaborFamily += 1;
      }
      byCat.set(category, row);
    }

    return Array.from(byCat.values()).sort((a, b) =>
      (b.missingImage - a.missingImage) ||
      (b.missingManufacturer + b.missingModelSeries + b.missingRealSku + b.missingMaterialCost + b.missingLaborMinutes) -
      (a.missingManufacturer + a.missingModelSeries + a.missingRealSku + a.missingMaterialCost + a.missingLaborMinutes)
      || b.total - a.total
      || a.category.localeCompare(b.category)
    );
  }, [items]);

  async function copyImageSprintCsv() {
    const header = ['Category', 'SKU', 'Manufacturer', 'Model', 'Series', 'Description'].join(',');
    const lines = items
      .filter((i) => i.active && !i.deprecated && i.isCanonical !== false)
      .filter((i) => String(i.manufacturer || '').trim() && (String(i.model || '').trim() || String(i.series || '').trim()))
      .filter((i) => !String(i.imageUrl || '').trim())
      .sort((a, b) => a.category.localeCompare(b.category) || a.sku.localeCompare(b.sku))
      .map((i) => {
        const safe = (v: string) => `"${String(v || '').replace(/"/g, '""')}"`;
        return [
          safe(i.category || ''),
          safe(i.sku || ''),
          safe(i.manufacturer || ''),
          safe(i.model || ''),
          safe(i.series || ''),
          safe(i.description || ''),
        ].join(',');
      });

    const csv = [header, ...lines].join('\n');
    await navigator.clipboard.writeText(csv);
    window.alert(`Copied ${lines.length} manufacturer-backed row(s) missing ImageURL (forward-facing) to clipboard.`);
  }

  async function copyCatalogResearchQueueCsv() {
    const header = ['Category', 'SKU', 'Description', 'MissingFields'].join(',');
    const lines = filteredItems
      .filter((i) => i.active && !i.deprecated && i.isCanonical !== false)
      .map((i) => {
        const missing: string[] = [];
        if (!String(i.manufacturer || '').trim()) missing.push('Manufacturer');
        if (!String(i.model || '').trim() && !String(i.series || '').trim()) missing.push('Model/Series');
        if (!String(i.imageUrl || '').trim()) missing.push('ImageURL');
        if (!String(i.sku || '').trim() || /^generic[-_]/i.test(String(i.sku || '').trim())) missing.push('RealSKU');
        if (!Number.isFinite(i.baseMaterialCost) || i.baseMaterialCost <= 0) missing.push('MaterialCost');
        if (!Number.isFinite(i.baseLaborMinutes) || i.baseLaborMinutes <= 0) missing.push('LaborMinutes');
        if ((!String(i.installLaborFamily || '').trim()) && (!Number.isFinite(i.baseLaborMinutes) || i.baseLaborMinutes <= 0)) {
          missing.push('InstallLaborFamily');
        }
        if (missing.length === 0) return null;
        const safe = (v: string) => `"${String(v || '').replace(/"/g, '""')}"`;
        return [safe(i.category || ''), safe(i.sku || ''), safe(i.description || ''), safe(missing.join('; '))].join(',');
      })
      .filter(Boolean) as string[];

    const csv = [header, ...lines].join('\n');
    await navigator.clipboard.writeText(csv);
    window.alert(`Copied ${lines.length} row(s) to clipboard as CSV (Category / SKU / Description / MissingFields).`);
  }

  const duplicateGroups = useMemo(() => {
    const groups = new Map<string, CatalogItem[]>();
    for (const item of items) {
      const key = (item.duplicateGroupKey || '').trim();
      if (!key) continue;
      const list = groups.get(key) || [];
      list.push(item);
      groups.set(key, list);
    }
    const entries = Array.from(groups.entries())
      .map(([key, group]) => [key, group.sort((a, b) => a.sku.localeCompare(b.sku))] as const)
      .filter(([, group]) => group.length > 1)
      .sort((a, b) => b[1].length - a[1].length);
    return entries;
  }, [items]);

  const filteredModifiers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return modifiers
      .filter((modifier) => {
        const textMatch =
          !query ||
          modifier.name.toLowerCase().includes(query) ||
          modifier.description?.toLowerCase().includes(query) ||
          modifier.modifierKey.toLowerCase().includes(query) ||
          modifier.appliesToCategories.join(' ').toLowerCase().includes(query);

        const activeMatch =
          activeFilter === 'all' ||
          (activeFilter === 'active' && modifier.active) ||
          (activeFilter === 'inactive' && !modifier.active);

        return textMatch && activeMatch;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [modifiers, search, activeFilter]);

  const filteredBundles = useMemo(() => {
    const query = search.trim().toLowerCase();
    return bundles
      .filter((bundle) => {
        const textMatch =
          !query ||
          bundle.bundleName.toLowerCase().includes(query) ||
          bundle.id.toLowerCase().includes(query) ||
          (bundle.category || '').toLowerCase().includes(query);

        const activeMatch =
          activeFilter === 'all' ||
          (activeFilter === 'active' && bundle.active) ||
          (activeFilter === 'inactive' && !bundle.active);

        return textMatch && activeMatch;
      })
      .sort((a, b) => a.bundleName.localeCompare(b.bundleName));
  }, [bundles, search, activeFilter]);

  const handleCreateItem = () => {
    const newItem: CatalogItem = {
      id: crypto.randomUUID(),
      sku: 'SKU-' + Math.floor(Math.random() * 10000),
      category: 'Toilet Accessories',
      description: 'New Catalog Item',
      manufacturer: '',
      model: '',
      uom: 'EA',
      baseMaterialCost: 0,
      baseLaborMinutes: 0,
      taxable: true,
      adaFlag: false,
      active: true,
      tags: [],
    };
    setEditingItem(newItem);
  };

  async function handleSaveItem(e: React.FormEvent) {
    e.preventDefault();
    if (!editingItem) return;
    try {
      const isNew = !items.find((item) => item.id === editingItem.id);
      if (isNew) {
        await api.createCatalogItem(editingItem);
      } else {
        await api.updateCatalogItem(editingItem);
      }
      closeItemEditor();
      await invalidateWorkspace();
    } catch (err) {
      console.error('Failed to save item', err);
      window.alert(err instanceof Error ? err.message : 'Failed to save catalog item.');
    }
  }

  async function loadAliasesForItem(itemId: string) {
    setAliasesLoadingItemId(itemId);
    try {
      const rows = await api.listCatalogItemAliases(itemId);
      setItemAliases((prev) => ({ ...prev, [itemId]: rows }));
    } catch (err) {
      console.error('Failed to load aliases', err);
      window.alert(err instanceof Error ? err.message : 'Failed to load aliases.');
    } finally {
      setAliasesLoadingItemId(null);
    }
  }

  async function loadAttributesForItem(itemId: string) {
    setAttrsLoadingItemId(itemId);
    try {
      const rows = await api.listCatalogItemAttributes(itemId);
      setItemAttributes((prev) => ({ ...prev, [itemId]: rows }));
    } catch (err) {
      console.error('Failed to load attributes', err);
      window.alert(err instanceof Error ? err.message : 'Failed to load attributes.');
    } finally {
      setAttrsLoadingItemId(null);
    }
  }

  async function handleAddAttribute(itemId: string) {
    const value = attrDraftValue.trim();
    if (!value) return;
    try {
      const materialDeltaType = attrDraftMaterialDeltaType || null;
      const laborDeltaType = attrDraftLaborDeltaType || null;
      const materialDeltaValue =
        materialDeltaType ? (attrDraftMaterialDeltaValue.trim() === '' ? null : Number(attrDraftMaterialDeltaValue)) : null;
      const laborDeltaValue =
        laborDeltaType ? (attrDraftLaborDeltaValue.trim() === '' ? null : Number(attrDraftLaborDeltaValue)) : null;

      const invalidPercent =
        (materialDeltaType === 'percent' && materialDeltaValue != null && Math.abs(materialDeltaValue) > 0 && Math.abs(materialDeltaValue) < 1) ||
        (laborDeltaType === 'percent' && laborDeltaValue != null && Math.abs(laborDeltaValue) > 0 && Math.abs(laborDeltaValue) < 1);
      if (invalidPercent) {
        window.alert('Percent deltas must be entered as whole percent points (e.g. 10 for 10%), not decimals like 0.1.');
        return;
      }

      await api.createCatalogItemAttribute({
        catalogItemId: itemId,
        attributeType: attrDraftType,
        attributeValue: value,
        materialDeltaType,
        materialDeltaValue,
        laborDeltaType,
        laborDeltaValue,
      });
      setAttrDraftValue('');
      setAttrDraftMaterialDeltaType('');
      setAttrDraftMaterialDeltaValue('');
      setAttrDraftLaborDeltaType('');
      setAttrDraftLaborDeltaValue('');
      await loadAttributesForItem(itemId);
    } catch (err) {
      console.error('Failed to add attribute', err);
      window.alert(err instanceof Error ? err.message : 'Failed to add attribute.');
    }
  }

  async function handleDeleteAttribute(itemId: string, attributeId: string) {
    if (!window.confirm('Remove this attribute?')) return;
    try {
      await api.deleteCatalogItemAttribute(attributeId);
      await loadAttributesForItem(itemId);
    } catch (err) {
      console.error('Failed to remove attribute', err);
      window.alert(err instanceof Error ? err.message : 'Failed to remove attribute.');
    }
  }

  async function handleAddAlias(itemId: string) {
    const value = aliasDraftValue.trim();
    if (!value) return;
    try {
      await api.createCatalogItemAlias({ catalogItemId: itemId, aliasType: aliasDraftType, aliasValue: value });
      setAliasDraftValue('');
      await loadAliasesForItem(itemId);
    } catch (err) {
      console.error('Failed to add alias', err);
      window.alert(err instanceof Error ? err.message : 'Failed to add alias.');
    }
  }

  async function handleDeleteAlias(itemId: string, aliasId: string) {
    if (!window.confirm('Delete this alias?')) return;
    try {
      await api.deleteCatalogItemAlias(aliasId);
      await loadAliasesForItem(itemId);
    } catch (err) {
      console.error('Failed to delete alias', err);
      window.alert(err instanceof Error ? err.message : 'Failed to delete alias.');
    }
  }

  async function resolveDuplicateGroup(key: string, canonicalId: string) {
    const group = duplicateGroups.find(([k]) => k === key)?.[1] || [];
    const canonical = group.find((i) => i.id === canonicalId) || null;
    if (!canonical) return;

    setDuplicateResolvingKey(key);
    try {
      // Ensure canonical row is marked as canonical and not deprecated.
      await api.updateCatalogItem({
        ...canonical,
        canonicalSku: canonical.sku,
        isCanonical: true,
        aliasOf: null,
        deprecated: false,
        deprecatedReason: null,
      });

      for (const row of group) {
        if (row.id === canonical.id) continue;

        // Convert duplicate SKU into a legacy alias for the canonical row.
        try {
          await api.createCatalogItemAlias({ catalogItemId: canonical.id, aliasType: 'legacy_sku', aliasValue: row.sku });
        } catch {
          // Ignore duplicates / uniqueness collisions.
        }

        // Mark duplicate row non-canonical + deprecated (no deletes).
        await api.updateCatalogItem({
          ...row,
          canonicalSku: canonical.sku,
          isCanonical: false,
          aliasOf: canonical.id,
          deprecated: true,
          deprecatedReason: row.deprecatedReason || `Duplicate of ${canonical.sku} (${canonical.description})`,
        });
      }

      await invalidateWorkspace();
      await loadAliasesForItem(canonical.id);
    } catch (err) {
      console.error('Duplicate resolution failed', err);
      window.alert(err instanceof Error ? err.message : 'Duplicate resolution failed.');
    } finally {
      setDuplicateResolvingKey(null);
    }
  }

  async function handleDeleteItem(id: string) {
    if (!confirm('Are you sure you want to deactivate this item?')) return;
    try {
      await api.deleteCatalogItem(id);
      await invalidateWorkspace();
    } catch (err) {
      console.error('Failed to delete item', err);
    }
  }

  function handleEditModifier(modifier: ModifierRecord) {
    setEditingModifier({ ...modifier });
  }

  async function handleSaveModifier(e: React.FormEvent) {
    e.preventDefault();
    if (!editingModifier) return;
    setSavingModifier(true);
    try {
      await api.updateCatalogModifier({
        id: editingModifier.id,
        name: editingModifier.name.trim(),
        modifierKey: editingModifier.modifierKey.trim(),
        description: (editingModifier.description || '').trim(),
        appliesToCategories: editingModifier.appliesToCategories,
        addLaborMinutes: Number(editingModifier.addLaborMinutes || 0),
        addMaterialCost: Number(editingModifier.addMaterialCost || 0),
        percentLabor: Number(editingModifier.percentLabor || 0),
        percentMaterial: Number(editingModifier.percentMaterial || 0),
        active: Boolean(editingModifier.active),
      });
      setEditingModifier(null);
      await invalidateWorkspace();
    } catch (error) {
      console.error('Failed to update modifier', error);
      alert(error instanceof Error ? error.message : 'Failed to update modifier');
    } finally {
      setSavingModifier(false);
    }
  }

  async function handleDeleteModifier(id: string) {
    if (!window.confirm('Deactivate this modifier?')) return;
    try {
      await api.deleteCatalogModifier(id);
      await invalidateWorkspace();
    } catch (error) {
      console.error('Failed to deactivate modifier', error);
      alert(error instanceof Error ? error.message : 'Failed to deactivate modifier');
    }
  }

  function handleEditBundle(bundle: BundleRecord) {
    setEditingBundle({ ...bundle });
  }

  async function handleSaveBundle(e: React.FormEvent) {
    e.preventDefault();
    if (!editingBundle) return;
    setSavingBundle(true);
    try {
      await api.updateCatalogBundle({
        id: editingBundle.id,
        bundleName: editingBundle.bundleName.trim(),
        category: editingBundle.category || null,
        active: Boolean(editingBundle.active),
      });
      setEditingBundle(null);
      await invalidateWorkspace();
    } catch (error) {
      console.error('Failed to update bundle', error);
      alert(error instanceof Error ? error.message : 'Failed to update bundle');
    } finally {
      setSavingBundle(false);
    }
  }

  async function handleDeleteBundle(id: string) {
    if (!window.confirm('Deactivate this bundle?')) return;
    try {
      await api.deleteCatalogBundle(id);
      await invalidateWorkspace();
    } catch (error) {
      console.error('Failed to deactivate bundle', error);
      alert(error instanceof Error ? error.message : 'Failed to deactivate bundle');
    }
  }

  const lastSynced = syncStatus?.lastSuccessAt || syncStatus?.lastAttemptAt;
  const displayedSyncFailure =
    syncActionError ||
    (syncStatus?.status === 'failed' && syncStatus.message?.trim() ? syncStatus.message.trim() : null);
  const itemsSyncedLabelHint =
    syncStatus?.status === 'failed' ? 'Last successful sheet import' : 'Last sheet sync';

  return (
    <div className="ui-page space-y-5">
      <header className="ui-panel px-4 py-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="ui-status-live">Live</span>
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                Brighten Builders <span className="mx-1 text-slate-300">/</span> Catalog Station
              </span>
            </div>
            <h1 className="mt-2 text-[24px] font-semibold leading-tight tracking-tight text-slate-950 md:text-[28px]">Catalog</h1>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.06em] text-slate-500">
              Items, modifiers, and bundles loaded from your workspace (sheet sync keeps them current).
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
              <span className="ui-chip-soft inline-flex items-center gap-1.5 px-2.5 py-1 font-medium text-slate-700">
                <Package className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                {items.length} items
              </span>
              <span className="ui-chip-soft px-2.5 py-1 font-medium text-slate-700">{modifiers.length} modifiers</span>
              <span className="ui-chip-soft px-2.5 py-1 font-medium text-slate-700">{bundles.length} bundles</span>
              {inventory ? (
                <span className="ui-chip-soft px-2.5 py-1 text-slate-600" title="Database activation flags">
                  {inventory.active} active · {inventory.inactive} inactive in DB
                </span>
              ) : null}
              {lastSynced ? (
                <span className="rounded-md border border-app-line bg-app-surface-soft px-2.5 py-1 text-app-muted">
                  Last sheet sync {new Date(lastSynced).toLocaleString()}
                </span>
              ) : (
                <span className="rounded-md border border-dashed border-app-line px-2.5 py-1 text-app-muted">
                  No sync timestamp yet — run sheet sync below
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      <section className="ui-surface p-4 space-y-4" aria-labelledby="catalog-sync-heading">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 id="catalog-sync-heading" className="text-sm font-semibold text-slate-900">
              Google Sheets sync
            </h2>
            <p className="ui-mono-kicker mt-1">Module 01 / Sync Status</p>
            <p className="mt-1 max-w-[52rem] text-xs leading-snug text-slate-500">
              Rows missing from the sheet are deactivated after sync; use Activate all after a bulk import if counts look wrong.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="ui-chip-soft inline-flex items-center gap-1">
              <Database className="w-3.5 h-3.5" aria-hidden />
              Source: Google Sheets
            </span>
            <span className={`rounded px-2 py-1 text-xs font-medium ${statusClass(syncStatus?.status || 'never')}`}>
              {syncStatus?.status === 'running'
                ? 'Syncing'
                : syncStatus?.status === 'success'
                  ? 'Synced'
                  : syncStatus?.status === 'failed'
                    ? 'Failed'
                    : 'Never synced'}
            </span>
            <button
              type="button"
              onClick={() => void handleSyncCatalog()}
              disabled={syncing}
              className="ui-btn-primary h-8 px-3 text-xs inline-flex items-center gap-1.5 disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} aria-hidden />
              {syncing ? 'Syncing…' : 'Sync catalog'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-2 text-xs">
          <div className="ui-surface-soft px-2 py-1.5 text-slate-700" title="Resolved from server env (GOOGLE_SHEETS_TAB_*)">
            {syncStatus?.workbook ? (
              <>
                Sheet tabs: {syncStatus.workbook.tabs.itemsFetch}, {syncStatus.workbook.tabs.modifiersFetch},{' '}
                {syncStatus.workbook.tabs.bundles}, {syncStatus.workbook.tabs.aliases},{' '}
                {syncStatus.workbook.tabs.attributes}
              </>
            ) : (
              <>Syncing CLEAN_ITEMS, CLEAN_MODIFIERS, BUNDLES, ALIASES, ATTRIBUTES (defaults)</>
            )}
          </div>
          <div className="ui-surface-soft px-2 py-1.5 text-slate-700">Last synced: {lastSynced ? new Date(lastSynced).toLocaleString() : 'Never'}</div>
          <div className="ui-surface-soft px-2 py-1.5 text-slate-700">
            DB rows: {inventory ? `${inventory.total} total · ${inventory.active} active · ${inventory.inactive} inactive` : '—'}
          </div>
          <div className="ui-surface-soft px-2 py-1.5 text-slate-700" title={itemsSyncedLabelHint}>
            {itemsSyncedLabelHint}: {syncStatus?.itemsSynced ?? '—'} items
          </div>
          <div className="ui-surface-soft px-2 py-1.5 text-slate-700">
            Modifiers: {syncStatus?.modifiersSynced || modifiers.length} | Bundles: {syncStatus?.bundlesSynced || bundles.length} | Aliases: {syncStatus?.aliasesSynced || 0} | Attributes: {syncStatus?.attributesSynced || 0}
          </div>
        </div>

        {displayedSyncFailure ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900 whitespace-pre-wrap">
            <span className="font-semibold">Sync error: </span>
            {displayedSyncFailure}
          </div>
        ) : null}

        {inventory && inventory.inactive > 0 ? (
          <div className="ui-callout-warn flex flex-wrap items-center justify-between gap-2 text-xs">
            <p>
              <span className="font-semibold">{inventory.inactive} catalog row(s) are inactive</span> — hidden from estimates and intake unless you filter “Inactive” here.
              Often caused by syncing Google Sheets when the sheet has fewer rows than this database.
            </p>
            <button
              type="button"
              onClick={() => void handleActivateAllCatalogItems()}
              disabled={activatingAll}
              className="ui-btn-secondary h-auto shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-semibold disabled:opacity-50"
            >
              {activatingAll ? 'Updating…' : 'Activate all catalog items'}
            </button>
          </div>
        ) : null}

        {syncStatus?.warnings?.length ? (
          <div className="ui-callout-warn text-xs">
            {syncStatus.warnings.slice(0, 3).map((warning, index) => (
              <p key={`${warning}-${index}`}>- {warning}</p>
            ))}
          </div>
        ) : null}
        {syncStatus ? <CatalogSyncReviewPanel syncStatus={syncStatus} /> : null}
      </section>

      <nav className="ui-surface p-3" aria-label="Catalog data tabs">
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('items')}
            className={`ui-wtab ${activeTab === 'items' ? 'ui-wtab-blue' : 'ui-wtab-idle'}`}
          >
            Items ({items.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('modifiers')}
            className={`ui-wtab ${activeTab === 'modifiers' ? 'ui-wtab-blue' : 'ui-wtab-idle'}`}
          >
            Modifiers ({modifiers.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('bundles')}
            className={`ui-wtab ${activeTab === 'bundles' ? 'ui-wtab-blue' : 'ui-wtab-idle'}`}
          >
            Bundles ({bundles.length})
          </button>
          <div className="ml-auto flex items-center gap-2">
            {activeTab === 'items' ? (
              <button
                type="button"
                onClick={handleCreateItem}
                className="ui-btn-primary h-8 px-3 text-xs inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Item
              </button>
            ) : null}
          </div>
        </div>
      </nav>

      <section className="ui-surface p-4 space-y-3">
        <div>
          <p className="ui-mono-kicker">Browse & filter</p>
          <p className="mt-1 text-xs text-slate-500">
            {activeTab === 'items'
              ? 'Filter items by category, type, activation, and canonical flags; row click opens the editor.'
              : activeTab === 'modifiers'
                ? 'Modifiers extend labor and material from the catalog workbook.'
                : 'Bundles group catalog SKUs for packaged estimating.'}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-12 lg:items-center">
          <div className={`relative ${activeTab === 'items' ? 'lg:col-span-4' : 'lg:col-span-10'}`}>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              ref={catalogSearchInputRef}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                activeTab === 'items'
                  ? 'Search SKU, description, manufacturer, model, sheet tab… (/ focuses)'
                  : activeTab === 'modifiers'
                    ? 'Search modifier key, name, categories'
                    : 'Search bundle id, name, category'
              }
              className="ui-input ui-input--leading-icon-sm h-8 text-xs"
              aria-label="Search catalog"
              title="Press / to focus this field when not typing in another control"
            />
          </div>

          {activeTab === 'items' ? (
            <>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="ui-input h-8 px-2 text-xs lg:col-span-2"
                aria-label="Filter by category"
              >
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category === 'all' ? 'All categories' : category}
                  </option>
                ))}
              </select>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="ui-input h-8 px-2 text-xs lg:col-span-2"
                aria-label="Filter by item type"
              >
                {itemTypes.map((itemType) => (
                  <option key={itemType} value={itemType}>
                    {itemType === 'all' ? 'All types' : itemType}
                  </option>
                ))}
              </select>
              <select
                value={activeFilter}
                onChange={(e) => setActiveFilter(e.target.value as 'all' | 'active' | 'inactive')}
                className="ui-input h-8 px-2 text-xs lg:col-span-2"
                aria-label="Filter by activation"
              >
                <option value="all">All activation</option>
                <option value="active">Active only</option>
                <option value="inactive">Inactive only</option>
              </select>
              <div className="relative lg:col-span-2">
                <ArrowUpDown className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortKey)}
                  className="ui-input ui-input--leading-icon-sm h-8 w-full pr-2 text-xs"
                  aria-label="Sort items"
                >
                  <option value="sku-asc">Sort: SKU (A–Z)</option>
                  <option value="sku-desc">Sort: SKU (Z–A)</option>
                  <option value="name-asc">Sort: Name (A–Z)</option>
                  <option value="name-desc">Sort: Name (Z–A)</option>
                  <option value="category-asc">Sort: Category</option>
                  <option value="material-desc">Sort: Material high → low</option>
                  <option value="labor-desc">Sort: Labor high → low</option>
                </select>
              </div>
            </>
          ) : (
            <>
              <select
                value={activeFilter}
                onChange={(e) => setActiveFilter(e.target.value as 'all' | 'active' | 'inactive')}
                className="ui-input h-8 px-2 text-xs lg:col-span-2"
                aria-label="Filter by activation"
              >
                <option value="all">All activation</option>
                <option value="active">Active only</option>
                <option value="inactive">Inactive only</option>
              </select>
            </>
          )}
        </div>

        {activeTab === 'items' ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
            <label className="inline-flex items-center gap-2 text-app-muted">
              <span className="shrink-0">Sheet tab</span>
              <select
                value={sourceTabFilter}
                onChange={(e) => setSourceTabFilter(e.target.value)}
                className="ui-input h-7 max-w-[14rem] px-2 text-[11px]"
                aria-label="Filter by workbook sheet tab"
              >
                {sheetSourceTabOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt === 'all' ? 'All sheet tabs' : opt === '__none__' ? 'No tab / unknown' : opt}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        {activeTab === 'items' ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
            <label className="inline-flex items-center gap-2 rounded-md border border-app-line bg-app-surface px-2 py-1">
              <span className="text-app-muted">Canonical</span>
              <select value={canonFilter} onChange={(e) => setCanonFilter(e.target.value as typeof canonFilter)} className="ui-input h-7 px-2 text-[11px]">
                <option value="all">All</option>
                <option value="canonical">Only canonical</option>
                <option value="non-canonical">Only non-canonical</option>
              </select>
            </label>

            <label className="inline-flex items-center gap-2 rounded-md border border-app-line bg-app-surface px-2 py-1 text-[11px] text-app">
              <input type="checkbox" checked={duplicatesOnly} onChange={(e) => setDuplicatesOnly(e.target.checked)} />
              Duplicates only
            </label>

            <label className="inline-flex items-center gap-2 rounded-md border border-app-line bg-app-surface px-2 py-1 text-[11px] text-app">
              <input type="checkbox" checked={deprecatedOnly} onChange={(e) => setDeprecatedOnly(e.target.checked)} />
              Deprecated only
            </label>

            <label className="ml-auto inline-flex items-center gap-2 rounded-md border border-app-line bg-app-surface px-2 py-1 text-[11px] text-app">
              <input type="checkbox" checked={showDuplicateReview} onChange={(e) => setShowDuplicateReview(e.target.checked)} />
              Duplicate review
            </label>

            <label className="inline-flex items-center gap-2 rounded-md border border-app-line bg-app-surface px-2 py-1 text-[11px] text-app">
              <input type="checkbox" checked={showQualityReport} onChange={(e) => setShowQualityReport(e.target.checked)} />
              Quality report
            </label>

            <label className="inline-flex items-center gap-2 rounded-md border border-app-line bg-app-surface px-2 py-1 text-[11px] text-app">
              <input type="checkbox" checked={imageSprintOnly} onChange={(e) => setImageSprintOnly(e.target.checked)} />
              Image sprint (mfr-backed, missing photo)
            </label>
          </div>
        ) : null}

        <div className="mt-2 text-[11px] text-slate-500">
          {activeTab === 'items' ? `Showing ${filteredItems.length} of ${items.length} item records` : activeTab === 'modifiers' ? `Showing ${filteredModifiers.length} of ${modifiers.length} modifier records` : `Showing ${filteredBundles.length} of ${bundles.length} bundle records`}
        </div>
      </section>

      {activeTab === 'items' && showDuplicateReview ? (
        <section className="ui-surface p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="ui-mono-kicker">Duplicates</p>
              <p className="mt-1 text-xs text-slate-500">
                Grouped by <span className="font-mono">duplicateGroupKey</span>. Pick a canonical record, then deprecate the rest (no deletes).
              </p>
            </div>
            <span className="ui-chip-soft">{duplicateGroups.length} groups</span>
          </div>

          {duplicateGroups.length === 0 ? (
            <div className="mt-3 ui-panel-muted p-3 text-xs text-slate-600">No duplicate groups detected yet.</div>
          ) : (
            <div className="mt-3 space-y-2">
              {duplicateGroups.slice(0, 25).map(([key, group]) => (
                <details key={key} className="ui-panel-muted p-3">
                  <summary className="cursor-pointer list-none">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-slate-500">Group</p>
                        <p className="mt-0.5 truncate text-xs font-semibold text-slate-900">{key}</p>
                      </div>
                      <span className="ui-chip-soft">{group.length} rows</span>
                    </div>
                  </summary>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <label className="text-[11px] font-medium text-slate-600">
                      Canonical row
                      <select
                        className="ui-input mt-1 h-8 px-2 text-[11px]"
                        value={duplicateCanonicalSelection[key] || group.find((r) => r.isCanonical !== false && !r.deprecated)?.id || group[0]?.id || ''}
                        onChange={(e) => setDuplicateCanonicalSelection((prev) => ({ ...prev, [key]: e.target.value }))}
                      >
                        {group.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.sku}{r.deprecated ? ' (deprecated)' : ''}{r.isCanonical === false ? ' (non-canonical)' : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="ui-btn-cta h-8 px-3 text-[11px]"
                      onClick={() => {
                        const selected =
                          duplicateCanonicalSelection[key] || group.find((r) => r.isCanonical !== false && !r.deprecated)?.id || group[0]?.id || '';
                        if (!selected) return;
                        void resolveDuplicateGroup(key, selected);
                      }}
                      disabled={duplicateResolvingKey === key}
                    >
                      {duplicateResolvingKey === key ? 'Resolving…' : 'Resolve group'}
                    </button>
                    <p className="text-[11px] text-slate-500">
                      Converts duplicate SKUs into <span className="font-mono">legacy_sku</span> aliases on the canonical row and deprecates the rest.
                    </p>
                  </div>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-app-line text-[10px] uppercase tracking-[0.08em] text-slate-500">
                          <th className="py-2 pr-2 text-left">SKU</th>
                          <th className="py-2 pr-2 text-left">Canonical</th>
                          <th className="py-2 pr-2 text-left">Finish</th>
                          <th className="py-2 pr-2 text-left">Deprecated</th>
                          <th className="py-2 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[color-mix(in_srgb,var(--line)_55%,white)]">
                        {group.map((item) => (
                          <tr key={item.id} className="align-top">
                            <td className="py-2 pr-2 font-mono text-[11px] text-slate-900">{item.sku}</td>
                            <td className="py-2 pr-2 font-mono text-[11px] text-slate-600">{item.canonicalSku || '—'}</td>
                            <td className="py-2 pr-2 text-slate-600">{item.finishGroup || '—'}</td>
                            <td className="py-2 pr-2">{item.deprecated ? <span className="ui-mono-chip ui-mono-chip--mute">yes</span> : <span className="ui-mono-chip ui-mono-chip--ok">no</span>}</td>
                            <td className="py-2 text-right">
                              <div className="flex flex-wrap items-center justify-end gap-1">
                                <button
                                  type="button"
                                  className="ui-btn-secondary h-8 px-2 text-[11px]"
                                  onClick={() => setEditingItem(item)}
                                >
                                  Open
                                </button>
                                <Link
                                  to={catalogCuratorPathDeep({
                                    q: item.sku,
                                    catalogItem: item.id,
                                    dup: true,
                                    drev: true,
                                  })}
                                  className="ui-btn-secondary inline-flex h-8 items-center px-2 text-[11px]"
                                >
                                  Link
                                </Link>
                                <button
                                  type="button"
                                  className="ui-btn-secondary inline-flex h-8 items-center gap-1 px-2 text-[11px]"
                                  title="Copy deep link to this row"
                                  onClick={() =>
                                    void copyTextToClipboard(
                                      `${typeof window !== 'undefined' ? window.location.origin : ''}${catalogCuratorPathDeep({
                                        q: item.sku,
                                        catalogItem: item.id,
                                        dup: true,
                                        drev: true,
                                      })}`,
                                    ).catch(() => {
                                      window.alert('Could not copy link.');
                                    })
                                  }
                                >
                                  <Clipboard className="h-3 w-3 shrink-0" aria-hidden />
                                  Copy
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {activeTab === 'items' && showQualityReport ? (
        <section className="ui-surface p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="ui-mono-kicker">Catalog quality</p>
              <p className="mt-1 text-xs text-slate-500">
                Highlights categories with missing manufacturer / model-series / image / real SKU / cost / labor. Uses current DB rows (no Google Sheet writes).
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <button
                type="button"
                className="ui-btn-secondary h-8 px-3 text-[11px]"
                onClick={() => void copyCatalogResearchQueueCsv()}
                disabled={filteredItems.length === 0}
              >
                Copy research queue CSV
              </button>
              <button type="button" className="ui-btn-secondary h-8 px-3 text-[11px]" onClick={() => void copyImageSprintCsv()}>
                Copy image sprint CSV
              </button>
            </div>
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-app-line text-[10px] uppercase tracking-[0.08em] text-slate-500">
                  <th className="py-2 pr-2 text-left">Category</th>
                  <th className="py-2 pr-2 text-right">Total</th>
                  <th className="py-2 pr-2 text-right">Active</th>
                  <th className="py-2 pr-2 text-right">Canonical</th>
                  <th className="py-2 pr-2 text-right">Deprecated</th>
                  <th className="py-2 pr-2 text-right">Missing Mfr</th>
                  <th className="py-2 pr-2 text-right">Missing Model/Series</th>
                  <th className="py-2 pr-2 text-right">Missing Image</th>
                  <th className="py-2 text-right">Missing Real SKU</th>
                  <th className="py-2 pr-2 text-right">Missing Material</th>
                  <th className="py-2 pr-2 text-right">Missing Labor</th>
                  <th className="py-2 text-right">Missing Install Family</th>
                </tr>
              </thead>
              <tbody>
                {catalogQualityByCategory.slice(0, 60).map((row) => (
                  <tr
                    key={row.category}
                    className="border-b border-slate-200/60 cursor-pointer hover:bg-slate-50/70"
                    title="Click to filter items by this category"
                    onClick={() => {
                      setActiveTab('items');
                      setCategoryFilter(row.category);
                    }}
                  >
                    <td className="py-2 pr-2 font-medium text-slate-900">{row.category}</td>
                    <td className="py-2 pr-2 text-right text-slate-700">{row.total}</td>
                    <td className="py-2 pr-2 text-right text-slate-700">{row.active}</td>
                    <td className="py-2 pr-2 text-right text-slate-700">{row.canonical}</td>
                    <td className="py-2 pr-2 text-right text-slate-700">{row.deprecated}</td>
                    <td className="py-2 pr-2 text-right text-slate-700">{row.missingManufacturer}</td>
                    <td className="py-2 pr-2 text-right text-slate-700">{row.missingModelSeries}</td>
                    <td className="py-2 pr-2 text-right text-slate-700">{row.missingImage}</td>
                    <td className="py-2 pr-2 text-right text-slate-700">{row.missingRealSku}</td>
                    <td className="py-2 pr-2 text-right text-slate-700">{row.missingMaterialCost}</td>
                    <td className="py-2 pr-2 text-right text-slate-700">{row.missingLaborMinutes}</td>
                    <td className="py-2 text-right text-slate-700">{row.missingInstallLaborFamily}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="ui-surface overflow-hidden" aria-label="Catalog browse results">
        <div className="max-h-[68vh] overflow-auto">
          {isError ? (
            <div className="flex min-h-[30vh] flex-col items-center justify-center gap-2 p-8 text-center text-sm text-red-700">
              <p>Could not load catalog workspace.</p>
              {error instanceof Error ? <p className="text-xs text-slate-600">{error.message}</p> : null}
              <button type="button" className="ui-btn-secondary h-9 px-3 text-xs" onClick={() => void refetch()}>
                Retry
              </button>
            </div>
          ) : isLoading ? (
            <div className="flex min-h-[30vh] items-center justify-center p-8 text-sm text-slate-500">Loading catalog…</div>
          ) : activeTab === 'items' ? (
            filteredItems.length === 0 ? (
              <div className="flex min-h-[28vh] flex-col items-center justify-center gap-3 p-10 text-center">
                <Package className="mx-auto h-8 w-8 text-slate-300" aria-hidden />
                {items.length === 0 ? (
                  <>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">No catalog items in the database yet</p>
                      <p className="mt-2 max-w-md text-xs leading-relaxed text-slate-600">
                        Run <strong>Google Sheets sync</strong> above (configure workbook tabs first). Until rows sync in, Items stays empty — modifiers and bundles populate from the same run.
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">No rows match these filters</p>
                      <p className="mt-2 max-w-md text-xs leading-relaxed text-slate-600">
                        Clear search text or reset category / type / activation / canonical toggles. If you expected inactive rows, choose &quot;Inactive only&quot; in the activation filter.
                      </p>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-100/95 backdrop-blur-sm">
                  <tr>
                    <th className="ui-table-th w-[3.25rem] text-center">Image</th>
                    <th className="ui-table-th min-w-[7rem]">SKU</th>
                    <th className="ui-table-th min-w-[12rem]">Description</th>
                    <th className="ui-table-th">Category</th>
                    <th className="ui-table-th">Type</th>
                    <th className="ui-table-th min-w-[8rem]">Mfr / brand</th>
                    <th className="ui-table-th">UoM</th>
                    <th className="ui-table-th-end">Labor</th>
                    <th className="ui-table-th-end">Material</th>
                    <th className="ui-table-th">Record status</th>
                    <th className="ui-table-th">Sheet source</th>
                    <th className="ui-table-th-end">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => {
                    const cat = String(item.category || '').toLowerCase();
                    const accent = cat.includes('partition')
                      ? 'border-l-emerald-500'
                      : cat.includes('screen') || cat.includes('mirror')
                        ? 'border-l-blue-500'
                        : cat.includes('accessor') || cat.includes('grab') || cat.includes('dispenser') || cat.includes('disposal')
                          ? 'border-l-amber-500'
                          : 'border-l-slate-300';
                    const imageHref = catalogImageHref(item.imageUrl);
                    const modelParts = [item.model, item.modelNumber, item.series].map((s) => String(s || '').trim()).filter(Boolean);
                    const sheetSrc = catalogItemSourceTab(item);
                    return (
                    <tr
                      key={item.id}
                      role="button"
                      tabIndex={0}
                      title="Click row to edit"
                      className={`cursor-pointer border-b border-slate-100 border-l-[3px] ${accent} outline-none hover:bg-slate-50/70 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400/50`}
                      onClick={() => setEditingItem(item)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setEditingItem(item);
                        }
                      }}
                    >
                      <td className="py-2 px-2 align-middle text-center">
                        <CatalogItemThumb url={item.imageUrl} />
                      </td>
                      <td className="py-2 px-3 align-top">
                        <div className="font-semibold text-slate-900">{item.sku?.trim() || '—'}</div>
                        <div className="font-mono text-[10px] text-slate-400" title={item.id}>
                          {item.id.length > 14 ? `${item.id.slice(0, 14)}…` : item.id}
                        </div>
                        {modelParts.length ? (
                          <div className="mt-1 text-[10px] leading-snug text-slate-500">
                            {modelParts.slice(0, 3).join(' · ')}
                          </div>
                        ) : null}
                      </td>
                      <td className="py-2 px-2 align-top">
                        <p className="line-clamp-2 font-medium leading-snug text-slate-900" title={item.description}>
                          {item.description?.trim() || '—'}
                        </p>
                        <div className="mt-1 inline-flex flex-wrap items-center gap-1 text-[10px] text-slate-500">
                          {item.laborBasis?.trim() ? (
                            <span className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[9px] text-slate-600" title="Labor basis">
                              {item.laborBasis}
                            </span>
                          ) : null}
                          {item.installLaborFamily?.trim() ? (
                            <span className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[9px] text-slate-600" title="Install labor family">
                              fam:{item.installLaborFamily}
                            </span>
                          ) : null}
                          {item.adaFlag ? (
                            <span className="inline-flex items-center gap-0.5 text-app-success" title="ADA flagged">
                              <ShieldCheck className="h-3 w-3" aria-hidden />
                              ADA
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="py-2 px-2 align-top text-slate-700">
                        <span>{item.category?.trim() || '—'}</span>
                        {item.categoryMain?.trim() ? (
                          <div className="mt-1 font-mono text-[10px] text-slate-500" title="categoryMain">
                            {item.categoryMain}
                          </div>
                        ) : null}
                      </td>
                      <td className="py-2 px-2 align-top text-slate-700">
                        <span className="font-medium">{catalogRowTypeLabel(item)}</span>
                        {item.recordGranularity ? (
                          <div className="mt-1 text-[10px] text-slate-500">Grain: {item.recordGranularity}</div>
                        ) : null}
                      </td>
                      <td className="py-2 px-2 align-top text-slate-700">
                        {(() => {
                          const mfr = item.manufacturer?.trim();
                          const br = item.brand?.trim();
                          const primary = mfr || br || '';
                          return (
                            <>
                              <div className="font-medium text-slate-800">{primary || '—'}</div>
                              {mfr && br && br !== mfr ? (
                                <div className="text-[10px] text-slate-500">Brand: {br}</div>
                              ) : null}
                            </>
                          );
                        })()}
                      </td>
                      <td className="py-2 px-2 text-slate-700">{item.defaultUnit?.trim() || item.uom}</td>
                      <td className="py-2 px-2 text-right text-slate-700">{formatNumberSafe(item.baseLaborMinutes, 1)} min</td>
                      <td className="py-2 px-2 text-right text-slate-700">{formatCurrencySafe(item.baseMaterialCost)}</td>
                      <td className="py-2 px-2 align-top">
                        <div className="flex flex-wrap gap-1">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${item.active ? 'border border-blue-200 bg-blue-50 text-blue-900' : 'border border-slate-200 bg-slate-100 text-slate-600'}`}
                          >
                            {item.active ? 'Active' : 'Inactive'}
                          </span>
                          {item.deprecated ? (
                            <span className="ui-mono-chip ui-mono-chip--mute text-[10px]" title={item.deprecatedReason?.trim() || undefined}>
                              Deprecated
                            </span>
                          ) : null}
                          {item.isCanonical === false ? (
                            <span className="ui-mono-chip ui-mono-chip--warn text-[10px]" title={item.aliasOf ? `aliasOf ${item.aliasOf}` : 'Non-canonical row'}>
                              Non-canon
                            </span>
                          ) : null}
                          {item.taxable === false ? (
                            <span className="rounded border border-slate-200 px-1 py-0.5 text-[10px] text-slate-600">Non-tax</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="py-2 px-2 align-top text-[10px] text-slate-600">
                        {sheetSrc ? (
                          <div className="min-w-0 max-w-[11rem]">
                            <div className="truncate font-mono" title={sheetSrc}>
                              {sheetSrc}
                            </div>
                            {item.catalogSourceRow != null ? (
                              <div
                                className="mt-0.5 font-semibold tabular-nums text-slate-800"
                                title="Workbook row (1-based)"
                              >
                                Row {item.catalogSourceRow}
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-2 px-3" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleDeleteItem(item.id);
                            }}
                            className="inline-flex h-7 items-center gap-1 rounded border border-red-200 px-2 text-red-700 hover:bg-red-50 outline-none focus-visible:ring-2 focus-visible:ring-red-400/40"
                          >
                            <Trash2 className="h-3 w-3" aria-hidden />
                            Deactivate
                          </button>
                          {imageHref ? (
                            <a
                              href={imageHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex h-7 items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 font-medium text-blue-800 hover:bg-blue-100"
                              title={imageHref}
                            >
                              <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                              Image
                            </a>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            )
          ) : activeTab === 'modifiers' ? (
            filteredModifiers.length === 0 ? (
              <div className="flex min-h-[28vh] flex-col items-center justify-center gap-3 p-10 text-center">
                <div className="text-sm font-semibold text-slate-800">
                  {modifiers.length === 0 ? 'No modifiers loaded yet' : 'No modifiers match these filters'}
                </div>
                <p className="max-w-md text-xs leading-relaxed text-slate-600">
                  {modifiers.length === 0
                    ? 'Run Google Sheets sync above after your workbook MODIFIERS tab is populated. Modifier rows drive labor/material deltas on estimates.'
                    : 'Clear search or switch activation filter to “All activation”. Sync warnings above sometimes list unknown modifier keys referenced by bundles.'}
                </p>
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-100/95 backdrop-blur-sm">
                  <tr>
                    <th className="ui-table-th">Modifier</th>
                    <th className="ui-table-th">Key</th>
                    <th className="ui-table-th min-w-[200px]">Description</th>
                    <th className="ui-table-th">Applies To</th>
                    <th className="ui-table-th-end">+ Labor Min</th>
                    <th className="ui-table-th-end">+ Material</th>
                    <th className="ui-table-th-end">% Labor</th>
                    <th className="ui-table-th-end">% Material</th>
                    <th className="ui-table-th-end whitespace-nowrap">Updated</th>
                    <th className="ui-table-th text-center">Active</th>
                    <th className="ui-table-th-end">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredModifiers.map((modifier) => (
                    <tr
                      key={modifier.id}
                      role="button"
                      tabIndex={0}
                      title="Click row to edit"
                      className="border-b border-slate-100 hover:bg-slate-50/70 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400/50"
                      onClick={() => void handleEditModifier(modifier)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          void handleEditModifier(modifier);
                        }
                      }}
                    >
                      <td className="py-2 px-3 font-medium text-slate-900">{modifier.name}</td>
                      <td className="py-2 px-2 text-slate-700">{modifier.modifierKey}</td>
                      <td
                        className="py-2 px-2 align-top text-slate-600 max-w-[min(28rem,40vw)]"
                        title={modifier.description || undefined}
                      >
                        <p className="line-clamp-2 text-[11px] leading-snug">{modifier.description?.trim() || '—'}</p>
                      </td>
                      <td className="py-2 px-2 text-slate-700">{modifier.appliesToCategories.join(', ') || '-'}</td>
                      <td className="py-2 px-2 text-right text-slate-700">{formatNumberSafe(modifier.addLaborMinutes, 2)}</td>
                      <td className="py-2 px-2 text-right text-slate-700">{formatCurrencySafe(modifier.addMaterialCost)}</td>
                      <td className="py-2 px-2 text-right text-slate-700">{formatPercentSafe(modifier.percentLabor)}</td>
                      <td className="py-2 px-2 text-right text-slate-700">{formatPercentSafe(modifier.percentMaterial)}</td>
                      <td className="py-2 px-2 text-right whitespace-nowrap text-slate-600">
                        {modifier.updatedAt ? new Date(modifier.updatedAt).toLocaleString() : '—'}
                      </td>
                      <td className="py-2 px-2 text-center">
                        <span
                          className={`rounded px-1.5 py-0.5 text-xs ${modifier.active ? 'ui-status-info border font-medium' : 'border border-slate-300 bg-slate-100 text-slate-600'}`}
                        >
                          {modifier.active ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td className="py-2 px-3" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleDeleteModifier(modifier.id);
                            }}
                            className="h-7 px-2 rounded border border-red-200 text-red-700 hover:bg-red-50 inline-flex items-center gap-1 outline-none focus-visible:ring-2 focus-visible:ring-red-400/40"
                          >
                            <Trash2 className="w-3 h-3" />
                            Deactivate
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : filteredBundles.length === 0 ? (
            <div className="flex min-h-[28vh] flex-col items-center justify-center gap-3 p-10 text-center">
              <div className="text-sm font-semibold text-slate-800">
                {bundles.length === 0 ? 'No bundles loaded yet' : 'No bundles match these filters'}
              </div>
              <p className="max-w-md text-xs leading-relaxed text-slate-600">
                {bundles.length === 0
                  ? 'Run Google Sheets sync above once your workbook BUNDLES tab has rows. Bundles reference catalog SKUs and modifiers — orphan SKU/modifier hints appear under sync warnings when something does not resolve.'
                  : 'Clear search or widen the activation filter. Use Manual review queues in the sync panel to export orphan bundle SKU references.'}
              </p>
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-100/95 backdrop-blur-sm">
                <tr>
                  <th className="ui-table-th">Bundle ID</th>
                  <th className="ui-table-th">Bundle Name</th>
                  <th className="ui-table-th">Category</th>
                  <th className="ui-table-th">Updated</th>
                  <th className="ui-table-th text-center">Active</th>
                  <th className="ui-table-th-end">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredBundles.map((bundle) => (
                  <tr
                    key={bundle.id}
                    role="button"
                    tabIndex={0}
                    title="Click row to edit"
                    className="border-b border-slate-100 hover:bg-slate-50/70 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400/50"
                    onClick={() => void handleEditBundle(bundle)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        void handleEditBundle(bundle);
                      }
                    }}
                  >
                    <td className="py-2 px-3 text-slate-700">{bundle.id}</td>
                    <td className="py-2 px-2 font-medium text-slate-900">{bundle.bundleName}</td>
                    <td className="py-2 px-2 text-slate-700">{bundle.category || '-'}</td>
                    <td className="py-2 px-2 text-slate-500">{bundle.updatedAt ? new Date(bundle.updatedAt).toLocaleString() : '-'}</td>
                    <td className="py-2 px-2 text-center">
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs ${bundle.active ? 'ui-status-info border font-medium' : 'border border-slate-300 bg-slate-100 text-slate-600'}`}
                      >
                        {bundle.active ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="py-2 px-3" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleDeleteBundle(bundle.id);
                          }}
                          className="h-7 px-2 rounded border border-red-200 text-red-700 hover:bg-red-50 inline-flex items-center gap-1 outline-none focus-visible:ring-2 focus-visible:ring-red-400/40"
                        >
                          <Trash2 className="w-3 h-3" />
                          Deactivate
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {editingItem ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 sm:p-6">
          <form onSubmit={handleSaveItem} className="ui-panel w-full max-w-2xl overflow-hidden p-0 shadow-2xl">
            <div className="flex items-center justify-between border-b border-app-line px-4 py-3.5">
              <div>
                <p className="ui-mono-kicker">Module 01 / Catalog Record</p>
                <h2 className="mt-1 text-base font-semibold text-slate-900">Edit Catalog Item</h2>
                {curatorEditorContextBadges.length ? (
                  <div className="mt-2 flex max-w-xl flex-wrap gap-1.5" role="status" aria-label="Active catalog filters">
                    {curatorEditorContextBadges.map((t) => (
                      <span key={t} className="ui-mono-chip ui-mono-chip--warn text-[10px]">
                        {t}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => closeItemEditor()}
                aria-label="Close edit catalog item"
                className="ui-ghost-btn h-9 w-9 justify-center p-0"
              >
                <Plus className="w-4 h-4 rotate-45" />
              </button>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto max-h-[70vh]">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Description</label>
                  <input
                    type="text"
                    required
                    className="ui-input"
                    value={editingItem.description}
                    onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">SKU</label>
                  <input
                    type="text"
                    className="ui-input"
                    value={editingItem.sku}
                    onChange={(e) => setEditingItem({ ...editingItem, sku: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Category</label>
                  <input
                    type="text"
                    className="ui-input"
                    value={editingItem.category}
                    onChange={(e) => setEditingItem({ ...editingItem, category: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Manufacturer</label>
                  <input
                    type="text"
                    className="ui-input"
                    value={editingItem.manufacturer ?? ''}
                    onChange={(e) =>
                      setEditingItem({
                        ...editingItem,
                        manufacturer: e.target.value.trim() ? e.target.value.trim() : undefined,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Brand</label>
                  <input
                    type="text"
                    placeholder="Brand line from sheet"
                    className="ui-input"
                    value={editingItem.brand ?? ''}
                    onChange={(e) =>
                      setEditingItem({
                        ...editingItem,
                        brand: e.target.value.trim() ? e.target.value.trim() : undefined,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Model</label>
                  <input
                    type="text"
                    className="ui-input"
                    value={editingItem.model ?? ''}
                    onChange={(e) =>
                      setEditingItem({
                        ...editingItem,
                        model: e.target.value.trim() ? e.target.value.trim() : undefined,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Model number</label>
                  <input
                    type="text"
                    className="ui-input"
                    value={editingItem.modelNumber ?? ''}
                    onChange={(e) =>
                      setEditingItem({
                        ...editingItem,
                        modelNumber: e.target.value.trim() ? e.target.value.trim() : undefined,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Series</label>
                  <input
                    type="text"
                    className="ui-input"
                    value={editingItem.series ?? ''}
                    onChange={(e) =>
                      setEditingItem({
                        ...editingItem,
                        series: e.target.value.trim() ? e.target.value.trim() : undefined,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Item type (sheet)</label>
                  <input
                    type="text"
                    placeholder="Normalized item type when present"
                    className="ui-input"
                    value={editingItem.itemType ?? ''}
                    onChange={(e) =>
                      setEditingItem({
                        ...editingItem,
                        itemType: e.target.value.trim() ? e.target.value.trim() : undefined,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Unit</label>
                  <select
                    className="ui-input"
                    value={editingItem.uom}
                    onChange={(e) => setEditingItem({ ...editingItem, uom: e.target.value as CatalogItem['uom'] })}
                  >
                    <option value="EA">EA</option>
                    <option value="LF">LF</option>
                    <option value="SF">SF</option>
                    <option value="CY">CY</option>
                    <option value="HR">HR</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Family</label>
                  <input
                    type="text"
                    placeholder="Product line / collection"
                    className="ui-input"
                    value={editingItem.family ?? ''}
                    onChange={(e) =>
                      setEditingItem({
                        ...editingItem,
                        family: e.target.value.trim() ? e.target.value.trim() : undefined,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Subcategory</label>
                  <input
                    type="text"
                    placeholder="Sheet subcategory when distinct from family"
                    className="ui-input"
                    value={editingItem.subcategory ?? ''}
                    onChange={(e) =>
                      setEditingItem({
                        ...editingItem,
                        subcategory: e.target.value.trim() ? e.target.value.trim() : undefined,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Base Material Cost ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="ui-input"
                    value={editingItem.baseMaterialCost}
                    onChange={(e) => setEditingItem({ ...editingItem, baseMaterialCost: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Base Labor Minutes</label>
                  <input
                    type="number"
                    className="ui-input"
                    value={editingItem.baseLaborMinutes}
                    onChange={(e) => setEditingItem({ ...editingItem, baseLaborMinutes: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Install Labor Family <span className="text-slate-400 font-normal">(fallback when this item has no labor minutes on a line)</span>
                  </label>
                  <select
                    className="ui-input"
                    value={editingItem.installLaborFamily ?? ''}
                    onChange={(e) =>
                      setEditingItem({
                        ...editingItem,
                        installLaborFamily: e.target.value ? e.target.value : null,
                      })
                    }
                  >
                    <option value="">— None —</option>
                    {INSTALL_LABOR_FAMILY_OPTIONS.map((opt) => (
                      <option key={opt.key} value={opt.key}>
                        {opt.label} · {opt.defaultMinutes} min {opt.unitBasis.replace('per_', '/ ')}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[10px] leading-snug text-slate-500">
                    Drives install-family labor for intake lines that match this SKU but arrive with zero labor. Leave blank to rely on heuristic scope-type detection.
                  </p>
                </div>
                <div className="col-span-2">
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Image URL (optional)</label>
                  <div className="flex flex-wrap items-start gap-3">
                    <input
                      type="url"
                      placeholder="https://…"
                      className="min-w-[12rem] flex-1 h-9 px-2 border border-slate-300 rounded text-sm"
                      value={editingItem.imageUrl ?? ''}
                      onChange={(e) =>
                        setEditingItem({
                          ...editingItem,
                          imageUrl: e.target.value.trim() ? e.target.value.trim() : undefined,
                        })
                      }
                    />
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-medium text-slate-500">Preview</span>
                      <div key={editingItem.imageUrl ?? ''}>
                        <CatalogItemThumb url={editingItem.imageUrl} />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="col-span-2 flex items-center gap-4 text-xs text-slate-700">
                  <label className="inline-flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={editingItem.active}
                      onChange={(e) => setEditingItem({ ...editingItem, active: e.target.checked })}
                    />
                    Active
                  </label>
                  <label className="inline-flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={editingItem.adaFlag}
                      onChange={(e) => setEditingItem({ ...editingItem, adaFlag: e.target.checked })}
                    />
                    ADA Flag
                  </label>
                  <label className="inline-flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={editingItem.taxable}
                      onChange={(e) => setEditingItem({ ...editingItem, taxable: e.target.checked })}
                    />
                    Taxable
                  </label>
                </div>

                <div className="col-span-2 ui-panel-muted p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="ui-mono-kicker">Canonicalization</p>
                      <p className="mt-1 text-[11px] text-slate-500">Transitional fields used to collapse duplicate finish rows safely.</p>
                    </div>
                    <span className="ui-chip-soft">{editingItem.isCanonical === false ? 'non-canonical' : 'canonical'}</span>
                  </div>

                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block text-[11px] font-medium text-slate-600">
                      Canonical SKU
                      <input
                        className="ui-input mt-1"
                        value={editingItem.canonicalSku || ''}
                        onChange={(e) => setEditingItem({ ...editingItem, canonicalSku: e.target.value || null })}
                        placeholder="Base SKU (no finish token)"
                      />
                    </label>

                    <label className="block text-[11px] font-medium text-slate-600">
                      Finish group
                      <input
                        className="ui-input mt-1"
                        value={editingItem.finishGroup || ''}
                        onChange={(e) => setEditingItem({ ...editingItem, finishGroup: e.target.value || null })}
                        placeholder="SS / CH / PB / …"
                      />
                    </label>

                    <label className="block text-[11px] font-medium text-slate-600 sm:col-span-2">
                      Duplicate group key
                      <input
                        className="ui-input mt-1 font-mono text-[11px]"
                        value={editingItem.duplicateGroupKey || ''}
                        onChange={(e) => setEditingItem({ ...editingItem, duplicateGroupKey: e.target.value || null })}
                        placeholder="category|baseSku"
                      />
                    </label>

                    <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={editingItem.isCanonical !== false}
                        onChange={(e) => setEditingItem({ ...editingItem, isCanonical: e.target.checked })}
                      />
                      Is canonical
                    </label>

                    <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={Boolean(editingItem.deprecated)}
                        onChange={(e) => setEditingItem({ ...editingItem, deprecated: e.target.checked })}
                      />
                      Deprecated
                    </label>

                    <label className="block text-[11px] font-medium text-slate-600 sm:col-span-2">
                      Deprecated reason
                      <input
                        className="ui-input mt-1"
                        value={editingItem.deprecatedReason || ''}
                        onChange={(e) => setEditingItem({ ...editingItem, deprecatedReason: e.target.value || null })}
                        placeholder="Why this row should no longer be used"
                      />
                    </label>

                    <label className="block text-[11px] font-medium text-slate-600 sm:col-span-2">
                      Alias of (catalog item id)
                      <input
                        className="ui-input mt-1 font-mono text-[11px]"
                        value={editingItem.aliasOf || ''}
                        onChange={(e) => setEditingItem({ ...editingItem, aliasOf: e.target.value || null })}
                        placeholder="canonical item id (optional)"
                      />
                    </label>
                  </div>
                </div>

                <div className="col-span-2 ui-panel-muted p-3">
                  <details className="group">
                    <summary className="cursor-pointer text-[11px] font-semibold text-slate-800 [&::-webkit-details-marker]:hidden">
                      <span className="underline decoration-dotted underline-offset-2 group-open:no-underline">
                        Sheet provenance and extra API fields
                      </span>
                      <span className="ml-2 font-normal text-app-muted">(read-only)</span>
                    </summary>
                    {(() => {
                      const ro = catalogItemReadOnlyRows(editingItem);
                      return ro.length ? (
                        <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1.5 border-t border-app-line pt-2 text-[11px] sm:grid-cols-2">
                          {ro.map((row) => (
                            <div key={row.label} className="min-w-0">
                              <dt className="text-app-muted">{row.label}</dt>
                              <dd className="break-words font-mono text-slate-800">{row.value}</dd>
                            </div>
                          ))}
                        </dl>
                      ) : (
                        <p className="mt-2 border-t border-app-line pt-2 text-[11px] text-app-muted">
                          No extra provenance fields on this row (they usually appear after a sheet sync).
                        </p>
                      );
                    })()}
                  </details>
                </div>

                <div className="col-span-2 ui-panel-muted p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="ui-mono-kicker">Aliases</p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        First-class aliases used by parsers and vendor variants (keeps catalog rows canonical).
                      </p>
                    </div>
                    <button
                      type="button"
                      className="ui-btn-secondary h-8 px-3 text-[11px]"
                      onClick={() => void loadAliasesForItem(editingItem.id)}
                      disabled={aliasesLoadingItemId === editingItem.id}
                    >
                      {aliasesLoadingItemId === editingItem.id ? 'Loading…' : 'Refresh'}
                    </button>
                  </div>

                  <div className="mt-3 flex flex-wrap items-end gap-2">
                    <label className="text-[11px] font-medium text-slate-600">
                      Type
                      <select
                        className="ui-input mt-1 h-8 px-2 text-[11px]"
                        value={aliasDraftType}
                        onChange={(e) => setAliasDraftType(e.target.value as import('../types').CatalogAliasType)}
                      >
                        <option value="legacy_sku">legacy_sku</option>
                        <option value="vendor_sku">vendor_sku</option>
                        <option value="parser_phrase">parser_phrase</option>
                        <option value="generic_name">generic_name</option>
                        <option value="search_key">search_key</option>
                      </select>
                    </label>
                    <label className="min-w-[14rem] flex-1 text-[11px] font-medium text-slate-600">
                      Alias value
                      <input className="ui-input mt-1 h-8" value={aliasDraftValue} onChange={(e) => setAliasDraftValue(e.target.value)} />
                    </label>
                    <button type="button" className="ui-btn-cta h-8 px-3 text-[11px]" onClick={() => void handleAddAlias(editingItem.id)}>
                      Add
                    </button>
                  </div>

                  <div className="mt-3">
                    {itemAliases[editingItem.id]?.length ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-app-line text-[10px] uppercase tracking-[0.08em] text-slate-500">
                              <th className="py-2 pr-2 text-left">Type</th>
                              <th className="py-2 pr-2 text-left">Value</th>
                              <th className="py-2 text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[color-mix(in_srgb,var(--line)_55%,white)]">
                            {itemAliases[editingItem.id].map((a) => (
                              <tr key={a.id}>
                                <td className="py-2 pr-2 font-mono text-[11px] text-slate-600">{a.aliasType}</td>
                                <td className="py-2 pr-2 font-mono text-[11px] text-slate-900">{a.aliasValue}</td>
                                <td className="py-2 text-right">
                                  <button type="button" className="ui-btn-secondary h-7 px-2 text-[11px]" onClick={() => void handleDeleteAlias(editingItem.id, a.id)}>
                                    Remove
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-500">No aliases loaded yet. Click Refresh to load.</p>
                    )}
                  </div>
                </div>

                <div className="col-span-2 ui-panel-muted p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="ui-mono-kicker">Attributes</p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        Structured variants (finish, mounting, coating, assembly) so meaning doesn’t require duplicate SKUs.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="ui-btn-secondary h-8 px-3 text-[11px]"
                      onClick={() => void loadAttributesForItem(editingItem.id)}
                      disabled={attrsLoadingItemId === editingItem.id}
                    >
                      {attrsLoadingItemId === editingItem.id ? 'Loading…' : 'Refresh'}
                    </button>
                  </div>

                  <div className="mt-3 flex flex-wrap items-end gap-2">
                    <label className="text-[11px] font-medium text-slate-600">
                      Type
                      <select
                        className="ui-input mt-1 h-8 px-2 text-[11px]"
                        value={attrDraftType}
                        onChange={(e) => setAttrDraftType(e.target.value as import('../types').CatalogAttributeType)}
                      >
                        <option value="finish">finish</option>
                        <option value="coating">coating</option>
                        <option value="grip">grip</option>
                        <option value="mounting">mounting</option>
                        <option value="assembly">assembly</option>
                      </select>
                    </label>
                    <label className="min-w-[14rem] flex-1 text-[11px] font-medium text-slate-600">
                      Value
                      <input className="ui-input mt-1 h-8" value={attrDraftValue} onChange={(e) => setAttrDraftValue(e.target.value)} />
                    </label>
                    <label className="text-[11px] font-medium text-slate-600">
                      Material delta
                      <div className="mt-1 flex items-center gap-2">
                        <select
                          className="ui-input h-8 px-2 text-[11px]"
                          value={attrDraftMaterialDeltaType}
                          onChange={(e) => setAttrDraftMaterialDeltaType(e.target.value as any)}
                        >
                          <option value="">none</option>
                          <option value="absolute">+$</option>
                          <option value="percent">% material</option>
                        </select>
                        <input
                          className="ui-input h-8 w-24 px-2 text-[11px]"
                          inputMode="decimal"
                          value={attrDraftMaterialDeltaValue}
                          onChange={(e) => setAttrDraftMaterialDeltaValue(e.target.value)}
                          placeholder={attrDraftMaterialDeltaType === 'percent' ? '10' : '5.00'}
                          aria-label="Material delta value"
                          disabled={!attrDraftMaterialDeltaType}
                        />
                      </div>
                      {attrDraftMaterialDeltaType === 'percent' ? (
                        <p className="mt-1 text-[10px] text-slate-500">Enter percent points (10 = 10%).</p>
                      ) : null}
                    </label>
                    <label className="text-[11px] font-medium text-slate-600">
                      Labor delta
                      <div className="mt-1 flex items-center gap-2">
                        <select
                          className="ui-input h-8 px-2 text-[11px]"
                          value={attrDraftLaborDeltaType}
                          onChange={(e) => setAttrDraftLaborDeltaType(e.target.value as any)}
                        >
                          <option value="">none</option>
                          <option value="minutes">+min</option>
                          <option value="percent">% labor</option>
                        </select>
                        <input
                          className="ui-input h-8 w-24 px-2 text-[11px]"
                          inputMode="decimal"
                          value={attrDraftLaborDeltaValue}
                          onChange={(e) => setAttrDraftLaborDeltaValue(e.target.value)}
                          placeholder={attrDraftLaborDeltaType === 'percent' ? '10' : '2.0'}
                          aria-label="Labor delta value"
                          disabled={!attrDraftLaborDeltaType}
                        />
                      </div>
                      {attrDraftLaborDeltaType === 'percent' ? (
                        <p className="mt-1 text-[10px] text-slate-500">Enter percent points (10 = 10%).</p>
                      ) : null}
                    </label>
                    <button type="button" className="ui-btn-cta h-8 px-3 text-[11px]" onClick={() => void handleAddAttribute(editingItem.id)}>
                      Add
                    </button>
                  </div>

                  <div className="mt-3">
                    {itemAttributes[editingItem.id]?.length ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-app-line text-[10px] uppercase tracking-[0.08em] text-slate-500">
                              <th className="py-2 pr-2 text-left">Type</th>
                              <th className="py-2 pr-2 text-left">Value</th>
                              <th className="py-2 pr-2 text-left">Effect</th>
                              <th className="py-2 text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[color-mix(in_srgb,var(--line)_55%,white)]">
                            {itemAttributes[editingItem.id].map((a) => (
                              <tr key={a.id}>
                                <td className="py-2 pr-2 font-mono text-[11px] text-slate-600">{a.attributeType}</td>
                                <td className="py-2 pr-2 font-mono text-[11px] text-slate-900">{a.attributeValue}</td>
                                <td className="py-2 pr-2 text-[11px] text-slate-700">{describeAttributeEffect(a)}</td>
                                <td className="py-2 text-right">
                                  <button type="button" className="ui-btn-secondary h-7 px-2 text-[11px]" onClick={() => void handleDeleteAttribute(editingItem.id, a.id)}>
                                    Remove
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-500">No attributes loaded yet. Click Refresh to load.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => closeItemEditor()}
                className="h-8 px-3 border border-slate-300 rounded text-xs text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="h-8 px-3 rounded bg-blue-700 hover:bg-blue-800 text-white text-xs font-medium"
              >
                Save Item
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {editingModifier ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 sm:p-6">
          <form onSubmit={handleSaveModifier} className="ui-panel w-full max-w-2xl overflow-hidden p-0 shadow-2xl">
            <div className="flex items-center justify-between border-b border-app-line px-4 py-3.5">
              <div>
                <p className="ui-mono-kicker">Catalog / Modifier</p>
                <h2 className="mt-1 text-base font-semibold text-slate-900">Edit Modifier</h2>
              </div>
              <button type="button" onClick={() => setEditingModifier(null)} aria-label="Close edit modifier" className="ui-ghost-btn h-9 w-9 justify-center p-0">
                <Plus className="h-4 w-4 rotate-45" />
              </button>
            </div>
            <div className="p-4 space-y-4 overflow-y-auto max-h-[70vh]">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Name</label>
                  <input className="ui-input" value={editingModifier.name} onChange={(e) => setEditingModifier({ ...editingModifier, name: e.target.value })} required />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Modifier Key</label>
                  <input className="ui-input" value={editingModifier.modifierKey} onChange={(e) => setEditingModifier({ ...editingModifier, modifierKey: e.target.value })} required />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Description</label>
                  <textarea className="ui-textarea" rows={3} value={editingModifier.description || ''} onChange={(e) => setEditingModifier({ ...editingModifier, description: e.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Applies to categories</label>
                  <input
                    className="ui-input"
                    placeholder="Comma separated, e.g. Toilet Partitions, Accessories"
                    value={editingModifier.appliesToCategories.join(', ')}
                    onChange={(e) =>
                      setEditingModifier({
                        ...editingModifier,
                        appliesToCategories: e.target.value
                          .split(',')
                          .map((p) => p.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Add labor minutes</label>
                  <input type="number" className="ui-input" value={editingModifier.addLaborMinutes} onChange={(e) => setEditingModifier({ ...editingModifier, addLaborMinutes: Number(e.target.value) || 0 })} />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Add material cost</label>
                  <input type="number" step="0.01" className="ui-input" value={editingModifier.addMaterialCost} onChange={(e) => setEditingModifier({ ...editingModifier, addMaterialCost: Number(e.target.value) || 0 })} />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Percent labor</label>
                  <input type="number" step="0.01" className="ui-input" value={editingModifier.percentLabor} onChange={(e) => setEditingModifier({ ...editingModifier, percentLabor: Number(e.target.value) || 0 })} />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Percent material</label>
                  <input type="number" step="0.01" className="ui-input" value={editingModifier.percentMaterial} onChange={(e) => setEditingModifier({ ...editingModifier, percentMaterial: Number(e.target.value) || 0 })} />
                </div>
                <label className="sm:col-span-2 inline-flex items-center gap-2 text-xs text-slate-700">
                  <input type="checkbox" checked={Boolean(editingModifier.active)} onChange={(e) => setEditingModifier({ ...editingModifier, active: e.target.checked })} />
                  Active
                </label>
              </div>
              <p className="text-[11px] text-app-muted">
                <span className="font-medium text-slate-600">Record id:</span>{' '}
                <span className="font-mono text-slate-800">{editingModifier.id}</span>
                <span className="mx-2 text-slate-300">·</span>
                <span className="font-medium text-slate-600">Updated:</span>{' '}
                {editingModifier.updatedAt ? new Date(editingModifier.updatedAt).toLocaleString() : '—'}
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-app-line px-4 py-3.5">
              <button type="button" onClick={() => setEditingModifier(null)} className="ui-btn-secondary" disabled={savingModifier}>
                Cancel
              </button>
              <button type="submit" className="ui-btn-cta" disabled={savingModifier}>
                {savingModifier ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {editingBundle ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 sm:p-6">
          <form onSubmit={handleSaveBundle} className="ui-panel w-full max-w-xl overflow-hidden p-0 shadow-2xl">
            <div className="flex items-center justify-between border-b border-app-line px-4 py-3.5">
              <div>
                <p className="ui-mono-kicker">Catalog / Bundle</p>
                <h2 className="mt-1 text-base font-semibold text-slate-900">Edit Bundle</h2>
              </div>
              <button type="button" onClick={() => setEditingBundle(null)} aria-label="Close edit bundle" className="ui-ghost-btn h-9 w-9 justify-center p-0">
                <Plus className="h-4 w-4 rotate-45" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div className="rounded-lg border border-app-line bg-app-surface-soft px-3 py-2 text-[11px] text-slate-700">
                <div>
                  <span className="text-app-muted">Bundle id</span>{' '}
                  <span className="break-all font-mono text-slate-900">{editingBundle.id}</span>
                </div>
                <div className="mt-1">
                  <span className="text-app-muted">Last updated</span>{' '}
                  {editingBundle.updatedAt ? new Date(editingBundle.updatedAt).toLocaleString() : '—'}
                </div>
              </div>
              <label className="block text-[11px] font-medium text-slate-600">
                Bundle name
                <input className="ui-input mt-1" value={editingBundle.bundleName} onChange={(e) => setEditingBundle({ ...editingBundle, bundleName: e.target.value })} required />
              </label>
              <label className="block text-[11px] font-medium text-slate-600">
                Category (optional)
                <input className="ui-input mt-1" value={editingBundle.category || ''} onChange={(e) => setEditingBundle({ ...editingBundle, category: e.target.value || null })} />
              </label>
              <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                <input type="checkbox" checked={Boolean(editingBundle.active)} onChange={(e) => setEditingBundle({ ...editingBundle, active: e.target.checked })} />
                Active
              </label>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-app-line px-4 py-3.5">
              <button type="button" onClick={() => setEditingBundle(null)} className="ui-btn-secondary" disabled={savingBundle}>
                Cancel
              </button>
              <button type="submit" className="ui-btn-cta" disabled={savingBundle}>
                {savingBundle ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
