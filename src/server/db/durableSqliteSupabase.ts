import fs from 'fs';
import os from 'os';
import path from 'path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type Database from 'better-sqlite3';

function supabaseUrlForStorage(): string {
  return String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
}

function supabaseServiceRoleKey(): string {
  return String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
}

function createServiceRoleClient(): SupabaseClient | null {
  const url = supabaseUrlForStorage();
  const key = supabaseServiceRoleKey();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function getDurableSqliteSupabaseConfig(): { bucket: string; object: string; intervalMs: number } | null {
  const bucket = String(process.env.DATABASE_SUPABASE_BUCKET || '').trim();
  if (!bucket) return null;
  if (!createServiceRoleClient()) {
    return null;
  }
  const object = String(process.env.DATABASE_SUPABASE_OBJECT || '').trim() || 'estimator.db';
  const intervalMsRaw = String(process.env.DATABASE_SUPABASE_BACKUP_INTERVAL_MS || '').trim();
  const intervalMs = intervalMsRaw ? Number(intervalMsRaw) : 30_000;
  return {
    bucket,
    object,
    intervalMs: Number.isFinite(intervalMs) && intervalMs >= 5_000 ? intervalMs : 30_000,
  };
}

export function warnIfSupabaseBucketWithoutCredentials(): void {
  if (!String(process.env.DATABASE_SUPABASE_BUCKET || '').trim()) return;
  if (createServiceRoleClient()) return;
  console.warn(
    '[db] DATABASE_SUPABASE_BUCKET is set but SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY are required for Storage backups. Remote SQLite persistence is disabled until those are set.'
  );
}

export async function restoreSqliteFromSupabaseIfConfigured(dbPath: string): Promise<{
  attempted: boolean;
  restored: boolean;
  message?: string;
}> {
  const cfg = getDurableSqliteSupabaseConfig();
  if (!cfg) {
    return { attempted: false, restored: false };
  }

  if (fs.existsSync(dbPath)) {
    return { attempted: false, restored: false };
  }

  const supabase = createServiceRoleClient()!;
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const { data, error } = await supabase.storage.from(cfg.bucket).download(cfg.object);
  if (error) {
    const msg = error.message || String(error);
    if (/not found|not_found|No such file|The resource was not found|404/i.test(msg)) {
      return { attempted: true, restored: false, message: `No Supabase Storage object at ${cfg.bucket}/${cfg.object}` };
    }
    return { attempted: true, restored: false, message: `Failed to restore SQLite from Supabase: ${msg}` };
  }
  if (!data) {
    return { attempted: true, restored: false, message: 'Supabase download returned no data.' };
  }
  const buf = Buffer.from(await data.arrayBuffer());
  fs.writeFileSync(dbPath, buf);
  return { attempted: true, restored: true, message: `Restored SQLite from supabase://storage/${cfg.bucket}/${cfg.object}` };
}

export function startSqliteSupabaseBackupLoop(
  db: Database,
  dbPath: string,
  opts?: { onBackupResult?: (result: { ok: boolean; attemptedAt: string; message?: string }) => void }
): { stop: () => Promise<void> } {
  const cfg = getDurableSqliteSupabaseConfig();
  if (!cfg) return { stop: async () => {} };

  const supabase = createServiceRoleClient()!;
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
        await db.backup(tmpPath);
        const body = fs.readFileSync(tmpPath);
        const { error: upErr } = await supabase.storage.from(cfg.bucket).upload(cfg.object, body, {
          upsert: true,
          contentType: 'application/x-sqlite3',
          cacheControl: 'no-store',
        });
        if (upErr) {
          const msg = upErr.message || String(upErr);
          opts?.onBackupResult?.({ ok: false, attemptedAt, message: msg });
        } else {
          opts?.onBackupResult?.({ ok: true, attemptedAt });
        }
      } finally {
        try {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {
          // ignore
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

  const shutdown = () => {
    if (stopped) return;
    runBackup().catch(() => {});
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

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

export async function backupSqliteToSupabaseOnce(
  db: Database,
  dbPath: string
): Promise<{ ok: boolean; message?: string }> {
  const cfg = getDurableSqliteSupabaseConfig();
  if (!cfg) return { ok: false, message: 'DATABASE_SUPABASE_BUCKET with valid Supabase credentials is not set.' };
  const supabase = createServiceRoleClient()!;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'estimator-backup-'));
  const tmpPath = path.join(tmpDir, path.basename(dbPath));
  try {
    await db.backup(tmpPath);
    const body = fs.readFileSync(tmpPath);
    const { error } = await supabase.storage.from(cfg.bucket).upload(cfg.object, body, {
      upsert: true,
      contentType: 'application/x-sqlite3',
      cacheControl: 'no-store',
    });
    if (error) {
      return { ok: false, message: error.message || String(error) };
    }
    return { ok: true, message: `Backed up SQLite to supabase://storage/${cfg.bucket}/${cfg.object}` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: msg };
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

export async function getSupabaseBackupObjectMetadata(): Promise<{
  ok: boolean;
  bucket?: string;
  object?: string;
  updated?: string;
  sizeBytes?: number;
  message?: string;
}> {
  const cfg = getDurableSqliteSupabaseConfig();
  if (!cfg) return { ok: false, message: 'DATABASE_SUPABASE_BUCKET (with service role) is not set.' };
  const supabase = createServiceRoleClient()!;
  const key = cfg.object;
  const lastSlash = key.lastIndexOf('/');
  const parent = lastSlash > 0 ? key.slice(0, lastSlash) : '';
  const name = lastSlash > 0 ? key.slice(lastSlash + 1) : key;
  if (!name) {
    return { ok: false, bucket: cfg.bucket, object: cfg.object, message: 'Invalid DATABASE_SUPABASE_OBJECT.' };
  }
  const { data, error } = await supabase.storage.from(cfg.bucket).list(parent, { limit: 1_000 });
  if (error) {
    return { ok: false, bucket: cfg.bucket, object: cfg.object, message: error.message || String(error) };
  }
  const match = (data || []).find((f) => f.name === name);
  if (!match) {
    return { ok: false, bucket: cfg.bucket, object: cfg.object, message: 'Backup object not found in bucket.' };
  }
  const meta = (match.metadata as { size?: number } | null | undefined) || {};
  return {
    ok: true,
    bucket: cfg.bucket,
    object: cfg.object,
    updated: (match as { updated_at?: string; created_at?: string }).updated_at || (match as { created_at?: string }).created_at,
    sizeBytes: meta.size != null ? Number(meta.size) : undefined,
  };
}
