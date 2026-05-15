import type { CatalogItem } from '../../types.ts';
import type { CatalogVendorPriceHistoryRow } from '../../shared/types/estimator.ts';
import { TAB_CATALOG_ALIASES_DEFAULT, TAB_CATALOG_ITEMS_DEFAULT } from '../../shared/sheets/div10SheetTabs.ts';
import {
  catalogLaborTabCatalogAliases,
  catalogLaborTabCatalogAttributes,
  catalogLaborTabCatalogItems,
  catalogLaborTabCatalogVendorPrices,
} from '../config/div10SheetsWorkbooks.ts';
import { getGaxiosLikeHttpStatus } from '../http/jsonErrors.ts';
import { SHEETS_TABS, isGoogleSheetsConfigured, readRows, upsertRowById, type SheetsRow } from '../integrations/googleSheets.ts';
import { assertSheetsWorkbookId, getCatalogSpreadsheetId } from './dataBackend.ts';

export interface CatalogAliasSheetRow {
  aliasId: string;
  catalogItemId: string;
  aliasValue: string;
}

export interface CatalogAttributeSheetRow {
  attributeId: string;
  catalogItemId: string;
  attributeType: string;
  attributeValue: string;
}

function catalogWorkbookId(): string {
  return assertSheetsWorkbookId(getCatalogSpreadsheetId(), 'CATALOG_LABOR_BACKEND_SPREADSHEET_ID');
}

/** Tab name used for the most recent successful catalog items read (for API meta). */
let lastResolvedCatalogItemsTab: string | null = null;

export function peekResolvedCatalogItemsSheetTab(): string {
  return lastResolvedCatalogItemsTab ?? catalogLaborTabCatalogItems();
}

async function readCatalogItemSheetRows(): Promise<Array<Record<string, string>>> {
  const wb = catalogWorkbookId();
  const primary = catalogLaborTabCatalogItems();
  lastResolvedCatalogItemsTab = null;
  const legacy = SHEETS_TABS.CATALOG_ITEMS;
  if (primary === legacy) {
    const rows = await readRows(primary, wb);
    lastResolvedCatalogItemsTab = primary;
    return rows;
  }
  try {
    const rows = await readRows(primary, wb);
    lastResolvedCatalogItemsTab = primary;
    return rows;
  } catch (e) {
    if (getGaxiosLikeHttpStatus(e) !== 404) throw e;
    if (primary === TAB_CATALOG_ITEMS_DEFAULT) {
      const tail = wb.slice(-6);
      console.warn(
        `[sheetsCatalog] Div 10 default tab "${primary}" not found (404) on workbook …${tail}; retrying "${legacy}". ` +
          `If both fail, CATALOG_LABOR_BACKEND_SPREADSHEET_ID does not match the file URL (copy id from /d/THIS_PART/edit). ` +
          `Share the file with GOOGLE_SERVICE_ACCOUNT_EMAIL. Override tab: GOOGLE_SHEETS_TAB_CATALOG_ITEMS.`
      );
      const rows = await readRows(legacy, wb);
      lastResolvedCatalogItemsTab = legacy;
      return rows;
    }
    throw e;
  }
}

async function readCatalogAliasSheetRows(): Promise<Array<Record<string, string>>> {
  const wb = catalogWorkbookId();
  const primary = catalogLaborTabCatalogAliases();
  const legacy = SHEETS_TABS.CATALOG_ALIASES;
  if (primary === legacy) return await readRows(primary, wb);
  try {
    return await readRows(primary, wb);
  } catch (e) {
    if (getGaxiosLikeHttpStatus(e) !== 404) throw e;
    if (primary === TAB_CATALOG_ALIASES_DEFAULT) {
      console.warn(`[sheetsCatalog] tab "${primary}" not found (404); retrying "${legacy}".`);
      return await readRows(legacy, wb);
    }
    throw e;
  }
}

function parseBoolean(value: string | undefined, defaultValue = false): boolean {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return defaultValue;
  return v === 'true' || v === '1' || v === 'yes' || v === 'y';
}

function parseNumber(value: string | undefined, defaultValue = 0): number {
  const n = Number(String(value || '').trim());
  return Number.isFinite(n) ? n : defaultValue;
}

function mapCatalogItemRow(row: Record<string, string>): CatalogItem {
  const catalogItemId = String(row.catalog_item_id || row.CatalogItemID || '').trim();
  const sku = String(row.sku || row.SKU || '').trim();
  const stableId = catalogItemId || sku;
  const item: CatalogItem = {
    id: stableId,
    sku,
    category: String(row.category || row.Category || '').trim(),
    subcategory: String(row.subcategory || row.Subcategory || '').trim() || undefined,
    manufacturer: String(row.manufacturer || row.Manufacturer || '').trim() || undefined,
    model: String(row.model || row.Model || '').trim() || undefined,
    series: String(row.series || row.Series || '').trim() || undefined,
    description: String(row.description || row.Description || row.GenericItemName || '').trim(),
    uom: (String(row.unit || row.Unit || 'EA').trim() || 'EA') as CatalogItem['uom'],
    baseMaterialCost: parseNumber(row.material_unit_cost ?? row.BaseMaterialCost, 0),
    baseLaborMinutes: parseNumber(row.labor_minutes_each ?? row.BaseLaborMinutes, 0),
    installLaborFamily: String(row.labor_family_key || row.InstallLaborFamily || '').trim() || undefined,
    active: parseBoolean(row.active ?? row.Active, true),
    taxable: parseBoolean(row.TaxCategory, true),
    adaFlag: false,
    imageUrl: String(row.image_url || row.ImageURL || '').trim() || undefined,
    notes: String(row.notes || row.SourceNotes || '').trim() || undefined,
  };
  return item;
}

