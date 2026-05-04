/**
 * Read-only consolidated publish-blocker report for workbook-first catalog posture.
 * Writes reports/workbook-first-sync/publish_blockers_latest.csv
 *
 *   npm run catalog:publish:blockers
 *   DB_DRIVER=pg DATABASE_URL=... npm run catalog:publish:blockers
 *
 * Optional: PUBLISH_BLOCKERS_ALLOWED_CATEGORIES=comma,separated — flags active rows whose category is not in the set (case-sensitive trim match).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { isPgDriver } from '../src/server/db/driver.ts';
import { closePgPool } from '../src/server/db/pgPool.ts';
import { dbAll } from '../src/server/db/query.ts';
import { CATALOG_ALLOWED_UOM } from '../src/shared/catalogValidationConstants.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(REPO_ROOT, 'reports', 'workbook-first-sync');
const OUT_CSV = path.join(OUT_DIR, 'publish_blockers_latest.csv');

['.env', '.env.local'].forEach((name) => {
  const p = path.join(REPO_ROOT, name);
  if (fs.existsSync(p)) dotenv.config({ path: p, override: false });
});

type BlockerRow = [string, string, string, string];

function escapeCell(v: string): string {
  const s = String(v).replace(/"/g, '""');
  if (/[",\n\r]/.test(s)) return `"${s}"`;
  return s;
}

function writeCsv(rows: BlockerRow[]): void {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const header: BlockerRow = ['blocker_type', 'severity', 'reference_id', 'detail'];
  const lines = [header.map(escapeCell).join(',')];
  for (const r of rows) {
    lines.push(r.map((c) => escapeCell(String(c))).join(','));
  }
  fs.writeFileSync(OUT_CSV, lines.join('\n'), 'utf8');
}

async function tableExists(name: string): Promise<boolean> {
  if (isPgDriver()) {
    const q = await dbAll<{ ok: number }>(
      `SELECT 1 AS ok FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ? LIMIT 1`,
      [name]
    );
    return q.length > 0;
  }
  const q = await dbAll<{ ok: number }>(
    `SELECT 1 AS ok FROM sqlite_master WHERE type IN ('table','view') AND name = ?`,
    [name]
  );
  return q.length > 0;
}

async function main(): Promise<void> {
  const rows: BlockerRow[] = [];
  const driver = isPgDriver() ? 'pg' : 'sqlite';
  console.log(`Publish blockers (${driver}) → ${path.relative(REPO_ROOT, OUT_CSV)}`);

  const allowedCatsRaw = String(process.env.PUBLISH_BLOCKERS_ALLOWED_CATEGORIES || '').trim();
  const allowedCategories = new Set(
    allowedCatsRaw
      ? allowedCatsRaw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : []
  );

  // --- Duplicate manufacturer/sku keys (catalog_items)
  if (await tableExists('catalog_items')) {
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
      `;
    try {
      const dups = await dbAll<{ mfr_key: string; sku_key: string; cnt: number; catalog_item_ids: string }>(dupSql, []);
      for (const d of dups) {
        rows.push([
          'duplicate_catalog_key',
          'high',
          `${d.mfr_key}::${d.sku_key}`,
          `count=${d.cnt}; ids=${d.catalog_item_ids || ''}`,
        ]);
      }
    } catch (e) {
      rows.push(['duplicate_catalog_key', 'error', '', String(e)]);
    }
  }

  // --- Alias conflicts (catalog_item_aliases)
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
        `,
        []
      );
      for (const r of aliasRows) {
        rows.push(['alias_conflict_catalog_item_aliases', 'high', r.av, `targets=${r.n}; ids=${r.ids || ''}`]);
      }
    } catch (e) {
      rows.push(['alias_conflict_catalog_item_aliases', 'error', '', String(e)]);
    }
  }

  // --- Estimator SKU alias conflicts
  if (await tableExists('estimator_sku_aliases')) {
    const agg = isPgDriver()
      ? `string_agg(DISTINCT target_catalog_item_id::text, '|' ORDER BY target_catalog_item_id::text)`
      : `GROUP_CONCAT(DISTINCT target_catalog_item_id)`;
    try {
      const aliasRows = await dbAll<{ av: string; n: number; ids: string }>(
        `
        SELECT LOWER(TRIM(alias_text)) AS av,
               COUNT(DISTINCT target_catalog_item_id) AS n,
               ${agg} AS ids
        FROM estimator_sku_aliases
        WHERE COALESCE(active, 1) = 1
        GROUP BY LOWER(TRIM(alias_text))
        HAVING COUNT(DISTINCT target_catalog_item_id) > 1
        `,
        []
      );
      for (const r of aliasRows) {
        rows.push(['alias_conflict_estimator_sku_aliases', 'high', r.av, `targets=${r.n}; ids=${r.ids || ''}`]);
      }
    } catch (e) {
      rows.push(['alias_conflict_estimator_sku_aliases', 'error', '', String(e)]);
    }
  }

  // --- Orphan catalog_item_attributes → catalog_items
  if ((await tableExists('catalog_item_attributes')) && (await tableExists('catalog_items'))) {
    const sql = isPgDriver()
      ? `
      SELECT a.id::text AS id, a.catalog_item_id::text AS catalog_item_id
      FROM catalog_item_attributes a
      LEFT JOIN catalog_items c ON c.id = a.catalog_item_id
      WHERE c.id IS NULL
      `
      : `
      SELECT a.id AS id, a.catalog_item_id AS catalog_item_id
      FROM catalog_item_attributes a
      LEFT JOIN catalog_items c ON c.id = a.catalog_item_id
      WHERE c.id IS NULL
      `;
    try {
      const orphans = await dbAll<{ id: string; catalog_item_id: string }>(sql, []);
      for (const o of orphans) {
        rows.push(['orphan_catalog_item_attributes_fk', 'high', o.id, `missing_catalog_item_id=${o.catalog_item_id}`]);
      }
    } catch (e) {
      rows.push(['orphan_catalog_item_attributes_fk', 'error', '', String(e)]);
    }
  }

  // --- Orphan estimator_catalog_item_attributes → catalog_items
  if ((await tableExists('estimator_catalog_item_attributes')) && (await tableExists('catalog_items'))) {
    const sql = isPgDriver()
      ? `
      SELECT a.id::text AS id, a.catalog_item_id::text AS catalog_item_id
      FROM estimator_catalog_item_attributes a
      LEFT JOIN catalog_items c ON c.id = a.catalog_item_id
      WHERE c.id IS NULL
      `
      : `
      SELECT a.id AS id, a.catalog_item_id AS catalog_item_id
      FROM estimator_catalog_item_attributes a
      LEFT JOIN catalog_items c ON c.id = a.catalog_item_id
      WHERE c.id IS NULL
      `;
    try {
      const orphans = await dbAll<{ id: string; catalog_item_id: string }>(sql, []);
      for (const o of orphans) {
        rows.push([
          'orphan_estimator_catalog_item_attributes_fk',
          'high',
          o.id,
          `missing_catalog_item_id=${o.catalog_item_id}`,
        ]);
      }
    } catch (e) {
      rows.push(['orphan_estimator_catalog_item_attributes_fk', 'error', '', String(e)]);
    }
  }

  // --- Orphan bundle_items → catalog_items / bundles_v1
  if (await tableExists('bundle_items_v1')) {
    if (await tableExists('catalog_items')) {
      const sql = isPgDriver()
        ? `
        SELECT bi.id::text AS id, bi.catalog_item_id::text AS catalog_item_id
        FROM bundle_items_v1 bi
        LEFT JOIN catalog_items c ON c.id = bi.catalog_item_id
        WHERE bi.catalog_item_id IS NOT NULL AND trim(bi.catalog_item_id::text) <> '' AND c.id IS NULL
        `
        : `
        SELECT bi.id AS id, bi.catalog_item_id AS catalog_item_id
        FROM bundle_items_v1 bi
        LEFT JOIN catalog_items c ON c.id = bi.catalog_item_id
        WHERE bi.catalog_item_id IS NOT NULL AND trim(bi.catalog_item_id) <> '' AND c.id IS NULL
        `;
      try {
        const orphans = await dbAll<{ id: string; catalog_item_id: string }>(sql, []);
        for (const o of orphans) {
          rows.push(['orphan_bundle_item_catalog_fk', 'high', o.id, `missing_catalog_item_id=${o.catalog_item_id}`]);
        }
      } catch (e) {
        rows.push(['orphan_bundle_item_catalog_fk', 'error', '', String(e)]);
      }
    }
    if (await tableExists('bundles_v1')) {
      const sql = isPgDriver()
        ? `
        SELECT bi.id::text AS id, bi.bundle_id::text AS bundle_id
        FROM bundle_items_v1 bi
        LEFT JOIN bundles_v1 b ON b.id = bi.bundle_id
        WHERE b.id IS NULL
        `
        : `
        SELECT bi.id AS id, bi.bundle_id AS bundle_id
        FROM bundle_items_v1 bi
        LEFT JOIN bundles_v1 b ON b.id = bi.bundle_id
        WHERE b.id IS NULL
        `;
      try {
        const orphans = await dbAll<{ id: string; bundle_id: string }>(sql, []);
        for (const o of orphans) {
          rows.push(['orphan_bundle_item_bundle_fk', 'high', o.id, `missing_bundle_id=${o.bundle_id}`]);
        }
      } catch (e) {
        rows.push(['orphan_bundle_item_bundle_fk', 'error', '', String(e)]);
      }
    }
  }

  // --- catalog_item_aliases orphan FK
  if ((await tableExists('catalog_item_aliases')) && (await tableExists('catalog_items'))) {
    const sql = isPgDriver()
      ? `
      SELECT a.id::text AS id, a.catalog_item_id::text AS catalog_item_id
      FROM catalog_item_aliases a
      LEFT JOIN catalog_items c ON c.id = a.catalog_item_id
      WHERE c.id IS NULL
      `
      : `
      SELECT a.id AS id, a.catalog_item_id AS catalog_item_id
      FROM catalog_item_aliases a
      LEFT JOIN catalog_items c ON c.id = a.catalog_item_id
      WHERE c.id IS NULL
      `;
    try {
      const orphans = await dbAll<{ id: string; catalog_item_id: string }>(sql, []);
      for (const o of orphans) {
        rows.push(['orphan_catalog_item_aliases_fk', 'high', o.id, `missing_catalog_item_id=${o.catalog_item_id}`]);
      }
    } catch (e) {
      rows.push(['orphan_catalog_item_aliases_fk', 'error', '', String(e)]);
    }
  }

  // --- Invalid UOM (active rows)
  if (await tableExists('catalog_items')) {
    try {
      const bad = await dbAll<{ id: string; uom: string | null }>(
        isPgDriver()
          ? `SELECT id::text AS id, uom FROM catalog_items WHERE active = 1 AND uom IS NOT NULL AND trim(uom) <> ''`
          : `SELECT id AS id, uom FROM catalog_items WHERE active = 1 AND uom IS NOT NULL AND trim(uom) <> ''`,
        []
      );
      for (const r of bad) {
        const u = String(r.uom || '')
          .trim()
          .toUpperCase();
        if (!CATALOG_ALLOWED_UOM.has(u)) {
          rows.push(['invalid_uom', 'medium', r.id, `uom=${r.uom}`]);
        }
      }
    } catch (e) {
      rows.push(['invalid_uom', 'error', '', String(e)]);
    }
  }

  // --- Invalid category (optional allow-list)
  if (allowedCategories.size > 0 && (await tableExists('catalog_items'))) {
    try {
      const active = await dbAll<{ id: string; category: string | null }>(
        isPgDriver()
          ? `SELECT id::text AS id, category FROM catalog_items WHERE active = 1`
          : `SELECT id AS id, category FROM catalog_items WHERE active = 1`,
        []
      );
      for (const r of active) {
        const cat = String(r.category ?? '').trim();
        if (!cat || !allowedCategories.has(cat)) {
          rows.push(['invalid_or_unlisted_category', 'medium', r.id, `category=${cat || '(blank)'}`]);
        }
      }
    } catch (e) {
      rows.push(['invalid_or_unlisted_category', 'error', '', String(e)]);
    }
  }

  // --- Suspicious labor (reuse supabase-phase-audit semantics)
  if (await tableExists('catalog_items')) {
    const susLaborSqlPg = `
    SELECT id::text AS id, sku, category, manufacturer, description, base_labor_minutes, uom,
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
    SELECT id AS id, sku, category, manufacturer, description, base_labor_minutes, uom,
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
      for (const r of sus) {
        rows.push([
          'suspicious_labor',
          'low',
          String(r.id ?? ''),
          `reason=${String(r.reason_bucket ?? '')}; sku=${String(r.sku ?? '')}; labor=${String(r.base_labor_minutes ?? '')}`,
        ]);
      }
    } catch (e) {
      rows.push(['suspicious_labor', 'error', '', String(e)]);
    }
  }

  if (rows.length === 0) {
    rows.push(['none', 'info', '', 'No blockers matched (or prerequisite tables missing).']);
  }

  writeCsv(rows);
  console.log(`Wrote ${rows.length} row(s).`);
}

main()
  .then(async () => {
    if (isPgDriver()) await closePgPool();
    process.exit(0);
  })
  .catch(async (e) => {
    console.error(e);
    if (isPgDriver()) await closePgPool();
    process.exit(1);
  });
