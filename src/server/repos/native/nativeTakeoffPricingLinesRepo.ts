import { dbAll, dbGet } from '../../db/query.ts';
import { NATIVE_PRICED_TAKEOFF_LINES_SELECT } from './nativeTakeoffPricingSql.ts';

export async function listPricedTakeoffLinesForProject(projectId: string, roomId?: string): Promise<Record<string, unknown>[]> {
  if (roomId) {
    return dbAll(
      `${NATIVE_PRICED_TAKEOFF_LINES_SELECT} WHERE v.project_id::text = ? AND COALESCE(v.area_id::text, pa.id::text) = ? ORDER BY tr.created_at`,
      [projectId, roomId]
    );
  }
  return dbAll(`${NATIVE_PRICED_TAKEOFF_LINES_SELECT} WHERE v.project_id::text = ? ORDER BY tr.created_at`, [projectId]);
}

export async function getPricedTakeoffLine(lineId: string): Promise<Record<string, unknown> | undefined> {
  return dbGet(`${NATIVE_PRICED_TAKEOFF_LINES_SELECT} WHERE v.takeoff_row_id::text = ?`, [lineId]);
}
