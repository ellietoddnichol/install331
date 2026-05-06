/**
 * Run supabase/migrations/*.sql in lexical order against DATABASE_URL.
 * Usage: set DATABASE_URL=postgresql://... or define it in .env.local, then npm run db:migrate
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const migrationsDir = path.join(root, 'supabase', 'migrations');

for (const [name, override] of [
  ['.env', false],
  ['.env.local', true],
]) {
  const full = path.join(root, name);
  if (fs.existsSync(full)) dotenv.config({ path: full, override });
}

const databaseUrl = String(
  process.env.DIRECT_URL || process.env.DATABASE_URL || ''
).trim();
if (!databaseUrl) {
  console.error('DIRECT_URL or DATABASE_URL is required for db:migrate');
  process.exit(1);
}

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

try {
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
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
