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

// Each row: [modifierKey, applies (pipe-delimited), addLaborMin, addMatCost, pctLabor, pctMat, updatedAt]
const ROWS: [string, string, number, number, number, number, string][] = [
  ['ADA', 'Toilet Accessories|Lockers', 10, 0.1, 0, 10, '2026-03-13'],
  ['PEENED', 'Toilet Accessories', 0, 8, 0, 8, '2026-03-11'],
  ['STAINLESS', 'Toilet Accessories|Partitions|Accessories', 0, 12, 0, 12, '2026-03-11'],
  ['POWDER-COATED', 'Partitions|Lockers', 0, 15, 0, 10, '2026-03-11'],
  ['PHENOLIC', 'Partitions', 8, 75, 8, 20, '2026-03-11'],
  ['SOLID-PLASTIC', 'Partitions', 6, 60, 6, 18, '2026-03-11'],
  ['RECESSED', 'Cabinets|Accessories', 20, 0.15, 0, 15, '2026-03-14'],
  ['SEMI-RECESSED', 'Cabinets|Accessories', 12, 0.1, 0, 10, '2026-03-15'],
  ['SURFACE-MOUNT', 'Toilet Accessories|Wall Protection|Accessories', 0, 0, 0, 0, '2026-03-11'],
  ['DECK-MOUNTED', 'Toilet Accessories', 15, 20, 12, 8, '2026-03-11'],
  ['WALL-MOUNTED', 'Toilet Accessories|Accessories', 5, 0, 5, 0, '2026-03-11'],
  ['HIGH-RISE', 'Toilet Accessories|Partitions|Lockers|Visual Display Boards', 20, 0, 20, 0, '2026-03-11'],
  ['RESTRICTED-ACCESS', 'Toilet Accessories|Partitions|Lockers|Wall Protection', 15, 0, 15, 0, '2026-03-11'],
  ['AFTER-HOURS', 'Toilet Accessories|Partitions|Lockers|Accessories', 0, 0, 18, 0, '2026-03-11'],
  ['UNION', 'All Division 10', 0, 0.22, 0, 22, '2026-03-20'],
  ['TILE-WALL', 'Toilet Accessories', 18, 0.18, 0, 18, '2026-03-16'],
  ['CMU-WALL', 'Cabinets|Protection', 12, 0.12, 0, 12, '2026-03-17'],
  ['CONCRETE', 'Toilet Accessories|Cabinets|Wall Protection', 20, 12, 20, 5, '2026-03-11'],
  ['WOOD-BLOCKING', 'Toilet Accessories|Accessories', 10, 18, 8, 6, '2026-03-11'],
  ['OUT-OF-PLUMB', 'Partitions|Lockers', 25, 0.2, 0, 20, '2026-03-18'],
  ['CUSTOM-COLOR', 'Partitions|Lockers|Visual Display Boards', 0, 35, 0, 12, '2026-03-11'],
  ['CORNER-INSTALL', 'Wall Protection|Accessories', 8, 0, 8, 0, '2026-03-11'],
  ['LONG-CARRY', 'Lockers|Mailboxes', 18, 0.15, 0, 15, '2026-03-19'],
  ['FORKLIFT-REQUIRED', 'Lockers|Visual Display Boards', 5, 40, 3, 8, '2026-03-11'],
  ['FIELD-VERIFY', 'Toilet Accessories|Partitions|Lockers|Cabinets', 12, 0, 10, 0, '2026-03-11'],
  ['STANDARD', 'Toilet Accessories|Partitions|Accessories', 0, 0, 0, 0, '2026-03-12'],
  ['MULTI-STALL', 'Toilet Accessories|Partitions|Accessories', 0, 0, 0, 0, '2026-03-13'],
  ['WOMENS', 'Toilet Accessories', 0, 0, 0, 0, '2026-03-12'],
  ['MENS', 'Toilet Accessories', 0, 0, 0, 0, '2026-03-12'],
  ['LOCKER-ROOM', 'Lockers|Accessories', 0, 0, 0, 0, '2026-03-12'],
  ['TEAM', 'Lockers|Accessories', 0, 0, 0, 0, '2026-03-12'],
  ['PVC', 'Wall Protection', 0, 0, 0, 0, '2026-03-12'],
  ['UTILITY', 'Toilet Accessories|Accessories', 0, 0, 0, 0, '2026-03-12'],
  ['MATTE-BLACK', 'Accessories|Partitions', 10, 45, 12, 35, '2026-03-13'],
  ['MARBLE-WALL', 'Accessories|Cabinets', 25, 20, 25, 8, '2026-03-13'],
  ['GRANITE-WALL', 'Accessories|Cabinets', 25, 25, 25, 10, '2026-03-13'],
  ['QUARTZ-WALL', 'Accessories|Cabinets', 20, 18, 20, 6, '2026-03-13'],
  ['GLASS-MOUNT', 'Accessories', 35, 60, 30, 15, '2026-03-13'],
  ['ANTIMICROBIAL', 'Accessories', 0, 35, 0, 45, '2026-03-13'],
  ['SMART-SYNC', 'Electronics', 60, 120, 20, 15, '2026-03-13'],
  ['GENDER-NEUTRAL', 'Signage|Partitions', 15, 25, 10, 15, '2026-03-13'],
  ['HIGH-RECYCLED', 'Partitions|Accessories', 0, 15, 0, 12, '2026-03-13'],
  ['ANTI-GRAFFITI', 'Partitions|Wall Protection', 0, 25, 0, 15, '2026-03-13'],
  ['FIRE-RATED-ADD', 'Cabinets', 30, 85, 15, 25, '2026-03-13'],
  ['MULTIPLE-ITEM-LC', 'All Division 10', 0, 0, -10, 0, '2026-03-14'],
  [
    'UNASSEMBLED',
    'Toilet Accessories|Partitions|Lockers|Accessories|Visual Display Boards',
    30,
    0,
    0,
    0,
    '2026-03-15',
  ],
];

