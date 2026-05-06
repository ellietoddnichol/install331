import { Router } from 'express';
import {
  getCatalogInventoryCounts,
  getCatalogPostCutoverHealth,
  reactivateAllCatalogItems,
} from '../../repos/catalogRepo.ts';
import {
  getCatalogSyncRunRowForCsv,
  getCatalogSyncStatus,
  getSettings,
  listCatalogSyncRuns,
  updateSettings,
} from '../../repos/settingsRepo.ts';
import { intakeLineMemoryKeyFromFields, upsertIntakeCatalogMemory } from '../../repos/intakeCatalogMemoryRepo.ts';
import { recalculateAllLinePricing } from '../../repos/modifiersRepo.ts';
import { backfillTakeoffRegistryToGoogleSheets, resolveConfiguredAndFetchItemsTabs, syncCatalogFromGoogleSheets } from '../../services/googleSheetsCatalogSync.ts';
import { generateProposalDraftFromGemini } from '../../services/geminiProposalDraft.ts';
import { getErrorMessage } from '../../../shared/utils/errorMessage.ts';
import { getDbPersistenceStatusSnapshot, runDbBackupNow } from '../../db/connection.ts';
import { getActiveRemoteDurableKind, getRemoteDurableSqliteObjectMetadata } from '../../db/durableSqliteRemote.ts';
import { getIntegrationHealthSnapshot } from '../../services/integrationHealth.ts';
import { buildCatalogReviewCsv } from '../../services/catalogSyncReviewCsv.ts';
import { isCatalogReviewQueueKey } from '../../../shared/catalogReviewQueues.ts';

export const settingsRouter = Router();

settingsRouter.get('/integration-health', (_req, res) => {
  return res.json({ data: getIntegrationHealthSnapshot() });
});

settingsRouter.get('/', async (_req, res) => {
  return res.json({ data: await getSettings() });
});

settingsRouter.put('/', async (req, res) => {
  const current = await getSettings();
  const next = await updateSettings(req.body ?? {});
  if (current.defaultLaborRatePerHour !== next.defaultLaborRatePerHour) {
    await recalculateAllLinePricing();
  }
  return res.json({ data: next });
});

/** Remember estimator catalog choice for future intake matching (company-wide). */
settingsRouter.post('/intake-catalog-memory', async (req, res) => {
  const catalogItemId = String(req.body?.catalogItemId || '').trim();
  if (!catalogItemId) {
    return res.status(400).json({ error: 'catalogItemId is required.' });
  }
  const memoryKey = intakeLineMemoryKeyFromFields({
    itemCode: req.body?.itemCode,
    itemName: req.body?.itemName,
    description: req.body?.description,
  });
  await upsertIntakeCatalogMemory(memoryKey, catalogItemId);
  return res.json({ data: { ok: true } });
});

settingsRouter.post('/proposal-draft', async (req, res) => {
  try {
    const result = await generateProposalDraftFromGemini(req.body ?? {});
    return res.json({ data: result });
  } catch (error: unknown) {
    const message = getErrorMessage(error, 'Proposal draft generation failed.');
    const status = /missing|not configured/i.test(message) ? 503 : 500;
    return res.status(status).json({ error: message });
  }
});

settingsRouter.get('/catalog-sync-status', async (_req, res) => {
  return res.json({ data: await getCatalogSyncStatus() });
});

settingsRouter.get('/catalog-sync-runs', async (req, res) => {
  const limit = Math.max(1, Math.min(50, Number(req.query.limit || 10)));
  return res.json({ data: await listCatalogSyncRuns(limit) });
});

/**
 * Per-queue workbook-first review export from a sync run (`warnings_json` + optional `run_context_json`).
 * Query: `queue` (required enum), `runId` (optional UUID — defaults to latest run row).
 */
settingsRouter.get('/catalog-sync-review-csv', async (req, res) => {
  const queueRaw = String(req.query.queue ?? '').trim();
  if (!isCatalogReviewQueueKey(queueRaw)) {
    return res.status(400).json({
      error: `Invalid queue. Use one of: duplicate_sku_groups, alias_collisions, labor_outliers, orphan_bundle_skus, unknown_modifiers, orphan_attribute_skus, orphan_alias_skus.`,
    });
  }
  const runIdArg = typeof req.query.runId === 'string' ? req.query.runId.trim() : '';
  const runRow = await getCatalogSyncRunRowForCsv(runIdArg || undefined);
  if (!runRow) {
    res.status(404);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.send('No catalog sync run found for export.');
  }
  const built = buildCatalogReviewCsv({ queue: queueRaw, run: runRow });
  if (!built || built.rowCount === 0) {
    res.status(404);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.send(`No rows for queue "${queueRaw}" on the selected run.`);
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  const safeSlug = `${queueRaw}-${String(runRow.id).slice(0, 8)}`;
  res.setHeader('Content-Disposition', `attachment; filename="catalog-review-${safeSlug}.csv"`);
  return res.send(built.csv);
});

settingsRouter.get('/catalog-inventory', async (_req, res) => {
  return res.json({ data: await getCatalogInventoryCounts() });
});

/** Post–CLEAN_ITEMS cutover: DB forward-facing counts, image gaps, vs last sync (for manual comparison to sheet META audit). */
settingsRouter.get('/catalog-post-cutover-health', async (_req, res) => {
  const { fetch: itemsSourceTab } = resolveConfiguredAndFetchItemsTabs();
  const sync = await getCatalogSyncStatus();
  return res.json({ data: await getCatalogPostCutoverHealth({ itemsSourceTab, lastCatalogSync: sync }) });
});

/** Sets every catalog row to active (e.g. after SQLite import). Sheet sync normally deactivates rows not in the sheet. */
settingsRouter.post('/activate-all-catalog-items', async (_req, res) => {
  const changed = await reactivateAllCatalogItems();
  return res.json({ data: { changed, ...(await getCatalogInventoryCounts()) } });
});

settingsRouter.post('/sync-catalog', async (_req, res) => {
  try {
    const result = await syncCatalogFromGoogleSheets();
    return res.json({ data: result });
  } catch (error: unknown) {
    const message = getErrorMessage(error, 'Catalog sync failed.');
    console.error('[catalog-sync] POST /v1/settings/sync-catalog failed:', message, error);
    return res.status(500).json({ error: message });
  }
});

settingsRouter.post('/backfill-takeoff-registry', async (_req, res) => {
  try {
    const result = await backfillTakeoffRegistryToGoogleSheets();
    return res.json({ data: result });
  } catch (error: unknown) {
    const message = getErrorMessage(error, 'Takeoff registry backfill failed.');
    const status = /missing|not configured/i.test(message) ? 503 : 500;
    return res.status(status).json({ error: message });
  }
});

settingsRouter.get('/persistence-status', async (_req, res) => {
  const status = getDbPersistenceStatusSnapshot();
  const objectMeta = await getRemoteDurableSqliteObjectMetadata();
  return res.json({ data: { ...status, gcsObjectMeta: objectMeta, remoteDurableKind: getActiveRemoteDurableKind() } });
});

settingsRouter.post('/persistence-backup-now', async (_req, res) => {
  const result = await runDbBackupNow();
  const status = getDbPersistenceStatusSnapshot();
  const objectMeta = await getRemoteDurableSqliteObjectMetadata();
  const code = result.ok ? 200 : 503;
  return res.status(code).json({ data: { ok: result.ok, message: result.message, status: { ...status, gcsObjectMeta: objectMeta, remoteDurableKind: getActiveRemoteDurableKind() } } });
});
