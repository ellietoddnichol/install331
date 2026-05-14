import { Router } from 'express';
import { applyModifierToLine, listLineModifiers, listModifiers, removeLineModifier } from '../../repos/modifiersRepo.ts';
import { listModifiersFromSheets } from '../../repos/sheetsSettingsRepo.ts';
import { isSheetsDataBackend } from '../../repos/dataBackend.ts';

export const modifiersRouter = Router();

modifiersRouter.get('/', async (_req, res) => {
  const data = isSheetsDataBackend() ? await listModifiersFromSheets() : await listModifiers();
  return res.json({ data });
});

modifiersRouter.get('/line/:lineId', async (req, res) => {
  if (isSheetsDataBackend()) {
    return res.json({ data: [] });
  }
  return res.json({ data: await listLineModifiers(req.params.lineId) });
});

modifiersRouter.post('/line/:lineId/apply', async (req, res) => {
  if (isSheetsDataBackend()) {
    return res.status(503).json({ error: 'Line-level modifier application is not yet supported in sheets mode.' });
  }
  const modifierId = String(req.body?.modifierId ?? '');
  if (!modifierId) {
    return res.status(400).json({ error: 'modifierId is required' });
  }

  const result = await applyModifierToLine(req.params.lineId, modifierId);
  if (!result) {
    return res.status(404).json({ error: 'Line or modifier not found' });
  }

  return res.status(201).json({ data: result });
});

modifiersRouter.delete('/line/:lineId/:lineModifierId', async (req, res) => {
  if (isSheetsDataBackend()) {
    return res.status(503).json({ error: 'Line-level modifier removal is not yet supported in sheets mode.' });
  }
  const result = await removeLineModifier(req.params.lineId, req.params.lineModifierId);
  if (!result) {
    return res.status(404).json({ error: 'Line or modifier record not found' });
  }

  return res.json({ data: result });
});
