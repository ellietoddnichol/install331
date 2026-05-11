import { Router, type NextFunction, type Request, type Response } from 'express';
import { isPgDriver } from '../../db/driver.ts';
import { useNativeSupabaseWorkspace } from '../../db/nativeWorkspace.ts';
import { getErrorMessage } from '../../../shared/utils/errorMessage.ts';
import * as pipeline from '../../repos/native/nativeEstimatorPipelineRepo.ts';
import * as rpc from '../../repos/native/nativePgEstimatorRpc.ts';
import { dbCatalogAll } from '../../db/query.ts';
import { getCatalogItemsTableName } from '../../db/catalogTable.ts';
import { getProject } from '../../repos/projectsRepo.ts';
import { buildNativeProposalPreview } from '../../services/nativeProposalPreviewService.ts';

export const pipelineRouter = Router();

function requireNativePipeline(_req: Request, res: Response, next: NextFunction) {
  if (!isPgDriver() || !useNativeSupabaseWorkspace()) {
    return res.status(400).json({
      error:
        'Native Supabase pipeline is only available when DB_DRIVER=pg and WORKSPACE_USE_LEGACY_V1 is not set. See .env.example.',
    });
  }
  next();
}

pipelineRouter.use(requireNativePipeline);

pipelineRouter.get('/capabilities', (_req, res) => {
  res.json({ data: { nativeWorkspace: true, pg: true } });
});

/**
 * Proposal tab (native): `v_estimate_lines_customer` + `v_estimate_summary` via
 * `buildNativeProposalPreview` — no ad hoc SQL in the client.
 */
