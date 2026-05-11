import { dbAll, dbGet, dbRun } from '../../db/query.ts';
import { getPgPool } from '../../db/pgPool.ts';
import { RoomRecord } from '../../../shared/types/estimator.ts';
import { NATIVE_ROOM_ROW_SELECT } from './nativeProjectSql.ts';

function mapRoomRow(row: any): RoomRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    roomName: row.room_name,
    sortOrder: Number(row.sort_order ?? 0),
    notes: row.notes ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listRoomsByProjectNative(projectId: string): Promise<RoomRecord[]> {
  const rows = await dbAll(`${NATIVE_ROOM_ROW_SELECT} WHERE pa.project_id::text = ? ORDER BY pa.sort_order, pa.created_at`, [projectId]);
  return rows.map(mapRoomRow);
}

export async function getRoomNative(roomId: string): Promise<RoomRecord | null> {
  const row = await dbGet(`${NATIVE_ROOM_ROW_SELECT} WHERE pa.id::text = ?`, [roomId]);
  return row ? mapRoomRow(row) : null;
}

export async function createRoomNative(input: { id: string; projectId: string; roomName: string; sortOrder: number }): Promise<void> {
  const pool = getPgPool();
  await pool.query(
    `INSERT INTO public.project_areas (id, project_id, name, sort_order, created_at)
     VALUES ($1::uuid, $2::uuid, $3, $4, now())`,
    [input.id, input.projectId, input.roomName, input.sortOrder]
  );
}

export async function updateRoomNative(roomId: string, roomName: string, sortOrder: number): Promise<void> {
  const pool = getPgPool();
  await pool.query(`UPDATE public.project_areas SET name = $1, sort_order = $2 WHERE id::text = $3`, [roomName, sortOrder, roomId]);
}

export async function deleteRoomNative(roomId: string): Promise<boolean> {
  const pool = getPgPool();
  const r = await pool.query(`DELETE FROM public.project_areas WHERE id::text = $1`, [roomId]);
  return (r.rowCount ?? 0) > 0;
}

export async function nextSortOrderNative(projectId: string): Promise<number> {
  const row = await dbGet<{ next_sort: number }>(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort FROM public.project_areas WHERE project_id::text = ?',
    [projectId]
  );
  return Number(row?.next_sort ?? 0);
}
