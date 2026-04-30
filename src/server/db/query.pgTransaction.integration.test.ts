import test from 'node:test';
import assert from 'node:assert/strict';

const runPg =
  String(process.env.DB_DRIVER || '').trim().toLowerCase() === 'pg' &&
  Boolean(String(process.env.DATABASE_URL || '').trim());

test(
  'withPgTransaction: dbRun/dbGet use one transaction client (rollback drops temp DDL)',
  { skip: !runPg },
  async () => {
    const { withPgTransaction, dbRun, dbGet } = await import('./query.ts');
    const { closePgPool } = await import('./pgPool.ts');

    try {
      await assert.rejects(
        async () =>
          withPgTransaction(async () => {
            await dbRun(`CREATE TEMP TABLE opt_c_pg_tx_probe (id INT PRIMARY KEY)`);
            await dbRun(`INSERT INTO opt_c_pg_tx_probe VALUES (1)`);
            const row = await dbGet<{ n: string }>(`SELECT COUNT(*)::text AS n FROM opt_c_pg_tx_probe`);
            assert.equal(row?.n, '1');
            throw new Error('opt_c_force_rollback');
          }),
        /opt_c_force_rollback/
      );

      await assert.rejects(async () => {
        await dbGet(`SELECT 1 FROM opt_c_pg_tx_probe LIMIT 1`);
      });
    } finally {
      await closePgPool();
    }
  }
);

test(
  'outside withPgTransaction dbGet hits pool (no AsyncLocalStorage bleed)',
  { skip: !runPg },
  async () => {
    const { dbGet } = await import('./query.ts');
    const { closePgPool } = await import('./pgPool.ts');
    try {
      const row = await dbGet<{ one: number }>('SELECT 1::int AS one');
      assert.equal(row?.one, 1);
    } finally {
      await closePgPool();
    }
  }
);
