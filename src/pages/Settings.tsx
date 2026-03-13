import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { CatalogSyncStatusRecord, SettingsRecord } from '../shared/types/estimator';
import { ensureProposalDefaults } from '../shared/utils/proposalDefaults';

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
      setSettings(saved);
      alert('Settings saved.');
    } catch (error: any) {
      alert(`Failed to save settings: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function syncSheets() {
    setSyncing(true);
    try {
      const result = await api.syncV1Catalog();
      const [refreshedStatus, refreshedRuns] = await Promise.all([api.getCatalogSyncStatus(), api.getCatalogSyncRuns(8)]);
      setSyncStatus(refreshedStatus);
      setSyncRuns(refreshedRuns);
      alert(`Google Sheets sync complete: ${result.itemsSynced} items, ${result.modifiersSynced} modifiers, ${result.bundlesSynced} bundles.`);
    } catch (error: any) {
      alert(`Google Sheets sync failed: ${error.message}`);
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

  if (!settings) return <div className="p-6 text-sm text-slate-500">Loading settings...</div>;

  return (
    <div className="ui-page-narrow space-y-4">
      <div className="ui-surface p-4 md:p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="ui-label">System Configuration</p>
          <h1 className="text-2xl font-semibold mt-1">Settings</h1>
          <p className="ui-subtitle mt-1">Company profile, proposal defaults, and catalog sync administration.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => void syncSheets()} disabled={syncing} className="ui-btn-secondary disabled:opacity-50">
            {syncing ? 'Syncing...' : 'Sync Google Sheets'}
          </button>
          <button onClick={() => void saveSettings()} disabled={saving} className="ui-btn-primary disabled:opacity-60">
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>

      <section className="ui-surface p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="ui-label">Catalog Sync Status</h2>
          <span className="ui-chip border-slate-200 bg-slate-50 text-slate-600">
            Status: {syncStatus?.status || 'never'}
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2 text-xs text-slate-600">
          <div className="ui-surface-soft p-2">
            <p className="text-slate-500">Last Attempt</p>
            <p className="font-medium text-slate-800">{formatDate(syncStatus?.lastAttemptAt || null)}</p>
          </div>
          <div className="ui-surface-soft p-2">
            <p className="text-slate-500">Last Success</p>
            <p className="font-medium text-slate-800">{formatDate(syncStatus?.lastSuccessAt || null)}</p>
          </div>
          <div className="ui-surface-soft p-2">
            <p className="text-slate-500">Synced Counts</p>
            <p className="font-medium text-slate-800">{syncStatus?.itemsSynced || 0} items · {syncStatus?.modifiersSynced || 0} modifiers · {syncStatus?.bundlesSynced || 0} bundles</p>
          </div>
          <div className="ui-surface-soft p-2">
            <p className="text-slate-500">Bundle Items</p>
            <p className="font-medium text-slate-800">{syncStatus?.bundleItemsSynced || 0} linked items</p>
          </div>
        </div>
        {!!syncStatus?.message && (
          <p className="text-xs text-slate-600 border border-slate-200 rounded p-2 bg-slate-50">{syncStatus.message}</p>
        )}
        {!!syncStatus?.warnings?.length && (
          <div className="border border-amber-200 bg-amber-50/40 rounded p-2">
            <p className="text-xs font-medium text-amber-800 mb-1">Warnings</p>
            <ul className="text-xs text-amber-900 list-disc pl-4">
              {syncStatus.warnings.slice(0, 6).map((warning, idx) => (
                <li key={`${warning}-${idx}`}>{warning}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="ui-surface p-4 space-y-3">
        <h2 className="ui-label">Recent Sync Runs</h2>
        {syncRuns.length === 0 ? (
          <p className="text-xs text-slate-500">No sync runs yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="text-left py-2 pr-2">Attempted</th>
                  <th className="text-left py-2 pr-2">Status</th>
                  <th className="text-left py-2 pr-2">Counts</th>
                  <th className="text-left py-2">Message</th>
                </tr>
              </thead>
              <tbody>
                {syncRuns.map((run) => (
                  <tr key={run.id} className="border-b border-slate-100 align-top">
                    <td className="py-2 pr-2 text-slate-700">{formatDate(run.attemptedAt)}</td>
                    <td className="py-2 pr-2">
                      <span className={`px-2 py-0.5 rounded border ${run.status === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
                        {run.status}
                      </span>
                    </td>
                    <td className="py-2 pr-2 text-slate-700">
                      {run.itemsSynced}I / {run.modifiersSynced}M / {run.bundlesSynced}B / {run.bundleItemsSynced}BI
                    </td>
                    <td className="py-2 text-slate-700">
                      {run.message || 'No message'}
                      {run.warnings.length > 0 && (
                        <span className="text-amber-700"> ({run.warnings.length} warning{run.warnings.length === 1 ? '' : 's'})</span>
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
        <section className="ui-surface p-4 space-y-3">
          <h2 className="ui-label">Company Profile</h2>
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

        <section className="ui-surface p-4 space-y-3">
          <h2 className="ui-label">Estimate Defaults</h2>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-slate-600 block">Default Tax %
              <input type="number" className="ui-input mt-1" value={settings.defaultTaxPercent} onChange={(e) => setSettings({ ...settings, defaultTaxPercent: Number(e.target.value) || 0 })} />
            </label>
            <label className="text-xs text-slate-600 block">Default Overhead %
              <input type="number" className="ui-input mt-1" value={settings.defaultOverheadPercent} onChange={(e) => setSettings({ ...settings, defaultOverheadPercent: Number(e.target.value) || 0 })} />
            </label>
            <label className="text-xs text-slate-600 block">Default Profit %
              <input type="number" className="ui-input mt-1" value={settings.defaultProfitPercent} onChange={(e) => setSettings({ ...settings, defaultProfitPercent: Number(e.target.value) || 0 })} />
            </label>
            <label className="text-xs text-slate-600 block">Default Labor Burden %
              <input type="number" className="ui-input mt-1" value={settings.defaultLaborBurdenPercent} onChange={(e) => setSettings({ ...settings, defaultLaborBurdenPercent: Number(e.target.value) || 0 })} />
            </label>
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
        </section>
      </div>
    </div>
  );
}
