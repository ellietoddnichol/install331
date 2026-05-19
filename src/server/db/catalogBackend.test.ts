import test from 'node:test';
import assert from 'node:assert/strict';
import { assertCatalogBackendMatchesDriver, isPgCatalogBackend, resolveCatalogBackendSetting } from './catalogBackend.ts';

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

test('Sheets-first MVP: CATALOG_BACKEND=sheet with sqlite driver does not require Postgres', () => {
  withEnv(
    {
      DB_DRIVER: 'sqlite',
      CATALOG_BACKEND: 'sheet',
      DATABASE_URL: undefined,
      SUPABASE_URL: undefined,
    },
    () => {
      assert.doesNotThrow(() => assertCatalogBackendMatchesDriver());
      assert.equal(resolveCatalogBackendSetting(), 'local');
      assert.equal(isPgCatalogBackend(), false);
    }
  );
});

test('CATALOG_BACKEND=pg requires DB_DRIVER=pg', () => {
  withEnv(
    {
      DB_DRIVER: 'sqlite',
      CATALOG_BACKEND: 'pg',
    },
    () => {
      assert.throws(() => assertCatalogBackendMatchesDriver(), /CATALOG_BACKEND=supabase\|pg requires DB_DRIVER=pg/);
    }
  );
});
