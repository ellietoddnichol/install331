import { randomUUID } from 'crypto';
import { dbAll, dbGet, dbRun } from '../db/query.ts';
import { RoomRecord } from '../../shared/types/estimator.ts';

function mapRoomRow(row: any): RoomRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    roomName: row.room_name,
    sortOrder: row.sort_order,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listRooms(projectId: string): Promise<RoomRecord[]> {
  const rows = await dbAll('SELECT * FROM rooms_v1 WHERE project_id = ? ORDER BY sort_order, created_at', [projectId]);
  return rows.map(mapRoomRow);
}

export async function getRoom(roomId: string): Promise<RoomRecord | null> {
  const row = await dbGet('SELECT * FROM rooms_v1 WHERE id = ?', [roomId]);
  return row ? mapRoomRow(row) : null;
}

export async function createRoom(input: Partial<RoomRecord> & { projectId: string; roomName: string }): Promise<RoomRecord> {
  const now = new Date().toISOString();
  const nextSort = (await dbGet('SELECT COALESCE(MAX(sort_order), -1) + 1 AS nextSort FROM rooms_v1 WHERE project_id = ?', [
    input.projectId,
  ])) as { nextSort: number } | undefined;

  const room: RoomRecord = {
    id: input.id ?? randomUUID(),
    projectId: input.projectId,
    roomName: input.roomName,
    sortOrder: input.sortOrder ?? Number(nextSort?.nextSort ?? 0),
    notes: input.notes ?? null,
    createdAt: now,
    updatedAt: now,
  };

  await dbRun(
    `
    INSERT INTO rooms_v1 (id, project_id, room_name, sort_order, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
    [room.id, room.projectId, room.roomName, room.sortOrder, room.notes, room.createdAt, room.updatedAt]
  );

  return room;
}

export async function updateRoom(roomId: string, input: Partial<RoomRecord>): Promise<RoomRecord | null> {
  const existing = await getRoom(roomId);
  if (!existing) return null;

  const next: RoomRecord = {
    ...existing,
    ...input,
    id: roomId,
    updatedAt: new Date().toISOString(),
  };

  await dbRun(
    `
    UPDATE rooms_v1 SET room_name = ?, sort_order = ?, notes = ?, updated_at = ? WHERE id = ?
  `,
    [next.roomName, next.sortOrder, next.notes, next.updatedAt, roomId]
  );

  return next;
}

export async function deleteRoom(roomId: string): Promise<boolean> {
  const result = await dbRun('DELETE FROM rooms_v1 WHERE id = ?', [roomId]);
  return result.changes > 0;
}

export async function duplicateRoom(roomId: string): Promise<RoomRecord | null> {
  const source = await getRoom(roomId);
  if (!source) return null;

  return createRoom({
    projectId: source.projectId,
    roomName: `${source.roomName} Copy`,
    notes: source.notes,
  });
}
