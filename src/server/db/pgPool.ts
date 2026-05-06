import pg from 'pg';
import { assertPgEnv } from './driver.ts';
import { resolvePgSslConfig } from './pgSsl.ts';

let pool: pg.Pool | null = null;

export function getPgPool(): pg.Pool {
  assertPgEnv();
  const url = String(process.env.DATABASE_URL || '').trim();
  if (!url) {
    throw new Error('DATABASE_URL is required when DB_DRIVER=pg');
  }
  if (!pool) {
    const ssl = resolvePgSslConfig();
    pool = new pg.Pool({
      connectionString: url,
      max: Number(process.env.PG_POOL_MAX || 20),
      idleTimeoutMillis: 30_000,
      ...(ssl !== false ? { ssl } : {}),
    });
  }
  return pool;
}

export async function closePgPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
