/**
 * One-off migration: SQLite estimator.db → Postgres (Supabase).
 *
 * Usage:
 *   DATABASE_URL=postgresql://... SQLITE_PATH=./estimator.db tsx scripts/migrate-sqlite-to-pg.ts
 *   DRY_RUN=1 tsx scripts/migrate-sqlite-to-pg.ts   # row counts only, no writes
 *
 * Optional: uploads project_files_v1 blobs to Supabase Storage when
 * SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + SUPABASE_STORAGE_BUCKET are set.
 */
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SQLITE_PATH = String(process.env.SQLITE_PATH || process.env.SQLITE_DB || './estimator.db').trim();
const DATABASE_URL = String(process.env.DATABASE_URL || '').trim();
const DRY_RUN = ['1', 'true', 'yes'].includes(String(process.env.DRY_RUN || '').trim().toLowerCase());

const TABLE_ORDER = [
  'projects_v1',
  'rooms_v1',
  'catalog_items',
  'estimator_catalog_attribute_defs',
  'estimator_parametric_modifiers',
  'estimator_sku_aliases',
  'estimator_catalog_item_attributes',
  'estimator_norm_bundles_v1',
  'estimator_norm_bundle_items_v1',
  'estimator_catalog_validation_issues',
  'takeoff_lines_v1',
  'settings_v1',
  'modifiers_v1',
  'bundles_v1',
  'bundle_items_v1',
  'line_modifiers_v1',
  'catalog_sync_status_v1',
  'catalog_sync_runs_v1',
  'project_files_v1',
  'intake_catalog_memory_v1',
] as const;

async function pgColumnNames(pool: pg.Pool, table: string): Promise<Set<string>> {
  const { rows } = await pool.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [table]
  );
  return new Set(rows.map((r) => r.column_name));
}

function placeholders(n: number): string {
  return Array.from({ length: n }, (_, i) => `$${i + 1}`).join(', ');
}

async function migrateTable(
  sqlite: Database.Database,
  pool: pg.Pool,
  table: string,
  dryRun: boolean,
  uploadFile?: (row: Record<string, unknown>) => Promise<Record<string, unknown>>
): Promise<{ sqlite: number; pgInserted: number }> {
  const pgCols = await pgColumnNames(pool, table);
  const rows = sqlite.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[];
  let pgInserted = 0;

  for (const row of rows) {
    let working = { ...row };
    if (uploadFile) {
      working = await uploadFile(working);
    }

    const cols = Object.keys(working).filter((k) => pgCols.has(k));
    if (!cols.length) continue;
    const vals = cols.map((c) => working[c]);
    const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders(cols.length)}) ON CONFLICT DO NOTHING`;

    if (!dryRun) {
      const res = await pool.query(sql, vals);
      pgInserted += res.rowCount ?? 0;
    }
  }

  return { sqlite: rows.length, pgInserted: dryRun ? 0 : pgInserted };
}

async function countPg(pool: pg.Pool, table: string): Promise<number> {
  const { rows } = await pool.query<{ c: string }>(`SELECT count(*)::text AS c FROM ${table}`);
  return Number(rows[0]?.c || 0);
}

function sqliteTableExists(sqlite: Database.Database, table: string): boolean {
  const row = sqlite.prepare(`SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?`).get(table) as
    | { ok: number }
    | undefined;
  return Boolean(row);
}

async function main() {
  if (!DATABASE_URL) {
    console.error('DATABASE_URL is required.');
    process.exit(1);
  }
  const absSqlite = path.isAbsolute(SQLITE_PATH) ? SQLITE_PATH : path.join(process.cwd(), SQLITE_PATH);
  if (!fs.existsSync(absSqlite)) {
    console.error(`SQLite file not found: ${absSqlite}`);
    process.exit(1);
  }

  const sqlite = new Database(absSqlite, { readonly: true });
  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  const supabaseUrl = String(process.env.SUPABASE_URL || '').trim();
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const bucket = String(process.env.SUPABASE_STORAGE_BUCKET || 'project-files').trim();
  const storage =
    supabaseUrl && serviceKey
      ? createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
      : null;

  console.log(`SQLite: ${absSqlite}`);
  console.log(`Dry run: ${DRY_RUN}`);
  console.log(`Storage upload: ${storage ? 'yes' : 'no'}`);

  const countsBefore = new Map<string, number>();
  for (const t of TABLE_ORDER) {
    countsBefore.set(t, await countPg(pool, t));
  }

  for (const table of TABLE_ORDER) {
    if (!sqliteTableExists(sqlite, table)) {
      console.warn(`[${table}] missing in SQLite — skipped`);
      continue;
    }
    if (table === 'project_files_v1' && storage) {
      await migrateTable(sqlite, pool, table, DRY_RUN, async (row) => {
        const dataB64 = row.data_base64;
        const projectId = String(row.project_id ?? '');
        const fileId = String(row.id ?? '');
        if (!dataB64 || row.storage_object_key) return row;
        const key = `projects/${projectId}/files/${fileId}`;
        if (!DRY_RUN) {
          const body = Buffer.from(String(dataB64), 'base64');
          const { error } = await storage.storage.from(bucket).upload(key, body, {
            contentType: String(row.mime_type || 'application/octet-stream'),
            upsert: true,
          });
          if (error) {
            console.warn(`[project_files_v1] storage upload failed for ${fileId}: ${error.message}`);
            return row;
          }
        }
        return { ...row, storage_object_key: key, data_base64: null };
      });
    } else {
      await migrateTable(sqlite, pool, table, DRY_RUN);
    }
    const sCount = sqlite.prepare(`SELECT count(*) AS c FROM ${table}`).get() as { c: number };
    const pCount = await countPg(pool, table);
    console.log(
      `[${table}] sqlite_rows=${Number(sCount.c)} pg_count_after=${pCount} (pg_before=${countsBefore.get(table)})`
    );
  }

  sqlite.close();
  await pool.end();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
