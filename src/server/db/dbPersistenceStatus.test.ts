import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { test } from 'node:test';

import { getDbPersistenceStatus, updateDbPersistenceStatus } from '../repos/dbPersistenceRepo.ts';
import { getEstimatorDb } from './connection.ts';

test('db_persistence_status_v1 can be read and updated', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'estimator.persistence-status.'));
  const dbPath = path.join(tmpDir, `estimator.${crypto.randomUUID()}.db`);
  process.env.DATABASE_PATH = dbPath;

  // Ensure schema is initialized through the normal connection path.
  getEstimatorDb();

  const initial = getDbPersistenceStatus();
  assert.equal(initial.id, 'db');

  const next = updateDbPersistenceStatus({
    dbPath: '/data/estimator.db',
    mode: 'ephemeral_gcs',
    gcsBucket: 'bucket',
    gcsObject: 'estimator.db',
    restoreStatus: 'restored',
    restoreMessage: 'ok',
    lastBackupSuccessAt: new Date().toISOString(),
    lastBackupError: null,
  });
  assert.equal(next.dbPath, '/data/estimator.db');
  assert.equal(next.mode, 'ephemeral_gcs');
  assert.equal(next.restoreStatus, 'restored');

  const reread = getDbPersistenceStatus();
  assert.equal(reread.dbPath, '/data/estimator.db');
  assert.equal(reread.gcsBucket, 'bucket');
});

