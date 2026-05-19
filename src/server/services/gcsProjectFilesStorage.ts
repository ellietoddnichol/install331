import fs from 'fs';
import { Storage } from '@google-cloud/storage';

function loadServiceAccountCredentials(): { client_email: string; private_key: string } | null {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT;
  const file = process.env.GOOGLE_SERVICE_ACCOUNT_FILE;

  try {
    if (json) {
      const parsed = JSON.parse(json) as { client_email?: string; private_key?: string };
      if (parsed.client_email && parsed.private_key) {
        return {
          client_email: parsed.client_email,
          private_key: String(parsed.private_key).replace(/\\n/g, '\n'),
        };
      }
    }
    if (file && fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as { client_email?: string; private_key?: string };
      if (parsed.client_email && parsed.private_key) {
        return {
          client_email: parsed.client_email,
          private_key: String(parsed.private_key).replace(/\\n/g, '\n'),
        };
      }
    }
    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_CLIENT_EMAIL;
    const privateKey = (process.env.GOOGLE_PRIVATE_KEY || process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(
      /\\n/g,
      '\n'
    );
    if (clientEmail && privateKey) {
      return { client_email: clientEmail, private_key: privateKey };
    }
  } catch {
    return null;
  }
  return null;
}

let storageClient: Storage | undefined;

function getStorage(): Storage {
  if (storageClient) return storageClient;
  const creds = loadServiceAccountCredentials();
  if (!creds) {
    throw new Error(
      'Google credentials are missing. Set GOOGLE_SERVICE_ACCOUNT_FILE, GOOGLE_SERVICE_ACCOUNT JSON, or GOOGLE_SERVICE_ACCOUNT_EMAIL with GOOGLE_PRIVATE_KEY (or GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY).'
    );
  }
  storageClient = new Storage({
    credentials: {
      client_email: creds.client_email,
      private_key: creds.private_key,
    },
  });
  return storageClient;
}

/** Bucket name for project drawings / takeoffs. When unset, files stay inline in SQLite (legacy). */
export function getGcsProjectFilesBucketName(): string | undefined {
  const raw = process.env.GCS_PROJECT_FILES_BUCKET?.trim();
  return raw || undefined;
}

export function isGcsProjectFilesEnabled(): boolean {
  return Boolean(getGcsProjectFilesBucketName() && loadServiceAccountCredentials());
}

export function sanitizeObjectFileSegment(name: string): string {
  const trimmed = name.trim().replace(/[/\\]/g, '_');
  const safe = trimmed.replace(/[^\w.\- ()]+/g, '_').slice(0, 180);
  return safe || 'upload.bin';
}

export function buildProjectFileObjectName(projectId: string, fileId: string, fileName: string): string {
  const safe = sanitizeObjectFileSegment(fileName);
  return `project-files/${projectId}/${fileId}/${safe}`;
}

type GcsProjectFilesIo = {
  upload: (params: { bucket: string; objectName: string; buffer: Buffer; contentType: string }) => Promise<void>;
  download: (bucket: string, objectName: string) => Promise<Buffer>;
  delete: (bucket: string, objectName: string) => Promise<void>;
};

let gcsProjectFilesIoOverride: GcsProjectFilesIo | null = null;

/** Test hook: stub GCS upload/download/delete without touching a real bucket. */
export function __setGcsProjectFilesIoForTests(io: GcsProjectFilesIo | null): void {
  gcsProjectFilesIoOverride = io;
}

async function uploadProjectFileToGcsImpl(params: {
  bucket: string;
  objectName: string;
  buffer: Buffer;
  contentType: string;
}): Promise<void> {
  const storage = getStorage();
  const file = storage.bucket(params.bucket).file(params.objectName);
  await file.save(params.buffer, {
    contentType: params.contentType || 'application/octet-stream',
    resumable: params.buffer.length > 5 * 1024 * 1024,
    metadata: { cacheControl: 'private, max-age=0' },
  });
}

async function downloadProjectFileFromGcsImpl(bucket: string, objectName: string): Promise<Buffer> {
  const storage = getStorage();
  const [data] = await storage.bucket(bucket).file(objectName).download();
  return data;
}

async function deleteProjectFileFromGcsImpl(bucket: string, objectName: string): Promise<void> {
  try {
    await getStorage().bucket(bucket).file(objectName).delete({ ignoreNotFound: true });
  } catch {
    // Best-effort cleanup; row removal still proceeds.
  }
}

export async function uploadProjectFileToGcs(params: {
  bucket: string;
  objectName: string;
  buffer: Buffer;
  contentType: string;
}): Promise<void> {
  if (gcsProjectFilesIoOverride) return gcsProjectFilesIoOverride.upload(params);
  return uploadProjectFileToGcsImpl(params);
}

export async function downloadProjectFileFromGcs(bucket: string, objectName: string): Promise<Buffer> {
  if (gcsProjectFilesIoOverride) return gcsProjectFilesIoOverride.download(bucket, objectName);
  return downloadProjectFileFromGcsImpl(bucket, objectName);
}

export async function deleteProjectFileFromGcs(bucket: string, objectName: string): Promise<void> {
  if (gcsProjectFilesIoOverride) return gcsProjectFilesIoOverride.delete(bucket, objectName);
  return deleteProjectFileFromGcsImpl(bucket, objectName);
}
