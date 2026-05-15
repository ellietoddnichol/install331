/**
 * Catalog reads/writes for the Catalog UI when `DATA_BACKEND=sheets`.
 * Google Sheets (`CATALOG_LABOR_BACKEND_SPREADSHEET_ID` / `CatalogItems` tab) is the source of truth.
 */
import {
  getCatalogItemById,
  listCatalogItemFacets,
  listCatalogItemsForApi,
  listCatalogItemsPage,
  listDistinctCatalogCategories,
  type CatalogItemsPageParams,
} from './catalogRepo.ts';
import { isSheetsDataBackend } from './dataBackend.ts';
import {
  deactivateCatalogItemInSheets,
  getWorkspaceCatalogInventoryFromSheets,
  listCatalogItemsFromSheets,
  peekResolvedCatalogItemsSheetTab,
  upsertCatalogItemInSheets,
} from './sheetsCatalogRepo.ts';
import type { CatalogItem } from '../../types.ts';

export type CatalogItemsReadSource = 'sheets';

let lastCatalogItemsReadSource: CatalogItemsReadSource = 'sheets';

export function peekCatalogItemsReadSource(): CatalogItemsReadSource {
  return lastCatalogItemsReadSource;
}

/** Items for facets/categories and in-memory paging when sheets mode is active. */
export async function listWorkspaceCatalogItems(includeInactive = true): Promise<CatalogItem[]> {
  if (!isSheetsDataBackend()) {
    return listCatalogItemsForApi(includeInactive);
  }
  const items = await listCatalogItemsFromSheets();
  lastCatalogItemsReadSource = 'sheets';
  if (!includeInactive) return items.filter((item) => item.active);
  return items;
}

export async function getWorkspaceCatalogFacets(): Promise<{
  categories: string[];
  itemTypes: string[];
  sourceTabs: string[];
  hasUntaggedSource: boolean;
}> {
  if (!isSheetsDataBackend()) {
    return listCatalogItemFacets();
  }
  const items = await listWorkspaceCatalogItems(true);
  const categories = [...new Set(items.map((item) => item.category).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
  const itemTypes = [
    ...new Set(
      items.map((item) => String(item.subcategory || item.category || '').trim()).filter(Boolean)
    ),
  ].sort((a, b) => a.localeCompare(b));
  const tab = peekResolvedCatalogItemsSheetTab();
  return {
    categories,
    itemTypes,
    sourceTabs: tab ? [tab] : [],
    hasUntaggedSource: false,
  };
}

export async function listWorkspaceDistinctCatalogCategories(): Promise<string[]> {
  if (!isSheetsDataBackend()) {
    return listDistinctCatalogCategories();
  }
  const items = await listWorkspaceCatalogItems(true);
  return [...new Set(items.map((item) => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export async function listWorkspaceCatalogItemsPage(
  params: CatalogItemsPageParams
): Promise<{ rows: CatalogItem[]; total: number }> {
  if (!isSheetsDataBackend()) {
    return listCatalogItemsPage(params);
  }
  const items = await listWorkspaceCatalogItems(true);
  const category = params.category ? params.category.trim().toLowerCase() : '';
  const q = params.q ? params.q.trim().toLowerCase() : '';
  const filtered = items.filter((item) => {
    if (params.activeFilter === 'active' && !item.active) return false;
    if (params.activeFilter === 'inactive' && item.active) return false;
    if (category && String(item.category || '').toLowerCase() !== category) return false;
    if (q) {
      const haystack = [
        item.sku,
        item.description,
        item.category,
        item.subcategory || '',
        item.manufacturer || '',
        item.model || '',
        item.series || '',
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
  const offset = Math.max(0, params.offset);
  const limit = Math.max(1, Math.min(200, params.limit));
  return { rows: filtered.slice(offset, offset + limit), total: filtered.length };
}

export async function getWorkspaceCatalogItemById(id: string): Promise<CatalogItem | null> {
  if (!isSheetsDataBackend()) {
    return getCatalogItemById(id);
  }
  const items = await listWorkspaceCatalogItems(true);
  return items.find((item) => item.id === id) ?? null;
}

export async function getWorkspaceCatalogInventoryCounts(): Promise<{
  total: number;
  active: number;
  inactive: number;
}> {
  if (!isSheetsDataBackend()) {
    const { getCatalogInventoryCounts } = await import('./catalogRepo.ts');
    return getCatalogInventoryCounts();
  }
  return getWorkspaceCatalogInventoryFromSheets();
}

export async function persistWorkspaceCatalogItem(item: CatalogItem): Promise<CatalogItem> {
  if (!isSheetsDataBackend()) {
    throw new Error('persistWorkspaceCatalogItem is only used when DATA_BACKEND=sheets.');
  }
  return upsertCatalogItemInSheets(item);
}

export async function deactivateWorkspaceCatalogItem(id: string): Promise<boolean> {
  if (!isSheetsDataBackend()) {
    const { getCatalogItemById } = await import('./catalogRepo.ts');
    const existing = await getCatalogItemById(id);
    if (!existing) return false;
    const { dbCatalogRun } = await import('../db/query.ts');
    await dbCatalogRun('UPDATE catalog_items SET active = 0 WHERE id = ?', [id]);
    return true;
  }
  return deactivateCatalogItemInSheets(id);
}

export async function searchWorkspaceCatalogItems(input: {
  query: string;
  category?: string | null;
  includeInactive?: boolean;
  limit?: number;
}): Promise<CatalogItem[]> {
  if (!isSheetsDataBackend()) {
    const { searchCatalogItemsForApi } = await import('./catalogRepo.ts');
    return searchCatalogItemsForApi(input);
  }
  const q = input.query.trim().toLowerCase();
  const category = input.category ? input.category.trim().toLowerCase() : '';
  const limit = Math.max(1, Math.min(200, input.limit ?? 60));
  let items = await listWorkspaceCatalogItems(Boolean(input.includeInactive));
  if (category) {
    items = items.filter((item) => String(item.category || '').toLowerCase() === category);
  }
  if (q) {
    items = items.filter((item) => {
      const haystack = [
        item.sku,
        item.description,
        item.category,
        item.subcategory || '',
        item.manufacturer || '',
        item.model || '',
        item.series || '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }
  return items.slice(0, limit);
}
