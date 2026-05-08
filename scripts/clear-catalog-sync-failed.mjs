import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import dotenv from 'dotenv';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
for (const [name, override] of [
  ['.env', false],
  ['.env.local', true],
]) {
  const full = path.join(root, name);
  if (fs.existsSync(full)) dotenv.config({ path: full, override });
}

const url = String(process.env.DIRECT_URL || process.env.DATABASE_URL || '').trim();
if (!url) {
  console.error('DIRECT_URL or DATABASE_URL is required.');
  process.exit(1);
}

const client = new pg.Client({
  connectionString: url,
  ssl: /supabase\.co|pooler\.supabase\.com/i.test(url) ? { rejectUnauthorized: false } : undefined,
});
await client.connect();

const before = await client.query(
  `SELECT id, status, message FROM public.catalog_sync_status_v1`
);
console.log('Before:', before.rows);

await client.query(
  `UPDATE public.catalog_sync_status_v1
   SET status = 'never',
       message = NULL,
       last_attempt_at = NULL
   WHERE status = 'failed'`
);

const after = await client.query(
  `SELECT id, status, message FROM public.catalog_sync_status_v1`
);
console.log('After:', after.rows);

await client.end();
