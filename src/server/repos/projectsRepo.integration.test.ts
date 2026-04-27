import test from 'node:test';
import assert from 'node:assert/strict';

const runPg =
  String(process.env.DB_DRIVER || '').trim().toLowerCase() === 'pg' &&
  Boolean(String(process.env.DATABASE_URL || '').trim());

test(
  'projectsRepo: create, list, get, delete on Postgres',
  { skip: !runPg },
  async () => {
    const { createProject, deleteProject, getProject, listProjects } = await import('./projectsRepo.ts');
    const { closePgPool } = await import('../db/pgPool.ts');
    const name = `pg-integration-${Date.now()}`;
    let id: string | null = null;
    try {
      const created = await createProject({ projectName: name });
      id = created.id;
      const listed = await listProjects();
      assert.ok(listed.some((p) => p.id === id));
      const got = await getProject(id);
      assert.equal(got?.projectName, name);
    } finally {
      if (id) await deleteProject(id);
      await closePgPool();
    }
  }
);
