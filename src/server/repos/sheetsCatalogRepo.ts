import type { CatalogItem } from '../../types.ts';
import type { CatalogVendorPriceHistoryRow } from '../../shared/types/estimator.ts';
import { SHEETS_TABS, isGoogleSheetsConfigured, readRows } from '../integrations/googleSheets.ts';
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
  return assertSheetsWorkbookId(getCatalogSpreadsheetId(), 'GOOGLE_CATALOG_SPREADSHEET_ID');
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
  const catalogItemId = String(row.CatalogItemID || '').trim();
  const sku = String(row.SKU || '').trim();
  const stableId = catalogItemId || sku;
  const item: CatalogItem = {
    id: stableId,
    sku,
    category: String(row.Category || '').trim(),
    subcategory: String(row.Subcategory || '').trim() || undefined,
    manufacturer: String(row.Manufacturer || '').trim() || undefined,
    model: String(row.Model || '').trim() || undefined,
    series: String(row.Series || '').trim() || undefined,
    description: String(row.Description || row.GenericItemName || '').trim(),
    uom: (String(row.Unit || 'EA').trim() || 'EA') as CatalogItem['uom'],
    baseMaterialCost: parseNumber(row.BaseMaterialCost, 0),
    baseLaborMinutes: parseNumber(row.BaseLaborMinutes, 0),
    active: parseBoolean(row.Active, true),
    taxable: parseBoolean(row.TaxCategory, true),
    adaFlag: false,
    imageUrl: String(row.ImageURL || '').trim() || undefined,
    notes: String(row.SourceNotes || '').trim() || undefined,
  };
  return item;
}

export function isSheetsCatalogReadEnabled(): boolean {
  const env = String(process.env.GOOGLE_SHEETS_CATALOG_READ_ENABLED || '').trim().toLowerCase();
  if (env === '0' || env === 'false' || env === 'no') return false;
  return isGoogleSheetsConfigured();
}

export async function listCatalogItemsFromSheets(): Promise<CatalogItem[]> {
  const rows = await readRows(SHEETS_TABS.CATALOG_ITEMS, catalogWorkbookId());
  return rows
    .map(mapCatalogItemRow)
    .filter((item) => item.id && item.description);
}

export async function listCatalogVendorPriceHistoryFromSheets(catalogItemId?: string | null): Promise<CatalogVendorPriceHistoryRow[]> {
  const rows = await readRows(SHEETS_TABS.CATALOG_VENDOR_PRICES, catalogWorkbookId());
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
  const rows = await readRows(SHEETS_TABS.CATALOG_ALIASES, catalogWorkbookId());
  return rows
    .map((row) => ({
      aliasId: String(row.AliasID || row.id || '').trim(),
      catalogItemId: String(row.CatalogItemID || '').trim(),
      aliasValue: String(row.AliasValue || row.Alias || '').trim(),
    }))
    .filter((row) => row.aliasValue.length > 0);
}

export async function listCatalogAttributesFromSheets(): Promise<CatalogAttributeSheetRow[]> {
  const rows = await readRows(SHEETS_TABS.CATALOG_ATTRIBUTES, catalogWorkbookId());
  return rows
    .map((row) => ({
      attributeId: String(row.AttributeID || row.id || '').trim(),
      catalogItemId: String(row.CatalogItemID || '').trim(),
      attributeType: String(row.AttributeType || '').trim(),
      attributeValue: String(row.AttributeValue || '').trim(),
    }))
    .filter((row) => row.attributeType.length > 0 || row.attributeValue.length > 0);
}
