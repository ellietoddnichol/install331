import pg from 'pg';
import { assertPgEnv } from './driver.ts';

let pool: pg.Pool | null = null;

function validateDatabaseUrl(raw: string): void {
  // Provide a readable error instead of EINVALIDUSERINFO from pg's parser.
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(
      [
        'Invalid DATABASE_URL format.',
        'Expected: postgresql://USER:PASSWORD@HOST:PORT/DBNAME?sslmode=require',
        `Received: ${JSON.stringify(raw)}`,
      ].join(' ')
    );
  }

  const protocol = parsed.protocol.replace(':', '');
  if (protocol !== 'postgresql' && protocol !== 'postgres') {
    throw new Error(`Invalid DATABASE_URL protocol "${parsed.protocol}". Use "postgresql://" or "postgres://".`);
  }
  if (!parsed.hostname) {
    throw new Error('Invalid DATABASE_URL: missing host.');
  }
  if (!parsed.username) {
    throw new Error('Invalid DATABASE_URL: missing username.');
  }
  const dbName = parsed.pathname.replace(/^\//, '');
  if (!dbName) {
    throw new Error('Invalid DATABASE_URL: missing database name (path).');
  }
  // Defensive: if credentials include raw reserved characters, node URL parser would keep them,
  // but downstream parsers may fail. Give a helpful hint.
  if (/[ @]/.test(parsed.username) || /[ @]/.test(parsed.password)) {
    throw new Error(
      'Invalid DATABASE_URL: username/password contains spaces or "@". URL-encode reserved characters (e.g. "@" -> "%40").'
    );
  }
}

export function getPgPool(): pg.Pool {
  assertPgEnv();
  const url = String(process.env.DATABASE_URL || '').trim();
  if (!url) {
    throw new Error('DATABASE_URL is required when DB_DRIVER=pg');
  }
  if (!pool) {
    validateDatabaseUrl(url);
    pool = new pg.Pool({
      connectionString: url,
      max: Number(process.env.PG_POOL_MAX || 20),
      idleTimeoutMillis: 30_000,
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
