/**
 * Manufacturer + SKU identity-risk audit (read-only).
 * Writes:
 *   reports/workbook-first-sync/identity_risk_remediation_queue.csv
 *   reports/workbook-first-sync/manufacturer_sku_collision_summary.md
 *   reports/workbook-first-sync/recommended_preflight_hardening_next.md
 *
 *   npm run catalog:audit:identity-mfr-sku
 *   DB_DRIVER=pg DATABASE_URL=... npm run catalog:audit:identity-mfr-sku
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { isPgDriver } from '../src/server/db/driver.ts';
import { closePgPool } from '../src/server/db/pgPool.ts';
import { dbAll } from '../src/server/db/query.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(REPO_ROOT, 'reports', 'workbook-first-sync');
const OUT_QUEUE = path.join(OUT_DIR, 'identity_risk_remediation_queue.csv');
const OUT_SUMMARY = path.join(OUT_DIR, 'manufacturer_sku_collision_summary.md');
const OUT_PREFLIGHT = path.join(OUT_DIR, 'recommended_preflight_hardening_next.md');

['.env', '.env.local'].forEach((name) => {
  const p = path.join(REPO_ROOT, name);
  if (fs.existsSync(p)) dotenv.config({ path: p, override: false });
});

function escapeCell(v: string): string {
  const s = String(v).replace(/"/g, '""');
  if (/[",\n\r]/.test(s)) return `"${s}"`;
  return s;
}

function writeCsv(header: string[], rows: string[][]): void {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const lines = [header.join(',')];
  for (const r of rows) lines.push(r.map(escapeCell).join(','));
  fs.writeFileSync(OUT_QUEUE, lines.join('\n'), 'utf8');
}

type DetailRow = {
  id: string;
  sku_norm: string;
  manufacturer: string | null;
  category: string | null;
  description: string | null;
  catalog_source_tab: string | null;
  active: number | null;
};

function idPattern(id: string): string {
  if (id.startsWith('sheet-item-')) return 'sheet_item_derived';
  if (id.startsWith('sheet-mod-')) return 'modifier_derived';
  return 'legacy_or_manual_seed';
}

function cleanItemsFirstNote(tab: string | null): string {
  const t = (tab || '').trim();
  if (!t) return 'review_source_tab_unknown';
  if (/clean/i.test(t)) return 'CLEAN_ITEMS_workbook_first';
  return `tab_${t}_review_after_clean`;
}

async function run(): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const pg = isPgDriver();

  const mfrCollisionDetailSql = pg
    ? `
    WITH grp AS (
      SELECT lower(trim(sku)) AS sku_norm
      FROM catalog_items
      WHERE sku IS NOT NULL AND trim(sku) <> ''
      GROUP BY lower(trim(sku))
      HAVING COUNT(DISTINCT trim(COALESCE(manufacturer::text, ''))) > 1
    )
    SELECT c.id::text AS id,
           lower(trim(c.sku)) AS sku_norm,
           c.manufacturer::text AS manufacturer,
           c.category::text AS category,
           left(c.description::text, 500) AS description,
           c.catalog_source_tab::text AS catalog_source_tab,
           c.active
    FROM catalog_items c
    JOIN grp g ON lower(trim(c.sku)) = g.sku_norm
    ORDER BY g.sku_norm, c.manufacturer NULLS LAST, c.id::text
    `
    : `
    WITH grp AS (
      SELECT lower(trim(sku)) AS sku_norm
      FROM catalog_items
      WHERE sku IS NOT NULL AND trim(sku) <> ''
      GROUP BY lower(trim(sku))
      HAVING COUNT(DISTINCT trim(COALESCE(manufacturer, ''))) > 1
    )
    SELECT c.id AS id,
           lower(trim(c.sku)) AS sku_norm,
           c.manufacturer AS manufacturer,
           c.category AS category,
           substr(c.description, 1, 500) AS description,
           c.catalog_source_tab AS catalog_source_tab,
           c.active
    FROM catalog_items c
    JOIN grp g ON lower(trim(c.sku)) = g.sku_norm
    ORDER BY g.sku_norm, c.manufacturer IS NULL DESC, c.id
    `;

  let collisionRows: DetailRow[];
  try {
    collisionRows = (await dbAll<DetailRow>(mfrCollisionDetailSql, [])) as DetailRow[];
  } catch (e) {
    console.error('Manufacturer+SKU collision query failed:', e);
    collisionRows = [];
  }

  const divergentDetailSqlPg = `
    WITH cat_grp AS (
      SELECT lower(trim(sku)) AS sku_norm
      FROM catalog_items
      WHERE sku IS NOT NULL AND trim(sku) <> ''
      GROUP BY lower(trim(sku))
      HAVING COUNT(DISTINCT trim(COALESCE(category::text, ''))) > 1
    ), mfr_grp AS (
      SELECT lower(trim(sku)) AS sku_norm
      FROM catalog_items
      WHERE sku IS NOT NULL AND trim(sku) <> ''
      GROUP BY lower(trim(sku))
      HAVING COUNT(DISTINCT trim(COALESCE(manufacturer::text, ''))) > 1
    )
    SELECT c.id::text AS id,
           lower(trim(c.sku)) AS sku_norm,
           c.manufacturer::text AS manufacturer,
           c.category::text AS category,
           left(c.description::text, 500) AS description,
           c.catalog_source_tab::text AS catalog_source_tab,
           c.active
    FROM catalog_items c
    JOIN cat_grp cg ON lower(trim(c.sku)) = cg.sku_norm
    WHERE NOT EXISTS (SELECT 1 FROM mfr_grp m WHERE m.sku_norm = cg.sku_norm)
    ORDER BY cg.sku_norm, c.category NULLS LAST, c.id::text
  `;

  const divergentDetailSqlSqlite = `
    WITH cat_grp AS (
      SELECT lower(trim(sku)) AS sku_norm
      FROM catalog_items
      WHERE sku IS NOT NULL AND trim(sku) <> ''
      GROUP BY lower(trim(sku))
      HAVING COUNT(DISTINCT trim(COALESCE(category, ''))) > 1
    ), mfr_grp AS (
      SELECT lower(trim(sku)) AS sku_norm
      FROM catalog_items
      WHERE sku IS NOT NULL AND trim(sku) <> ''
      GROUP BY lower(trim(sku))
      HAVING COUNT(DISTINCT trim(COALESCE(manufacturer, ''))) > 1
    )
    SELECT c.id AS id,
           lower(trim(c.sku)) AS sku_norm,
           c.manufacturer AS manufacturer,
           c.category AS category,
           substr(c.description, 1, 500) AS description,
           c.catalog_source_tab AS catalog_source_tab,
           c.active
    FROM catalog_items c
    JOIN cat_grp cg ON lower(trim(c.sku)) = cg.sku_norm
    WHERE lower(trim(c.sku)) NOT IN (SELECT sku_norm FROM mfr_grp)
    ORDER BY cg.sku_norm, c.category IS NULL DESC, c.id
  `;

  let divergentRows: DetailRow[] = [];
  try {
    divergentRows = (await dbAll<DetailRow>(pg ? divergentDetailSqlPg : divergentDetailSqlSqlite, [])) as DetailRow[];
  } catch (e) {
    console.warn('Divergent category detail query skipped:', e);
  }

  const header = [
    'remediation_tier',
    'priority_source',
    'normalized_sku',
    'manufacturer',
    'category',
    'description',
    'current_id',
    'id_pattern',
    'catalog_source_tab',
    'active',
    'risk_type',
    'recommended_action',
  ];

  const queueRows: string[][] = [];

  const pushRow = (
    tier: 'manual_identity_review' | 'safe_workbook_cleanup' | 'future_preflight_hardening',
    priority: string,
    r: DetailRow,
    risk: string,
    action: string
  ) => {
    queueRows.push([
      tier,
      priority,
      r.sku_norm,
      r.manufacturer ?? '',
      r.category ?? '',
      r.description ?? '',
      r.id,
      idPattern(r.id),
      r.catalog_source_tab ?? '',
      String(r.active ?? ''),
      risk,
      action,
    ]);
  };

  for (const r of collisionRows) {
    pushRow(
      'manual_identity_review',
      cleanItemsFirstNote(r.catalog_source_tab),
      r,
      'duplicate_sku_different_manufacturer',
      'Disambiguate OEM: add vendor prefix to SKU in CLEAN_ITEMS OR assign explicit Catalog_Item_ID when added; deactivate duplicate identity after merge (non-destructive).'
    );
  }

  for (const r of divergentRows) {
    pushRow(
      'safe_workbook_cleanup',
      cleanItemsFirstNote(r.catalog_source_tab),
      r,
      'duplicate_sku_divergent_category',
      'Align category strings for this SKU in CLEAN_ITEMS if same product; if different products, split SKUs (manual review if uncertain).'
    );
  }

  if (queueRows.length > 0) {
    const tierOrder: Record<string, number> = {
      manual_identity_review: 0,
      safe_workbook_cleanup: 1,
      future_preflight_hardening: 2,
    };
    queueRows.sort((a, b) => {
      const priA = a[1] === 'CLEAN_ITEMS_workbook_first' ? 0 : 1;
      const priB = b[1] === 'CLEAN_ITEMS_workbook_first' ? 0 : 1;
      if (priA !== priB) return priA - priB;
      const tA = tierOrder[a[0] ?? ''] ?? 99;
      const tB = tierOrder[b[0] ?? ''] ?? 99;
      if (tA !== tB) return tA - tB;
      const skuCmp = (a[2] ?? '').localeCompare(b[2] ?? '', undefined, { sensitivity: 'base' });
      if (skuCmp !== 0) return skuCmp;
      return (a[6] ?? '').localeCompare(b[6] ?? '', undefined, { sensitivity: 'base' });
    });
  }

  if (queueRows.length === 0) {
    queueRows.push([
      'future_preflight_hardening',
      'n/a',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      'no_rows_from_db',
      'Run against production mirror; local DB may be empty. Re-run: npm run catalog:audit:identity-mfr-sku',
    ]);
  }

  writeCsv(header, queueRows);

  const distinctCollisionSkus = new Set(collisionRows.map((r) => r.sku_norm)).size;
  const distinctDivergentSkus = new Set(divergentRows.map((r) => r.sku_norm)).size;

  const summaryMd = `# Manufacturer + SKU collision summary

Generated: **${new Date().toISOString()}**  
DB driver: **${pg ? 'pg' : 'sqlite'}**

## Counts

| Metric | Value |
|--------|------:|
| Rows in **manufacturer collision** detail | ${collisionRows.length} |
| Distinct **normalized SKUs** (mfr collision) | ${distinctCollisionSkus} |
| Rows in **category divergence** (excluding mfr-collision SKUs) | ${divergentRows.length} |
| Distinct **normalized SKUs** (category-only) | ${distinctDivergentSkus} |

## Interpretation

- **Manufacturer collision:** same \`lower(trim(sku))\` assigned to **multiple distinct manufacturer strings** (trimmed). High risk for **merged \`catalog_items.id\`** under SKU-only \`sheet-item-\` derivation.
- **Category divergence:** same normalized SKU with **multiple category values** and **not** already in the mfr-collision set — often **taxonomy cleanup** in CLEAN_ITEMS; escalate to **manual identity review** if descriptions differ materially.

## Output

- Concrete queue: \`identity_risk_remediation_queue.csv\`
- Preflight next steps: \`recommended_preflight_hardening_next.md\`
`;

  fs.writeFileSync(OUT_SUMMARY, summaryMd, 'utf8');

  const preflightMd = `# Recommended preflight hardening (next, no schema yet)

Based on \`catalog_id_strategy_review.md\`, \`identity_risk_candidates.csv\`, and this audit run.

## 1. Blocking / warning rules (importer)

| Rule | Severity | Notes |
|------|----------|------|
| **SKU + manufacturer cluster** — \`COUNT(DISTINCT trim(manufacturer))\` > 1 per \`lower(trim(sku))\` | **BLOCK** or **WARN** | Align with operator policy; BLOCK prevents silent merge identity. |
| **SKU + category cluster** — multiple categories for same normalized SKU (after mfr check passes) | **WARN** | Often safe workbook category normalization. |
| **Missing SKU** on active publish row | **WARN** → **BLOCK** | Require Item Key or explicit future \`Catalog_Item_ID\`. |
| **Hash-only identity** (no SKU, no Item Key) for **active** row | **BLOCK** | Prevents unstable \`sheet-item-\` churn. |

## 2. Workbook-first governance

- Enforce **OEM-prefixed SKUs** in CLEAN_ITEMS when numeric collision risk exists (e.g. Bobrick vs Bradley same style number).
- Document **one row = one buyout identity**; split rows before sync when manufacturers differ.

## 3. Future code (after policy sign-off)

- Derive stable segment from **normalized \`manufacturer_normalized\` + SKU** when both present (see \`recommended_long_term_id_strategy.md\`).
- Optional **\`Catalog_Item_ID\`** column mapping — additive DB column when ready.

## 4. This environment

- Remediation rows written: **${queueRows.length}** (includes placeholder row if DB returned no collisions).
`;

  fs.writeFileSync(OUT_PREFLIGHT, preflightMd, 'utf8');

  console.log(`Wrote ${path.relative(REPO_ROOT, OUT_QUEUE)} (${queueRows.length} data rows)`);
  console.log(`Wrote ${path.relative(REPO_ROOT, OUT_SUMMARY)}`);
  console.log(`Wrote ${path.relative(REPO_ROOT, OUT_PREFLIGHT)}`);
}

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
