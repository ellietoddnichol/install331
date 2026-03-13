import { randomUUID } from 'crypto';
import { estimatorDb } from '../db/connection.ts';
import { ProjectFileRecord } from '../../shared/types/estimator.ts';

function mapProjectFileRow(row: any): ProjectFileRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
  };
}

export function listProjectFiles(projectId: string): ProjectFileRecord[] {
  const rows = estimatorDb
    .prepare('SELECT id, project_id, file_name, mime_type, size_bytes, created_at FROM project_files_v1 WHERE project_id = ? ORDER BY created_at DESC')
    .all(projectId);
  return rows.map(mapProjectFileRow);
}

export function createProjectFile(input: {
  projectId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  dataBase64: string;
}): ProjectFileRecord {
  const record: ProjectFileRecord = {
    id: randomUUID(),
    projectId: input.projectId,
    fileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    createdAt: new Date().toISOString(),
  };

  estimatorDb
    .prepare(
      `INSERT INTO project_files_v1 (id, project_id, file_name, mime_type, size_bytes, data_base64, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(record.id, record.projectId, record.fileName, record.mimeType, record.sizeBytes, input.dataBase64, record.createdAt);

  return record;
}

export function getProjectFile(projectId: string, fileId: string): (ProjectFileRecord & { dataBase64: string }) | null {
  const row = estimatorDb
    .prepare(
      `SELECT id, project_id, file_name, mime_type, size_bytes, data_base64, created_at
       FROM project_files_v1
       WHERE project_id = ? AND id = ?`
    )
    .get(projectId, fileId) as any;

  if (!row) return null;

  return {
    ...mapProjectFileRow(row),
    dataBase64: row.data_base64,
  };
}

export function deleteProjectFile(projectId: string, fileId: string): boolean {
  const result = estimatorDb
    .prepare('DELETE FROM project_files_v1 WHERE project_id = ? AND id = ?')
    .run(projectId, fileId);
  return result.changes > 0;
}
