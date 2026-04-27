/**
 * Non-destructive catalog / modifiers / bundles audit.
 * Writes CSV reports under reports/catalog-audit/ — no DB mutations.
 *
 * Usage (repo root):
 *   npm run catalog:audit
 *   DB_DRIVER=pg DATABASE_URL=... npm run catalog:audit
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { isPgDriver } from '../src/server/db/driver.ts';
import { closePgPool } from '../src/server/db/pgPool.ts';
import { dbAll } from '../src/server/db/query.ts';
import type { CatalogValidationIssueType } from '../src/shared/types/catalogValidationIssue.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(REPO_ROOT, 'reports', 'catalog-audit');

['.env', '.env.local'].forEach((name) => {
  const p = path.join(REPO_ROOT, name);
  if (fs.existsSync(p)) dotenv.config({ path: p, override: false });
});

type CatalogRow = Record<string, unknown>;
type ModifierRow = {
  id: string;
  name: string;
  modifier_key: string;
  description: string;
  applies_to_categories: string;
  add_labor_minutes: number;
  add_material_cost: number;
  percent_labor: number;
  percent_material: number;
  active: number;
  updated_at: string;
};

type BundleRow = { id: string; bundle_name: string; category: string | null; active: number };
type BundleItemRow = {
  id: string;
  bundle_id: string;
  catalog_item_id: string | null;
  sku: string | null;
  description: string;
  notes: string | null;
  active_bundle?: number;
};

type AuditRow = {
  issueType: CatalogValidationIssueType;
  entity: 'catalog_item' | 'modifier' | 'bundle' | 'bundle_item';
  entityId: string;
  message: string;
  detail: string;
};

const VARIANT_RE =
  /\b(ss|s\/s|stainless|matte|black|recess|recessed|surface|hdpe|phenolic|powder|baked|painted|grip|texture|ada|fire[- ]?rated?|compart(ment)?s?|stalls?|pilaster|tissue|grab|lf\b|linear\s*ft|sf\b|sq\.?\s*ft)\b/gi;
const MASTFORMAT_RE = /\b(\d{2}\s+\d{2}\s+\d{2}|\d{2}\d{2}\d{2})\b/;

/** Suggested MasterFormat (Division 10) — for gap analysis only. */
const CATEGORY_CSI_MAP: Array<{ re: RegExp; code: string; label: string }> = [
  { re: /visual|whiteboard|tack|display|board/i, code: '10 11 00', label: 'Visual display boards' },
  { re: /sign(age)?\b|identifying/i, code: '10 14 00', label: 'Signage' },
  { re: /toilet.*partition|partition|urinal screen|headrail|phenolic|scranton|hadrian/i, code: '10 21 13', label: 'Toilet compartments' },
  { re: /wall\s*protec|crash\s*rail|corner\s*guard|chair\s*rail|hand\s*rail(?!ing)/i, code: '10 26 00', label: 'Wall protection' },
  { re: /washroom|bath(rooms?)?\s*accessor|toilet accessor|restroom|dispenser|grab|mirror|shelf|dryer|coat\s*hook|paper\s*towel|soap|faucet/i, code: '10 28 00', label: 'Washroom accessories' },
  { re: /fire\s*ext|extinguisher|cabinet.*fire|fire.*specialt/i, code: '10 44 00', label: 'Fire protection specialties' },
  { re: /locker/i, code: '10 51 00', label: 'Lockers' },
  { re: /storage|unit\s*ventilat|wire\s*partitions/i, code: '10 56 00', label: 'Storage' },
];

const ALLOWED_UOM = new Set(
  'EA,LS,LF,SF,BOX,CASE,ST,SET,STALL,COMPARTMENT,PAIR,ROLL,PER,TBD'
    .split(',')
    .map((s) => s.trim().toUpperCase())
);

