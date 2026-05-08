/**
 * Bulk-upsert a TSV catalog dump into Supabase `public.catalog_items`.
 *
 * Expected columns (tab-separated, header on line 1):
 *   SKU, Category, Manufacturer, Model, Series, Description, Unit,
 *   BaseMaterialCost, BaseLaborMinutes, Active, UpdatedAt,
 *   GenericItemName, DefaultModifiers, ImageURL
 *
 * Conflict target: unique partial index on (lower(brand), lower(sku))
 * where sku IS NOT NULL and sku <> ''.
 *
 * Usage:
 *   npx tsx scripts/import-catalog-tsv.ts tmp/catalog-import.tsv
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

for (const [name, override] of [
  ['.env', false],
  ['.env.local', true],
] as const) {
  const full = path.join(root, name);
  if (fs.existsSync(full)) dotenv.config({ path: full, override });
}

const databaseUrl = String(
  process.env.DIRECT_URL || process.env.DATABASE_URL || ''
).trim();

if (!databaseUrl) {
  console.error('[catalog-import] DATABASE_URL or DIRECT_URL is required.');
  process.exit(1);
}

type Row = {
  sku: string;
  category_key: string;
  manufacturer_name: string;
  brand: string;
  model: string | null;
  series: string | null;
  description: string | null;
  unit: string | null;
  base_material_cost: number | null;
  default_install_minutes: number | null;
  active: boolean;
  raw_name: string | null;
  beautified_name: string | null;
  image_url: string | null;
  updated_at: string;
};

function toCategoryKey(input: string): string {
  return input
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\//g, ' ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

function toNumberOrNull(s: string | undefined): number | null {
  if (s == null) return null;
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function toBoolDefaultTrue(s: string | undefined): boolean {
  if (!s) return true;
  const t = s.trim().toUpperCase();
  if (t === 'FALSE' || t === '0' || t === 'NO') return false;
  return true;
}

function toIsoTimestamp(s: string | undefined): string {
  const fallback = new Date().toISOString();
  if (!s) return fallback;
  const t = s.trim();
  if (!t) return fallback;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toISOString();
}

function nullIfEmpty(s: string | undefined): string | null {
  if (s == null) return null;
  const t = s.trim();
  return t ? t : null;
}

function parseTsv(content: string): Row[] {
  const lines = content.split(/\r?\n/);
  if (lines.length < 2) return [];
  const dataLines = lines.slice(1);
  const rows: Row[] = [];
  const seen = new Map<string, number>();

  for (let i = 0; i < dataLines.length; i++) {
    const raw = dataLines[i];
    if (!raw || !raw.trim()) continue;
    const cols = raw.split('\t');
    const sku = (cols[0] || '').trim();
    const manufacturer = (cols[2] || '').trim();
    if (!sku || !manufacturer) continue;
    const categoryRaw = (cols[1] || '').trim();
    const categoryKey = toCategoryKey(categoryRaw);
    if (!categoryKey) continue;
    const row: Row = {
      sku,
      category_key: categoryKey,
      manufacturer_name: manufacturer,
      brand: manufacturer,
      model: nullIfEmpty(cols[3]),
      series: nullIfEmpty(cols[4]),
      description: nullIfEmpty(cols[5]),
      unit: nullIfEmpty(cols[6]),
      base_material_cost: toNumberOrNull(cols[7]),
      default_install_minutes: toNumberOrNull(cols[8]),
      active: toBoolDefaultTrue(cols[9]),
      updated_at: toIsoTimestamp(cols[10]),
      raw_name: nullIfEmpty(cols[11]),
      beautified_name: nullIfEmpty(cols[11]),
      image_url: nullIfEmpty(cols[13]),
    };
    const key = `${row.brand.toLowerCase()}|${row.sku.toLowerCase()}`;
    seen.set(key, rows.length);
    if (seen.get(key) === rows.length) {
      rows.push(row);
    } else {
      rows[seen.get(key)!] = row;
    }
  }
  // Dedupe (last-write-wins); rebuild from map values.
  const finalRows: Row[] = [];
  const dedup = new Map<string, Row>();
  for (const r of rows) {
    const k = `${r.brand.toLowerCase()}|${r.sku.toLowerCase()}`;
    dedup.set(k, r);
  }
  for (const r of dedup.values()) finalRows.push(r);
  return finalRows;
}

const UPSERT_SQL = `
INSERT INTO public.catalog_items (
  sku, category_key, manufacturer_name, brand, model, series,
  description, unit, base_material_cost, default_install_minutes,
  active, raw_name, beautified_name, image_url, updated_at
) VALUES (
  $1, $2, $3, $4, $5, $6,
  $7, $8, $9, $10,
  $11, $12, $13, $14, $15
)
ON CONFLICT (lower(coalesce(brand, '')), lower(coalesce(sku, '')))
WHERE (sku IS NOT NULL AND sku <> '')
DO UPDATE SET
  category_key = EXCLUDED.category_key,
  manufacturer_name = EXCLUDED.manufacturer_name,
  brand = EXCLUDED.brand,
  model = EXCLUDED.model,
  series = EXCLUDED.series,
  description = EXCLUDED.description,
  unit = EXCLUDED.unit,
  base_material_cost = EXCLUDED.base_material_cost,
  default_install_minutes = EXCLUDED.default_install_minutes,
  active = EXCLUDED.active,
  raw_name = EXCLUDED.raw_name,
  beautified_name = EXCLUDED.beautified_name,
  image_url = EXCLUDED.image_url,
  updated_at = EXCLUDED.updated_at;
`;

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: tsx scripts/import-catalog-tsv.ts <path-to-tsv>');
    process.exit(1);
  }
  const abs = path.isAbsolute(filePath) ? filePath : path.join(root, filePath);
  if (!fs.existsSync(abs)) {
    console.error(`[catalog-import] File not found: ${abs}`);
    process.exit(1);
  }
  const content = fs.readFileSync(abs, 'utf8');
  const rows = parseTsv(content);
  console.log(`[catalog-import] Parsed ${rows.length} unique rows from ${path.relative(root, abs)}`);

  const sslLooksSupabase = /supabase\.co|pooler\.supabase\.com/i.test(databaseUrl);
  const client = new pg.Client({
    connectionString: databaseUrl,
    ssl: sslLooksSupabase ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();
  let inserted = 0;
  let failed = 0;
  try {
    for (const r of rows) {
      try {
        await client.query(UPSERT_SQL, [
          r.sku,
          r.category_key,
          r.manufacturer_name,
          r.brand,
          r.model,
          r.series,
          r.description,
          r.unit,
          r.base_material_cost,
          r.default_install_minutes,
          r.active,
          r.raw_name,
          r.beautified_name,
          r.image_url,
          r.updated_at,
        ]);
        inserted++;
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[catalog-import] FAIL sku=${r.sku} brand=${r.brand}: ${msg}`);
      }
    }
  } finally {
    await client.end();
  }
  console.log(`[catalog-import] Done. upserted=${inserted}, failed=${failed}`);
}

main().catch((err) => {
  console.error('[catalog-import] Fatal:', err);
  process.exit(1);
});
