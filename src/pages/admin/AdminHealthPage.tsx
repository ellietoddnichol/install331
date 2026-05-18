import React, { useEffect, useMemo, useState } from 'react';
import { Activity, CheckCircle2, RefreshCw } from 'lucide-react';
import { api } from '../../services/api';
import { FieldOpsPageHeader } from '../../components/fieldops/FieldOpsPrimitives';
import { StatusBadge } from '../../components/ui/mvp/StatusBadge';
import { getErrorMessage } from '../../shared/utils/errorMessage';

function workbookTitle(key: string): string {
  if (key === 'projectSetupEstimateProposal') return 'Project Setup';
  if (key === 'vendorIntakeBackend') return 'Vendor Intake';
  if (key === 'catalogLaborBackend') return 'Catalog Labor';
  if (/install/i.test(key)) return 'Install Intelligence';
  return key;
}

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

  if (integration?.googleSheets) {
    return {
      label: 'Sheets backend active',
      tone: 'ready' as const,
      detail: health.googleAuthError
        ? `Integration reports credentials; live workbook probe failed: ${health.googleAuthError}`
        : undefined,
    };
  }

  const workbooksConfigured = (health.workbooks || []).some(
    (wb) => wb.spreadsheetIdMasked && wb.spreadsheetIdMasked !== '(unset)',
  );

  if (workbooksConfigured || (health.missingEnvVars?.length ?? 0) === 0) {
    return {
      label: 'Sheets backend active',
      tone: 'ready' as const,
      detail: health.googleAuthError
        ? `Spreadsheet IDs are set. Add Google service account credentials to run live workbook checks: ${health.googleAuthError}`
        : 'Spreadsheet IDs are set. Configure Google service account credentials to run live workbook checks.',
    };
  }

  return {
    label: 'Credentials needed for workbook checks',
    tone: 'review' as const,
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

  const sheetsActive = Boolean(health?.sheetsBackendActive);

  return (
    <div className="ui-page space-y-6">
      <FieldOpsPageHeader
        kicker="Administrator"
        title="Health & Workbooks"
        subtitle="Operations status board for Google Sheets workbooks, credentials, and data freshness."
        actions={
          <button type="button" onClick={() => void load()} className="ui-fo-btn-primary gap-2" disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Recheck all
          </button>
        }
      />

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
      ) : null}

      <section className={`ui-fo-card p-5 ${sheetsActive ? 'border-emerald-200 bg-emerald-50/40' : ''}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 gap-3">
            {sheetsActive ? (
              <CheckCircle2 className="mt-0.5 h-8 w-8 shrink-0 text-emerald-600" aria-hidden />
            ) : (
              <Activity className="mt-0.5 h-8 w-8 shrink-0 text-slate-400" aria-hidden />
            )}
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                {sheetsActive ? 'Sheets backend active' : 'Sheets backend inactive'}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {sheetsActive
                  ? 'Workbook routing is configured for the sheets data backend.'
                  : health?.message || 'Set DATA_BACKEND=sheets to enable workbook health checks.'}
              </p>
              {sheetsStatus.detail ? <p className="mt-2 text-xs text-slate-600">{sheetsStatus.detail}</p> : null}
            </div>
          </div>
          <StatusBadge label={sheetsStatus.label} tone={sheetsStatus.tone} />
        </div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-slate-200/80 bg-white px-3 py-2">
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Connection</dt>
            <dd className="mt-1 font-medium text-slate-900">{sheetsActive ? 'Connected' : '—'}</dd>
          </div>
          <div className="rounded-lg border border-slate-200/80 bg-white px-3 py-2">
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Authentication</dt>
            <dd className="mt-1 font-medium text-slate-900">
              {health?.googleAuthConfigured || integration?.googleSheets ? 'Authorized' : 'Needs credentials'}
            </dd>
          </div>
          <div className="rounded-lg border border-slate-200/80 bg-white px-3 py-2">
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Sheets access</dt>
            <dd className="mt-1 font-medium text-slate-900">{sheetsActive ? 'Read / write routing' : '—'}</dd>
          </div>
          <div className="rounded-lg border border-slate-200/80 bg-white px-3 py-2">
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Data backend</dt>
            <dd className="mt-1 font-mono text-xs font-medium text-slate-900">{health?.dataBackend ?? '—'}</dd>
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
        <div className="grid gap-6 xl:grid-cols-[1fr_minmax(16rem,20rem)]">
        <section className="space-y-4">
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
          <div className="grid gap-4 sm:grid-cols-2">
            {health.workbooks.map((wb) => (
              <article key={wb.key} className="ui-fo-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">{workbookTitle(wb.key)}</h3>
                  {wb.ok ? <StatusBadge label="Active" tone="ready" /> : <StatusBadge label="Warning" tone="review" />}
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
                <button type="button" className="ui-fo-btn-secondary mt-3 h-8 w-full text-xs" onClick={() => void load()}>
                  Recheck
                </button>
              </article>
            ))}
          </div>
          <section className="ui-fo-card p-5">
            <h2 className="text-sm font-semibold text-slate-900">Guidance &amp; common checks</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {['Credential check', 'Tab structure check', 'Permission check', 'Data freshness check'].map((label) => (
                <li key={label} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                  <span>{label}</span>
                  <button type="button" className="ui-fo-btn-secondary h-8 px-3 text-xs" onClick={() => void load()}>
                    Check
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </section>
        <aside className="space-y-4">
          <section className={`ui-fo-card p-4 ${health.ok ? 'border-emerald-200 bg-emerald-50/30' : 'border-amber-200 bg-amber-50/30'}`}>
            <h2 className="text-sm font-semibold text-slate-900">System health</h2>
            <p className="mt-2 text-sm text-slate-700">
              {health.ok ? 'All critical systems are operating normally.' : 'One or more workbook checks need attention.'}
            </p>
            <div className="mt-3">
              {health.ok ? <StatusBadge label="Healthy" tone="ready" /> : <StatusBadge label="Needs review" tone="review" />}
            </div>
          </section>
          <section className="ui-fo-card p-4 text-sm text-slate-600">
            <h2 className="font-semibold text-slate-900">What is this?</h2>
            <p className="mt-2 leading-relaxed">
              Validates Div 10 Google Sheets workbooks for project setup, vendor intake, and catalog labor routing.
            </p>
          </section>
          <section className="ui-fo-card p-4 text-sm text-slate-600">
            <h2 className="font-semibold text-slate-900">Need help?</h2>
            <p className="mt-2 leading-relaxed">See docs/div10-brain-env.md for workbook IDs and service account setup.</p>
          </section>
        </aside>
        </div>
      ) : null}
    </div>
  );
}