pipelineRouter.get('/projects/:projectId/proposal-preview', async (req, res, next) => {
  try {
    const estimateId = String(req.query.estimateId || '').trim();
    if (!estimateId) {
      return res.status(400).json({ error: 'estimateId query parameter is required' });
    }
    const project = await getProject(req.params.projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const payload = await buildNativeProposalPreview(project, estimateId);
    res.json({ data: payload });
  } catch (e) {
    next(e);
  }
});

pipelineRouter.get('/projects/:projectId/takeoff-uploads', async (req, res, next) => {
  try {
    const rows = await pipeline.listTakeoffUploadsForProject(req.params.projectId);
    res.json({ data: rows });
  } catch (e) {
    next(e);
  }
});

pipelineRouter.get('/projects/:projectId/estimates', async (req, res, next) => {
  try {
    const rows = await pipeline.listEstimatesForProject(req.params.projectId);
    res.json({ data: rows });
  } catch (e) {
    next(e);
  }
});

pipelineRouter.post('/takeoff-uploads/:takeoffUploadId/process-matches', async (req, res, next) => {
  try {
    await rpc.rpcProcessTakeoffUploadMatches(req.params.takeoffUploadId);
    res.json({ data: { ok: true } });
  } catch (e) {
    next(e);
  }
});

pipelineRouter.get('/takeoff-uploads/:takeoffUploadId/review-queue', async (req, res, next) => {
  try {
    const [reviewQueue, autoMatched] = await Promise.all([
      pipeline.listMatchReviewQueue(req.params.takeoffUploadId),
      pipeline.listRecentlyAutoMatched(req.params.takeoffUploadId),
    ]);
    res.json({ data: { reviewQueue, autoMatched } });
  } catch (e) {
    next(e);
  }
});

pipelineRouter.get('/takeoff-uploads/:takeoffUploadId/best-actions', async (req, res, next) => {
  try {
    const rows = await pipeline.listBestMatchActions(req.params.takeoffUploadId);
    res.json({ data: rows });
  } catch (e) {
    next(e);
  }
});

pipelineRouter.post('/takeoff-rows/:takeoffRowId/accept-match', async (req, res, next) => {
  try {
    const catalogItemId = String(req.body?.catalogItemId || '').trim();
    const isReplace = Boolean(req.body?.isReplace);
    const confidence = Number(req.body?.confidence ?? 1);
    if (!catalogItemId) return res.status(400).json({ error: 'catalogItemId is required' });
    await rpc.rpcAppAcceptMatch(req.params.takeoffRowId, catalogItemId, isReplace, confidence);
    res.json({ data: { ok: true } });
  } catch (e) {
    next(e);
  }
});

pipelineRouter.post('/takeoff-rows/:takeoffRowId/reject-match', async (req, res, next) => {
  try {
    const catalogItemId = String(req.body?.catalogItemId || '').trim();
    const reasonCode = String(req.body?.reasonCode || 'rejected').trim() || 'rejected';
    if (!catalogItemId) return res.status(400).json({ error: 'catalogItemId is required' });
    await rpc.rpcAppRejectMatch(req.params.takeoffRowId, catalogItemId, reasonCode);
    res.json({ data: { ok: true } });
  } catch (e) {
    next(e);
  }
});

pipelineRouter.post('/takeoff-rows/:takeoffRowId/clear-match', async (req, res, next) => {
  try {
    await rpc.rpcAppClearMatch(req.params.takeoffRowId);
    res.json({ data: { ok: true } });
  } catch (e) {
    next(e);
  }
});

pipelineRouter.post('/estimates/:estimateId/build-from-upload', async (req, res, next) => {
  try {
    const takeoffUploadId = String(req.body?.takeoffUploadId || '').trim();
    const laborRate = Number(req.body?.laborRate ?? req.body?.labor_rate);
    const locationCode = String(req.body?.locationCode ?? req.body?.location_code ?? 'DEFAULT').trim() || 'DEFAULT';
    const overwriteExisting = Boolean(req.body?.overwriteExisting ?? req.body?.overwrite_existing);
    if (!takeoffUploadId) return res.status(400).json({ error: 'takeoffUploadId is required' });
    if (!Number.isFinite(laborRate) || laborRate <= 0) return res.status(400).json({ error: 'laborRate must be a positive number' });
    await rpc.rpcBuildEstimateFromTakeoffUpload(req.params.estimateId, takeoffUploadId, laborRate, locationCode, overwriteExisting);
    res.json({ data: { ok: true } });
  } catch (e) {
    next(e);
  }
});

pipelineRouter.get('/estimates/:estimateId/lines-detailed', async (req, res, next) => {
  try {
    const rows = await pipeline.queryEstimateLinesDetailed(req.params.estimateId);
    res.json({ data: rows });
  } catch (e) {
    next(e);
  }
});

pipelineRouter.get('/estimates/:estimateId/summary', async (req, res, next) => {
  try {
    const row = await pipeline.queryEstimateSummary(req.params.estimateId);
    res.json({ data: row });
  } catch (e) {
    next(e);
  }
});

pipelineRouter.get('/estimates/:estimateId/category-totals', async (req, res, next) => {
  try {
    const rows = await pipeline.queryEstimateCategoryTotals(req.params.estimateId);
    res.json({ data: rows });
  } catch (e) {
    next(e);
  }
});

pipelineRouter.get('/estimates/:estimateId/line-rollups', async (req, res, next) => {
  try {
    const rows = await pipeline.queryEstimateLineRollups(req.params.estimateId);
    res.json({ data: rows });
  } catch (e) {
    next(e);
  }
});

pipelineRouter.get('/estimates/:estimateId/readiness', async (req, res, next) => {
  try {
    const row = await pipeline.queryEstimateReadiness(req.params.estimateId);
    res.json({ data: row });
  } catch (e) {
    next(e);
  }
});

pipelineRouter.get('/estimates/:estimateId/lines-customer', async (req, res, next) => {
  try {
    const rows = await pipeline.queryEstimateLinesCustomer(req.params.estimateId);
    res.json({ data: rows });
  } catch (e) {
    next(e);
  }
});

pipelineRouter.post('/estimates/:estimateId/refresh-variance', async (req, res, next) => {
  try {
    await rpc.rpcRefreshEstimateVarianceGroups(req.params.estimateId);
    res.json({ data: { ok: true } });
  } catch (e) {
    next(e);
  }
});

pipelineRouter.post('/estimates/:estimateId/seed-proposal-sections', async (req, res, next) => {
  try {
    await rpc.rpcSeedProposalSectionsForEstimate(req.params.estimateId);
    res.json({ data: { ok: true } });
  } catch (e) {
    next(e);
  }
});

pipelineRouter.get('/catalog-search', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ data: [] });
    const like = `%${q.replace(/%/g, '').replace(/_/g, '')}%`;
    const itemsTable = getCatalogItemsTableName();
    const rows = await dbCatalogAll(
      `SELECT ci.id::text AS id,
         ci.sku,
         ci.manufacturer,
         ci.model,
         ci.category,
         ci.subcategory,
         ci.description
       FROM ${itemsTable} ci
       LEFT JOIN public.catalog_aliases ca ON ca.catalog_item_id = ci.id
       WHERE (ci.active IS NULL OR ci.active = true OR ci.active = 1)
         AND (
           lower(ci.sku) LIKE lower(?)
           OR lower(ci.description) LIKE lower(?)
           OR lower(COALESCE(ca.alias_text, '')) LIKE lower(?)
         )
       GROUP BY ci.id, ci.sku, ci.manufacturer, ci.model, ci.category, ci.subcategory, ci.description
       LIMIT 40`,
      [like, like, like]
    );
    res.json({ data: rows });
  } catch (e) {
    next(e);
  }
});

pipelineRouter.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  res.status(500).json({ error: getErrorMessage(err, 'Pipeline request failed.') });
});
