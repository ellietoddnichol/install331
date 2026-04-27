import { Router } from 'express';
import { createRoom, deleteRoom, duplicateRoom, getRoom, listRooms, updateRoom } from '../../repos/roomsRepo.ts';
import { createTakeoffLine, listTakeoffLines } from '../../repos/takeoffRepo.ts';

export const roomsRouter = Router();

roomsRouter.get('/', async (req, res) => {
  const projectId = String(req.query.projectId ?? '');
  if (!projectId) {
    return res.status(400).json({ error: 'projectId is required' });
  }

  return res.json({ data: await listRooms(projectId) });
});

roomsRouter.post('/', async (req, res) => {
  const projectId = String(req.body?.projectId ?? '');
  const roomName = String(req.body?.roomName ?? '');
  if (!projectId || !roomName) {
    return res.status(400).json({ error: 'projectId and roomName are required' });
  }

  const room = await createRoom(req.body);
  return res.status(201).json({ data: room });
});

roomsRouter.put('/:roomId', async (req, res) => {
  const room = await updateRoom(req.params.roomId, req.body ?? {});
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }

  return res.json({ data: room });
});

roomsRouter.post('/:roomId/duplicate', async (req, res) => {
  const source = await getRoom(req.params.roomId);
  if (!source) {
    return res.status(404).json({ error: 'Room not found' });
  }

  const room = await duplicateRoom(req.params.roomId);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }

  const sourceLines = await listTakeoffLines(source.projectId, source.id);
  await Promise.all(
    sourceLines.map(async (line) =>
      createTakeoffLine({
        projectId: source.projectId,
        roomId: room.id,
        sourceType: line.sourceType,
        sourceRef: line.sourceRef,
        description: line.description,
        sku: line.sku,
        category: line.category,
        subcategory: line.subcategory,
        baseType: line.baseType,
        qty: line.qty,
        unit: line.unit,
        materialCost: line.materialCost,
        laborMinutes: line.laborMinutes,
        laborCost: line.laborCost,
        pricingSource: line.pricingSource,
        unitSell: line.unitSell,
        notes: line.notes,
        bundleId: line.bundleId,
        catalogItemId: line.catalogItemId,
        variantId: line.variantId,
      })
    )
  );

  return res.status(201).json({ data: room });
});

roomsRouter.delete('/:roomId', async (req, res) => {
  const deleted = await deleteRoom(req.params.roomId);
  if (!deleted) {
    return res.status(404).json({ error: 'Room not found' });
  }

  return res.json({ data: { deleted: true } });
});