function toJsonArrayString(pipeStr: string): string {
  const arr = String(pipeStr || '')
    .split(/[|,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return JSON.stringify(arr);
}

const SQL = `
INSERT INTO public.modifiers_v1 (
  id, name, modifier_key, description, applies_to_categories,
  add_labor_minutes, add_material_cost, percent_labor, percent_material,
  active, updated_at
) VALUES ($1, $2, $3, '', $4, $5, $6, $7, $8, 1, $9)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  modifier_key = EXCLUDED.modifier_key,
  applies_to_categories = EXCLUDED.applies_to_categories,
  add_labor_minutes = EXCLUDED.add_labor_minutes,
  add_material_cost = EXCLUDED.add_material_cost,
  percent_labor = EXCLUDED.percent_labor,
  percent_material = EXCLUDED.percent_material,
  active = EXCLUDED.active,
  updated_at = EXCLUDED.updated_at
`;

const ssl = resolvePgSslConfigForConnectionString(url);
const client = new pg.Client({
  connectionString: url,
  ...(ssl !== undefined ? { ssl } : {}),
});
await client.connect();

const meta = await client.query(`SELECT inet_server_addr()::text AS addr`);
console.log(`Connected to upstream ${meta.rows[0].addr}`);

let ok = 0;
let fail = 0;
for (const r of ROWS) {
  const [key, applies, lab, mat, pl, pm, upd] = r;
  const id = key;
  const name = key;
  const json = toJsonArrayString(applies);
  try {
    await client.query(SQL, [id, name, key, json, lab, mat, pl, pm, upd]);
    ok++;
  } catch (err) {
    fail++;
    console.warn(`FAIL ${key}: ${err instanceof Error ? err.message : err}`);
  }
}
const total = await client.query(`SELECT count(*)::int AS n FROM public.modifiers_v1`);
console.log(`Done. upserted=${ok} failed=${fail}; total rows now: ${total.rows[0].n}`);
await client.end();
