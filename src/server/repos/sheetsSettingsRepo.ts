import type { BundleItemRecord, BundleRecord, ModifierRecord, SettingsRecord } from '../../shared/types/estimator.ts';
import { SHEETS_TABS, readRows, upsertRowById } from '../integrations/googleSheets.ts';
import { assertSheetsWorkbookId, getSettingsSpreadsheetId } from './dataBackend.ts';

export interface TaxJurisdictionRow {
  jurisdictionId: string;
  locationLabel: string;
  stateCode: string;
  postalCode: string;
  taxPercent: number;
  notes: string;
  updatedAt: string;
}

function settingsWorkbookId(): string {
  return assertSheetsWorkbookId(getSettingsSpreadsheetId(), 'GOOGLE_SETTINGS_SPREADSHEET_ID');
}

function toNumber(value: string | undefined, fallback = 0): number {
  const n = Number(String(value || '').trim());
  return Number.isFinite(n) ? n : fallback;
}

function toBool(value: string | undefined, fallback = false): boolean {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return fallback;
  return v === 'true' || v === '1' || v === 'yes' || v === 'y';
}

export async function listModifiersFromSheets(): Promise<ModifierRecord[]> {
  const rows = await readRows(SHEETS_TABS.MODIFIERS, settingsWorkbookId());
  return rows.map((row) => ({
    id: String(row.ModifierID || row.id || '').trim(),
    name: String(row.Name || '').trim(),
    modifierKey: String(row.ModifierKey || row.Name || '').trim().toLowerCase().replace(/\s+/g, '_'),
    description: String(row.Description || '').trim(),
    appliesToCategories: String(row.AppliesToCategories || '')
      .split(/[;,]/)
      .map((v) => v.trim())
      .filter(Boolean),
    addLaborMinutes: toNumber(row.AddLaborMinutes, 0),
    addMaterialCost: toNumber(row.AddMaterialCost, 0),
    percentLabor: toNumber(row.PercentLabor, 0),
    percentMaterial: toNumber(row.PercentMaterial, 0),
    active: toBool(row.Active, true),
    updatedAt: String(row.UpdatedAt || '').trim() || new Date().toISOString(),
  })).filter((row) => row.id && row.name);
}

export async function listBundlesFromSheets(): Promise<BundleRecord[]> {
  const rows = await readRows(SHEETS_TABS.BUNDLES, settingsWorkbookId());
  return rows.map((row) => ({
    id: String(row.BundleID || row.id || '').trim(),
    bundleName: String(row.BundleName || '').trim(),
    category: String(row.Category || '').trim() || null,
    active: toBool(row.Active, true),
    updatedAt: String(row.UpdatedAt || '').trim() || new Date().toISOString(),
  })).filter((row) => row.id && row.bundleName);
}

