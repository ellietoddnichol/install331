import pg from 'pg';
import { assertPgEnv } from './driver.ts';

let pool: pg.Pool | null = null;

/**
 * Supabase Postgres (direct + pooler) presents a Supabase-issued cert that Node sees as
 * "self-signed in chain" by default. We accept it (rejectUnauthorized=false) for known
 * Supabase hostnames or when the operator explicitly opts out via PG_SSL_REJECT_UNAUTHORIZED=0.
 * Channel security (TLS encryption) is preserved; we just skip CA verification.
 */
function resolvePgSslConfig(connectionString: string): pg.PoolConfig['ssl'] {
  const explicit = String(process.env.PG_SSL_REJECT_UNAUTHORIZED ?? '').trim();
  if (explicit === '0' || explicit.toLowerCase() === 'false') {
    return { rejectUnauthorized: false };
  }
  if (explicit === '1' || explicit.toLowerCase() === 'true') {
    return { rejectUnauthorized: true };
  }
  try {
    const host = new URL(connectionString).hostname;
    if (/\.supabase\.(co|com|net)$/i.test(host) || /pooler\.supabase\.com$/i.test(host)) {
      return { rejectUnauthorized: false };
    }
  } catch {
    // ignore — let pg use its default ssl behavior for non-URL strings
  }
  return undefined;
}

export function getPgPool(): pg.Pool {
  assertPgEnv();
  const url = String(process.env.DATABASE_URL || '').trim();
  if (!url) {
    throw new Error('DATABASE_URL is required when DB_DRIVER=pg');
  }
  if (!pool) {
    const ssl = resolvePgSslConfig(url);
    pool = new pg.Pool({
      connectionString: url,
      max: Number(process.env.PG_POOL_MAX || 20),
      idleTimeoutMillis: 30_000,
      ...(ssl !== undefined ? { ssl } : {}),
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
