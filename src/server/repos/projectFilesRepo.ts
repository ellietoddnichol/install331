import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { isPgDriver } from '../db/driver.ts';
import { dbAll, dbGet, dbRun } from '../db/query.ts';
import { getProjectFilesBucket, getServiceSupabase, isSupabaseStorageConfigured } from '../supabase/serviceClient.ts';
import { ProjectFileRecord } from '../../shared/types/estimator.ts';
import {
  buildProjectFileObjectName,
  deleteProjectFileFromGcs,
  downloadProjectFileFromGcs,
  getGcsProjectFilesBucketName,
  isGcsProjectFilesEnabled,
  uploadProjectFileToGcs,
} from '../services/gcsProjectFilesStorage.ts';

export type ProjectFileStoredRow = ProjectFileRecord & {
  dataBase64: string;
  gcsBucket: string | null;
  gcsObjectName: string | null;
};

const LOCAL_DISK_PREFIX = 'local:';
const GCS_STORAGE_PREFIX = 'gcs:';

function projectFilesStorageMode(): string {
  return String(process.env.PROJECT_FILES_STORAGE || '').trim().toLowerCase();
}

function useLocalDiskForProjectFiles(): boolean {
  return !isPgDriver() && projectFilesStorageMode() === 'disk';
}

/** Google Cloud Storage (recommended for Cloud Run / Sheets-first MVP). */
function useGcsForProjectFiles(): boolean {
  const mode = projectFilesStorageMode();
  if (mode === 'gcs') {
    if (!isGcsProjectFilesEnabled()) {
      throw new Error(
        'PROJECT_FILES_STORAGE=gcs requires GCS_PROJECT_FILES_BUCKET and Google service account credentials (GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY or GOOGLE_SERVICE_ACCOUNT_FILE).'
      );
    }
    return true;
  }
  if (mode === 'disk' || mode === 'inline' || mode === 'sqlite' || mode === 'supabase') return false;
  return isGcsProjectFilesEnabled();
}

function useSupabaseForProjectFiles(): boolean {
  if (useGcsForProjectFiles() || useLocalDiskForProjectFiles()) return false;
  const mode = projectFilesStorageMode();
  if (mode === 'supabase') return isSupabaseStorageConfigured();
  return isPgDriver() && isSupabaseStorageConfigured();
}

function projectFilesDiskRoot(): string {
  const raw = String(process.env.PROJECT_FILES_DIR || path.join('data', 'project-files')).trim();
  return path.isAbsolute(raw) ? raw : path.join(process.cwd(), raw);
}

