import { Router } from 'express';
import { applyBundleToRoom, createBundle, listBundleItems, listBundles } from '../../repos/bundlesRepo.ts';

export const bundlesRouter = Router();

bundlesRouter.get('/', (_req, res) => {
  return res.json({ data: listBundles() });
});

bundlesRouter.get('/:bundleId/items', (req, res) => {
  return res.json({ data: listBundleItems(req.params.bundleId) });
});

bundlesRouter.post('/', (req, res) => {
  const bundleName = String(req.body?.bundleName ?? '');
  if (!bundleName) {
    return res.status(400).json({ error: 'bundleName is required' });
  }

  const created = createBundle(req.body);
  return res.status(201).json({ data: created });
});

bundlesRouter.post('/:bundleId/apply', (req, res) => {
  const projectId = String(req.body?.projectId ?? '');
  const roomId = String(req.body?.roomId ?? '');
  if (!projectId || !roomId) {
    return res.status(400).json({ error: 'projectId and roomId are required' });
  }

  const applied = applyBundleToRoom({ bundleId: req.params.bundleId, projectId, roomId });
  if (!applied) {
    return res.status(404).json({ error: 'Bundle not found' });
  }

  return res.status(201).json({ data: applied });
});
