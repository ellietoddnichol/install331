import { dbAll, dbGet } from '../../db/query.ts';
import { getPgPool } from '../../db/pgPool.ts';
import { ProjectRecord } from '../../../shared/types/estimator.ts';
import { mapProjectRow } from '../projectsRowMapping.ts';
import { NATIVE_PROJECT_ROW_SELECT } from './nativeProjectSql.ts';

function toNativeStatus(status: string): string {
  const s = String(status || '').trim().toLowerCase();
  if (s === 'archived') return 'archived';
  return 'draft';
}

export async function listProjectsNative(): Promise<ProjectRecord[]> {
  const rows = await dbAll(`${NATIVE_PROJECT_ROW_SELECT} ORDER BY p.updated_at DESC`);
  return rows.map(mapProjectRow);
}

export async function getProjectNative(projectId: string): Promise<ProjectRecord | null> {
  const row = await dbGet(`${NATIVE_PROJECT_ROW_SELECT} WHERE p.id::text = ?`, [projectId]);
  return row ? mapProjectRow(row) : null;
}

export async function insertProjectNative(project: ProjectRecord): Promise<void> {
  const pool = getPgPool();
  await pool.query(
    `INSERT INTO public.projects (id, name, customer_name, project_number, status, address, notes, created_at, updated_at)
     VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9::timestamptz)`,
    [
      project.id,
      project.projectName,
      project.clientName,
      project.projectNumber,
      toNativeStatus(project.status),
      project.address,
      project.notes,
      project.createdAt,
      project.updatedAt,
    ]
  );
}

/** Updates only columns that exist on `public.projects` (extended fields stay in-memory defaults until a JSON/metadata column exists). */
export async function updateProjectNativeCore(projectId: string, next: ProjectRecord): Promise<void> {
  const pool = getPgPool();
  await pool.query(
    `UPDATE public.projects SET
       name = $1,
       customer_name = $2,
       project_number = $3,
       address = $4,
       notes = $5,
       status = $6,
       updated_at = $7::timestamptz
     WHERE id::text = $8`,
    [
      next.projectName,
      next.clientName,
      next.projectNumber,
      next.address,
      next.notes,
      toNativeStatus(next.status),
      next.updatedAt,
      projectId,
    ]
  );
}

export async function archiveProjectNative(projectId: string): Promise<boolean> {
  const pool = getPgPool();
  const r = await pool.query(`UPDATE public.projects SET status = 'archived', updated_at = now() WHERE id::text = $1`, [projectId]);
  return (r.rowCount ?? 0) > 0;
}

export async function deleteProjectNative(projectId: string): Promise<boolean> {
  const pool = getPgPool();
  const r = await pool.query(`DELETE FROM public.projects WHERE id::text = $1`, [projectId]);
  return (r.rowCount ?? 0) > 0;
}
