import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('getSettings uses defaults when global row is absent; updateSettings upserts via dbRun', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'install331-settings-async-'));
  process.env.DATABASE_PATH = path.join(tmpDir, 'settings.async.test.db');

  const { getEstimatorDb } = await import('../db/connection.ts');
  getEstimatorDb();
  getEstimatorDb().prepare('DELETE FROM settings_v1 WHERE id = ?').run('global');

  const { getSettings, updateSettings } = await import('./settingsRepo.ts');
  const baseline = await getSettings();
  assert.equal(baseline.id, 'global');

  const saved = await updateSettings({ companyName: 'Acme Test Co', defaultLaborRatePerHour: 125 });
  assert.equal(saved.companyName, 'Acme Test Co');
  assert.equal(saved.defaultLaborRatePerHour, 125);

  const { dbGet } = await import('../db/query.ts');
  const row = (await dbGet(`SELECT company_name, default_labor_rate_per_hour FROM settings_v1 WHERE id = ?`, [
    'global',
  ])) as { company_name: string; default_labor_rate_per_hour: number } | undefined;
  assert.ok(row);
  assert.equal(row.company_name, 'Acme Test Co');
  assert.equal(Number(row.default_labor_rate_per_hour), 125);
});
