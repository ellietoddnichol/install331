import test from 'node:test';
import assert from 'node:assert/strict';
import { readDiv10BrainEnv } from './env.ts';

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

test('readDiv10BrainEnv returns null when DIV10_BRAIN_ENABLED=0 without Supabase', () => {
  withEnv(
    {
      DIV10_BRAIN_ENABLED: '0',
      SUPABASE_URL: undefined,
      SUPABASE_SERVICE_ROLE_KEY: undefined,
      OPENAI_API_KEY: undefined,
    },
    () => {
      assert.equal(readDiv10BrainEnv(), null);
    }
  );
});

test('readDiv10BrainEnv returns null when Supabase or OpenAI env is missing', () => {
  withEnv(
    {
      DIV10_BRAIN_ENABLED: undefined,
      SUPABASE_URL: undefined,
      SUPABASE_SERVICE_ROLE_KEY: undefined,
      OPENAI_API_KEY: undefined,
    },
    () => {
      assert.equal(readDiv10BrainEnv(), null);
    }
  );
});
