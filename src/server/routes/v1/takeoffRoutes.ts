import { Router } from 'express';
import { createTakeoffLine, deleteTakeoffLine, listTakeoffLines, updateTakeoffLine } from '../../repos/takeoffRepo.ts';
import { recalculateProjectLinePricing } from '../../repos/modifiersRepo.ts';
import { getProject } from '../../repos/projectsRepo.ts';
import { calculateEstimateSummary } from '../../services/estimateEngineV1.ts';
import { generateInstallReviewEmailDraft } from '../../services/installReviewEmailService.ts';

export const takeoffRouter = Router();

takeoffRouter.get('/lines', (req, res) => {
  const projectId = String(req.query.projectId ?? '');
  const roomId = req.query.roomId ? String(req.query.roomId) : undefined;
  if (!projectId) {
    return res.status(400).json({ error: 'projectId is required' });
  }

  return res.json({ data: listTakeoffLines(projectId, roomId) });
});

takeoffRouter.post('/lines', (req, res) => {
  const projectId = String(req.body?.projectId ?? '');
  const roomId = String(req.body?.roomId ?? '');
  const description = String(req.body?.description ?? '');

  if (!projectId || !roomId || !description) {
    return res.status(400).json({ error: 'projectId, roomId and description are required' });
  }

  const line = createTakeoffLine(req.body);
  return res.status(201).json({ data: line });
});

takeoffRouter.put('/lines/:lineId', (req, res) => {
  const line = updateTakeoffLine(req.params.lineId, req.body ?? {});
  if (!line) {
    return res.status(404).json({ error: 'Takeoff line not found' });
  }

  return res.json({ data: line });
});

takeoffRouter.delete('/lines/:lineId', (req, res) => {
  const deleted = deleteTakeoffLine(req.params.lineId);
  if (!deleted) {
    return res.status(404).json({ error: 'Takeoff line not found' });
  }

  return res.json({ data: { deleted: true } });
});

takeoffRouter.post('/finalize-parser-lines', (req, res) => {
  const payload = req.body ?? {};
  const lines = Array.isArray(payload.lines) ? payload.lines : [];

  if (!lines.length) {
    return res.status(400).json({ error: 'lines is required' });
  }

  const created = lines.map((line: any) => createTakeoffLine(line));
  return res.status(201).json({ data: created });
});

takeoffRouter.post('/reprice/:projectId', (req, res) => {
  const project = getProject(req.params.projectId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const updated = recalculateProjectLinePricing(project.id);
  return res.json({ data: updated });
});

takeoffRouter.get('/summary/:projectId', (req, res) => {
  const project = getProject(req.params.projectId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const lines = listTakeoffLines(project.id);
  return res.json({ data: calculateEstimateSummary(project, lines) });
});

takeoffRouter.post('/install-review-email/:projectId', async (req, res) => {
  const project = getProject(req.params.projectId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const lines = listTakeoffLines(project.id);
  const summary = calculateEstimateSummary(project, lines);
  const draft = await generateInstallReviewEmailDraft({ project, lines, summary });
  return res.json({ data: draft });
});
