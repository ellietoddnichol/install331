/**
 * Verifies Supabase project reachability using your .env + .env.local (same load order as server.ts).
 * Run: npx tsx scripts/supabase-link-smoke.ts
 *
 * Does not print secrets — only host shapes and pass/fail.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

for (const [fileName, override] of [
  ['.env', false],
  ['.env.local', true],
] as const) {
  const fullPath = path.join(root, fileName);
  if (fs.existsSync(fullPath)) dotenv.config({ path: fullPath, override });
}

function hostOnly(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '(invalid URL)';
  }
}

const supabaseUrl = String(process.env.SUPABASE_URL || '').trim();
const anon = String(process.env.SUPABASE_ANON_KEY || '').trim();
const viteUrl = String(process.env.VITE_SUPABASE_URL || '').trim();
const viteAnon = String(process.env.VITE_SUPABASE_ANON_KEY || '').trim();
const dbDriver = String(process.env.DB_DRIVER || 'sqlite').trim().toLowerCase();
const databaseUrl = String(process.env.DATABASE_URL || '').trim();

console.log(
  JSON.stringify(
    {
      envFiles: ['.env', '.env.local'].map((n) => ({
        name: n,
        present: fs.existsSync(path.join(root, n)),
      })),
      DB_DRIVER: dbDriver,
      SUPABASE_URL_host: supabaseUrl ? hostOnly(supabaseUrl) : 'missing',
      SUPABASE_ANON_KEY: anon ? 'set' : 'missing',
      VITE_SUPABASE_URL_host: viteUrl ? hostOnly(viteUrl) : 'missing',
      VITE_SUPABASE_ANON_KEY: viteAnon ? 'set' : 'missing',
      viteMatchesServerUrl: Boolean(supabaseUrl && viteUrl && supabaseUrl === viteUrl),
      viteMatchesServerAnon: Boolean(anon && viteAnon && anon === viteAnon),
      DATABASE_URL: databaseUrl ? 'set' : 'missing',
    },
    null,
    2
  )
);

async function main(): Promise<void> {
  if (supabaseUrl && anon) {
    const base = supabaseUrl.replace(/\/$/, '');
    try {
      const r = await fetch(`${base}/auth/v1/health`, {
        method: 'GET',
        headers: { apikey: anon, Authorization: `Bearer ${anon}` },
      });
      const body = r.ok ? '' : await r.text();
      console.log(
        `[supabase] GET /auth/v1/health → ${r.status} ${r.ok ? 'OK' : body.slice(0, 200)}`
      );
    } catch (e) {
      console.log('[supabase] GET /auth/v1/health → FAIL', e instanceof Error ? e.message : e);
    }
  } else {
    console.log('[supabase] skip (need SUPABASE_URL + SUPABASE_ANON_KEY)');
  }

  if (dbDriver === 'pg' && databaseUrl) {
    const pool = new pg.Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 15000 });
    try {
      const q = await pool.query('select 1 as ok');
      console.log('[postgres] SELECT 1 → OK', q.rows[0]);
    } catch (e) {
      console.log('[postgres] FAIL', e instanceof Error ? e.message : e);
    } finally {
      await pool.end();
    }
  } else if (dbDriver !== 'pg') {
    console.log('[postgres] skip (DB_DRIVER is not pg)');
  } else {
    console.log('[postgres] skip (no DATABASE_URL)');
  }
}

await main();
