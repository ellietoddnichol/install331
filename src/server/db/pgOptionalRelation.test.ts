import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  isPgUndefinedRelation,
  resetPgOptionalRelationWarningDedupe,
  tryOptionalPgRelation,
} from './pgOptionalRelation.ts';

afterEach(() => {
  resetPgOptionalRelationWarningDedupe();
});

test('isPgUndefinedRelation is true only for 42P01', () => {
  assert.equal(isPgUndefinedRelation({ code: '42P01' }), true);
  assert.equal(isPgUndefinedRelation(Object.assign(new Error('x'), { code: '42P01' })), true);
  assert.equal(isPgUndefinedRelation({ code: '23505' }), false);
  assert.equal(isPgUndefinedRelation(new Error('boom')), false);
  assert.equal(isPgUndefinedRelation(null), false);
});

test('tryOptionalPgRelation returns fallback and logs once per dedupe key on 42P01', async () => {
  const lines: string[] = [];
  const orig = console.warn;
  console.warn = (...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  };
  try {
    const a = await tryOptionalPgRelation(
      'dedupe-key',
      async () => {
        throw Object.assign(new Error('relation "x" does not exist'), { code: '42P01' });
      },
      42
    );
    const b = await tryOptionalPgRelation(
      'dedupe-key',
      async () => {
        throw Object.assign(new Error('relation "x" does not exist'), { code: '42P01' });
      },
      99
    );
    assert.equal(a, 42);
    assert.equal(b, 99);
    assert.equal(lines.length, 1);
    assert.match(lines[0]!, /\[pg-optional-relation\]/);
    assert.match(lines[0]!, /dedupe-key/);
  } finally {
    console.warn = orig;
  }
});

test('tryOptionalPgRelation rethrows non-42P01 errors', async () => {
  await assert.rejects(
    () =>
      tryOptionalPgRelation(
        'must-fail',
        async () => {
          throw Object.assign(new Error('unique'), { code: '23505' });
        },
        null
      ),
    /unique/
  );
});

/**
 * Mirrors the sequential optional reads in `settingsRepo.getCatalogSyncStatus` (status row,
 * then latest run row): each may independently return fallback when the relation is absent.
 */
test('pattern: sequential optional reads (settingsRepo-style)', async () => {
  const orig = console.warn;
  console.warn = () => {};
  try {
    const statusRow = await tryOptionalPgRelation(
      'settings catalog_sync_status_v1',
      async () => {
        throw Object.assign(new Error('missing status'), { code: '42P01' });
      },
      undefined as { id: string } | undefined
    );
    const latestRun = await tryOptionalPgRelation(
      'settings catalog_sync_runs_v1 (latest run)',
      async () => {
        throw Object.assign(new Error('missing runs'), { code: '42P01' });
      },
      undefined as { id: string } | undefined
    );
    assert.equal(statusRow, undefined);
    assert.equal(latestRun, undefined);
  } finally {
    console.warn = orig;
  }
});
