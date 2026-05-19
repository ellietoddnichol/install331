import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveEstimatorDbPath } from './resolveEstimatorDbPath.ts';

function withEnv(patch: Record<string, string | undefined>, fn: () => void): void {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(patch)) {
    saved[key] = process.env[key];
    const value = patch[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    fn();
  } finally {
    for (const key of Object.keys(saved)) {
      const value = saved[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('resolveEstimatorDbPath ignores DATABASE_URL when DB_DRIVER=sqlite', () => {
  withEnv(
    {
      DB_DRIVER: 'sqlite',
      DATABASE_URL: 'postgresql://user:pass@db.example.com:5432/postgres',
      SQLITE_PATH: './tmp-test-estimator.db',
      DATABASE_PATH: undefined,
      NODE_ENV: 'development',
    },
    () => {
      const resolved = resolveEstimatorDbPath();
      assert.match(resolved, /tmp-test-estimator\.db$/);
    }
  );
});
