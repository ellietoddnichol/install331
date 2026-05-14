import { Router } from 'express';
import { applyBundleToRoom, createBundle, listBundleItems, listBundles } from '../../repos/bundlesRepo.ts';
import { listBundleItemsFromSheets, listBundlesFromSheets } from '../../repos/sheetsSettingsRepo.ts';
import { isSheetsDataBackend } from '../../repos/dataBackend.ts';

export const bundlesRouter = Router();

bundlesRouter.get('/', async (_req, res) => {
  const data = isSheetsDataBackend() ? await listBundlesFromSheets() : await listBundles();
  return res.json({ data });
});

bundlesRouter.get('/:bundleId/items', async (req, res) => {
  const data = isSheetsDataBackend()
    ? await listBundleItemsFromSheets(req.params.bundleId)
    : await listBundleItems(req.params.bundleId);
  return res.json({ data });
});

bundlesRouter.post('/', async (req, res) => {
  if (isSheetsDataBackend()) {
    return res.status(503).json({ error: 'Bundle creation is not yet supported in sheets mode.' });
  }
  const bundleName = String(req.body?.bundleName ?? '');
  if (!bundleName) {
    return res.status(400).json({ error: 'bundleName is required' });
  }

  const created = await createBundle(req.body);
  return res.status(201).json({ data: created });
});

bundlesRouter.post('/:bundleId/apply', async (req, res) => {
  if (isSheetsDataBackend()) {
    return res.status(503).json({ error: 'Bundle apply is not yet supported in sheets mode.' });
  }
  const projectId = String(req.body?.projectId ?? '');
  const roomId = String(req.body?.roomId ?? '');
  if (!projectId || !roomId) {
    return res.status(400).json({ error: 'projectId and roomId are required' });
  }

  const applied = await applyBundleToRoom({ bundleId: req.params.bundleId, projectId, roomId });
  if (!applied) {
    return res.status(404).json({ error: 'Bundle not found' });
  }

  return res.status(201).json({ data: applied });
});