export async function listBundleItemsFromSheets(bundleId: string): Promise<BundleItemRecord[]> {
  const rows = await readRows(SHEETS_TABS.BUNDLE_ITEMS, settingsWorkbookId());
  return rows
    .map((row) => ({
      id: String(row.BundleItemID || row.id || '').trim(),
      bundleId: String(row.BundleID || '').trim(),
      catalogItemId: String(row.CatalogItemID || '').trim() || null,
      sku: String(row.SKU || '').trim() || null,
      description: String(row.Description || '').trim(),
      qty: toNumber(row.Qty, 1) || 1,
      materialCost: toNumber(row.MaterialCost, 0),
      laborMinutes: toNumber(row.LaborMinutes, 0),
      laborCost: toNumber(row.LaborCost, 0),
      sortOrder: toNumber(row.SortOrder, 0),
      notes: String(row.Notes || '').trim() || null,
    }))
    .filter((row) => row.bundleId === bundleId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function getSettingsFromSheets(): Promise<SettingsRecord> {
  const rows = await readRows(SHEETS_TABS.APP_SETTINGS, settingsWorkbookId());
  const row = rows[0] || {};
  const now = new Date().toISOString();
  return {
    id: String(row.SettingsID || 'global').trim() || 'global',
    companyName: String(row.CompanyName || '').trim(),
    companyAddress: String(row.CompanyAddress || '').trim(),
    companyPhone: String(row.CompanyPhone || '').trim(),
    companyEmail: String(row.CompanyEmail || '').trim(),
    logoUrl: String(row.LogoUrl || '').trim(),
    defaultLaborRatePerHour: toNumber(row.DefaultLaborRatePerHour, 100),
    defaultOverheadPercent: toNumber(row.DefaultOverheadPercent, 0),
    defaultProfitPercent: toNumber(row.DefaultProfitPercent, 0),
    defaultTaxPercent: toNumber(row.DefaultTaxPercent, 0),
    defaultLaborBurdenPercent: toNumber(row.DefaultLaborBurdenPercent, 0),
    defaultLaborOverheadPercent: toNumber(row.DefaultLaborOverheadPercent, 0),
    proposalIntro: String(row.ProposalIntro || '').trim(),
    proposalTerms: String(row.ProposalTerms || '').trim(),
    proposalExclusions: String(row.ProposalExclusions || '').trim(),
    proposalClarifications: String(row.ProposalClarifications || '').trim(),
    proposalAcceptanceLabel: String(row.ProposalAcceptanceLabel || '').trim(),
    intakeCatalogAutoApplyMode: (String(row.IntakeCatalogAutoApplyMode || 'off').trim() || 'off') as SettingsRecord['intakeCatalogAutoApplyMode'],
    intakeCatalogTierAMinScore: toNumber(row.IntakeCatalogTierAMinScore, 0.85),
    updatedAt: String(row.UpdatedAt || '').trim() || now,
  };
}

export async function updateSettingsInSheets(input: Partial<SettingsRecord>): Promise<SettingsRecord> {
  const current = await getSettingsFromSheets();
  const next: SettingsRecord = {
    ...current,
    ...input,
    id: current.id || 'global',
    updatedAt: new Date().toISOString(),
  };

  await upsertRowById(
    SHEETS_TABS.APP_SETTINGS,
    'SettingsID',
    {
      SettingsID: next.id,
      CompanyName: next.companyName,
      CompanyAddress: next.companyAddress,
      CompanyPhone: next.companyPhone,
      CompanyEmail: next.companyEmail,
      LogoUrl: next.logoUrl,
      DefaultLaborRatePerHour: next.defaultLaborRatePerHour,
      DefaultOverheadPercent: next.defaultOverheadPercent,
      DefaultProfitPercent: next.defaultProfitPercent,
      DefaultTaxPercent: next.defaultTaxPercent,
      DefaultLaborBurdenPercent: next.defaultLaborBurdenPercent,
      DefaultLaborOverheadPercent: next.defaultLaborOverheadPercent,
      ProposalIntro: next.proposalIntro,
      ProposalTerms: next.proposalTerms,
      ProposalExclusions: next.proposalExclusions,
      ProposalClarifications: next.proposalClarifications,
      ProposalAcceptanceLabel: next.proposalAcceptanceLabel,
      IntakeCatalogAutoApplyMode: next.intakeCatalogAutoApplyMode,
      IntakeCatalogTierAMinScore: next.intakeCatalogTierAMinScore,
      UpdatedAt: next.updatedAt,
    },
    settingsWorkbookId()
  );

  return next;
}

export async function listTaxJurisdictionsFromSheets(): Promise<TaxJurisdictionRow[]> {
  const rows = await readRows(SHEETS_TABS.TAX_JURISDICTIONS, settingsWorkbookId());
  return rows.map((row) => ({
    jurisdictionId: String(row.JurisdictionID || row.id || '').trim(),
    locationLabel: String(row.LocationLabel || '').trim(),
    stateCode: String(row.StateCode || '').trim(),
    postalCode: String(row.PostalCode || '').trim(),
    taxPercent: toNumber(row.TaxPercent, 0),
    notes: String(row.Notes || '').trim(),
    updatedAt: String(row.UpdatedAt || '').trim() || new Date().toISOString(),
  })).filter((row) => row.jurisdictionId || row.locationLabel);
}
