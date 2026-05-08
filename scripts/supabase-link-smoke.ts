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
import {
  normalizeSupabaseDatabaseUrl,
  resolvePgSslConfigForConnectionString,
} from '../src/server/db/pgPool.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

/** Inherited from OS/shell before any dotenv — can mask .env if set (Windows). */
const inheritedDbDriver = String(process.env.DB_DRIVER || '').trim();

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

/** Parsed hostname from DATABASE_URL (for debugging DNS issues; no credentials). */
function pgHostname(connectionString: string): string {
  try {
    return new URL(connectionString).hostname;
  } catch {
    return '(invalid DATABASE_URL)';
  }
}

const supabaseUrl = String(process.env.SUPABASE_URL || '').trim();
const anon = String(process.env.SUPABASE_ANON_KEY || '').trim();
const viteUrl = String(process.env.VITE_SUPABASE_URL || '').trim();
const viteAnon = String(process.env.VITE_SUPABASE_ANON_KEY || '').trim();
const dbDriver = String(process.env.DB_DRIVER || 'sqlite').trim().toLowerCase();
const databaseUrl = normalizeSupabaseDatabaseUrl(String(process.env.DATABASE_URL || '').trim());

console.log(
  JSON.stringify(
    {
      envFiles: ['.env', '.env.local'].map((n) => ({
        name: n,
        present: fs.existsSync(path.join(root, n)),
      })),
      DB_DRIVER_inherited_from_shell_before_load: inheritedDbDriver || '(unset)',
      DB_DRIVER: dbDriver,
      SUPABASE_URL_host: supabaseUrl ? hostOnly(supabaseUrl) : 'missing',
      SUPABASE_ANON_KEY: anon ? 'set' : 'missing',
      VITE_SUPABASE_URL_host: viteUrl ? hostOnly(viteUrl) : 'missing',
      VITE_SUPABASE_ANON_KEY: viteAnon ? 'set' : 'missing',
      viteMatchesServerUrl: Boolean(supabaseUrl && viteUrl && supabaseUrl === viteUrl),
      viteMatchesServerAnon: Boolean(anon && viteAnon && anon === viteAnon),
      DATABASE_URL: databaseUrl ? 'set' : 'missing',
      DATABASE_URL_host: databaseUrl ? pgHostname(databaseUrl) : 'missing',
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
    const ssl = resolvePgSslConfigForConnectionString(databaseUrl);
    const pool = new pg.Pool({
      connectionString: databaseUrl,
      connectionTimeoutMillis: 15000,
      ...(ssl !== undefined ? { ssl } : {}),
    });
    try {
      const q = await pool.query('select 1 as ok');
      console.log('[postgres] SELECT 1 → OK', q.rows[0]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log('[postgres] FAIL', msg);
      if (/ENOTFOUND|getaddrinfo/i.test(msg) && databaseUrl) {
        const h = pgHostname(databaseUrl);
        console.log(
          '[postgres] hint: DNS failed for pooler host %s. Use a single-line URI from Supabase → Database → Connection string (must end with .pooler.supabase.com). If the host looks cut off (e.g. ends with .supabase.c), remove a line break in .env.local or fix a bad copy. If your DB password contains & # @ or spaces, URL-encode it in the connection string.',
          h
        );
      }
    } finally {
      await pool.end();
    }
  } else if (dbDriver !== 'pg') {
    console.log('[postgres] skip (DB_DRIVER is not pg)');
    if (inheritedDbDriver && inheritedDbDriver !== 'pg') {
      console.log(
        '[postgres] hint: shell had DB_DRIVER=%s before Node started; in PowerShell try: Remove-Item Env:DB_DRIVER; npm run smoke:supabase',
        inheritedDbDriver
      );
    }
  } else {
    console.log('[postgres] skip (no DATABASE_URL)');
  }
}

await main();