function escapeCell(v: string): string {
  const s = v.replace(/"/g, '""');
  if (/[",\n\r]/.test(s)) return `"${s}"`;
  return s;
}

function writeCsv(fileName: string, header: string[], dataRows: string[][]): void {
  const lines = [header.join(',')];
  for (const r of dataRows) {
    lines.push(r.map(escapeCell).join(','));
  }
  const out = path.join(OUT_DIR, fileName);
  fs.writeFileSync(out, lines.join('\n'), 'utf8');
  console.log(`Wrote ${path.relative(REPO_ROOT, out)} (${dataRows.length} rows)`);
}

function normSku(s: unknown): string {
  return String(s ?? '')
    .trim()
    .toUpperCase();
}

function normNameKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(ea|each|pc|p\/c|model|mfg|size|x|inch|in|ft)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function getCatalogItemColumnNames(): Promise<Set<string>> {
  if (isPgDriver()) {
    const rows = await dbAll<{ column_name: string }>(
      `SELECT column_name::text AS column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'catalog_items'`
    );
    return new Set(rows.map((r) => r.column_name));
  }
  const rows = await dbAll<{ name: string }>('PRAGMA table_info(catalog_items)');
  return new Set(rows.map((r) => r.name));
}

function csiValue(row: CatalogRow, cols: Set<string>): string | null {
  for (const c of ['csi_section', 'csi_code', 'masterformat', 'div10_code', 'mf_section', 'section_code']) {
    if (cols.has(c)) {
      const v = row[c];
      if (v != null && String(v).trim()) return String(v).trim();
    }
  }
  return null;
}

function inferCsiForCategory(category: string): { code: string; label: string } | null {
  const t = String(category || '').trim();
  if (!t) return null;
  for (const m of CATEGORY_CSI_MAP) {
    if (m.re.test(t)) return { code: m.code, label: m.label };
  }
  return null;
}

function isTangibleForZeroCost(item: CatalogRow, description: string): boolean {
  const d = (description + ' ' + String(item.sku || '')).toLowerCase();
  if (/\b(lump|allowance|tbd|placeholder|n\/a|note:)/i.test(d)) return false;
  if (/\b(labor|supervision|mobil|fee|permit|bond)\b/i.test(d) && !/\b(part|bar|locker|partition|dispenser)\b/i.test(d)) return false;
  return true;
}

function countByType(rows: AuditRow[]) {
  const byType = new Map<string, number>();
  for (const r of rows) {
    byType.set(r.issueType, (byType.get(r.issueType) ?? 0) + 1);
  }
  return byType;
}

function pushIssue(
  acc: AuditRow[],
  t: CatalogValidationIssueType,
  entity: AuditRow['entity'],
  id: string,
  message: string,
  detail: string
) {
  acc.push({ issueType: t, entity, entityId: id, message, detail });
}

function parseJsonTags(tags: unknown): { ok: true; arr: string[] } | { ok: false; raw: string } {
  if (tags == null || tags === '') return { ok: true, arr: [] };
  if (Array.isArray(tags)) return { ok: true, arr: tags.map(String) };
  const s = String(tags);
  try {
    const j = JSON.parse(s);
    if (Array.isArray(j)) return { ok: true, arr: j.map(String) };
    return { ok: false, raw: s };
  } catch {
    return { ok: false, raw: s };
  }
}

function mixedDelims(s: string): boolean {
  return /[|,;]/.test(s) && /,/.test(s) && (/\|/.test(s) || /;/.test(s));
}

async function run() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const driver = isPgDriver() ? 'pg' : 'sqlite';
  console.log(`Catalog audit (read-only) — ${driver} — out: ${path.relative(REPO_ROOT, OUT_DIR)}`);

  const allIssues: AuditRow[] = [];
  const cols = await getCatalogItemColumnNames();
  if (cols.size === 0) {
    pushIssue(
      allIssues,
      'SUSPICIOUS_NUMERIC',
      'catalog_item',
      '_',
      'Could not list catalog_items columns (empty DB or missing table).',
      'Check SQLITE_PATH, DATABASE_URL, and migrations'
    );
  }

  const catalog = await dbAll<CatalogRow>('SELECT * FROM catalog_items');

  const skuToIds = new Map<string, string[]>();
  const nameKeyToIds = new Map<string, string[]>();
  for (const row of catalog) {
    const id = String(row.id ?? '');
    const skuN = normSku(row.sku);
    if (skuN) {
      if (!skuToIds.has(skuN)) skuToIds.set(skuN, []);
      skuToIds.get(skuN)!.push(id);
    }
    const fam = String(row.family || '').trim();
    const desc = String(row.description || '').trim();
    const nameKey = normNameKey(fam || desc);
    if (nameKey.length >= 8) {
      if (!nameKeyToIds.has(nameKey)) nameKeyToIds.set(nameKey, []);
      nameKeyToIds.get(nameKey)!.push(id);
    }
  }

  for (const [sku, ids] of skuToIds) {
    if (ids.length > 1) {
      for (const id of ids) {
        pushIssue(
          allIssues,
          'DUPLICATE_SKU',
          'catalog_item',
          id,
          `Non-unique sku "${sku}"`,
          `shared_ids: ${[...new Set(ids)].join('|')}`
        );
      }
    }
  }
  for (const [k, ids] of nameKeyToIds) {
    if (new Set(ids).size <= 1) continue;
    const exampleIds = [...new Set(ids)];
    for (const id of exampleIds) {
      pushIssue(
        allIssues,
        'DUPLICATE_NAME_CLUSTER',
        'catalog_item',
        id,
        `Rows share normalised name key "${k.slice(0, 64)}${k.length > 64 ? '…' : ''}"`,
        `ids: ${exampleIds.join(';')}`
      );
    }
  }

  for (const row of catalog) {
    const id = String(row.id ?? '');
    const sku = String(row.sku ?? '');
    if (!String(sku).trim()) {
      pushIssue(allIssues, 'EMPTY_SKU', 'catalog_item', id, 'Empty SKU', '');
    }
    const desc = String(row.description ?? '');

    VARIANT_RE.lastIndex = 0;
    if (VARIANT_RE.test(String(row.sku ?? '')) || VARIANT_RE.test(desc)) {
      const hit = (String(row.sku) + ' ' + desc).match(VARIANT_RE);
      pushIssue(
        allIssues,
        'VARIANT_TOKEN_IN_TEXT',
        'catalog_item',
        id,
        'Variant tokens in SKU or description (candidate for attributes)',
        (hit && hit[0]) || 'matched'
      );
    }

    const mat = Number(row.base_material_cost);
    if (!Number.isFinite(mat) || mat < 0) {
      pushIssue(allIssues, 'SUSPICIOUS_NUMERIC', 'catalog_item', id, 'base_material_cost not a non-negative number', String(row.base_material_cost));
    } else if (row.active && mat === 0 && isTangibleForZeroCost(row, desc)) {
      pushIssue(allIssues, 'ZERO_MATERIAL_TANGIBLE', 'catalog_item', id, 'Active item with $0 base material (review)', 'category: ' + String(row.category));
    }

    const labor = Number(row.base_labor_minutes);
    if (row.active && !Number.isFinite(labor)) {
      pushIssue(allIssues, 'SUSPICIOUS_NUMERIC', 'catalog_item', id, 'base_labor_minutes invalid', String(row.base_labor_minutes));
    }

    const u = String(row.uom ?? 'EA').trim().toUpperCase() || 'EA';
    if (!ALLOWED_UOM.has(u) && u !== 'EA') {
      pushIssue(allIssues, 'UOM_ANOMALY', 'catalog_item', id, 'Unusual or nonstandard UOM', u);
    }
    const category = String(row.category ?? '');
    if (/wall\s*protec|crash|corner/i.test(desc + ' ' + category) && u === 'EA') {
      pushIssue(
        allIssues,
        'UOM_ANOMALY',
        'catalog_item',
        id,
        'Wall protection / rail scope often should be LF, not EA',
        u
      );
    }
    if (/toilet|partition|compart(ment)?\b|stalls?/i.test(desc + ' ' + category) && u === 'EA' && /partition|phenolic|stainless|hdpe/i.test(desc + category)) {
      pushIssue(
        allIssues,
        'UOM_ANOMALY',
        'catalog_item',
        id,
        'Toilet partition scope often should be STALL or COMPARTMENT, not EA',
        u
      );
    }

    const csi = csiValue(row, cols);
    if (!MASTFORMAT_RE.test(csi || '') && !MASTFORMAT_RE.test(desc) && !MASTFORMAT_RE.test(String(row.notes ?? ''))) {
      if (!cols.has('csi_code') && !cols.has('csi_section') && !cols.has('masterformat')) {
        /* optional column: still flag category mapping gap */
        const inf = inferCsiForCategory(category);
        if (inf) {
          pushIssue(
            allIssues,
            'MISSING_CSI',
            'catalog_item',
            id,
            `No CSI/section in row; category suggests ${inf.code} (${inf.label}) — add csi when column exists`,
            category
          );
        } else {
          pushIssue(
            allIssues,
            'UNMAPPED_CATEGORY_CSI',
            'catalog_item',
            id,
            'No CSI/section and category not mapped to a suggested MasterFormat in audit map',
            category
          );
        }
      } else {
        if (!csi) {
          pushIssue(allIssues, 'MISSING_CSI', 'catalog_item', id, 'Missing CSI/section in dedicated column', category);
        }
      }
    }

    const t = parseJsonTags(row.tags);
    if (!t.ok) {
      pushIssue(allIssues, 'TAGS_OR_JSON_INVALID', 'catalog_item', id, 'tags not valid JSON array', t.raw.slice(0, 200));
    } else if (t.arr.some((x) => mixedDelims(x))) {
      pushIssue(
        allIssues,
        'DELIMITER_INCONSISTENT',
        'catalog_item',
        id,
        'A tag value mixes list delimiters (use | consistently after normalization)',
        t.arr.join(' ; ')
      );
    }

    const n = String(row.notes || '');
    if (mixedDelims(n)) {
      pushIssue(
        allIssues,
        'DELIMITER_INCONSISTENT',
        'catalog_item',
        id,
        'Notes mix comma, pipe, or semicolon in one blob',
        n.slice(0, 180)
      );
    }

    if (id.toLowerCase().includes('sheet-item') || /^legacy|deprecated|old /i.test(n) || /deprecated/i.test(desc)) {
      pushIssue(
        allIssues,
        'LEGACY_ALIAS_CANDIDATE',
        'catalog_item',
        id,
        'Heuristic: sheet-import id, or deprecated wording — candidate for alias layer',
        sku
      );
    }
  }

  const modifiers = await dbAll<ModifierRow>('SELECT * FROM modifiers_v1');
  for (const m of modifiers) {
    const pctLike =
      m.percent_labor === 0 &&
      m.percent_material === 0 &&
      m.add_labor_minutes < 0.0001 &&
      m.add_material_cost > 0 &&
      m.add_material_cost <= 100 &&
      (Number.isInteger(m.add_material_cost) || Math.abs(m.add_material_cost * 100 - Math.round(m.add_material_cost * 100)) < 1e-6);

    if (pctLike && /\b(%|percent|uplift)\b/i.test(m.description + ' ' + m.name)) {
      pushIssue(
        allIssues,
        'MODIFIER_PCT_IN_FLAT_SUSPECT',
        'modifier',
        m.id,
        'Flat add_material with percent language but percent fields zero (verify math)',
        `add_material_cost=${m.add_material_cost} name=${m.name}`
      );
    }
    if (m.percent_labor > 0 && m.percent_labor < 0.2 && m.add_labor_minutes === 0) {
      pushIssue(
        allIssues,
        'SUSPICIOUS_NUMERIC',
        'modifier',
        m.id,
        'percent_labor is between 0 and 0.2 (confirm not meant to be 0–20%)',
        `percent_labor=${m.percent_labor}`
      );
    }
    if (m.percent_material > 0 && m.percent_material < 0.2) {
      pushIssue(
        allIssues,
        'SUSPICIOUS_NUMERIC',
        'modifier',
        m.id,
        'percent_material is between 0 and 0.2 (confirm not meant to be 0–20%)',
        `percent_material=${m.percent_material}`
      );
    }
    let jcat: unknown;
    try {
      jcat = JSON.parse(m.applies_to_categories || '[]');
    } catch {
      pushIssue(
        allIssues,
        'TAGS_OR_JSON_INVALID',
        'modifier',
        m.id,
        'applies_to_categories is not valid JSON',
        m.applies_to_categories.slice(0, 200)
      );
    }
    if (typeof jcat === 'string' && mixedDelims(String(jcat))) {
      pushIssue(
        allIssues,
        'DELIMITER_INCONSISTENT',
        'modifier',
        m.id,
        'applies_to_categories (string) mixes delimiters',
        String(jcat).slice(0, 180)
      );
    }
  }

  const bundles = await dbAll<BundleRow>('SELECT * FROM bundles_v1');
  const bundleAct = new Map(bundles.map((b) => [b.id, b.active]));
  const skus = new Set<string>();
  const idSet = new Set<string>(catalog.map((c) => String(c.id)));
  for (const c of catalog) {
    if (String(c.sku || '').trim()) skus.add(normSku(c.sku));
  }

  const bItems = await dbAll<BundleItemRow & { b_active?: number }>(
    `SELECT bi.*, b.active as b_active FROM bundle_items_v1 bi JOIN bundles_v1 b ON b.id = bi.bundle_id`
  );
  for (const bi of bItems) {
    if (!bi.b_active) continue;
    if (bi.catalog_item_id && !idSet.has(bi.catalog_item_id)) {
      pushIssue(
        allIssues,
        'BUNDLE_DANGLING_REFERENCE',
        'bundle_item',
        bi.id,
        'catalog_item_id not found in catalog_items',
        String(bi.catalog_item_id)
      );
    }
    if (!bi.catalog_item_id) {
      const s = String(bi.sku || '').trim();
      if (s && !skus.has(normSku(s))) {
        pushIssue(
          allIssues,
          'BUNDLE_DANGLING_REFERENCE',
          'bundle_item',
          bi.id,
          'No catalog_item_id and SKU not found in current catalog',
          s
        );
      }
    } else if (String(bi.sku || '').trim() && !skus.has(normSku(bi.sku))) {
      pushIssue(
        allIssues,
        'BUNDLE_DANGLING_SUSPECT',
        'bundle_item',
        bi.id,
        'Line has catalog_item_id but bundle SKU is absent from current catalog (override text?)',
        String(bi.sku)
      );
    }
    if (String(bi.notes || '').includes('|') && String(bi.notes).includes(',') && String(bi.notes).split('|').length > 1) {
      pushIssue(
        allIssues,
        'DELIMITER_INCONSISTENT',
        'bundle_item',
        bi.id,
        'Bundle item notes use mixed delimiters',
        (bi.notes || '').slice(0, 160)
      );
    }
  }
  for (const b of bundles) {
    if (mixedDelims(b.bundle_name)) {
      pushIssue(
        allIssues,
        'DELIMITER_INCONSISTENT',
        'bundle',
        b.id,
        'Bundle name mixes delimiters',
        b.bundle_name
      );
    }
  }

  // Split issues into per-report CSVs
  const hFull: string[] = ['issue_type', 'entity', 'entity_id', 'message', 'detail'];
  const toRows = (issues: AuditRow[]) => issues.map((r) => [r.issueType, r.entity, r.entityId, r.message, r.detail]);

  const dupSku = allIssues.filter((i) => i.issueType === 'DUPLICATE_SKU');
  const dupName = allIssues.filter((i) => i.issueType === 'DUPLICATE_NAME_CLUSTER');
  const uom = allIssues.filter((i) => i.issueType === 'UOM_ANOMALY');
  const modMath = allIssues.filter((i) => i.issueType === 'MODIFIER_PCT_IN_FLAT_SUSPECT' || (i.entity === 'modifier' && i.issueType === 'SUSPICIOUS_NUMERIC'));
  const zeroCost = allIssues.filter((i) => i.issueType === 'ZERO_MATERIAL_TANGIBLE');
  const csi = allIssues.filter(
    (i) => i.issueType === 'MISSING_CSI' || i.issueType === 'UNMAPPED_CATEGORY_CSI' || (i.entity === 'catalog_item' && i.message.includes('CSI'))
  );
  const legacy = allIssues.filter((i) => i.issueType === 'LEGACY_ALIAS_CANDIDATE');
  const delim = allIssues.filter((i) => i.issueType === 'DELIMITER_INCONSISTENT' || i.issueType === 'TAGS_OR_JSON_INVALID');
  const bundleRef = allIssues.filter(
    (i) => i.entity === 'bundle' || i.entity === 'bundle_item' || /BUNDLE_DANGLING/.test(i.issueType)
  );
  const variant = allIssues.filter((i) => i.issueType === 'VARIANT_TOKEN_IN_TEXT');

  writeCsv('catalog_audit_report.csv', hFull, toRows(allIssues));
  const byType = countByType(allIssues);
  const countRows: string[][] = Array.from(byType.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, c]) => [k, String(c)]);
  writeCsv('issue_counts_by_type.csv', ['issue_type', 'count'], countRows);
  writeCsv('duplicate_sku_report.csv', hFull, toRows(dupSku));
  writeCsv('likely_duplicate_name_report.csv', hFull, toRows(dupName));
  writeCsv('uom_anomaly_report.csv', hFull, toRows(uom));
  writeCsv('modifier_math_error_report.csv', hFull, toRows(modMath));
  writeCsv('zero_cost_items_report.csv', hFull, toRows(zeroCost));
  writeCsv('category_mapping_report.csv', hFull, toRows(csi));
  writeCsv('legacy_alias_candidates.csv', hFull, toRows(legacy));
  writeCsv('variant_token_report.csv', hFull, toRows(variant));
  writeCsv('delimiter_and_json_report.csv', hFull, toRows(delim));
  writeCsv('bundle_reference_report.csv', hFull, toRows(bundleRef));

  console.log('\n--- Issue counts by type (see issue_counts_by_type.csv) ---');
  for (const [k, c] of Array.from(byType.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  ${k}: ${c}`);
  }
  const total = allIssues.length;
  console.log(`\nTotal issue rows: ${total} (one item may appear in multiple issues)`);
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
