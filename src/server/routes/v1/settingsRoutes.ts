import { Router } from 'express';
import { getCatalogSyncStatus, getSettings, listCatalogSyncRuns, updateSettings } from '../../repos/settingsRepo.ts';
import { syncCatalogFromGoogleSheets } from '../../services/googleSheetsCatalogSync.ts';
import { generateProposalDraftFromGemini } from '../../services/geminiProposalDraft.ts';

export const settingsRouter = Router();

settingsRouter.get('/', (_req, res) => {
  return res.json({ data: getSettings() });
});

settingsRouter.put('/', (req, res) => {
  return res.json({ data: updateSettings(req.body ?? {}) });
});

settingsRouter.post('/proposal-draft', async (req, res) => {
  try {
    const result = await generateProposalDraftFromGemini(req.body ?? {});
    return res.json({ data: result });
  } catch (error: any) {
    const message = error.message || 'Proposal draft generation failed.';
    const status = /missing|not configured/i.test(message) ? 503 : 500;
    return res.status(status).json({ error: message });
  }
});

settingsRouter.get('/catalog-sync-status', (_req, res) => {
  return res.json({ data: getCatalogSyncStatus() });
});

settingsRouter.get('/catalog-sync-runs', (req, res) => {
  const limit = Math.max(1, Math.min(50, Number(req.query.limit || 10)));
  return res.json({ data: listCatalogSyncRuns(limit) });
});

settingsRouter.post('/sync-catalog', async (_req, res) => {
  try {
    const result = await syncCatalogFromGoogleSheets();
    return res.json({ data: result });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Catalog sync failed.' });
  }
});
