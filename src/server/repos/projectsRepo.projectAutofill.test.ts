import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** One process / one DB singleton — keep a single temp DB and distinct project ids. */
test('projectsRepo project autofill: raw title inference, jobConditions merge, preserve bid #', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'install331-autofill-'));
  const dbPath = path.join(tmpDir, 'estimator.autofill.test.db');
  process.env.DATABASE_PATH = dbPath;

  const { createProject, updateProject, getProject } = await import('./projectsRepo.ts');

  const garbled =
    'F¼Æ"%1Ð½zÎÔ¹ùÝkfWp·+P$nWà`Ó - Austin, TX';
  const created = createProject({
    projectName: garbled,
    projectNumber: '',
    clientName: 'Acme',
    address: '',
    jobConditions: { installerCount: 1 } as any,
  });

  assert.match(String(created.projectNumber || ''), /^BP-/);
  assert.equal(created.address, 'Austin, TX');
  assert.equal(created.jobConditions.locationLabel, 'Austin, TX');
  assert.equal(getProject(created.id)?.address, 'Austin, TX');

  const created2 = createProject({
    projectName: 'Clinic - Kansas City, KS',
    projectNumber: '',
    clientName: 'Acme',
    address: '',
  });
  assert.equal(created2.jobConditions.locationLabel, 'Kansas City, KS');

  const updated = updateProject(created2.id, {
    jobConditions: { installerCount: 4 },
  } as any);
  assert.ok(updated);
  assert.equal(updated!.jobConditions.installerCount, 4);
  assert.equal(updated!.jobConditions.locationLabel, 'Kansas City, KS');
  assert.equal(getProject(created2.id)?.jobConditions.locationLabel, 'Kansas City, KS');

  const created3 = createProject({
    projectName: 'Hold - Dallas, TX',
    projectNumber: '',
    clientName: 'Acme',
    address: '123 Main',
  });
  const num = String(created3.projectNumber || '');
  assert.match(num, /^BP-/);

  const updated3 = updateProject(created3.id, {
    projectName: created3.projectName,
    projectNumber: '',
    clientName: created3.clientName,
    address: created3.address,
  } as any);
  const created4 = createProject({
    projectName: 'Zero project - Omaha, NE',
    projectNumber: '0',
    clientName: 'Acme',
    address: '',
  });
  assert.match(String(created4.projectNumber || ''), /^BP-/);
});
