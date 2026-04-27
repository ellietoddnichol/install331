import { Router } from 'express';
import { archiveProject, createProject, deleteProject, getProject, listProjects, suggestPeerIntakeDefaults, updateProject } from '../../repos/projectsRepo.ts';
import { createProjectFile, deleteProjectFile, getProjectFile, listProjectFiles } from '../../repos/projectFilesRepo.ts';
import { suggestAddresses } from '../../services/addressSuggestService.ts';
import { calculateDistanceMiles } from '../../services/distanceService.ts';

export const projectsRouter = Router();

projectsRouter.get('/address-suggest', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 3) {
    return res.json({ data: { suggestions: [] as { label: string }[] } });
  }
  try {
    const suggestions = await suggestAddresses(q);
    return res.json({ data: { suggestions } });
  } catch {
    return res.status(502).json({ error: 'Address suggestions unavailable' });
  }
});

projectsRouter.get('/distance', async (req, res) => {
  const address = String(req.query.address || '').trim();
  const originAddress = String(req.query.originAddress || '').trim();
  if (!address) {
    return res.status(400).json({ error: 'address is required' });
  }
  const miles = await calculateDistanceMiles(address, originAddress || undefined);
  return res.json({ data: { miles } });
});

projectsRouter.get('/', async (_req, res) => {
  res.json({ data: await listProjects() });
});

projectsRouter.get('/peer-intake-defaults', async (req, res) => {
  const clientName = String(req.query.clientName || '').trim() || null;
  const generalContractor = String(req.query.generalContractor || '').trim() || null;
  const excludeProjectId = String(req.query.excludeProjectId || '').trim() || null;
  const data = await suggestPeerIntakeDefaults({ clientName, generalContractor, excludeProjectId });
  return res.json({ data });
});

projectsRouter.get('/:projectId', async (req, res) => {
  const project = await getProject(req.params.projectId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  return res.json({ data: project });
});

projectsRouter.post('/', async (req, res) => {
  const project = await createProject(req.body ?? {});
  return res.status(201).json({ data: project });
});

projectsRouter.put('/:projectId', async (req, res) => {
  const project = await updateProject(req.params.projectId, req.body ?? {});
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  return res.json({ data: project });
});

projectsRouter.delete('/:projectId', async (req, res) => {
  if (String(req.query.permanent || '') === 'true') {
    const deleted = await deleteProject(req.params.projectId);
    if (!deleted) {
      return res.status(404).json({ error: 'Project not found' });
    }

    return res.json({ data: { deleted: true } });
  }

  const archived = await archiveProject(req.params.projectId);
  if (!archived) {
    return res.status(404).json({ error: 'Project not found' });
  }

  return res.json({ data: { archived: true } });
});

projectsRouter.get('/:projectId/files', async (req, res) => {
  const project = await getProject(req.params.projectId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  return res.json({ data: await listProjectFiles(req.params.projectId) });
});

projectsRouter.post('/:projectId/files', async (req, res) => {
  const project = await getProject(req.params.projectId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const fileName = String(req.body?.fileName || '').trim();
  const mimeType = String(req.body?.mimeType || 'application/octet-stream').trim() || 'application/octet-stream';
  const dataBase64 = String(req.body?.dataBase64 || '').trim();
  const sizeBytes = Number(req.body?.sizeBytes || 0);

  if (!fileName || !dataBase64 || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return res.status(400).json({ error: 'Missing file payload.' });
  }

  if (sizeBytes > 10 * 1024 * 1024) {
    return res.status(400).json({ error: 'File too large. Maximum size is 10 MB.' });
  }

  try {
    const created = await createProjectFile({
      projectId: req.params.projectId,
      fileName,
      mimeType,
      sizeBytes,
      dataBase64,
    });
    return res.status(201).json({ data: created });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: message });
  }
});

projectsRouter.get('/:projectId/files/:fileId/download', async (req, res) => {
  try {
    const file = await getProjectFile(req.params.projectId, req.params.fileId);
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    const data = Buffer.from(file.dataBase64, 'base64');
    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.fileName)}"`);
    return res.send(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: message });
  }
});

projectsRouter.delete('/:projectId/files/:fileId', async (req, res) => {
  const deleted = await deleteProjectFile(req.params.projectId, req.params.fileId);
  if (!deleted) {
    return res.status(404).json({ error: 'File not found' });
  }

  return res.json({ data: { deleted: true } });
});
