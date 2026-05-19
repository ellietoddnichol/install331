import test from 'node:test';
import assert from 'node:assert/strict';
import { assertCatalogBackendMatchesDriver } from '../db/catalogBackend.ts';
import { logCatalogRuntimeHints } from '../db/catalogRuntimeHints.ts';
import { getIntegrationHealthSnapshot } from '../services/integrationHealth.ts';
import { readDiv10BrainEnv } from '../div10Brain/env.ts';

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

test('Sheets-first boot path does not require Supabase env vars', () => {
  withEnv(
    {
      DB_DRIVER: 'sqlite',
      DATA_BACKEND: 'sheets',
      CATALOG_BACKEND: 'sheet',
      DATABASE_URL: undefined,
      DIRECT_URL: undefined,
      SUPABASE_URL: undefined,
      SUPABASE_SERVICE_ROLE_KEY: undefined,
      SUPABASE_ANON_KEY: undefined,
      VITE_SUPABASE_URL: undefined,
      VITE_SUPABASE_ANON_KEY: undefined,
      DIV10_BRAIN_ENABLED: '0',
      OPENAI_API_KEY: undefined,
    },
    () => {
      assert.doesNotThrow(() => assertCatalogBackendMatchesDriver());
      assert.doesNotThrow(() => logCatalogRuntimeHints());
      assert.equal(readDiv10BrainEnv(), null);
      const health = getIntegrationHealthSnapshot();
      assert.equal(health.dbDriver, 'sqlite');
      assert.equal(health.catalogDataSource, 'sheets');
      assert.equal(health.supabaseAnon, false);
      assert.equal(health.supabaseServiceRole, false);
    }
  );
});
