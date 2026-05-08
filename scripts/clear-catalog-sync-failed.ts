import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import dotenv from 'dotenv';
import pg from 'pg';
import { normalizeSupabaseDatabaseUrl, resolvePgSslConfigForConnectionString } from '../src/server/db/pgPool.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
for (const [name, override] of [
  ['.env', false],
  ['.env.local', true],
] as const) {
  const full = path.join(root, name);
  if (fs.existsSync(full)) dotenv.config({ path: full, override });
}

const rawUrl = String(process.env.DIRECT_URL || process.env.DATABASE_URL || '').trim();
const url = normalizeSupabaseDatabaseUrl(rawUrl);
if (!url) {
  console.error('DIRECT_URL or DATABASE_URL is required.');
  process.exit(1);
}

const ssl = resolvePgSslConfigForConnectionString(url);
const client = new pg.Client({
  connectionString: url,
  ...(ssl !== undefined ? { ssl } : {}),
});
await client.connect();

const before = await client.query(`SELECT id, status, message FROM public.catalog_sync_status_v1`);
console.log('Before:', before.rows);

await client.query(
  `UPDATE public.catalog_sync_status_v1
   SET status = 'never',
       message = NULL,
       last_attempt_at = NULL
   WHERE status = 'failed'`
);

const after = await client.query(`SELECT id, status, message FROM public.catalog_sync_status_v1`);
console.log('After:', after.rows);

await client.end();
