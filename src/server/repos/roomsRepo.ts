import { randomUUID } from 'crypto';
import { getEstimatorDb } from '../db/connection.ts';
import { isPgDriver } from '../db/driver.ts';
import { dbAll, dbGet, dbRun } from '../db/query.ts';
import { RoomRecord } from '../../shared/types/estimator.ts';
import { useNativeSupabaseWorkspace } from '../db/nativeWorkspace.ts';
import * as nativeRooms from './native/nativeRoomsRepo.ts';

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

export async function listRooms(projectId: string): Promise<RoomRecord[]> {
  if (isPgDriver() && useNativeSupabaseWorkspace()) {
    return nativeRooms.listRoomsByProjectNative(projectId);
  }
  const rows = isPgDriver()
    ? await dbAll('SELECT * FROM rooms_v1 WHERE project_id = ? ORDER BY sort_order, created_at', [projectId])
    : getEstimatorDb().prepare('SELECT * FROM rooms_v1 WHERE project_id = ? ORDER BY sort_order, created_at').all(projectId);
  return rows.map(mapRoomRow);
}

export async function getRoom(roomId: string): Promise<RoomRecord | null> {
  if (isPgDriver() && useNativeSupabaseWorkspace()) {
    return nativeRooms.getRoomNative(roomId);
  }
  const row = isPgDriver()
    ? await dbGet('SELECT * FROM rooms_v1 WHERE id = ?', [roomId])
    : getEstimatorDb().prepare('SELECT * FROM rooms_v1 WHERE id = ?').get(roomId);
  return row ? mapRoomRow(row) : null;
}

export async function createRoom(input: Partial<RoomRecord> & { projectId: string; roomName: string }): Promise<RoomRecord> {
  const now = new Date().toISOString();
  const sortRow = isPgDriver() && useNativeSupabaseWorkspace()
    ? { next_sort: await nativeRooms.nextSortOrderNative(input.projectId) }
    : isPgDriver()
      ? await dbGet<{ next_sort: number }>(
          'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort FROM rooms_v1 WHERE project_id = ?',
          [input.projectId]
        )
      : (getEstimatorDb()
          .prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort FROM rooms_v1 WHERE project_id = ?')
          .get(input.projectId) as { next_sort: number } | undefined);

  const room: RoomRecord = {
    id: input.id ?? randomUUID(),
    projectId: input.projectId,
    roomName: input.roomName,
    sortOrder: input.sortOrder ?? sortRow?.next_sort ?? 0,
    notes: input.notes ?? null,
    createdAt: now,
    updatedAt: now,
  };

  if (isPgDriver() && useNativeSupabaseWorkspace()) {
    await nativeRooms.createRoomNative({
      id: room.id,
      projectId: room.projectId,
      roomName: room.roomName,
      sortOrder: room.sortOrder,
    });
  } else if (isPgDriver()) {
    await dbRun(
      `
    INSERT INTO rooms_v1 (id, project_id, room_name, sort_order, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
      [room.id, room.projectId, room.roomName, room.sortOrder, room.notes, room.createdAt, room.updatedAt]
    );
  } else {
    getEstimatorDb()
      .prepare(
        `
    INSERT INTO rooms_v1 (id, project_id, room_name, sort_order, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `
      )
      .run(room.id, room.projectId, room.roomName, room.sortOrder, room.notes, room.createdAt, room.updatedAt);
  }

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

  if (isPgDriver() && useNativeSupabaseWorkspace()) {
    await nativeRooms.updateRoomNative(roomId, next.roomName, next.sortOrder);
  } else if (isPgDriver()) {
    await dbRun(`UPDATE rooms_v1 SET room_name = ?, sort_order = ?, notes = ?, updated_at = ? WHERE id = ?`, [
      next.roomName,
      next.sortOrder,
      next.notes,
      next.updatedAt,
      roomId,
    ]);
  } else {
    getEstimatorDb()
      .prepare(`UPDATE rooms_v1 SET room_name = ?, sort_order = ?, notes = ?, updated_at = ? WHERE id = ?`)
      .run(next.roomName, next.sortOrder, next.notes, next.updatedAt, roomId);
  }

  return next;
}

export async function deleteRoom(roomId: string): Promise<boolean> {
  if (isPgDriver() && useNativeSupabaseWorkspace()) {
    return nativeRooms.deleteRoomNative(roomId);
  }
  const result = isPgDriver()
    ? await dbRun('DELETE FROM rooms_v1 WHERE id = ?', [roomId])
    : getEstimatorDb().prepare('DELETE FROM rooms_v1 WHERE id = ?').run(roomId);
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
