import type { BundleItemRecord, BundleRecord, ModifierRecord, SettingsRecord } from '../../shared/types/estimator.ts';
import {
  catalogLaborTabBundleItems,
  catalogLaborTabBundles,
  catalogLaborTabModifiers,
  projectSetupTabSettings,
} from '../config/div10SheetsWorkbooks.ts';
import {
  SHEETS_TABS,
  readRowsOrEmpty,
  readRowsWithLegacyTab,
  upsertRowById,
} from '../integrations/googleSheets.ts';
import { assertSheetsWorkbookId, getCatalogSpreadsheetId, getSettingsSpreadsheetId } from './dataBackend.ts';

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
  return assertSheetsWorkbookId(getSettingsSpreadsheetId(), 'PROJECT_SETUP_ESTIMATE_PROPOSAL_SPREADSHEET_ID');
}

function catalogWorkbookId(): string {
  return assertSheetsWorkbookId(getCatalogSpreadsheetId(), 'CATALOG_LABOR_BACKEND_SPREADSHEET_ID');
}

function settingsTab(): string {
  return projectSetupTabSettings();
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

function isKeyValueSettingsRows(rows: Array<Record<string, string>>): boolean {
  return rows.some(
    (row) => String(row.setting_key || row.SettingKey || row.Key || '').trim().length > 0
  );
}

function settingsFromKeyValueRows(rows: Array<Record<string, string>>): SettingsRecord {
  const map = new Map<string, string>();
  for (const row of rows) {
    const key = String(row.setting_key || row.SettingKey || row.Key || '').trim();
    if (!key) continue;
    map.set(key, String(row.setting_value ?? row.SettingValue ?? row.Value ?? '').trim());
  }
  const g = (k: string, fallback = '') => map.get(k) ?? fallback;
  const now = new Date().toISOString();
  return {
    id: g('SettingsID', 'global') || 'global',
    companyName: g('CompanyName'),
    companyAddress: g('CompanyAddress'),
    companyPhone: g('CompanyPhone'),
    companyEmail: g('CompanyEmail'),
    logoUrl: g('LogoUrl'),
    defaultLaborRatePerHour: toNumber(g('DefaultLaborRatePerHour'), 100),
    defaultOverheadPercent: toNumber(g('DefaultOverheadPercent'), 0),
    defaultProfitPercent: toNumber(g('DefaultProfitPercent'), 0),
    defaultTaxPercent: toNumber(g('DefaultTaxPercent'), 0),
    defaultLaborBurdenPercent: toNumber(g('DefaultLaborBurdenPercent'), 0),
    defaultLaborOverheadPercent: toNumber(g('DefaultLaborOverheadPercent'), 0),
    proposalIntro: g('ProposalIntro'),
    proposalTerms: g('ProposalTerms'),
    proposalExclusions: g('ProposalExclusions'),
    proposalClarifications: g('ProposalClarifications'),
    proposalAcceptanceLabel: g('ProposalAcceptanceLabel'),
    intakeCatalogAutoApplyMode: (g('IntakeCatalogAutoApplyMode', 'off') || 'off') as SettingsRecord['intakeCatalogAutoApplyMode'],
    intakeCatalogTierAMinScore: toNumber(g('IntakeCatalogTierAMinScore'), 0.85),
    updatedAt: g('UpdatedAt') || now,
  };
}

function settingsFromWideRow(row: Record<string, string>): SettingsRecord {
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

const SETTINGS_SHEET_FIELDS: Array<{ sheetKey: string; pick: (s: SettingsRecord) => string | number }> = [
  { sheetKey: 'SettingsID', pick: (s) => s.id },
  { sheetKey: 'CompanyName', pick: (s) => s.companyName },
  { sheetKey: 'CompanyAddress', pick: (s) => s.companyAddress },
  { sheetKey: 'CompanyPhone', pick: (s) => s.companyPhone },
  { sheetKey: 'CompanyEmail', pick: (s) => s.companyEmail },
  { sheetKey: 'LogoUrl', pick: (s) => s.logoUrl },
  { sheetKey: 'DefaultLaborRatePerHour', pick: (s) => s.defaultLaborRatePerHour },
  { sheetKey: 'DefaultOverheadPercent', pick: (s) => s.defaultOverheadPercent },
  { sheetKey: 'DefaultProfitPercent', pick: (s) => s.defaultProfitPercent },
  { sheetKey: 'DefaultTaxPercent', pick: (s) => s.defaultTaxPercent },
  { sheetKey: 'DefaultLaborBurdenPercent', pick: (s) => s.defaultLaborBurdenPercent },
  { sheetKey: 'DefaultLaborOverheadPercent', pick: (s) => s.defaultLaborOverheadPercent },
  { sheetKey: 'ProposalIntro', pick: (s) => s.proposalIntro },
  { sheetKey: 'ProposalTerms', pick: (s) => s.proposalTerms },
  { sheetKey: 'ProposalExclusions', pick: (s) => s.proposalExclusions },
  { sheetKey: 'ProposalClarifications', pick: (s) => s.proposalClarifications },
  { sheetKey: 'ProposalAcceptanceLabel', pick: (s) => s.proposalAcceptanceLabel },
  { sheetKey: 'IntakeCatalogAutoApplyMode', pick: (s) => s.intakeCatalogAutoApplyMode },
  { sheetKey: 'IntakeCatalogTierAMinScore', pick: (s) => s.intakeCatalogTierAMinScore },
  { sheetKey: 'UpdatedAt', pick: (s) => s.updatedAt },
];

export async function listModifiersFromSheets(): Promise<ModifierRecord[]> {
  const rows = await readRowsWithLegacyTab(catalogLaborTabModifiers(), SHEETS_TABS.MODIFIERS, catalogWorkbookId());
  return rows
    .map((row) => ({
      id: String(row.ModifierID || row.id || '').trim(),
      name: String(row.Name || '').trim(),
      modifierKey: String(row.ModifierKey || row.Name || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_'),
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
    }))
    .filter((row) => row.id && row.name);
}

export async function listBundlesFromSheets(): Promise<BundleRecord[]> {
  const rows = await readRowsWithLegacyTab(catalogLaborTabBundles(), SHEETS_TABS.BUNDLES, catalogWorkbookId());
  return rows
    .map((row) => ({
      id: String(row.BundleID || row.id || '').trim(),
      bundleName: String(row.BundleName || row.Name || '').trim(),
      category: String(row.Category || '').trim() || null,
      active: toBool(row.Active, true),
      updatedAt: String(row.UpdatedAt || '').trim() || new Date().toISOString(),
    }))
    .filter((row) => row.id && row.bundleName);
}

export async function listBundleItemsFromSheets(bundleId: string): Promise<BundleItemRecord[]> {
  const rows = await readRowsOrEmpty(catalogLaborTabBundleItems(), catalogWorkbookId());
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
  const rows = await readRowsWithLegacyTab(settingsTab(), SHEETS_TABS.APP_SETTINGS, settingsWorkbookId());
  if (isKeyValueSettingsRows(rows)) return settingsFromKeyValueRows(rows);
  return settingsFromWideRow(rows[0] || {});
}

export async function updateSettingsInSheets(input: Partial<SettingsRecord>): Promise<SettingsRecord> {
  const current = await getSettingsFromSheets();
  const next: SettingsRecord = {
    ...current,
    ...input,
    id: current.id || 'global',
    updatedAt: new Date().toISOString(),
  };

  const rows = await readRowsWithLegacyTab(settingsTab(), SHEETS_TABS.APP_SETTINGS, settingsWorkbookId());
  const wb = settingsWorkbookId();
  const tab = settingsTab();

  if (isKeyValueSettingsRows(rows)) {
    for (const { sheetKey, pick } of SETTINGS_SHEET_FIELDS) {
      await upsertRowById(
        tab,
        'setting_key',
        { setting_key: sheetKey, setting_value: String(pick(next)), setting_type: 'string', description: '', updated_at: next.updatedAt },
        wb
      );
    }
    return next;
  }

  await upsertRowById(
    tab,
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
    wb
  );

  return next;
}

export async function listTaxJurisdictionsFromSheets(): Promise<TaxJurisdictionRow[]> {
  const rows = await readRowsOrEmpty(SHEETS_TABS.TAX_JURISDICTIONS, settingsWorkbookId());
  return rows
    .map((row) => ({
      jurisdictionId: String(row.JurisdictionID || row.id || '').trim(),
      locationLabel: String(row.LocationLabel || '').trim(),
      stateCode: String(row.StateCode || '').trim(),
      postalCode: String(row.PostalCode || '').trim(),
      taxPercent: toNumber(row.TaxPercent, 0),
      notes: String(row.Notes || '').trim(),
      updatedAt: String(row.UpdatedAt || '').trim() || new Date().toISOString(),
    }))
    .filter((row) => row.jurisdictionId || row.locationLabel);
}
