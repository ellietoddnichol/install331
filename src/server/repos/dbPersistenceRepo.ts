import { getEstimatorDb } from '../db/connection.ts';
import type { DbPersistenceStatusRecord } from '../../shared/types/estimator.ts';

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

export function getDbPersistenceStatus(): DbPersistenceStatusRecord {
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

