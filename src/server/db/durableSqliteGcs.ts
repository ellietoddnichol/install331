import fs from 'fs';
import os from 'os';
import path from 'path';
import { Storage } from '@google-cloud/storage';
import type Database from 'better-sqlite3';
import { getDurableSqliteSupabaseConfig } from './durableSqliteSupabase.ts';

function isCloudRun(): boolean {
  return Boolean(process.env.K_SERVICE || process.env.K_REVISION || process.env.K_CONFIGURATION);
}

export function getDurableSqliteGcsConfig(): { bucket: string; object: string; intervalMs: number } | null {
  const bucket = String(process.env.DATABASE_GCS_BUCKET || '').trim();
  if (!bucket) return null;
  const object = String(process.env.DATABASE_GCS_OBJECT || '').trim() || 'estimator.db';
  const intervalMsRaw = String(process.env.DATABASE_GCS_BACKUP_INTERVAL_MS || '').trim();
  const intervalMs = intervalMsRaw ? Number(intervalMsRaw) : 30_000;
  return {
    bucket,
    object,
    intervalMs: Number.isFinite(intervalMs) && intervalMs >= 5_000 ? intervalMs : 30_000,
  };
}

export async function restoreSqliteFromGcsIfConfigured(dbPath: string): Promise<{
  attempted: boolean;
  restored: boolean;
  message?: string;
}> {
  const cfg = getDurableSqliteGcsConfig();
  if (!cfg) {
    if (isCloudRun() && getDurableSqliteSupabaseConfig()) {
      return { attempted: false, restored: false };
    }
    if (isCloudRun()) {
      return {
        attempted: false,
        restored: false,
        message:
          'Cloud Run detected but no remote SQLite backup is configured. Set DATABASE_GCS_BUCKET, or set DATABASE_SUPABASE_BUCKET with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Otherwise SQLite is on ephemeral container disk and can be lost on deploy.',
      };
    }
    return { attempted: false, restored: false };
  }

  if (fs.existsSync(dbPath)) {
    return { attempted: false, restored: false };
  }

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const storage = new Storage();
  const file = storage.bucket(cfg.bucket).file(cfg.object);

  try {
    const [exists] = await file.exists();
    if (!exists) {
      return { attempted: true, restored: false, message: `No GCS snapshot found at gs://${cfg.bucket}/${cfg.object}` };
    }
    await file.download({ destination: dbPath });
    return { attempted: true, restored: true, message: `Restored SQLite from gs://${cfg.bucket}/${cfg.object}` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { attempted: true, restored: false, message: `Failed to restore SQLite from GCS: ${msg}` };
  }
}

export function startSqliteGcsBackupLoop(
  db: Database,
  dbPath: string,
  opts?: {
    onBackupResult?: (result: { ok: boolean; attemptedAt: string; message?: string }) => void;
  }
): { stop: () => Promise<void> } {
  const cfg = getDurableSqliteGcsConfig();
  if (!cfg) return { stop: async () => {} };

  const storage = new Storage();
  const bucket = storage.bucket(cfg.bucket);
  const objectFile = bucket.file(cfg.object);

  let stopped = false;
  let inFlight: Promise<void> | null = null;
  let timer: NodeJS.Timeout | null = null;

  const runBackup = async () => {
    if (stopped) return;
    if (inFlight) return;

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'estimator-backup-'));
    const tmpPath = path.join(tmpDir, path.basename(dbPath));

    inFlight = (async () => {
      const attemptedAt = new Date().toISOString();
      try {
        // Creates a consistent snapshot even while the DB is live.
        // (better-sqlite3 backup copies from the active DB connection.)
        await db.backup(tmpPath);
        await objectFile.save(fs.readFileSync(tmpPath), {
          resumable: false,
          contentType: 'application/x-sqlite3',
          metadata: { cacheControl: 'no-store' },
        });
        opts?.onBackupResult?.({ ok: true, attemptedAt });
      } finally {
        try {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {
          // ignore cleanup errors
        }
        inFlight = null;
      }
    })();

    await inFlight;
  };

  timer = setInterval(() => {
    runBackup().catch((err: unknown) => {
      const attemptedAt = new Date().toISOString();
      const msg = err instanceof Error ? err.message : String(err);
      opts?.onBackupResult?.({ ok: false, attemptedAt, message: msg });
    });
  }, cfg.intervalMs);

  // Best-effort: flush a backup on shutdown signals.
  const shutdown = () => {
    if (stopped) return;
    runBackup()
      .catch(() => {})
      .finally(() => {
        // no-op; server.ts handles process exit
      });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // Kick one soon after boot, so a newly-created DB becomes durable quickly.
  setTimeout(() => {
    runBackup().catch((err: unknown) => {
      const attemptedAt = new Date().toISOString();
      const msg = err instanceof Error ? err.message : String(err);
      opts?.onBackupResult?.({ ok: false, attemptedAt, message: msg });
    });
  }, 5_000);

  return {
    stop: async () => {
      stopped = true;
      if (timer) clearInterval(timer);
      if (inFlight) await inFlight;
    },
  };
}

export async function backupSqliteToGcsOnce(db: Database, dbPath: string): Promise<{ ok: boolean; message?: string }> {
  const cfg = getDurableSqliteGcsConfig();
  if (!cfg) return { ok: false, message: 'DATABASE_GCS_BUCKET is not set.' };
  const storage = new Storage();
  const objectFile = storage.bucket(cfg.bucket).file(cfg.object);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'estimator-backup-'));
  const tmpPath = path.join(tmpDir, path.basename(dbPath));
  try {
    await db.backup(tmpPath);
    await objectFile.save(fs.readFileSync(tmpPath), {
      resumable: false,
      contentType: 'application/x-sqlite3',
      metadata: { cacheControl: 'no-store' },
    });
    return { ok: true, message: `Backed up SQLite to gs://${cfg.bucket}/${cfg.object}` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: msg };
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
}

export async function getGcsBackupObjectMetadata(): Promise<{
  ok: boolean;
  bucket?: string;
  object?: string;
  updated?: string;
  sizeBytes?: number;
  message?: string;
}> {
  const cfg = getDurableSqliteGcsConfig();
  if (!cfg) return { ok: false, message: 'DATABASE_GCS_BUCKET is not set.' };
  try {
    const storage = new Storage();
    const file = storage.bucket(cfg.bucket).file(cfg.object);
    const [exists] = await file.exists();
    if (!exists) return { ok: false, bucket: cfg.bucket, object: cfg.object, message: 'Backup object not found.' };
    const [meta] = await file.getMetadata();
    return {
      ok: true,
      bucket: cfg.bucket,
      object: cfg.object,
      updated: (meta.updated as string | undefined) || null || undefined,
      sizeBytes: meta.size ? Number(meta.size) : undefined,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, bucket: cfg.bucket, object: cfg.object, message: msg };
  }
}

