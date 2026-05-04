import { Router } from 'express';
import { applyBundleToRoom, createBundle, listBundleItems, listBundles } from '../../repos/bundlesRepo.ts';

export const bundlesRouter = Router();

bundlesRouter.get('/', async (_req, res) => {
  return res.json({ data: await listBundles() });
});

bundlesRouter.get('/:bundleId/items', async (req, res) => {
  return res.json({ data: await listBundleItems(req.params.bundleId) });
});

bundlesRouter.post('/', async (req, res) => {
  const bundleName = String(req.body?.bundleName ?? '');
  if (!bundleName) {
    return res.status(400).json({ error: 'bundleName is required' });
  }

  const created = await createBundle(req.body);
  return res.status(201).json({ data: created });
});

bundlesRouter.post('/:bundleId/apply', async (req, res) => {
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
