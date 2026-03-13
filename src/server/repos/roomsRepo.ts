import { randomUUID } from 'crypto';
import { estimatorDb } from '../db/connection.ts';
import { RoomRecord } from '../../shared/types/estimator.ts';

function mapRoomRow(row: any): RoomRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    roomName: row.room_name,
    sortOrder: row.sort_order,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function listRooms(projectId: string): RoomRecord[] {
  const rows = estimatorDb.prepare('SELECT * FROM rooms_v1 WHERE project_id = ? ORDER BY sort_order, created_at').all(projectId);
  return rows.map(mapRoomRow);
}

export function getRoom(roomId: string): RoomRecord | null {
  const row = estimatorDb.prepare('SELECT * FROM rooms_v1 WHERE id = ?').get(roomId);
  return row ? mapRoomRow(row) : null;
}

export function createRoom(input: Partial<RoomRecord> & { projectId: string; roomName: string }): RoomRecord {
  const now = new Date().toISOString();
  const nextSort = estimatorDb.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS nextSort FROM rooms_v1 WHERE project_id = ?').get(input.projectId) as { nextSort: number };

  const room: RoomRecord = {
    id: input.id ?? randomUUID(),
    projectId: input.projectId,
    roomName: input.roomName,
    sortOrder: input.sortOrder ?? nextSort.nextSort,
    notes: input.notes ?? null,
    createdAt: now,
    updatedAt: now
  };

  estimatorDb.prepare(`
    INSERT INTO rooms_v1 (id, project_id, room_name, sort_order, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(room.id, room.projectId, room.roomName, room.sortOrder, room.notes, room.createdAt, room.updatedAt);

  return room;
}

export function updateRoom(roomId: string, input: Partial<RoomRecord>): RoomRecord | null {
  const existing = getRoom(roomId);
  if (!existing) return null;

  const next: RoomRecord = {
    ...existing,
    ...input,
    id: roomId,
    updatedAt: new Date().toISOString()
  };

  estimatorDb.prepare(`
    UPDATE rooms_v1 SET room_name = ?, sort_order = ?, notes = ?, updated_at = ? WHERE id = ?
  `).run(next.roomName, next.sortOrder, next.notes, next.updatedAt, roomId);

  return next;
}

export function deleteRoom(roomId: string): boolean {
  const result = estimatorDb.prepare('DELETE FROM rooms_v1 WHERE id = ?').run(roomId);
  return result.changes > 0;
}

export function duplicateRoom(roomId: string): RoomRecord | null {
  const source = getRoom(roomId);
  if (!source) return null;

  return createRoom({
    projectId: source.projectId,
    roomName: `${source.roomName} Copy`,
    notes: source.notes
  });
}
