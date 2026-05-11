import { Router } from 'express';
import {
  getCatalogItemById,
  listCatalogItemFacets,
  listCatalogItemsByIds,
  listCatalogItemsPage,
  listDistinctCatalogCategories,
} from '../../repos/catalogRepo.ts';
import { getCatalogItemsTableName } from '../../db/catalogTable.ts';

export const catalogRouter = Router();

const catalogDebug = () => String(process.env.CATALOG_DEBUG || '').trim() === '1';

catalogRouter.get('/categories', async (_req, res) => {
  const data = await listDistinctCatalogCategories();
  return res.json({ data });
});

catalogRouter.get('/facets', async (_req, res) => {
  const data = await listCatalogItemFacets();
  return res.json({ data });
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

  const { rows, total } = await listCatalogItemsPage({
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
  if (catalogDebug()) {
    console.log(
      `[catalog] GET /v1/catalog/items read=${getCatalogItemsTableName()} total=${total} returned=${rows.length} offset=${offset} limit=${limit}`
    );
  }
  return res.json({ data: { items: rows, total, offset, limit } });
});

catalogRouter.get('/items/:id', async (req, res) => {
  const row = await getCatalogItemById(req.params.id);
  if (!row) return res.status(404).json({ error: 'Catalog item not found.' });
  return res.json({ data: row });
});

catalogRouter.post('/items/lookup', async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? (req.body.ids as unknown[]).map((x) => String(x ?? '').trim()) : [];
  const items = await listCatalogItemsByIds(ids);
  return res.json({ data: { items } });
});
