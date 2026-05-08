/**
 * Run supabase/migrations/*.sql in lexical order against DATABASE_URL.
 * Usage: set DATABASE_URL=postgresql://... or define it in .env.local, then npm run db:migrate
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';
import { normalizeSupabaseDatabaseUrl, resolvePgSslConfigForConnectionString } from '../src/server/db/pgPool.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const migrationsDir = path.join(root, 'supabase', 'migrations');

for (const [name, override] of [
  ['.env', false],
  ['.env.local', true],
] as const) {
  const full = path.join(root, name);
  if (fs.existsSync(full)) dotenv.config({ path: full, override });
}

const rawUrl = String(process.env.DIRECT_URL || process.env.DATABASE_URL || '').trim();
const databaseUrl = normalizeSupabaseDatabaseUrl(rawUrl);
if (!databaseUrl) {
  console.error('DIRECT_URL or DATABASE_URL is required for db:migrate');
  process.exit(1);
}

const ssl = resolvePgSslConfigForConnectionString(databaseUrl);
const client = new pg.Client({
  connectionString: databaseUrl,
  ...(ssl !== undefined ? { ssl } : {}),
});
await client.connect();

try {
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const full = path.join(migrationsDir, file);
    const sql = fs.readFileSync(full, 'utf8');
    console.log(`Applying ${file} ...`);
    await client.query(sql);
  }
  console.log('Migrations complete.');
} finally {
  await client.end();
}
