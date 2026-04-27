import { randomUUID } from 'crypto';
import { isPgDriver } from '../db/driver.ts';
import { dbAll, dbGet, dbRun } from '../db/query.ts';
import { getProjectFilesBucket, getServiceSupabase, isSupabaseStorageConfigured } from '../supabase/serviceClient.ts';
import { ProjectFileRecord } from '../../shared/types/estimator.ts';

type ProjectFileDbRow = {
  id: string;
  project_id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  data_base64?: string | null;
  storage_object_key?: string | null;
  created_at: string;
};

function mapProjectFileRow(row: ProjectFileDbRow): ProjectFileRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
  };
}

export async function listProjectFiles(projectId: string): Promise<ProjectFileRecord[]> {
  const rows = await dbAll(
    'SELECT id, project_id, file_name, mime_type, size_bytes, created_at FROM project_files_v1 WHERE project_id = ? ORDER BY created_at DESC',
    [projectId]
  );
  return (rows as ProjectFileDbRow[]).map(mapProjectFileRow);
}

export async function createProjectFile(input: {
  projectId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  dataBase64: string;
}): Promise<ProjectFileRecord> {
  const record: ProjectFileRecord = {
    id: randomUUID(),
    projectId: input.projectId,
    fileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    createdAt: new Date().toISOString(),
  };

  const useStorage = isPgDriver() && isSupabaseStorageConfigured();
  if (useStorage) {
    const bucket = getProjectFilesBucket();
    const objectKey = `${input.projectId}/${record.id}`;
    const bytes = Buffer.from(input.dataBase64, 'base64');
    const supabase = getServiceSupabase();
    const { error } = await supabase.storage.from(bucket).upload(objectKey, bytes, {
      contentType: input.mimeType,
      upsert: true,
    });
    if (error) {
      throw new Error(`Supabase storage upload failed: ${error.message}`);
    }
    await dbRun(
      `INSERT INTO project_files_v1 (id, project_id, file_name, mime_type, size_bytes, data_base64, storage_object_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [record.id, record.projectId, record.fileName, record.mimeType, record.sizeBytes, null, objectKey, record.createdAt]
    );
  } else {
    await dbRun(
      `INSERT INTO project_files_v1 (id, project_id, file_name, mime_type, size_bytes, data_base64, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [record.id, record.projectId, record.fileName, record.mimeType, record.sizeBytes, input.dataBase64, record.createdAt]
    );
  }

  return record;
}

export async function getProjectFile(
  projectId: string,
  fileId: string
): Promise<(ProjectFileRecord & { dataBase64: string }) | null> {
  const row = (await dbGet(
    `SELECT id, project_id, file_name, mime_type, size_bytes, data_base64, storage_object_key, created_at
       FROM project_files_v1
       WHERE project_id = ? AND id = ?`,
    [projectId, fileId]
  )) as ProjectFileDbRow | undefined;

  if (!row) return null;

  let dataBase64 = String(row.data_base64 ?? '');
  const storageKey = row.storage_object_key ? String(row.storage_object_key) : '';
  if (storageKey && isSupabaseStorageConfigured()) {
    const supabase = getServiceSupabase();
    const bucket = getProjectFilesBucket();
    const { data, error } = await supabase.storage.from(bucket).download(storageKey);
    if (error) {
      throw new Error(`Supabase storage download failed: ${error.message}`);
    }
    const buf = Buffer.from(await data.arrayBuffer());
    dataBase64 = buf.toString('base64');
  }

  return {
    ...mapProjectFileRow(row),
    dataBase64,
  };
}

export async function deleteProjectFile(projectId: string, fileId: string): Promise<boolean> {
  const row = (await dbGet(
    'SELECT storage_object_key FROM project_files_v1 WHERE project_id = ? AND id = ?',
    [projectId, fileId]
  )) as { storage_object_key?: string | null } | undefined;

  const storageKey = row?.storage_object_key ? String(row.storage_object_key) : '';
  if (storageKey && isSupabaseStorageConfigured()) {
    const supabase = getServiceSupabase();
    const bucket = getProjectFilesBucket();
    await supabase.storage.from(bucket).remove([storageKey]);
  }

  const result = await dbRun('DELETE FROM project_files_v1 WHERE project_id = ? AND id = ?', [projectId, fileId]);
  return result.changes > 0;
}
