import React, { useEffect, useMemo, useState } from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import { api } from '../../services/api';
import { StatusBadge } from '../../components/ui/mvp/StatusBadge';
import { getErrorMessage } from '../../shared/utils/errorMessage';

type Div10Health = Awaited<ReturnType<typeof api.getAdminDiv10SheetsHealth>>;
type IntegrationSnap = Awaited<ReturnType<typeof api.getV1IntegrationHealth>>;

function resolveGoogleSheetsStatus(integration: IntegrationSnap | null, health: Div10Health | null, healthLoading: boolean) {
  if (!health) {
    if (healthLoading) return { label: 'Checking…', tone: 'neutral' as const };
    if (integration?.googleSheets) return { label: 'Credentials configured', tone: 'ready' as const };
    return { label: '—', tone: 'neutral' as const };
  }

  if (!health.sheetsBackendActive) {
    return {
      label: 'Sheets backend not active',
      tone: 'neutral' as const,
      detail: health.message,
    };
  }

  if (health.googleAuthConfigured) {
    return {
      label: health.workbooks.length ? 'Workbook checks available' : 'Sheets backend active',
      tone: 'ready' as const,
    };
  }

  return {
    label: 'Not configured',
    tone: 'neutral' as const,
    detail: health.googleAuthError,
  };
}

export function AdminHealthPage() {
  const [health, setHealth] = useState<Div10Health | null>(null);
  const [integration, setIntegration] = useState<IntegrationSnap | null>(null);
  const [syncStatus, setSyncStatus] = useState<Awaited<ReturnType<typeof api.getCatalogSyncStatus>> | null>(null);
  const [postCutover, setPostCutover] = useState<Awaited<ReturnType<typeof api.getV1CatalogPostCutoverHealth>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [h, ih, sync, cutover] = await Promise.all([
        api.getAdminDiv10SheetsHealth(),
        api.getV1IntegrationHealth().catch(() => null),
        api.getCatalogSyncStatus().catch(() => null),
        api.getV1CatalogPostCutoverHealth().catch(() => null),
      ]);
      setHealth(h);
      setIntegration(ih);
      setSyncStatus(sync);
      setPostCutover(cutover);
    } catch (e) {
      setError(getErrorMessage(e, 'Could not load workbook health.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const sheetsStatus = useMemo(
    () => resolveGoogleSheetsStatus(integration, health, loading && !health),
    [integration, health, loading],
  );

  return (
    <div className="ui-page space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Administrator</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Health & workbooks</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Backend workbook status, Google Sheets connection, and data backend mode. This detail is not shown on everyday estimating screens.
          </p>
        </div>
        <button type="button" onClick={() => void load()} className="ui-btn-secondary gap-2" disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Connection summary</h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-slate-500">DATA_BACKEND</dt>
            <dd className="font-mono text-xs font-medium text-slate-900">{health?.dataBackend ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Google Sheets</dt>
            <dd className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge label={sheetsStatus.label} tone={sheetsStatus.tone} />
                {integration && !integration.googleSheets && health?.googleAuthConfigured ? (
                  <span className="text-[11px] text-slate-500">(service account not detected via standard env names)</span>
                ) : null}
              </div>
              {sheetsStatus.detail ? <p className="text-xs text-slate-600">{sheetsStatus.detail}</p> : null}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Catalog items source</dt>
            <dd className="font-mono text-xs text-slate-800">{integration?.catalogItemsReadTable ?? '—'}</dd>
          </div>
        </dl>
      </section>

      {syncStatus || postCutover ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Catalog sync &amp; inventory</h2>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {syncStatus ? (
              <>
                <div>
                  <dt className="text-slate-500">Last catalog run</dt>
                  <dd className="font-medium text-slate-900">
                    {syncStatus.lastSuccessAt
                      ? `Success · ${new Date(syncStatus.lastSuccessAt).toLocaleString()}`
                      : syncStatus.lastAttemptAt
                        ? `Attempt · ${new Date(syncStatus.lastAttemptAt).toLocaleString()}`
                        : 'No runs recorded'}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Sync status</dt>
                  <dd className="capitalize text-slate-900">{syncStatus.status}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Last row counts</dt>
                  <dd className="font-mono text-[11px] text-slate-800">
                    items {syncStatus.itemsSynced} · modifiers {syncStatus.modifiersSynced}
                    {syncStatus.bundlesSynced || syncStatus.bundleItemsSynced
                      ? ` · bundles ${syncStatus.bundlesSynced}/${syncStatus.bundleItemsSynced}`
                      : ''}
                  </dd>
                </div>
              </>
            ) : null}
            {postCutover ? (
              <div className="sm:col-span-2 lg:col-span-3">
                <dt className="text-slate-500">Database inventory (forward-facing)</dt>
                <dd className="mt-1 text-slate-800">
                  <span className="font-medium">{postCutover.inventory.active}</span> active ·{' '}
                  <span className="font-medium">{postCutover.inventory.inactive}</span> inactive ·{' '}
                  <span className="font-medium">{postCutover.inventory.total}</span> total
                  {postCutover.inventory.inactive > 0 && postCutover.inventory.active === 0 ? (
                    <span className="ml-2 text-amber-800"> — all catalog rows are inactive</span>
                  ) : null}
                </dd>
              </div>
            ) : null}
          </dl>
          {syncStatus?.warnings?.length ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <p className="text-xs font-semibold text-amber-950">Sync / preflight warnings</p>
              <ul className="mt-2 max-h-40 list-disc space-y-1 overflow-y-auto pl-4 text-xs text-amber-950">
                {syncStatus.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {postCutover?.validationNotes?.length ? (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs font-semibold text-slate-800">Validation notes</p>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-700">
                {postCutover.validationNotes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {health ? (
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Activity className="h-4 w-4" />
            <span className="inline-flex items-center gap-2">
              Sheets backend {health.sheetsBackendActive ? 'active' : 'inactive'} · overall{' '}
              {health.ok ? <StatusBadge label="OK" tone="ready" /> : <StatusBadge label="Issues" tone="review" />}
            </span>
          </div>
          {health.missingEnvVars?.length ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              Missing env: {health.missingEnvVars.join(', ')}
            </div>
          ) : null}
          {health.errors?.length ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
              <p className="font-medium">Errors</p>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                {health.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="grid gap-4 lg:grid-cols-3">
            {health.workbooks.map((wb) => (
              <article key={wb.key} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">{wb.key}</h3>
                  {wb.ok ? <StatusBadge label="OK" tone="ready" /> : <StatusBadge label="Check" tone="review" />}
                </div>
                <p className="mt-1 font-mono text-[11px] text-slate-500">{wb.spreadsheetIdMasked}</p>
                {wb.error ? <p className="mt-2 text-xs text-rose-700">{wb.error}</p> : null}
                {wb.missingTabs?.length ? (
                  <p className="mt-2 text-xs text-amber-800">Missing tabs: {wb.missingTabs.join(', ')}</p>
                ) : null}
                <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto text-xs">
                  {wb.tabs.map((t) => (
                    <li key={t.tabName} className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-1">
                      <span className="font-medium text-slate-700">{t.tabName}</span>
                      {t.ok ? (
                        <StatusBadge label="OK" tone="ready" />
                      ) : (
                        <span className="text-amber-800" title={t.missingHeaders.join(', ')}>
                          {t.missingHeaders.length} header(s)
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
