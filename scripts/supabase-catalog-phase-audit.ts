/**
 * Supabase-catalog audit package generator (Phase 1 data surfaces).
 * Read-only queries; writes markdown/CSV under reports/supabase-catalog-audit/.
 *
 *   npm run catalog:audit:supabase-phase
 *   DB_DRIVER=pg DATABASE_URL=... npm run catalog:audit:supabase-phase
 *
 * Reuses `.env` / `.env.local` like catalog-audit.ts.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { isPgDriver } from '../src/server/db/driver.ts';
import { closePgPool } from '../src/server/db/pgPool.ts';
import { dbAll, dbGet } from '../src/server/db/query.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(REPO_ROOT, 'reports', 'supabase-catalog-audit');

for (const [name, override] of [
  ['.env', false],
  ['.env.local', true],
] as const) {
  const p = path.join(REPO_ROOT, name);
  if (fs.existsSync(p)) dotenv.config({ path: p, override });
}

const AUDIT_TABLES_ESTIMATOR_LINEAGE = [
  'catalog_items',
  'modifiers_v1',
  'bundles_v1',
  'bundle_items_v1',
  'catalog_sync_status_v1',
  'catalog_sync_runs_v1',
  'catalog_sheet_import_rows',
  'catalog_item_aliases',
  'catalog_item_attributes',
  'intake_catalog_memory_v1',
  'estimator_catalog_attribute_defs',
  'estimator_parametric_modifiers',
  'estimator_sku_aliases',
  'estimator_catalog_item_attributes',
  'estimator_norm_bundles_v1',
  'estimator_norm_bundle_items_v1',
  'estimator_catalog_validation_issues',
  'settings_v1',
] as const;

function escapeCell(v: string): string {
  const s = String(v).replace(/"/g, '""');
  if (/[",\n\r]/.test(s)) return `"${s}"`;
  return s;
}

function writeCsv(fileName: string, header: string[], rows: string[][]): void {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(r.map((c) => escapeCell(String(c))).join(','));
  }
  fs.writeFileSync(path.join(OUT_DIR, fileName), lines.join('\n'), 'utf8');
}

async function tableExists(name: string): Promise<boolean> {
  if (isPgDriver()) {
    const r = await dbGet<{ ok: number }>(
      `SELECT 1 AS ok FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ? LIMIT 1`,
      [name]
    );
    return !!r;
  }
  const r = await dbGet<{ ok: number }>(
    `SELECT 1 AS ok FROM sqlite_master WHERE type IN ('table','view') AND name = ?`,
    [name]
  );
  return !!r;
}

async function maybeCount(table: string): Promise<number | null> {
  if (!(await tableExists(table))) return null;
  try {
    const sql = isPgDriver() ? `SELECT COUNT(*)::integer AS n FROM ${table}` : `SELECT COUNT(1) AS n FROM ${table}`;
    const row = await dbGet<{ n: number }>(sql, []);
    return Number(row?.n ?? 0);
  } catch {
    return null;
  }
}

async function run(): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const driver = isPgDriver() ? 'pg' : 'sqlite';
  console.log(`Supabase-phase catalog audit (${driver}) → ${path.relative(REPO_ROOT, OUT_DIR)}`);

  // --- table_row_counts.csv
  const countRows: string[][] = [['table_name', 'row_count', 'exists']];
  for (const t of AUDIT_TABLES_ESTIMATOR_LINEAGE) {
    const c = await maybeCount(t);
    countRows.push([t, c == null ? '' : String(c), c == null ? '0' : '1']);
  }
  writeCsv('table_row_counts.csv', countRows[0], countRows.slice(1));

  if (!(await tableExists('catalog_items'))) {
    console.warn('catalog_items missing — skipping derived catalog reports.');
    return;
  }

  // --- duplicate_candidates.csv (same logical manufacturer key + SKU key)
  const dupSql = isPgDriver()
    ? `
    SELECT
      COALESCE(NULLIF(TRIM(manufacturer_normalized), ''), LOWER(TRIM(COALESCE(manufacturer, '')))) AS mfr_key,
      COALESCE(NULLIF(TRIM(sku_normalized), ''), LOWER(TRIM(COALESCE(sku, '')))) AS sku_key,
      COUNT(*)::integer AS cnt,
      string_agg(DISTINCT id::text, '|' ORDER BY id::text) AS catalog_item_ids
    FROM catalog_items
    GROUP BY 1, 2
    HAVING COUNT(*) > 1 AND LENGTH(COALESCE(sku_key, '')) > 0
    ORDER BY cnt DESC
    `
    : `
    SELECT
      COALESCE(NULLIF(TRIM(manufacturer_normalized), ''), LOWER(TRIM(COALESCE(manufacturer, '')))) AS mfr_key,
      COALESCE(NULLIF(TRIM(sku_normalized), ''), LOWER(TRIM(COALESCE(sku, '')))) AS sku_key,
      COUNT(*) AS cnt,
      GROUP_CONCAT(DISTINCT id) AS catalog_item_ids
    FROM catalog_items
    GROUP BY mfr_key, sku_key
    HAVING COUNT(*) > 1 AND LENGTH(COALESCE(sku_key, '')) > 0
    ORDER BY cnt DESC
    `;

  try {
    const dups = await dbAll<{ mfr_key: string; sku_key: string; cnt: number; catalog_item_ids: string }>(
      dupSql,
      []
    );
    writeCsv(
      'duplicate_candidates.csv',
      ['mfr_key', 'sku_key', 'row_count', 'catalog_item_ids'],
      dups.map((r) => [r.mfr_key, r.sku_key, String(r.cnt), r.catalog_item_ids || ''])
    );
  } catch (e) {
    writeCsv('duplicate_candidates.csv', ['error'], [[String(e)]]);
  }

  // --- missing_required_fields.csv (estimator-production heuristics)
  const missingSql = `
    SELECT id, sku, category, manufacturer, uom,
           base_material_cost, base_labor_minutes, active, install_labor_family,
           CASE WHEN active = 1 AND (sku IS NULL OR TRIM(sku) = '') THEN 'missing_sku;' ELSE '' END ||
           CASE WHEN active = 1 AND (category IS NULL OR TRIM(category) = '') THEN 'missing_category;' ELSE '' END ||
           CASE WHEN active = 1 AND (manufacturer IS NULL OR TRIM(manufacturer) = '') THEN 'missing_manufacturer;' ELSE '' END ||
           CASE WHEN active = 1 AND (uom IS NULL OR TRIM(uom) = '') THEN 'missing_uom;' ELSE '' END ||
           CASE WHEN active = 1 AND (base_labor_minutes IS NULL OR base_labor_minutes < 0) THEN 'missing_or_bad_labor;' ELSE '' END ||
           CASE WHEN active = 1 AND (install_labor_family IS NULL OR TRIM(install_labor_family) = '') THEN 'missing_install_labor_family;' ELSE '' END
           AS violation_flags
    FROM catalog_items
    WHERE active = 1
      AND (
        sku IS NULL OR TRIM(sku) = '' OR
        category IS NULL OR TRIM(category) = '' OR
        manufacturer IS NULL OR TRIM(manufacturer) = '' OR
        uom IS NULL OR TRIM(uom) = '' OR
        base_labor_minutes IS NULL OR base_labor_minutes < 0 OR
        install_labor_family IS NULL OR TRIM(install_labor_family) = ''
      )
  `;
  const missing = await dbAll<Record<string, unknown>>(missingSql, []);
  writeCsv(
    'missing_required_fields.csv',
    ['id', 'sku', 'category', 'manufacturer', 'uom', 'base_material_cost', 'base_labor_minutes', 'active', 'install_labor_family', 'violation_flags'],
    missing.map((r) =>
      [
        String(r.id ?? ''),
        String(r.sku ?? ''),
        String(r.category ?? ''),
        String(r.manufacturer ?? ''),
        String(r.uom ?? ''),
        String(r.base_material_cost ?? ''),
        String(r.base_labor_minutes ?? ''),
        String(r.active ?? ''),
        String(r.install_labor_family ?? ''),
        String(r.violation_flags ?? ''),
      ]
    )
  );

  // --- suspicious_labor_minutes.csv
  const susLaborSqlPg = `
    SELECT id, sku, category, manufacturer, description, base_labor_minutes, uom,
           CASE
             WHEN base_labor_minutes IS NULL THEN 'null_labor'
             WHEN base_labor_minutes < 0 THEN 'negative'
             WHEN base_labor_minutes = 0 THEN 'zero_active'
             WHEN base_labor_minutes > 720 THEN 'very_high_gt_12hr'
             WHEN base_labor_minutes BETWEEN 1 AND 4
                  AND category || ' ' || COALESCE(description,'') || COALESCE(subcategory,'') ILIKE '%partition%'
             THEN 'suspiciously_low_vs_category_partition'
             ELSE 'other_review'
           END AS reason_bucket
    FROM catalog_items
    WHERE active = 1
      AND (
        base_labor_minutes IS NULL OR base_labor_minutes < 0 OR base_labor_minutes > 720
        OR base_labor_minutes = 0
        OR (
          base_labor_minutes BETWEEN 1 AND 4
          AND category || COALESCE(description,'') || COALESCE(subcategory,'')
              ILIKE '%partition%'
        )
      )
  `;
  const susLaborSqlSqlite = `
    SELECT id, sku, category, manufacturer, description, base_labor_minutes, uom,
           CASE
             WHEN base_labor_minutes IS NULL THEN 'null_labor'
             WHEN base_labor_minutes < 0 THEN 'negative'
             WHEN base_labor_minutes = 0 THEN 'zero_active'
             WHEN base_labor_minutes > 720 THEN 'very_high_gt_12hr'
             WHEN base_labor_minutes BETWEEN 1 AND 5
                  AND lower(ifnull(category,'') || ' ' || ifnull(description,'') || ' ' || ifnull(subcategory,''))
                      LIKE '%partition%'
             THEN 'suspiciously_low_vs_category_partition'
             ELSE 'other_review'
           END AS reason_bucket
    FROM catalog_items
    WHERE active = 1
      AND (
        base_labor_minutes IS NULL OR base_labor_minutes < 0 OR base_labor_minutes > 720
        OR base_labor_minutes = 0
        OR (
          base_labor_minutes BETWEEN 1 AND 5
          AND lower(ifnull(category,'') || ifnull(description,'') || ifnull(subcategory,'')) LIKE '%partition%'
        )
      )
  `;
  try {
    const sus = await dbAll<Record<string, unknown>>(isPgDriver() ? susLaborSqlPg : susLaborSqlSqlite, []);
    writeCsv(
      'suspicious_labor_minutes.csv',
      ['id', 'sku', 'category', 'manufacturer', 'description', 'base_labor_minutes', 'uom', 'reason_bucket'],
      sus.map((r) =>
        [
          String(r.id),
          String(r.sku ?? ''),
          String(r.category ?? ''),
          String(r.manufacturer ?? ''),
          String(r.description ?? '').slice(0, 200),
          String(r.base_labor_minutes ?? ''),
          String(r.uom ?? ''),
          String(r.reason_bucket ?? ''),
        ]
      )
    );
  } catch {
    writeCsv('suspicious_labor_minutes.csv', ['note'], [['query_failed_see_terminal']]);
  }

  // --- alias_conflicts.csv (sheet-sync alias table allows same text → multiple items)
  if (await tableExists('catalog_item_aliases')) {
    const agg = isPgDriver()
      ? `string_agg(DISTINCT catalog_item_id::text, '|' ORDER BY catalog_item_id::text)`
      : `GROUP_CONCAT(DISTINCT catalog_item_id)`;

    try {
      const aliasRows = await dbAll<{ av: string; n: number; ids: string }>(
        `
        SELECT LOWER(TRIM(alias_value)) AS av,
               COUNT(DISTINCT catalog_item_id) AS n,
               ${agg} AS ids
        FROM catalog_item_aliases
        GROUP BY LOWER(TRIM(alias_value))
        HAVING COUNT(DISTINCT catalog_item_id) > 1
        ORDER BY n DESC
        `,
        []
      );
      writeCsv(
        'alias_conflicts.csv',
        ['normalized_alias_value', 'distinct_target_items', 'catalog_item_ids'],
        aliasRows.map((r) => [r.av, String(r.n), r.ids ?? ''])
      );
    } catch {
      writeCsv('alias_conflicts.csv', ['error'], [['alias_query_failed']]);
    }
  } else {
    writeCsv('alias_conflicts.csv', ['note'], [['catalog_item_aliases table not present']]);
  }

  // --- category_coverage_summary.csv
  const catRows = await dbAll<{ cat: string; total: number; active: number; with_mfr: number }>(
    isPgDriver()
      ? `
    SELECT COALESCE(category, '') AS cat,
           COUNT(*)::integer AS total,
           SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END)::integer AS active,
           SUM(CASE WHEN active = 1 AND manufacturer IS NOT NULL AND TRIM(manufacturer) <> '' THEN 1 ELSE 0 END)::integer AS with_mfr
    FROM catalog_items
    GROUP BY COALESCE(category, '')
    ORDER BY total DESC
  `
      : `
    SELECT COALESCE(category, '') AS cat,
           COUNT(*) AS total,
           SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) AS active,
           SUM(CASE WHEN active = 1 AND manufacturer IS NOT NULL AND TRIM(manufacturer) <> '' THEN 1 ELSE 0 END) AS with_mfr
    FROM catalog_items
    GROUP BY COALESCE(category, '')
    ORDER BY total DESC
  `,
    []
  );
  writeCsv(
    'category_coverage_summary.csv',
    ['category', 'row_count_total', 'row_count_active', 'active_rows_with_manufacturer'],
    catRows.map((r) => [r.cat, String(r.total), String(r.active), String(r.with_mfr)])
  );

  // --- install_labor_family_coverage.csv
  const lfRows = await dbAll<{ fam: string; total: number; active: number }>(
    isPgDriver()
      ? `
    SELECT COALESCE(NULLIF(TRIM(install_labor_family), ''), '(blank)') AS fam,
           COUNT(*)::integer AS total,
           SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END)::integer AS active
    FROM catalog_items
    GROUP BY COALESCE(NULLIF(TRIM(install_labor_family), ''), '(blank)')
    ORDER BY active DESC NULLS LAST, total DESC
  `
      : `
    SELECT COALESCE(NULLIF(TRIM(install_labor_family), ''), '(blank)') AS fam,
           COUNT(*) AS total,
           SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) AS active
    FROM catalog_items
    GROUP BY COALESCE(NULLIF(TRIM(install_labor_family), ''), '(blank)')
    ORDER BY active DESC, total DESC
  `,
    []
  );
  writeCsv(
    'install_labor_family_coverage.csv',
    ['install_labor_family', 'row_count_total', 'active_rows'],
    lfRows.map((r) => [r.fam, String(r.total), String(r.active)])
  );

  // --- modifier_coverage_summary.csv
  let modCsv: string[][] = [];
  if (await tableExists('modifiers_v1')) {
    const mods = await dbAll<ModifierRow>('SELECT id, modifier_key, applies_to_categories, active FROM modifiers_v1', []);
    modCsv.push(['source', 'id', 'modifier_key', 'active', 'applies_to_categories_json']);
    modCsv.push(...mods.map((m) => ['modifiers_v1', m.id, m.modifier_key, String(m.active), m.applies_to_categories]));
    const byCat = new Map<string, { count: number; keys: Set<string> }>();
    for (const m of mods) {
      if (!m.active) continue;
      let arr: unknown;
      try {
        arr = JSON.parse(m.applies_to_categories || '[]');
      } catch {
        arr = [];
      }
      const cats = Array.isArray(arr) ? arr.map(String) : [String(arr)];
      for (const c of cats) {
        if (!byCat.has(c)) byCat.set(c, { count: 0, keys: new Set() });
        const b = byCat.get(c)!;
        b.count += 1;
        b.keys.add(m.modifier_key);
      }
    }
    for (const [c, v] of [...byCat.entries()].sort((a, b) => b[1].count - a[1].count)) {
      modCsv.push(['modifiers_v1_aggregate', '', `category:${c}`, '1', `active_modifier_defs_touching_category=${String(v.count)}`]);
    }
  }
  if (await tableExists('estimator_parametric_modifiers')) {
    const epm = await dbAll<{ id: string; modifier_key: string; applies_to_categories_json: string; active: number }>(
      'SELECT id, modifier_key, applies_to_categories_json, active FROM estimator_parametric_modifiers',
      []
    );
    if (modCsv.length === 0) modCsv.push(['source', 'id', 'modifier_key', 'active', 'applies_to_categories_json']);
    modCsv.push(
      ...epm.map((m) => ['estimator_parametric_modifiers', m.id, m.modifier_key, String(m.active), m.applies_to_categories_json])
    );
  }
  writeCsv(
    'modifier_coverage_summary.csv',
    modCsv.length ? modCsv[0] : ['note'],
    modCsv.length > 1 ? modCsv.slice(1) : [['no_modifier_tables']]
  );

  console.log(`Wrote reports under ${path.relative(REPO_ROOT, OUT_DIR)}`);
}

type ModifierRow = {
  id: string;
  modifier_key: string;
  applies_to_categories: string;
  active: number;
};

run()
  .then(async () => {
    if (isPgDriver()) await closePgPool();
    process.exit(0);
  })
  .catch(async (e) => {
    console.error(e);
    if (isPgDriver()) await closePgPool();
    process.exit(1);
  });