export function isSheetsCatalogReadEnabled(): boolean {
  const env = String(process.env.GOOGLE_SHEETS_CATALOG_READ_ENABLED || '').trim().toLowerCase();
  if (env === '0' || env === 'false' || env === 'no') return false;
  return isGoogleSheetsConfigured();
}

export async function listCatalogItemsFromSheets(): Promise<CatalogItem[]> {
  const rows = await readCatalogItemSheetRows();
  return rows
    .map(mapCatalogItemRow)
    .filter((item) => item.id && item.description);
}

function formatActiveForSheet(active: boolean): string {
  return active ? 'yes' : 'no';
}

function mapCatalogItemToSheetRow(item: CatalogItem): SheetsRow {
  const catalogItemId = String(item.id || item.sku || '').trim();
  const sku = String(item.sku || catalogItemId).trim();
  return {
    CatalogItemID: catalogItemId,
    SKU: sku,
    Category: String(item.category || '').trim(),
    Subcategory: String(item.subcategory || '').trim(),
    Manufacturer: String(item.manufacturer || '').trim(),
    Model: String(item.model || '').trim(),
    Series: String(item.series || '').trim(),
    Description: String(item.description || '').trim(),
    Unit: String(item.uom || 'EA').trim() || 'EA',
    BaseMaterialCost: item.baseMaterialCost ?? 0,
    BaseLaborMinutes: item.baseLaborMinutes ?? 0,
    InstallLaborFamily: String(item.installLaborFamily || '').trim(),
    Active: formatActiveForSheet(item.active !== false),
    ImageURL: String(item.imageUrl || '').trim(),
    SourceNotes: String(item.notes || '').trim(),
  };
}

/** Create or update a catalog row on the Div 10 `CatalogItems` tab (source of truth when `DATA_BACKEND=sheets`). */
export async function upsertCatalogItemInSheets(item: CatalogItem): Promise<CatalogItem> {
  const sku = String(item.sku || '').trim();
  const id = String(item.id || '').trim() || (sku ? `CAT-${sku.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 40)}` : '');
  if (!id) {
    throw new Error('Catalog item requires an id or sku before saving to Google Sheets.');
  }
  if (!String(item.description || '').trim()) {
    throw new Error('Catalog item description is required before saving to Google Sheets.');
  }
  const normalized: CatalogItem = { ...item, id, sku: sku || id };
  const tab = catalogLaborTabCatalogItems();
  await upsertRowById(tab, 'CatalogItemID', mapCatalogItemToSheetRow(normalized), catalogWorkbookId());
  lastResolvedCatalogItemsTab = tab;
  return normalized;
}

/** Soft-delete: set `Active` to no on the sheet row. */
export async function deactivateCatalogItemInSheets(catalogItemId: string): Promise<boolean> {
  const id = String(catalogItemId || '').trim();
  if (!id) return false;
  const items = await listCatalogItemsFromSheets();
  const existing = items.find((row) => row.id === id);
  if (!existing) return false;
  await upsertCatalogItemInSheets({ ...existing, active: false });
  return true;
}

export async function getWorkspaceCatalogInventoryFromSheets(): Promise<{
  total: number;
  active: number;
  inactive: number;
}> {
  const items = await listCatalogItemsFromSheets();
  const active = items.filter((i) => i.active).length;
  return { total: items.length, active, inactive: items.length - active };
}

export async function listCatalogVendorPriceHistoryFromSheets(catalogItemId?: string | null): Promise<CatalogVendorPriceHistoryRow[]> {
  const rows = await readRows(catalogLaborTabCatalogVendorPrices(), catalogWorkbookId());
  const mapped = rows.map((row) => ({
    vendorPriceId: String(row.VendorPriceID || '').trim(),
    catalogItemId: String(row.CatalogItemID || '').trim(),
    vendor: String(row.Vendor || '').trim(),
    vendorSku: String(row.VendorSKU || '').trim(),
    sourceQuoteId: String(row.SourceQuoteID || '').trim(),
    sourceQuoteLineId: String(row.SourceQuoteLineID || '').trim(),
    quoteDate: String(row.QuoteDate || '').trim(),
    unitCost: parseNumber(row.UnitCost, 0),
    leadTime: String(row.LeadTime || '').trim(),
    preferredVendor: parseBoolean(row.PreferredVendor, false),
    notes: String(row.Notes || '').trim(),
    createdAt: String(row.CreatedAt || '').trim(),
  }));

  if (!catalogItemId) return mapped;
  return mapped.filter((row) => row.catalogItemId === catalogItemId);
}

export async function listCatalogAliasesFromSheets(): Promise<CatalogAliasSheetRow[]> {
  const rows = await readCatalogAliasSheetRows();
  return rows
    .map((row) => ({
      aliasId: String(row.AliasID || row.id || '').trim(),
      catalogItemId: String(row.CatalogItemID || '').trim(),
      aliasValue: String(row.AliasValue || row.Alias || '').trim(),
    }))
    .filter((row) => row.aliasValue.length > 0);
}

export async function listCatalogAttributesFromSheets(): Promise<CatalogAttributeSheetRow[]> {
  const rows = await readRows(catalogLaborTabCatalogAttributes(), catalogWorkbookId());
  return rows
    .map((row) => ({
      attributeId: String(row.AttributeID || row.id || '').trim(),
      catalogItemId: String(row.CatalogItemID || '').trim(),
      attributeType: String(row.AttributeType || '').trim(),
      attributeValue: String(row.AttributeValue || '').trim(),
    }))
    .filter((row) => row.attributeType.length > 0 || row.attributeValue.length > 0);
}
