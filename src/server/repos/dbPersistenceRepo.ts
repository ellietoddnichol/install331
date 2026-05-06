import { getEstimatorDb } from '../db/connection.ts';
import { isPgDriver } from '../db/driver.ts';
import type { DbPersistenceStatusRecord } from '../../shared/types/estimator.ts';

/** In-memory snapshot when SQLite persistence metadata table is not used (Postgres deployments). */
let pgPersistenceMirror: DbPersistenceStatusRecord | null = null;

type DbRow = {
  id: string;
  db_path: string;
  mode: string;
  gcs_bucket: string | null;
  gcs_object: string | null;
  restore_attempted_at: string | null;
  restore_status: string | null;
  restore_message: string | null;
  last_backup_success_at: string | null;
  last_backup_failure_at: string | null;
  last_backup_error: string | null;
  updated_at: string;
};

function pgPersistenceBaseline(): DbPersistenceStatusRecord {
  const now = new Date().toISOString();
  return {
    id: 'db',
    dbPath: '(Supabase Postgres — DATABASE_URL)',
    mode: 'volume',
    gcsBucket: null,
    gcsObject: null,
    restoreAttemptedAt: null,
    restoreStatus: 'not_configured',
    restoreMessage: 'SQLite file snapshot metadata is not used when DB_DRIVER=pg.',
    lastBackupSuccessAt: null,
    lastBackupFailureAt: null,
    lastBackupError: null,
    updatedAt: now,
  };
}

export function getDbPersistenceStatus(): DbPersistenceStatusRecord {
  if (isPgDriver()) {
    return pgPersistenceMirror ?? pgPersistenceBaseline();
  }
  const row = getEstimatorDb()
    .prepare(`SELECT * FROM db_persistence_status_v1 WHERE id = 'db'`)
    .get() as DbRow;

  return {
    id: 'db',
    dbPath: row.db_path,
    mode: row.mode as DbPersistenceStatusRecord['mode'],
    gcsBucket: row.gcs_bucket,
    gcsObject: row.gcs_object,
    restoreAttemptedAt: row.restore_attempted_at,
    restoreStatus: (row.restore_status as DbPersistenceStatusRecord['restoreStatus']) ?? 'not_configured',
    restoreMessage: row.restore_message,
    lastBackupSuccessAt: row.last_backup_success_at,
    lastBackupFailureAt: row.last_backup_failure_at,
    lastBackupError: row.last_backup_error,
    updatedAt: row.updated_at,
  };
}

export function updateDbPersistenceStatus(patch: Partial<Omit<DbPersistenceStatusRecord, 'id'>>): DbPersistenceStatusRecord {
  if (isPgDriver()) {
    const current = getDbPersistenceStatus();
    const next: DbPersistenceStatusRecord = {
      ...current,
      ...patch,
      id: 'db',
      updatedAt: new Date().toISOString(),
    };
    pgPersistenceMirror = next;
    return next;
  }
  const current = getDbPersistenceStatus();
  const next: DbPersistenceStatusRecord = {
    ...current,
    ...patch,
    id: 'db',
    updatedAt: new Date().toISOString(),
  };

  getEstimatorDb()
    .prepare(
      `UPDATE db_persistence_status_v1
       SET
         db_path = ?,
         mode = ?,
         gcs_bucket = ?,
         gcs_object = ?,
         restore_attempted_at = ?,
         restore_status = ?,
         restore_message = ?,
         last_backup_success_at = ?,
         last_backup_failure_at = ?,
         last_backup_error = ?,
         updated_at = ?
       WHERE id = 'db'`
    )
    .run(
      next.dbPath,
      next.mode,
      next.gcsBucket ?? null,
      next.gcsObject ?? null,
      next.restoreAttemptedAt ?? null,
      next.restoreStatus ?? null,
      next.restoreMessage ?? null,
      next.lastBackupSuccessAt ?? null,
      next.lastBackupFailureAt ?? null,
      next.lastBackupError ?? null,
      next.updatedAt
    );

  return next;
}

