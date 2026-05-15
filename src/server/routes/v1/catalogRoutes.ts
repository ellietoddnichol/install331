import { Router } from 'express';
import { listCatalogItemsByIds } from '../../repos/catalogRepo.ts';
import { isSheetsDataBackend } from '../../repos/dataBackend.ts';
import { listWorkspaceCatalogItems } from '../../repos/catalogWorkspaceReads.ts';
import { getCatalogItemsTableName } from '../../db/catalogTable.ts';
import { isPgCatalogBackend } from '../../db/catalogBackend.ts';
import { handleRouteError, tryRespondSheetsNotFound, tryRespondSheetsPermissionDenied } from '../../http/jsonErrors.ts';
import {
  getWorkspaceCatalogFacets,
  getWorkspaceCatalogItemById,
  listWorkspaceCatalogItemsPage,
  listWorkspaceDistinctCatalogCategories,
  peekCatalogItemsReadSource,
} from '../../repos/catalogWorkspaceReads.ts';
import { listCatalogVendorPriceHistoryFromSheets } from '../../repos/sheetsCatalogRepo.ts';
import { peekResolvedCatalogItemsSheetTab } from '../../repos/sheetsCatalogRepo.ts';

export const catalogRouter = Router();

const catalogDebug = () => String(process.env.CATALOG_DEBUG || '').trim() === '1';

function handleCatalogSheetsRouteError(res: import('express').Response, e: unknown): boolean {
  if (tryRespondSheetsPermissionDenied(res, e, '[catalog]')) return true;
  if (tryRespondSheetsNotFound(res, e, '[catalog]')) return true;
  handleRouteError(res, e, '[catalog]');
  return true;
}

catalogRouter.get('/categories', async (_req, res) => {
  try {
    const data = await listWorkspaceDistinctCatalogCategories();
    return res.json({ data });
  } catch (e) {
    if (handleCatalogSheetsRouteError(res, e)) return;
  }
});

catalogRouter.get('/facets', async (_req, res) => {
  try {
    const data = await getWorkspaceCatalogFacets();
    return res.json({ data });
  } catch (e) {
    if (handleCatalogSheetsRouteError(res, e)) return;
  }
});

catalogRouter.get('/items', async (req, res) => {
  const offset = Math.max(0, Number(req.query.offset || 0) || 0);
  const limit = Math.max(1, Math.min(200, Number(req.query.limit || 75) || 75));
  const activeFilterRaw = String(req.query.act || 'all').trim().toLowerCase();
  const activeFilter =
    activeFilterRaw === 'active' || activeFilterRaw === 'inactive' ? (activeFilterRaw as 'active' | 'inactive') : 'all';
  const category = typeof req.query.cat === 'string' ? req.query.cat.trim() : '';
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  const typeFilter = typeof req.query.itype === 'string' ? req.query.itype.trim() : '';
  const sourceTabFilter = typeof req.query.sheet === 'string' ? req.query.sheet.trim() : '';
  const imageSprintOnly = req.query.img === '1' || req.query.img === 'true';
  const sortBy = typeof req.query.sort === 'string' && req.query.sort.trim() ? req.query.sort.trim() : 'sku-asc';

  try {
    const { rows, total } = await listWorkspaceCatalogItemsPage({
      offset,
      limit,
      activeFilter,
      category: category || null,
      q: q || null,
      typeFilter: typeFilter || null,
      sourceTabFilter: sourceTabFilter || null,
      imageSprintOnly,
      sortBy,
    });

    if (isSheetsDataBackend() && peekCatalogItemsReadSource() === 'sheets') {
      const tabName = peekResolvedCatalogItemsSheetTab();
      const categoryLower = category.toLowerCase();
      const qLower = q.trim().toLowerCase();
      return res.json({
        data: { items: rows, total, offset, limit },
        meta: {
          catalogItemsReadTable: `GOOGLE_SHEETS:${tabName}`,
          dbDriver: String(process.env.DB_DRIVER || 'sqlite').trim() || 'sqlite',
          catalogBackend: 'sheets',
          emptyUnfiltered: total === 0 && !categoryLower && !qLower,
          emptyHint:
            total === 0
              ? `No rows found in ${tabName} tab (override with GOOGLE_SHEETS_TAB_CATALOG_ITEMS).`
              : null,
        },
      });
    }

    const readTable = getCatalogItemsTableName();
    const hasUserFilters =
      Boolean(category) ||
      Boolean(q) ||
      Boolean(typeFilter) ||
      Boolean(sourceTabFilter) ||
      imageSprintOnly ||
      activeFilter !== 'all';
    const meta = {
      catalogItemsReadTable: readTable,
      dbDriver: String(process.env.DB_DRIVER || 'sqlite').trim() || 'sqlite',
      catalogBackend: isPgCatalogBackend() ? ('postgres' as const) : ('sqlite' as const),
      emptyUnfiltered: total === 0 && !hasUserFilters,
      emptyHint:
        total === 0 && !hasUserFilters
          ? isPgCatalogBackend()
            ? `Read ${readTable} returned 0 rows. In Supabase: confirm rows exist and that CATALOG_ITEMS_TABLE matches your schema (catalog_items vs catalog_items_clean / public prefix).`
            : 'Local catalog_items has 0 rows — seed the DB or run a sheet import when enabled.'
          : null,
    };
    if (catalogDebug()) {
      console.log(
        `[catalog] GET /v1/catalog/items read=${readTable} total=${total} returned=${rows.length} offset=${offset} limit=${limit}`
      );
    }
    return res.json({ data: { items: rows, total, offset, limit }, meta });
  } catch (e) {
    if (handleCatalogSheetsRouteError(res, e)) return;
  }
});

catalogRouter.get('/items/:id', async (req, res) => {
  try {
    const row = await getWorkspaceCatalogItemById(req.params.id);
    if (!row) return res.status(404).json({ error: 'Catalog item not found.' });
    return res.json({ data: row });
  } catch (e) {
    if (handleCatalogSheetsRouteError(res, e)) return;
  }
});

catalogRouter.post('/items/lookup', async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? (req.body.ids as unknown[]).map((x) => String(x ?? '').trim()) : [];
  if (isSheetsDataBackend()) {
    const all = await listWorkspaceCatalogItems(true);
    const idSet = new Set(ids);
    const items = all.filter((item) => idSet.has(item.id));
    return res.json({ data: { items } });
  }
  const items = await listCatalogItemsByIds(ids);
  return res.json({ data: { items } });
});

catalogRouter.get('/vendor-prices', async (req, res) => {
  if (!isSheetsDataBackend()) {
    return res.json({ data: [] });
  }
  try {
    const catalogItemId = typeof req.query.catalogItemId === 'string' ? req.query.catalogItemId.trim() : '';
    const rows = await listCatalogVendorPriceHistoryFromSheets(catalogItemId || null);
    return res.json({ data: rows });
  } catch (e) {
    if (handleCatalogSheetsRouteError(res, e)) return;
  }
});