type ProjectFileDbRow = {
  id: string;
  project_id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  data_base64?: string | null;
  storage_object_key?: string | null;
  gcs_bucket?: string | null;
  gcs_object?: string | null;
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

  if (useLocalDiskForProjectFiles()) {
    const root = projectFilesDiskRoot();
    const dir = path.join(root, input.projectId);
    fs.mkdirSync(dir, { recursive: true });
    const rel = path.join(input.projectId, record.id);
    const fullPath = path.join(root, rel);
    const bytes = Buffer.from(input.dataBase64, 'base64');
    fs.writeFileSync(fullPath, bytes);
    const storageKey = `${LOCAL_DISK_PREFIX}${fullPath}`;
    await dbRun(
      `INSERT INTO project_files_v1 (id, project_id, file_name, mime_type, size_bytes, data_base64, storage_object_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [record.id, record.projectId, record.fileName, record.mimeType, record.sizeBytes, null, storageKey, record.createdAt]
    );
  } else if (useGcsForProjectFiles()) {
    const bucket = getGcsProjectFilesBucketName() as string;
    const objectName = buildProjectFileObjectName(input.projectId, record.id, input.fileName);
    const bytes = Buffer.from(input.dataBase64, 'base64');
    await uploadProjectFileToGcs({
      bucket,
      objectName,
      buffer: bytes,
      contentType: input.mimeType,
    });
    await dbRun(
      `INSERT INTO project_files_v1 (id, project_id, file_name, mime_type, size_bytes, data_base64, storage_object_key, gcs_bucket, gcs_object, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.id,
        record.projectId,
        record.fileName,
        record.mimeType,
        record.sizeBytes,
        null,
        `${GCS_STORAGE_PREFIX}${objectName}`,
        bucket,
        objectName,
        record.createdAt,
      ]
    );
  } else if (useSupabaseForProjectFiles()) {
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
    `SELECT id, project_id, file_name, mime_type, size_bytes, data_base64, storage_object_key, gcs_bucket, gcs_object, created_at
       FROM project_files_v1
       WHERE project_id = ? AND id = ?`,
    [projectId, fileId]
  )) as ProjectFileDbRow | undefined;

  if (!row) return null;

  let dataBase64 = String(row.data_base64 ?? '');
  const gcsBucket = row.gcs_bucket ? String(row.gcs_bucket) : '';
  const gcsObject = row.gcs_object ? String(row.gcs_object) : '';
  if (gcsBucket && gcsObject) {
    const buf = await downloadProjectFileFromGcs(gcsBucket, gcsObject);
    dataBase64 = buf.toString('base64');
  }

  const storageKey = row.storage_object_key ? String(row.storage_object_key) : '';
  if (!dataBase64 && storageKey.startsWith(LOCAL_DISK_PREFIX)) {
    const fullPath = storageKey.slice(LOCAL_DISK_PREFIX.length);
    if (fs.existsSync(fullPath)) {
      dataBase64 = fs.readFileSync(fullPath).toString('base64');
    } else {
      dataBase64 = '';
    }
  } else if (!dataBase64 && storageKey.startsWith(GCS_STORAGE_PREFIX)) {
    const objectName = storageKey.slice(GCS_STORAGE_PREFIX.length);
    const bucket = gcsBucket || getGcsProjectFilesBucketName();
    if (bucket && objectName) {
      const buf = await downloadProjectFileFromGcs(bucket, objectName);
      dataBase64 = buf.toString('base64');
    }
  } else if (!dataBase64 && storageKey && isSupabaseStorageConfigured()) {
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
    'SELECT storage_object_key, gcs_bucket, gcs_object FROM project_files_v1 WHERE project_id = ? AND id = ?',
    [projectId, fileId]
  )) as { storage_object_key?: string | null; gcs_bucket?: string | null; gcs_object?: string | null } | undefined;

  const gcsBucket = row?.gcs_bucket ? String(row.gcs_bucket) : '';
  const gcsObject = row?.gcs_object ? String(row.gcs_object) : '';
  if (gcsBucket && gcsObject) {
    await deleteProjectFileFromGcs(gcsBucket, gcsObject);
  }

  const storageKey = row?.storage_object_key ? String(row.storage_object_key) : '';
  if (storageKey.startsWith(LOCAL_DISK_PREFIX)) {
    const fullPath = storageKey.slice(LOCAL_DISK_PREFIX.length);
    try {
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    } catch {
      /* best-effort */
    }
  } else if (storageKey && isSupabaseStorageConfigured()) {
    const supabase = getServiceSupabase();
    const bucket = getProjectFilesBucket();
    await supabase.storage.from(bucket).remove([storageKey]);
  }

  const result = await dbRun('DELETE FROM project_files_v1 WHERE project_id = ? AND id = ?', [projectId, fileId]);
  return result.changes > 0;
}

/** Remove GCS objects for all files attached to a project (call before deleting the project row). */
export async function purgeProjectFilesFromGcs(projectId: string): Promise<void> {
  const rows = (await dbAll('SELECT gcs_bucket, gcs_object FROM project_files_v1 WHERE project_id = ?', [projectId])) as Array<{
    gcs_bucket: string | null;
    gcs_object: string | null;
  }>;

  await Promise.all(
    rows
      .filter((r) => r.gcs_bucket && r.gcs_object)
      .map((r) => deleteProjectFileFromGcs(r.gcs_bucket as string, r.gcs_object as string))
  );
}
