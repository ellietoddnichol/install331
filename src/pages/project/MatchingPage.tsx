import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';

function str(r: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = r[k];
    if (v != null && String(v).trim()) return String(v);
  }
  return '';
}

function num(r: Record<string, unknown>, ...keys: string[]): number {
  for (const k of keys) {
    const v = r[k];
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

export function MatchingPage({ projectId }: { projectId: string }) {
  const [capOk, setCapOk] = useState<boolean | null>(null);
  const [uploads, setUploads] = useState<Record<string, unknown>[]>([]);
  const [estimates, setEstimates] = useState<Record<string, unknown>[]>([]);
  const [uploadId, setUploadId] = useState<string>('');
  const [estimateId, setEstimateId] = useState<string>('');
  const [laborRate, setLaborRate] = useState('100');
  const [locationCode, setLocationCode] = useState('DEFAULT');
  const [reviewQueue, setReviewQueue] = useState<Record<string, unknown>[]>([]);
  const [autoMatched, setAutoMatched] = useState<Record<string, unknown>[]>([]);
  const [replaceRowId, setReplaceRowId] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState('');
  const [searchHits, setSearchHits] = useState<Record<string, unknown>[]>([]);
  const [lines, setLines] = useState<Record<string, unknown>[]>([]);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [readiness, setReadiness] = useState<Record<string, unknown> | null>(null);
  const [categoryTotals, setCategoryTotals] = useState<Record<string, unknown>[]>([]);
  const [rollups, setRollups] = useState<Record<string, unknown>[]>([]);
  const [customerLines, setCustomerLines] = useState<Record<string, unknown>[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const loadCapabilities = useCallback(async () => {
    try {
      const c = await api.getV1PipelineCapabilities();
      setCapOk(Boolean(c?.nativeWorkspace && c?.pg));
    } catch {
      setCapOk(false);
    }
  }, []);

  const loadLists = useCallback(async () => {
    if (!projectId || !capOk) return;
    setErr(null);
    try {
      const [u, e] = await Promise.all([
        api.getV1PipelineTakeoffUploads(projectId),
        api.getV1PipelineEstimates(projectId),
      ]);
      setUploads(u);
      setEstimates(e);
      if (!uploadId && u[0]) setUploadId(String((u[0] as { id?: unknown }).id || ''));
      if (!estimateId && e[0]) setEstimateId(String((e[0] as { id?: unknown }).id || ''));
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to load pipeline lists');
    }
  }, [projectId, capOk, uploadId, estimateId]);

  const loadQueue = useCallback(async () => {
    if (!uploadId || !capOk) return;
    setErr(null);
    try {
      const q = await api.getV1PipelineReviewQueue(uploadId);
      setReviewQueue(q.reviewQueue);
      setAutoMatched(q.autoMatched);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to load review queue');
      setReviewQueue([]);
      setAutoMatched([]);
    }
  }, [uploadId, capOk]);

  const loadEstimateViews = useCallback(async () => {
    if (!estimateId || !capOk) return;
    try {
      const [det, sum, read, cat, rol, cust] = await Promise.all([
        api.getV1PipelineEstimateLinesDetailed(estimateId),
        api.getV1PipelineEstimateSummary(estimateId),
        api.getV1PipelineEstimateReadiness(estimateId),
        api.getV1PipelineEstimateCategoryTotals(estimateId),
        api.getV1PipelineEstimateLineRollups(estimateId),
        api.getV1PipelineEstimateLinesCustomer(estimateId),
      ]);
      setLines(det);
      setSummary(sum);
      setReadiness(read);
      setCategoryTotals(cat);
      setRollups(rol);
      setCustomerLines(cust);
    } catch {
      setLines([]);
      setSummary(null);
      setReadiness(null);
      setCategoryTotals([]);
      setRollups([]);
      setCustomerLines([]);
    }
  }, [estimateId, capOk]);

  useEffect(() => {
    void loadCapabilities();
  }, [loadCapabilities]);

  useEffect(() => {
    if (capOk) void loadLists();
  }, [capOk, loadLists]);

  useEffect(() => {
    if (capOk && uploadId) void loadQueue();
  }, [capOk, uploadId, loadQueue]);

  useEffect(() => {
    if (capOk && estimateId) void loadEstimateViews();
  }, [capOk, estimateId, loadEstimateViews]);

  const onProcessMatches = async () => {
    if (!uploadId) return;
    setBusy('process');
    setErr(null);
    try {
      await api.postV1PipelineProcessMatches(uploadId);
      await loadQueue();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'process_takeoff_upload_matches failed');
    } finally {
      setBusy(null);
    }
  };

  const suggestedCatalogId = (row: Record<string, unknown>) =>
    str(row, 'suggested_catalog_item_id', 'catalog_item_id', 'candidate_catalog_item_id');

  const onAccept = async (row: Record<string, unknown>) => {
    const rowId = str(row, 'takeoff_row_id', 'id');
    const cid = suggestedCatalogId(row);
    if (!rowId || !cid) {
      setErr('Row is missing takeoff_row_id or suggested catalog id.');
      return;
    }
    setBusy(`accept:${rowId}`);
    setErr(null);
    try {
      await api.postV1PipelineAcceptMatch(rowId, {
        catalogItemId: cid,
        isReplace: false,
        confidence: num(row, 'final_score', 'match_confidence_score', 'confidence'),
      });
      await loadQueue();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'app_accept_match failed');
    } finally {
      setBusy(null);
    }
  };

  const onReject = async (row: Record<string, unknown>) => {
    const rowId = str(row, 'takeoff_row_id', 'id');
    const cid = suggestedCatalogId(row);
    if (!rowId || !cid) return;
    setBusy(`reject:${rowId}`);
    setErr(null);
    try {
      await api.postV1PipelineRejectMatch(rowId, { catalogItemId: cid, reasonCode: 'review_reject' });
      await loadQueue();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'app_reject_match failed');
    } finally {
      setBusy(null);
    }
  };

  const onClear = async (row: Record<string, unknown>) => {
    const rowId = str(row, 'takeoff_row_id', 'id');
    if (!rowId) return;
    setBusy(`clear:${rowId}`);
    setErr(null);
    try {
      await api.postV1PipelineClearMatch(rowId);
      await loadQueue();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'app_clear_match failed');
    } finally {
      setBusy(null);
    }
  };

  const onConfirmReplace = async (catalogItemId: string) => {
    if (!replaceRowId || !catalogItemId) return;
    setBusy('replace');
    setErr(null);
    try {
      await api.postV1PipelineAcceptMatch(replaceRowId, { catalogItemId, isReplace: true, confidence: 1 });
      setReplaceRowId(null);
      setSearchHits([]);
      setSearchQ('');
      await loadQueue();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'replace match failed');
    } finally {
      setBusy(null);
    }
  };

  const onSearchCatalog = async () => {
    const q = searchQ.trim();
    if (q.length < 2) {
      setSearchHits([]);
      return;
    }
    try {
      const hits = await api.getV1PipelineCatalogSearch(q);
      setSearchHits(hits);
    } catch {
      setSearchHits([]);
    }
  };

  const onBuildEstimate = async () => {
    if (!estimateId || !uploadId) return;
    const lr = Number(laborRate);
    if (!Number.isFinite(lr) || lr <= 0) {
      setErr('Labor rate must be a positive number.');
      return;
    }
    setBusy('build');
    setErr(null);
    try {
      await api.postV1PipelineBuildEstimateFromUpload({
        estimateId,
        takeoffUploadId: uploadId,
        laborRate: lr,
        locationCode,
        overwriteExisting: true,
      });
      await loadEstimateViews();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'build_estimate_from_takeoff_upload failed');
    } finally {
      setBusy(null);
    }
  };

  const uploadLabel = useMemo(() => {
    const u = uploads.find((x) => String((x as { id?: unknown }).id) === uploadId);
    return u ? str(u as Record<string, unknown>, 'file_name', 'filename', 'name') : uploadId;
  }, [uploads, uploadId]);

  if (capOk === false) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50/90 p-4 text-sm text-amber-950">
        <p className="font-semibold">Matching pipeline unavailable</p>
        <p className="mt-1 text-amber-900/90">
          Use Postgres (`DB_DRIVER=pg`) and native workspace (do not set `WORKSPACE_USE_LEGACY_V1=1`). The server exposes RPCs and views under{' '}
          <code className="rounded bg-white/80 px-1">/api/v1/pipeline/*</code>.
        </p>
      </div>
    );
  }

  if (capOk === null) {
    return <div className="text-sm text-slate-500">Checking pipeline…</div>;
  }

  return (
    <div className="space-y-6 text-sm">
      {err ? (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-red-900">
          <span className="font-medium">Error: </span>
          {err}
        </div>
      ) : null}

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Takeoff upload</h2>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-slate-500">Upload</span>
            <select
              className="min-w-[220px] rounded border border-slate-300 px-2 py-1.5"
              value={uploadId}
              onChange={(e) => setUploadId(e.target.value)}
            >
              {uploads.map((u) => (
                <option key={String((u as { id: string }).id)} value={String((u as { id: string }).id)}>
                  {str(u as Record<string, unknown>, 'file_name', 'filename', 'name') || (u as { id: string }).id}{' '}
                  ({str(u as Record<string, unknown>, 'status')})
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="rounded bg-slate-900 px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-white disabled:opacity-50"
            disabled={!uploadId || busy === 'process'}
            onClick={() => void onProcessMatches()}
          >
            {busy === 'process' ? 'Running…' : 'Run DB matchers'}
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Calls <code className="rounded bg-slate-100 px-1">process_takeoff_upload_matches</code> then reloads{' '}
          <code className="rounded bg-slate-100 px-1">v_match_review_queue</code>.
        </p>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900">Review queue</h2>
          <span className="text-xs text-slate-500">{uploadLabel}</span>
        </div>
        {reviewQueue.length === 0 ? (
          <p className="mt-3 text-slate-600">No rows in the review queue yet (or view returned no rows).</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-2">Description</th>
                  <th className="py-2 pr-2">Qty</th>
                  <th className="py-2 pr-2">Unit</th>
                  <th className="py-2 pr-2">Scope</th>
                  <th className="py-2 pr-2">Suggested</th>
                  <th className="py-2 pr-2">Score / band</th>
                  <th className="py-2 pr-2">Detail</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {reviewQueue.map((row, idx) => {
                  const rid = str(row, 'takeoff_row_id', 'id');
                  const rowKey = rid || `row-${idx}`;
                  return (
                    <tr key={rowKey} className="border-b border-slate-100 align-top">
                      <td className="max-w-[220px] py-2 pr-2 font-medium text-slate-800">{str(row, 'raw_description', 'description')}</td>
                      <td className="py-2 pr-2 tabular-nums">{num(row, 'qty', 'quantity')}</td>
                      <td className="py-2 pr-2">{str(row, 'unit', 'takeoff_unit', 'uom')}</td>
                      <td className="py-2 pr-2">{str(row, 'scope_bucket', 'intake_scope_bucket')}</td>
                      <td className="py-2 pr-2 text-slate-700">
                        <div>{str(row, 'suggested_sku', 'sku')}</div>
                        <div className="text-[10px] text-slate-500">
                          {str(row, 'suggested_manufacturer', 'manufacturer')} {str(row, 'suggested_model', 'model', 'model_number')}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {str(row, 'suggested_category', 'category')} / {str(row, 'suggested_subcategory', 'subcategory')}
                        </div>
                      </td>
                      <td className="py-2 pr-2 tabular-nums">
                        {num(row, 'final_score', 'match_confidence_score').toFixed(3)}
                        <div className="text-[10px] uppercase text-slate-500">{str(row, 'match_band')}</div>
                      </td>
                      <td className="max-w-[200px] py-2 pr-2 text-[10px] text-slate-600">{str(row, 'scoring_detail', 'match_reason_codes', 'reason_codes')}</td>
                      <td className="py-2">
                        <div className="flex flex-col gap-1">
                          <button
                            type="button"
                            className="rounded bg-emerald-700 px-2 py-0.5 text-[10px] font-semibold uppercase text-white disabled:opacity-40"
                            disabled={busy != null}
                            onClick={() => void onAccept(row)}
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            className="rounded bg-indigo-700 px-2 py-0.5 text-[10px] font-semibold uppercase text-white disabled:opacity-40"
                            disabled={busy != null}
                            onClick={() => {
                              setReplaceRowId(rid);
                              setSearchQ(str(row, 'raw_description', 'description'));
                            }}
                          >
                            Replace…
                          </button>
                          <button
                            type="button"
                            className="rounded bg-amber-700 px-2 py-0.5 text-[10px] font-semibold uppercase text-white disabled:opacity-40"
                            disabled={busy != null}
                            onClick={() => void onReject(row)}
                          >
                            Reject
                          </button>
                          <button
                            type="button"
                            className="rounded border border-slate-300 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-700 disabled:opacity-40"
                            disabled={busy != null}
                            onClick={() => void onClear(row)}
                          >
                            Clear
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {autoMatched.length > 0 ? (
          <div className="mt-4 rounded border border-slate-100 bg-slate-50/80 p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recently auto-matched</h3>
            <ul className="mt-2 space-y-1 text-xs text-slate-600">
              {autoMatched.slice(0, 12).map((row, i) => (
                <li key={i}>
                  {str(row, 'raw_description', 'description')} → {str(row, 'suggested_sku', 'sku')}{' '}
                  <span className="text-slate-400">({str(row, 'match_band')})</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {replaceRowId ? (
        <section className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-4">
          <h3 className="text-sm font-semibold text-indigo-950">Replace match (row {replaceRowId})</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              className="min-w-[200px] flex-1 rounded border border-indigo-200 px-2 py-1"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="Search catalog…"
            />
            <button type="button" className="rounded bg-indigo-800 px-3 py-1 text-xs text-white" onClick={() => void onSearchCatalog()}>
              Search
            </button>
            <button type="button" className="rounded border border-indigo-300 px-2 py-1 text-xs" onClick={() => setReplaceRowId(null)}>
              Cancel
            </button>
          </div>
          <ul className="mt-2 max-h-48 overflow-auto text-xs">
            {searchHits.map((h) => (
              <li key={String(h.id)} className="flex justify-between gap-2 border-b border-indigo-100 py-1">
                <span>
                  <span className="font-mono text-[10px]">{str(h, 'sku')}</span> {str(h, 'description')}
                </span>
                <button type="button" className="shrink-0 text-indigo-800 underline" onClick={() => void onConfirmReplace(String(h.id))}>
                  Use
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Estimate from takeoff</h2>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-slate-500">Estimate</span>
            <select className="min-w-[200px] rounded border border-slate-300 px-2 py-1.5" value={estimateId} onChange={(e) => setEstimateId(e.target.value)}>
              {estimates.map((e) => (
                <option key={String((e as { id: string }).id)} value={String((e as { id: string }).id)}>
                  {str(e as Record<string, unknown>, 'name', 'title')} ({str(e as Record<string, unknown>, 'estimate_class')})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-slate-500">Labor $/hr</span>
            <input className="w-24 rounded border border-slate-300 px-2 py-1.5 tabular-nums" value={laborRate} onChange={(e) => setLaborRate(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-slate-500">Location code</span>
            <input className="w-28 rounded border border-slate-300 px-2 py-1.5" value={locationCode} onChange={(e) => setLocationCode(e.target.value)} />
          </label>
          <button
            type="button"
            className="rounded bg-slate-900 px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-white disabled:opacity-50"
            disabled={!estimateId || !uploadId || busy === 'build'}
            onClick={() => void onBuildEstimate()}
          >
            {busy === 'build' ? 'Building…' : 'Build lines (DB)'}
          </button>
        </div>
        {readiness ? (
          <pre className="mt-3 max-h-40 overflow-auto rounded bg-slate-50 p-2 text-[10px] text-slate-700">{JSON.stringify(readiness, null, 2)}</pre>
        ) : null}
        {summary ? (
          <pre className="mt-2 max-h-40 overflow-auto rounded bg-slate-50 p-2 text-[10px] text-slate-700">{JSON.stringify(summary, null, 2)}</pre>
        ) : null}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="text-xs font-semibold uppercase text-slate-500">Internal lines (sample)</h3>
            <pre className="mt-1 max-h-56 overflow-auto rounded bg-slate-50 p-2 text-[10px]">{JSON.stringify(lines.slice(0, 8), null, 2)}</pre>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase text-slate-500">Customer schedule (view)</h3>
            <pre className="mt-1 max-h-56 overflow-auto rounded bg-slate-50 p-2 text-[10px]">{JSON.stringify(customerLines.slice(0, 8), null, 2)}</pre>
          </div>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="text-xs font-semibold uppercase text-slate-500">Category totals</h3>
            <pre className="mt-1 max-h-40 overflow-auto rounded bg-slate-50 p-2 text-[10px]">{JSON.stringify(categoryTotals, null, 2)}</pre>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase text-slate-500">Line rollups</h3>
            <pre className="mt-1 max-h-40 overflow-auto rounded bg-slate-50 p-2 text-[10px]">{JSON.stringify(rollups, null, 2)}</pre>
          </div>
        </div>
      </section>
    </div>
  );
}
