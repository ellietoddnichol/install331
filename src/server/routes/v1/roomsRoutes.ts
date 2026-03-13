import { Router } from 'express';
import { createRoom, deleteRoom, duplicateRoom, getRoom, listRooms, updateRoom } from '../../repos/roomsRepo.ts';
import { createTakeoffLine, listTakeoffLines } from '../../repos/takeoffRepo.ts';

export const roomsRouter = Router();

roomsRouter.get('/', (req, res) => {
  const projectId = String(req.query.projectId ?? '');
  if (!projectId) {
    return res.status(400).json({ error: 'projectId is required' });
  }

  return res.json({ data: listRooms(projectId) });
});

roomsRouter.post('/', (req, res) => {
  const projectId = String(req.body?.projectId ?? '');
  const roomName = String(req.body?.roomName ?? '');
  if (!projectId || !roomName) {
    return res.status(400).json({ error: 'projectId and roomName are required' });
  }

  const room = createRoom(req.body);
  return res.status(201).json({ data: room });
});

roomsRouter.put('/:roomId', (req, res) => {
  const room = updateRoom(req.params.roomId, req.body ?? {});
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }

  return res.json({ data: room });
});

roomsRouter.post('/:roomId/duplicate', (req, res) => {
  const source = getRoom(req.params.roomId);
  if (!source) {
    return res.status(404).json({ error: 'Room not found' });
  }

  const room = duplicateRoom(req.params.roomId);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }

  const sourceLines = listTakeoffLines(source.projectId, source.id);
  sourceLines.forEach((line) => {
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
      unitSell: line.unitSell,
      notes: line.notes,
      bundleId: line.bundleId,
      catalogItemId: line.catalogItemId,
      variantId: line.variantId
    });
  });

  return res.status(201).json({ data: room });
});

roomsRouter.delete('/:roomId', (req, res) => {
  const deleted = deleteRoom(req.params.roomId);
  if (!deleted) {
    return res.status(404).json({ error: 'Room not found' });
  }

  return res.json({ data: { deleted: true } });
});
