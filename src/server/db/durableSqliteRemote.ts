import type Database from 'better-sqlite3';
import {
  backupSqliteToGcsOnce,
  getDurableSqliteGcsConfig,
  getGcsBackupObjectMetadata,
  restoreSqliteFromGcsIfConfigured,
  startSqliteGcsBackupLoop,
} from './durableSqliteGcs.ts';
import {
  backupSqliteToSupabaseOnce,
  getDurableSqliteSupabaseConfig,
  getSupabaseBackupObjectMetadata,
  restoreSqliteFromSupabaseIfConfigured,
  startSqliteSupabaseBackupLoop,
} from './durableSqliteSupabase.ts';

/** Supabase Storage takes precedence when `DATABASE_SUPABASE_BUCKET` and service role are set. */
export function getActiveRemoteDurableKind(): 'supabase' | 'gcs' | null {
  if (getDurableSqliteSupabaseConfig()) return 'supabase';
  if (getDurableSqliteGcsConfig()) return 'gcs';
  return null;
}

export async function restoreSqliteFromRemoteDurableIfConfigured(dbPath: string) {
  if (getDurableSqliteSupabaseConfig()) return restoreSqliteFromSupabaseIfConfigured(dbPath);
  return restoreSqliteFromGcsIfConfigured(dbPath);
}

export function startRemoteDurableSqliteBackupLoop(
  db: Database,
  dbPath: string,
  opts?: { onBackupResult?: (result: { ok: boolean; attemptedAt: string; message?: string }) => void }
): { stop: () => Promise<void> } {
  if (getDurableSqliteSupabaseConfig()) return startSqliteSupabaseBackupLoop(db, dbPath, opts);
  return startSqliteGcsBackupLoop(db, dbPath, opts);
}

export async function backupSqliteToRemoteDurableOnce(db: Database, dbPath: string) {
  if (getDurableSqliteSupabaseConfig()) return backupSqliteToSupabaseOnce(db, dbPath);
  return backupSqliteToGcsOnce(db, dbPath);
}

export async function getRemoteDurableSqliteObjectMetadata() {
  if (getDurableSqliteSupabaseConfig()) return getSupabaseBackupObjectMetadata();
  if (getDurableSqliteGcsConfig()) return getGcsBackupObjectMetadata();
  return {
    ok: false,
    message: 'No remote backup is configured (set DATABASE_SUPABASE_BUCKET or DATABASE_GCS_BUCKET).',
  };
}
