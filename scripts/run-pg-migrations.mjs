/**
 * Run supabase/migrations/*.sql in lexical order against DATABASE_URL.
 * Usage: set DATABASE_URL=postgresql://... then npm run db:migrate
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const migrationsDir = path.join(root, 'supabase', 'migrations');

const databaseUrl = String(process.env.DATABASE_URL || '').trim();
if (!databaseUrl) {
  console.error('DATABASE_URL is required for db:migrate');
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
