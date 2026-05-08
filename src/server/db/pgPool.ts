import pg from 'pg';
import { assertPgEnv } from './driver.ts';

let pool: pg.Pool | null = null;

/**
 * Without this, newer `pg-connection-string` treats `sslmode=require` like `verify-full`, which
 * breaks Supabase pooler TLS in Node. `uselibpqcompat=true` restores libpq semantics for `require`.
 */
export function normalizeSupabaseDatabaseUrl(connectionString: string): string {
  const raw = String(connectionString || '').trim();
  if (!raw) return raw;
  try {
    const u = new URL(raw);
    const host = u.hostname;
    const isSupabase =
      /\.supabase\.(co|com|net)$/i.test(host) || /pooler\.supabase\.com$/i.test(host);
    if (!isSupabase) return raw;
    if (!u.searchParams.has('uselibpqcompat')) {
      u.searchParams.set('uselibpqcompat', 'true');
    }
    return u.toString();
  } catch {
    return raw;
  }
}

/**
 * Supabase Postgres (direct + pooler) presents a Supabase-issued cert that Node sees as
 * "self-signed in chain" by default. We accept it (rejectUnauthorized=false) for known
 * Supabase hostnames or when the operator explicitly opts out via PG_SSL_REJECT_UNAUTHORIZED=0.
 * Channel security (TLS encryption) is preserved; we just skip CA verification.
 */
/** Exported for scripts (e.g. smoke) that must match runtime TLS behavior for Supabase pooler. */
export function resolvePgSslConfigForConnectionString(connectionString: string): pg.PoolConfig['ssl'] {
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
  const url = normalizeSupabaseDatabaseUrl(String(process.env.DATABASE_URL || '').trim());
  if (!url) {
    throw new Error('DATABASE_URL is required when DB_DRIVER=pg');
  }
  if (!pool) {
    const ssl = resolvePgSslConfigForConnectionString(url);
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
