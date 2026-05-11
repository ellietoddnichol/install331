import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * `getConfiguredLaborRatePerHour` uses `tryOptionalPgRelation` when `DB_DRIVER=pg` and native
 * workspace is enabled (optional read of `public.app_settings`). On SQLite this test asserts
 * the legacy `settings_v1` path still yields a finite rate after that refactor.
 */
test('getConfiguredLaborRatePerHour returns a positive finite rate on SQLite (settings or default)', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'install331-takeoff-labor-'));
  process.env.DATABASE_PATH = path.join(tmpDir, 'takeoff.labor.test.db');
  delete process.env.DB_DRIVER;

  const { getEstimatorDb } = await import('../db/connection.ts');
  getEstimatorDb();

  const { getConfiguredLaborRatePerHour } = await import('./takeoffRepo.ts');
  const rate = await getConfiguredLaborRatePerHour();
  assert.ok(Number.isFinite(rate));
  assert.ok(rate > 0);
});
