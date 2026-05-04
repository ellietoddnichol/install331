import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { initLegacyDb } from '../legacyInit.ts';
import { initEstimatorSchema } from './schema.ts';
import { resolveEstimatorDbPath } from './resolveEstimatorDbPath.ts';
import { isPgDriver } from './driver.ts';
import {
  backupSqliteToRemoteDurableOnce,
  getActiveRemoteDurableKind,
  restoreSqliteFromRemoteDurableIfConfigured,
  startRemoteDurableSqliteBackupLoop,
} from './durableSqliteRemote.ts';
import { getDurableSqliteGcsConfig } from './durableSqliteGcs.ts';
import { getDurableSqliteSupabaseConfig, warnIfSupabaseBucketWithoutCredentials } from './durableSqliteSupabase.ts';
import { getDbPersistenceStatus, updateDbPersistenceStatus } from '../repos/dbPersistenceRepo.ts';
import type { DbPersistenceStatusRecord } from '../../shared/types/estimator.ts';

let estimatorDb: Database | null = null;
let backupStopper: { stop: () => Promise<void> } | null = null;
let prepared = false;
let resolvedDbPath: string | null = null;

export function getEstimatorDb(): Database {
  if (isPgDriver()) {
    throw new Error(
      'getEstimatorDb() is not available when DB_DRIVER=pg. Use dbAll/dbGet/dbRun from src/server/db/query.ts instead.'
    );
  }
  if (!estimatorDb) {
    // Sync-safe fallback for tests/scripts; production should call prepareEstimatorDbForServer() first.
    const dbPath = resolveEstimatorDbPath();
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    estimatorDb = new Database(dbPath);
    estimatorDb.pragma('journal_mode = WAL');
    estimatorDb.pragma('foreign_keys = ON');
    initLegacyDb(estimatorDb);
    initEstimatorSchema(estimatorDb);
  }
  return estimatorDb;
}

export async function prepareEstimatorDbForServer(): Promise<void> {
  if (prepared) return;
  prepared = true;

  if (isPgDriver()) {
    // Pooled Postgres path (query.ts, pgPool.ts). Skip local estimator.db + durable SQLite remote backup.
    return;
  }

  warnIfSupabaseBucketWithoutCredentials();
  const dbPath = resolveEstimatorDbPath();
  resolvedDbPath = dbPath;
  const supaCfg = getDurableSqliteSupabaseConfig();
  const gcsCfg = getDurableSqliteGcsConfig();
  const activeRemote = getActiveRemoteDurableKind();
  const remoteMeta =
    supaCfg != null
      ? { bucket: supaCfg.bucket, object: supaCfg.object }
      : gcsCfg != null
        ? { bucket: gcsCfg.bucket, object: gcsCfg.object }
        : null;

  const mode: DbPersistenceStatusRecord['mode'] = dbPath.startsWith('/data/')
    ? 'volume'
    : activeRemote === 'supabase'
      ? 'ephemeral_supabase'
      : activeRemote === 'gcs'
        ? 'ephemeral_gcs'
        : 'ephemeral';

  updateDbPersistenceStatus({
    dbPath,
    mode,
    gcsBucket: remoteMeta?.bucket ?? null,
    gcsObject: remoteMeta?.object ?? null,
  });

  const restore = await restoreSqliteFromRemoteDurableIfConfigured(dbPath);
  if (restore.message) {
    console.log(`[db] ${restore.message}`);
  }
  if (activeRemote) {
    const noSnapshot = /no.*snapshot|not found|No Supabase Storage object|Backup object not found/i;
    updateDbPersistenceStatus({
      restoreAttemptedAt: restore.attempted ? new Date().toISOString() : null,
      restoreStatus: restore.attempted
        ? restore.restored
          ? 'restored'
          : noSnapshot.test(restore.message || '')
            ? 'no_snapshot'
            : 'failed'
        : fs.existsSync(dbPath)
          ? 'skipped_existing_db'
          : 'not_configured',
      restoreMessage: restore.message ?? null,
    });
  } else {
    updateDbPersistenceStatus({
      restoreAttemptedAt: null,
      restoreStatus: fs.existsSync(dbPath) ? 'skipped_existing_db' : 'not_configured',
      restoreMessage: restore.message ?? null,
    });
  }

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  estimatorDb = new Database(dbPath);
  estimatorDb.pragma('journal_mode = WAL');
  estimatorDb.pragma('foreign_keys = ON');
  initLegacyDb(estimatorDb);
  initEstimatorSchema(estimatorDb);

  backupStopper = startRemoteDurableSqliteBackupLoop(estimatorDb, dbPath, {
    onBackupResult: (result) => {
      if (result.ok) {
        updateDbPersistenceStatus({
          lastBackupSuccessAt: result.attemptedAt,
          lastBackupError: null,
        });
      } else {
        updateDbPersistenceStatus({
          lastBackupFailureAt: result.attemptedAt,
          lastBackupError: result.message || 'Backup failed.',
        });
      }
    },
  });
}

export function getResolvedEstimatorDbPath(): string {
  return resolvedDbPath || resolveEstimatorDbPath();
}

export function getDbPersistenceStatusSnapshot() {
  return getDbPersistenceStatus();
}

export async function runDbBackupNow(): Promise<{ ok: boolean; message: string }> {
  if (isPgDriver()) {
    return {
      ok: false,
      message:
        'SQLite snapshot backup is not used when DB_DRIVER=pg. Use your Postgres/Supabase backup process for database backups.',
    };
  }
  const db = getEstimatorDb();
  const dbPath = getResolvedEstimatorDbPath();
  const result = await backupSqliteToRemoteDurableOnce(db, dbPath);
  const now = new Date().toISOString();
  if (result.ok) {
    updateDbPersistenceStatus({
      lastBackupSuccessAt: now,
      lastBackupError: null,
    });
    return { ok: true, message: result.message || 'Backup complete.' };
  }
  updateDbPersistenceStatus({
    lastBackupFailureAt: now,
    lastBackupError: result.message || 'Backup failed.',
  });
  return { ok: false, message: result.message || 'Backup failed.' };
}

export { getRemoteDurableSqliteObjectMetadata } from './durableSqliteRemote.ts';
