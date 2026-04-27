import type { PoolClient } from 'pg';
import { getEstimatorDb } from './connection.ts';
import { isPgDriver } from './driver.ts';
import { getPgPool } from './pgPool.ts';

/** Convert SQLite-style `?` placeholders to PostgreSQL `$1`, `$2`, ... */
export function sqliteParamsToPg(sql: string): string {
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
}

export async function dbAll<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  if (isPgDriver()) {
    const { rows } = await getPgPool().query<T>(sqliteParamsToPg(sql), params);
    return rows;
  }
  return getEstimatorDb().prepare(sql).all(...params) as T[];
}

export async function dbGet<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  if (isPgDriver()) {
    const { rows } = await getPgPool().query<T>(sqliteParamsToPg(sql), params);
    return rows[0];
  }
  return getEstimatorDb().prepare(sql).get(...params) as T | undefined;
}

export async function dbRun(sql: string, params: unknown[] = []): Promise<{ changes: number }> {
  if (isPgDriver()) {
    const result = await getPgPool().query(sqliteParamsToPg(sql), params);
    return { changes: result.rowCount ?? 0 };
  }
  const info = getEstimatorDb().prepare(sql).run(...params);
  return { changes: info.changes };
}

export type DbExec = {
  all: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;
  get: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T | undefined>;
  run: (sql: string, params?: unknown[]) => Promise<{ changes: number }>;
};

function clientExec(client: PoolClient): DbExec {
  return {
    all: async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => {
      const { rows } = await client.query<T>(sqliteParamsToPg(sql), params);
      return rows as T[];
    },
    get: async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => {
      const { rows } = await client.query<T>(sqliteParamsToPg(sql), params);
      return rows[0] as T | undefined;
    },
    run: async (sql, params = []) => {
      const result = await client.query(sqliteParamsToPg(sql), params);
      return { changes: result.rowCount ?? 0 };
    },
  };
}

/**
 * PostgreSQL: async transaction with a dedicated client.
 * SQLite: better-sqlite3 requires a synchronous transaction callback — the inner function must not await.
 * Callers should keep sqlite branches synchronous (no await inside fn when on sqlite).
 */
export async function withPgTransaction<T>(fn: (exec: DbExec) => Promise<T>): Promise<T> {
  const pool = getPgPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(clientExec(client));
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export function withSqliteTransaction<T>(fn: () => T): T {
  const db = getEstimatorDb();
  return db.transaction(fn)();
}
