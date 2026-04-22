import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { CatalogSyncStatusRecord, IntakeCatalogAutoApplyMode, SettingsRecord } from '../shared/types/estimator';
import { ensureProposalDefaults } from '../shared/utils/proposalDefaults';
import { getErrorMessage } from '../shared/utils/errorMessage';

export function Settings() {
  const [settings, setSettings] = useState<SettingsRecord | null>(null);
  const [syncStatus, setSyncStatus] = useState<CatalogSyncStatusRecord | null>(null);
  const [syncRuns, setSyncRuns] = useState<Array<{
    id: string;
    attemptedAt: string;
    status: 'success' | 'failed';
    message: string | null;
    itemsSynced: number;
    modifiersSynced: number;
    bundlesSynced: number;
    bundleItemsSynced: number;
    warnings: string[];
  }>>([]);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [backfillingRegistry, setBackfillingRegistry] = useState(false);

  useEffect(() => {
    void Promise.all([api.getV1Settings(), api.getCatalogSyncStatus(), api.getCatalogSyncRuns(8)]).then(([data, status, runs]) => {
      const next = ensureProposalDefaults({ ...data });
      if (!next.companyName) next.companyName = 'Brighten Builders, LLC';
      if (!next.companyAddress) next.companyAddress = '512 S. 70th Street, Kansas City, KS 66611';
      if (!next.logoUrl) next.logoUrl = 'https://static.wixstatic.com/media/18d091_be2178f095264ea0a1d2c8d78520b2ce%7Emv2.png/v1/fit/w_2500,h_1330,al_c/18d091_be2178f095264ea0a1d2c8d78520b2ce%7Emv2.png';
      setSettings(next);
      setSyncStatus(status);
      setSyncRuns(runs);
    });
  }, []);

  async function saveSettings() {
    if (!settings) return;
    setSaving(true);
    try {
      const saved = await api.updateV1Settings(settings);
      setSettings(ensureProposalDefaults(saved));
      alert('Settings saved.');
    } catch (error: unknown) {
      alert(`Failed to save settings: ${getErrorMessage(error, 'Unknown error')}`);
    } finally {
      setSaving(false);
    }
  }

  async function syncGoogleSheetsCatalog() {
    setSyncing(true);
    try {
      const result = await api.syncV1Catalog();
      const [refreshedStatus, refreshedRuns] = await Promise.all([api.getCatalogSyncStatus(), api.getCatalogSyncRuns(8)]);
      setSyncStatus(refreshedStatus);
      setSyncRuns(refreshedRuns);
      alert(`Google Sheets sync complete: ${result.itemsSynced} items, ${result.modifiersSynced} modifiers, ${result.bundlesSynced} bundles.`);
    } catch (error: unknown) {
      alert(`Google Sheets sync failed: ${getErrorMessage(error, 'Unknown error')}`);
      try {
        const [refreshedStatus, refreshedRuns] = await Promise.all([api.getCatalogSyncStatus(), api.getCatalogSyncRuns(8)]);
        setSyncStatus(refreshedStatus);
        setSyncRuns(refreshedRuns);
      } catch (_e) {
        // Best effort status refresh.
      }
    } finally {
      setSyncing(false);
    }
  }

  async function backfillTakeoffRegistry() {
    setBackfillingRegistry(true);
    try {
      const result = await api.backfillV1TakeoffRegistry();
      const [refreshedStatus, refreshedRuns] = await Promise.all([api.getCatalogSyncStatus(), api.getCatalogSyncRuns(8)]);
      setSyncStatus(refreshedStatus);
      setSyncRuns(refreshedRuns);
      alert(`Takeoff registry backfill complete: ${result.itemsBackfilled} items upserted to ${result.tabName}.`);
    } catch (error: unknown) {
      alert(`Takeoff registry backfill failed: ${getErrorMessage(error, 'Unknown error')}`);
      try {
        const [refreshedStatus, refreshedRuns] = await Promise.all([api.getCatalogSyncStatus(), api.getCatalogSyncRuns(8)]);
        setSyncStatus(refreshedStatus);
        setSyncRuns(refreshedRuns);
      } catch (_e) {
        // Best effort status refresh.
      }
    } finally {
      setBackfillingRegistry(false);
    }
  }

  function formatDate(value: string | null) {
    if (!value) return 'Never';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Never';
    return date.toLocaleString();
  }

  function onLogoFileSelected(file: File | undefined) {
    if (!file || !settings) return;
    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === 'string' ? reader.result : '';
      setSettings({ ...settings, logoUrl: value });
    };
    reader.readAsDataURL(file);
  }

  if (!settings) return <div className="flex min-h-[40vh] items-center justify-center p-8 text-sm text-slate-500">Loading settings…</div>;

  return (
    <div className="ui-page-narrow space-y-5">
      <div className="ui-panel flex flex-wrap items-end justify-between gap-4 px-4 py-3.5">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="ui-status-live">Live</span>
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
              Brighten Builders <span className="mx-1 text-slate-300">/</span> System Configuration
            </span>
          </div>
          <h1 className="mt-1.5 text-[24px] font-semibold leading-tight tracking-tight text-slate-950 md:text-[28px]">Settings</h1>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.06em] text-slate-500">
            Company Profile · Proposal Defaults · Catalog Sync Administration
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void backfillTakeoffRegistry()} disabled={backfillingRegistry || syncing} className="ui-btn-secondary disabled:opacity-50">
            {backfillingRegistry ? 'Backfilling...' : 'Backfill Takeoff Registry'}
          </button>
          <button type="button" onClick={() => void syncGoogleSheetsCatalog()} disabled={syncing} className="ui-btn-secondary disabled:opacity-50">
            {syncing ? 'Syncing...' : 'Sync Google Sheets'}
          </button>
          <button type="button" onClick={() => void saveSettings()} disabled={saving} className="ui-btn-cta disabled:opacity-60">
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>

      <section className="ui-accent-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="ui-mono-kicker">Module 01 / Catalog Sync Status</p>
            <h2 className="mt-1 text-sm font-semibold text-slate-900">Sync health</h2>
          </div>
          <span className={`ui-mono-chip ${syncStatus?.status === 'success' ? 'ui-mono-chip--ok' : syncStatus?.status === 'failed' ? 'ui-mono-chip--danger' : 'ui-mono-chip--mute'}`}>
            {syncStatus?.status || 'never'}
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
          <div className="ui-surface-soft p-2">
            <p className="ui-mono-kicker">Last Attempt</p>
            <p className="mt-1 font-mono text-[12px] font-semibold tabular-nums text-slate-900">{formatDate(syncStatus?.lastAttemptAt || null)}</p>
          </div>
          <div className="ui-surface-soft p-2">
            <p className="ui-mono-kicker">Last Success</p>
            <p className="mt-1 font-mono text-[12px] font-semibold tabular-nums text-slate-900">{formatDate(syncStatus?.lastSuccessAt || null)}</p>
          </div>
          <div className="ui-surface-soft p-2">
            <p className="ui-mono-kicker">Synced Counts</p>
            <p className="mt-1 font-mono text-[12px] font-semibold tabular-nums text-slate-900">{syncStatus?.itemsSynced || 0}I · {syncStatus?.modifiersSynced || 0}M · {syncStatus?.bundlesSynced || 0}B</p>
          </div>
          <div className="ui-surface-soft p-2">
            <p className="ui-mono-kicker">Bundle Items</p>
            <p className="mt-1 font-mono text-[12px] font-semibold tabular-nums text-slate-900">{syncStatus?.bundleItemsSynced || 0}</p>
          </div>
        </div>
        {!!syncStatus?.message && (
          <div className="ui-panel-muted p-3 text-xs text-[var(--text)]">{syncStatus.message}</div>
        )}
        <p className="text-xs text-slate-500">
          Use <span className="font-medium text-slate-700">Backfill Takeoff Registry</span> to mirror the app-side takeoff model registry into the Google Sheets ITEMS tab.
        </p>
        {!!syncStatus?.warnings?.length && (
          <div className="ui-callout-warn">
            <p className="ui-label mb-1 !normal-case tracking-normal text-[var(--warn)]">Warnings</p>
            <ul className="mt-1 list-disc pl-4 text-xs">
              {syncStatus.warnings.slice(0, 6).map((warning, idx) => (
                <li key={`${warning}-${idx}`}>{warning}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="ui-accent-card p-4 space-y-3">
        <div>
          <p className="ui-mono-kicker">Module 02 / Recent Sync Runs</p>
          <h2 className="mt-1 text-sm font-semibold text-slate-900">Audit trail</h2>
        </div>
        {syncRuns.length === 0 ? (
          <p className="text-xs text-slate-500">No sync runs yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
                <tr>
                  <th className="ui-table-th">Attempted</th>
                  <th className="ui-table-th">Status</th>
                  <th className="ui-table-th">Counts</th>
                  <th className="ui-table-th">Message</th>
                </tr>
              </thead>
              <tbody>
                {syncRuns.map((run) => (
                  <tr key={run.id} className={`border-b border-slate-100 border-l-[3px] align-top ${run.status === 'success' ? 'border-l-emerald-500' : 'border-l-rose-500'}`}>
                    <td className="py-2 pr-2 font-mono text-[11px] tabular-nums text-slate-700">{formatDate(run.attemptedAt)}</td>
                    <td className="py-2 pr-2">
                      <span className={`ui-mono-chip ${run.status === 'success' ? 'ui-mono-chip--ok' : 'ui-mono-chip--danger'}`}>
                        {run.status}
                      </span>
                    </td>
                    <td className="py-2 pr-2 text-slate-700">
                      {run.itemsSynced}I / {run.modifiersSynced}M / {run.bundlesSynced}B / {run.bundleItemsSynced}BI
                    </td>
                    <td className="py-2 text-slate-700">
                      {run.message || 'No message'}
                      {run.warnings.length > 0 && (
                        <span className="text-[var(--warn)]"> ({run.warnings.length} warning{run.warnings.length === 1 ? '' : 's'})</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <section className="ui-accent-card p-4 space-y-3">
          <div>
            <p className="ui-mono-kicker">Module 03 / Company Profile</p>
            <h2 className="mt-1 text-sm font-semibold text-slate-900">Brand identity</h2>
          </div>
          <label className="text-xs text-slate-600 block">Company Name
            <input className="ui-input mt-1" value={settings.companyName} onChange={(e) => setSettings({ ...settings, companyName: e.target.value })} />
          </label>
          <label className="text-xs text-slate-600 block">Address
            <input className="ui-input mt-1" value={settings.companyAddress} onChange={(e) => setSettings({ ...settings, companyAddress: e.target.value })} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-slate-600 block">Phone
              <input className="ui-input mt-1" value={settings.companyPhone} onChange={(e) => setSettings({ ...settings, companyPhone: e.target.value })} />
            </label>
            <label className="text-xs text-slate-600 block">Email
              <input className="ui-input mt-1" value={settings.companyEmail} onChange={(e) => setSettings({ ...settings, companyEmail: e.target.value })} />
            </label>
          </div>
          <label className="text-xs text-slate-600 block">Logo URL
            <input className="ui-input mt-1" value={settings.logoUrl} onChange={(e) => setSettings({ ...settings, logoUrl: e.target.value })} />
          </label>
          <label className="text-xs text-slate-600 block">Upload Logo File
            <input
              type="file"
              accept="image/*"
              className="mt-1 block w-full text-sm"
              onChange={(e) => onLogoFileSelected(e.target.files?.[0])}
            />
          </label>
        </section>

        <section className="ui-accent-card p-4 space-y-4">
          <div>
            <p className="ui-mono-kicker">Module 04 / Estimate Defaults</p>
            <h2 className="mt-1 text-sm font-semibold text-slate-900">Pricing defaults</h2>
            <p className="mt-1 text-xs text-slate-500">
              Defaults for new projects. The subcontractor billing rate ($/hr) is used when lines have install minutes but no labor dollars (typical for material-only takeoffs). Default is $100/hr; job conditions and line modifiers change labor minutes or labor cost only — not material.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-slate-600 block">Subcontractor rate ($/hr)
              <input type="number" className="ui-input mt-1" value={settings.defaultLaborRatePerHour} onChange={(e) => setSettings({ ...settings, defaultLaborRatePerHour: Number(e.target.value) || 0 })} />
            </label>
            <label className="text-xs text-slate-600 block">Default Tax %
              <input type="number" className="ui-input mt-1" value={settings.defaultTaxPercent} onChange={(e) => setSettings({ ...settings, defaultTaxPercent: Number(e.target.value) || 0 })} />
            </label>
            <label className="text-xs text-slate-600 block">Default Overhead %
              <input type="number" className="ui-input mt-1" value={settings.defaultOverheadPercent} onChange={(e) => setSettings({ ...settings, defaultOverheadPercent: Number(e.target.value) || 0 })} />
            </label>
            <label className="text-xs text-slate-600 block">Default Profit %
              <input type="number" className="ui-input mt-1" value={settings.defaultProfitPercent} onChange={(e) => setSettings({ ...settings, defaultProfitPercent: Number(e.target.value) || 0 })} />
            </label>
            <label className="text-xs text-slate-600 block">Default labor burden % (sub)
              <input type="number" className="ui-input mt-1" value={settings.defaultLaborBurdenPercent} onChange={(e) => setSettings({ ...settings, defaultLaborBurdenPercent: Number(e.target.value) || 0 })} />
              <span className="mt-1 block text-[11px] text-slate-500">Use 0 when your billing $/hr already includes burden.</span>
            </label>
            <label className="text-xs text-slate-600 block">Default labor overhead % (sub)
              <input type="number" className="ui-input mt-1" value={settings.defaultLaborOverheadPercent} onChange={(e) => setSettings({ ...settings, defaultLaborOverheadPercent: Number(e.target.value) || 0 })} />
              <span className="mt-1 block text-[11px] text-slate-500">Sell-side markup on loaded labor after burden (office default is often 5%).</span>
            </label>
          </div>

          <div className="border-t border-slate-200 pt-4 space-y-3">
            <div>
              <p className="ui-mono-kicker">Module 05 / Proposal Defaults</p>
              <h2 className="mt-1 text-sm font-semibold text-slate-900">Document copy</h2>
              <p className="mt-1 text-xs text-slate-500">These fields control the default proposal copy used in the proposal workspace and exported proposal documents.</p>
            </div>
            <label className="text-xs text-slate-600 block">Proposal Intro
              <textarea rows={4} className="ui-textarea mt-1" value={settings.proposalIntro} onChange={(e) => setSettings({ ...settings, proposalIntro: e.target.value })} />
            </label>
            <label className="text-xs text-slate-600 block">Proposal Terms
              <textarea rows={4} className="ui-textarea mt-1" value={settings.proposalTerms} onChange={(e) => setSettings({ ...settings, proposalTerms: e.target.value })} />
            </label>
            <label className="text-xs text-slate-600 block">Proposal Exclusions
              <textarea rows={3} className="ui-textarea mt-1" value={settings.proposalExclusions} onChange={(e) => setSettings({ ...settings, proposalExclusions: e.target.value })} />
            </label>
            <label className="text-xs text-slate-600 block">Proposal Clarifications
              <textarea rows={3} className="ui-textarea mt-1" value={settings.proposalClarifications} onChange={(e) => setSettings({ ...settings, proposalClarifications: e.target.value })} />
            </label>
            <label className="text-xs text-slate-600 block">Signature Label
              <input className="ui-input mt-1" value={settings.proposalAcceptanceLabel} onChange={(e) => setSettings({ ...settings, proposalAcceptanceLabel: e.target.value })} />
            </label>
          </div>
        </section>
      </div>

      <section className="ui-accent-card--amber mx-auto max-w-[1600px] space-y-3 p-4">
        <div>
          <p className="ui-mono-kicker">Module 06 / Intake Automation</p>
          <h2 className="mt-1 text-sm font-semibold text-slate-900">Catalog auto-link policy</h2>
        </div>
        <p className="text-xs text-slate-500">
          Company-wide policy for catalog matching during file intake. Tier A lines are strong matches with compatible units; thresholds apply on the server when building review rows and estimate drafts.
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="text-xs text-slate-600 block">
            Auto-apply mode
            <select
              className="ui-input mt-1"
              value={settings.intakeCatalogAutoApplyMode}
              onChange={(e) =>
                setSettings({ ...settings, intakeCatalogAutoApplyMode: e.target.value as IntakeCatalogAutoApplyMode })
              }
            >
              <option value="off">Off — manual review only</option>
              <option value="preselect_only">Pre-accept Tier A in estimate draft (no auto-link)</option>
              <option value="auto_link_tier_a">Auto-link Tier A lines to catalog</option>
            </select>
          </label>
          <label className="text-xs text-slate-600 block">
            Tier A minimum match score (0.5–0.99)
            <input
              type="number"
              step={0.01}
              min={0.5}
              max={0.99}
              className="ui-input mt-1"
              value={settings.intakeCatalogTierAMinScore}
              onChange={(e) => setSettings({ ...settings, intakeCatalogTierAMinScore: Number(e.target.value) || 0.82 })}
            />
          </label>
        </div>
      </section>
    </div>
  );
}
