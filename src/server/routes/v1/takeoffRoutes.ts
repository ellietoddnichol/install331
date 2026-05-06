import { Router } from 'express';
import {
  bulkMoveTakeoffLinesToRoom,
  createTakeoffLine,
  deleteTakeoffLine,
  duplicateTakeoffLine,
  listTakeoffLines,
  updateTakeoffLine,
} from '../../repos/takeoffRepo.ts';
import { recalculateProjectLinePricing } from '../../repos/modifiersRepo.ts';
import { getProject } from '../../repos/projectsRepo.ts';
import { calculateEstimateSummary } from '../../services/estimateEngineV1.ts';
import { generateInstallReviewEmailDraft } from '../../services/installReviewEmailService.ts';

export const takeoffRouter = Router();

takeoffRouter.get('/lines', async (req, res) => {
  const projectId = String(req.query.projectId ?? '');
  const roomId = req.query.roomId ? String(req.query.roomId) : undefined;
  if (!projectId) {
    return res.status(400).json({ error: 'projectId is required' });
  }

  return res.json({ data: await listTakeoffLines(projectId, roomId) });
});

takeoffRouter.post('/lines', async (req, res) => {
  const projectId = String(req.body?.projectId ?? '');
  const roomId = String(req.body?.roomId ?? '');
  const description = String(req.body?.description ?? '');

  if (!projectId || !roomId || !description) {
    return res.status(400).json({ error: 'projectId, roomId and description are required' });
  }

  const line = await createTakeoffLine(req.body);
  return res.status(201).json({ data: line });
});

takeoffRouter.post('/lines/bulk-move', async (req, res) => {
  const roomId = String(req.body?.roomId ?? '').trim();
  const rawIds = req.body?.lineIds;
  const lineIds = Array.isArray(rawIds) ? rawIds.map((id: unknown) => String(id ?? '').trim()).filter(Boolean) : [];

  if (!roomId || lineIds.length === 0) {
    return res.status(400).json({ error: 'roomId and a non-empty lineIds array are required' });
  }

  const result = await bulkMoveTakeoffLinesToRoom(lineIds, roomId);
  if ('error' in result) {
    return res.status(400).json({ error: result.error });
  }

  return res.json({ data: result.lines });
});

takeoffRouter.put('/lines/:lineId', async (req, res) => {
  const line = await updateTakeoffLine(req.params.lineId, req.body ?? {});
  if (!line) {
    return res.status(404).json({ error: 'Takeoff line not found' });
  }

  return res.json({ data: line });
});

takeoffRouter.delete('/lines/:lineId', async (req, res) => {
  const deleted = await deleteTakeoffLine(req.params.lineId);
  if (!deleted) {
    return res.status(404).json({ error: 'Takeoff line not found' });
  }

  return res.json({ data: { deleted: true } });
});

takeoffRouter.post('/lines/:lineId/duplicate', async (req, res) => {
  const roomId = String(req.body?.roomId ?? '').trim();
  if (!roomId) {
    return res.status(400).json({ error: 'roomId is required' });
  }

  const line = await duplicateTakeoffLine(req.params.lineId, roomId);
  if (!line) {
    return res.status(404).json({ error: 'Takeoff line not found or room is not in this project' });
  }

  return res.status(201).json({ data: line });
});

takeoffRouter.post('/finalize-parser-lines', async (req, res) => {
  const payload = req.body ?? {};
  const lines = Array.isArray(payload.lines) ? payload.lines : [];

  if (!lines.length) {
    return res.status(400).json({ error: 'lines is required' });
  }

  const created = await Promise.all(lines.map((line: any) => createTakeoffLine(line)));
  return res.status(201).json({ data: created });
});

takeoffRouter.post('/reprice/:projectId', async (req, res) => {
  const project = await getProject(req.params.projectId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const updated = await recalculateProjectLinePricing(project.id);
  return res.json({ data: updated });
});

takeoffRouter.get('/summary/:projectId', async (req, res) => {
  const project = await getProject(req.params.projectId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const lines = await listTakeoffLines(project.id);
  return res.json({ data: await calculateEstimateSummary(project, lines) });
});

takeoffRouter.post('/install-review-email/:projectId', async (req, res) => {
  const project = await getProject(req.params.projectId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const lines = await listTakeoffLines(project.id);
  const summary = await calculateEstimateSummary(project, lines);
  const draft = await generateInstallReviewEmailDraft({ project, lines, summary });
  return res.json({ data: draft });
});
