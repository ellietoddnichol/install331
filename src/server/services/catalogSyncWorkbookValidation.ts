/**
 * Pre-transaction validation for Google Sheets → catalog sync (workbook-first guardrails).
 */
import { createHash, randomUUID } from 'node:crypto';
import { getCatalogItemsWriteTableName, getCatalogModifiersReadTableName } from '../db/catalogTable.ts';
import { dbCatalogAll } from '../db/query.ts';
import { normalizeSku, normalizeUnit } from './catalog/catalogNormalization.ts';
import { CATALOG_ALLOWED_UOM } from '../../shared/catalogValidationConstants.ts';
import type { CatalogSyncReviewSummary, CatalogSyncRunAuditSummary } from '../../shared/types/catalogSyncAudit.ts';
import { CATALOG_SYNC_REVIEW_MAX_SAMPLES } from '../../shared/types/catalogSyncAudit.ts';

export type { CatalogSyncCountsSnapshot, CatalogSyncRunAuditSummary, CatalogSyncReviewSummary } from '../../shared/types/catalogSyncAudit.ts';

function pushReviewSample<T>(arr: T[], value: T): void {
  if (arr.length < CATALOG_SYNC_REVIEW_MAX_SAMPLES) arr.push(value);
}

function normalizeHeader(input: string): string {
  return String(input || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function columnIndex(headers: string[], aliases: string[]): number | null {
  for (let i = 0; i < headers.length; i += 1) {
    const header = headers[i];
    if (!header) continue;
    if (aliases.some((alias) => header === alias || header.includes(alias))) {
      return i;
    }
  }
  return null;
}

function getCell(row: string[], index: number | null): string {
  if (index === null) return '';
  return String(row[index] ?? '').trim();
}

function splitList(input: unknown): string[] {
  const value = String(input ?? '').trim();
  if (!value) return [];
  return value
    .split(/[,;|\n]/g)
    .map((token) => token.trim())
    .filter(Boolean);
}

function createHashKey(parts: string[]): string {
  return parts.map((p) => p.trim().toLowerCase()).filter(Boolean).join('|');
}

/** sha1 first 20 — mirrors googleSheetsCatalogSync `keyFromParts` */
function stableKeyFallback(category: string, nameOrDesc: string): string {
  const joined = createHashKey([category, nameOrDesc]);
  return createHash('sha1').update(joined || randomUUID()).digest('hex').slice(0, 20);
}

function parseNumberCell(raw: string): { value: number; invalid: boolean } {
  const s = String(raw ?? '').trim();
  if (!s) return { value: 0, invalid: false };
  const cleaned = s.replace(/,/g, '').replace(/^\s*[$€£]\s*/i, '').replace(/\s*[$€£]\s*$/i, '').trim();
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return { value: 0, invalid: true };
  return { value: n, invalid: false };
}

function parseBooleanCell(raw: string, defaultValue: boolean): { value: boolean; ambiguous: boolean } {
  const value = String(raw ?? '').trim().toLowerCase();
  if (!value) return { value: defaultValue, ambiguous: false };
  if (['true', '1', 'yes', 'y', 'active', 'enabled'].includes(value)) return { value: true, ambiguous: false };
  if (['false', '0', 'no', 'n', 'inactive', 'disabled'].includes(value)) return { value: false, ambiguous: false };
  return { value: defaultValue, ambiguous: true };
}

function normalizeModifierToken(input: string): string {
  return String(input ?? '').trim().toUpperCase().replace(/\s+/g, '_');
}

function canonicalKey(input: string): string {
  return String(input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function isEnvTruthyFlag(v: string | undefined): boolean {
  const s = String(v ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

/** Truncate long SKU lists in preflight messages (e.g. many products under one generic_name). */
function formatSkuSetForMessage(set: Set<string>, maxShow = 32): string {
  const arr = Array.from(set);
  if (arr.length <= maxShow) return arr.join(', ');
  return `${arr.slice(0, maxShow).join(', ')} … (+${arr.length - maxShow} more)`;
}

/** Sheet may use generic_name / Generic Name / genericname — key is aliasType|value */
function isGenericNameAliasAggKey(key: string): boolean {
  const head = key.split('|')[0] ?? '';
  const norm = head.replace(/_/g, '').toLowerCase();
  return norm === 'genericname';
}

/** Labor heuristics aligned with scripts/publish-blockers-report.ts */
export function laborSuspicionReason(row: {
  category: string;
  description: string;
  subcategory: string;
  laborMin: number;
  active: boolean;
}): string | null {
  if (!row.active) return null;
  const { laborMin: lm } = row;
  if (!Number.isFinite(lm)) return null;
  if (lm < 0) return 'negative_labor';
  if (lm > 720) return 'very_high_gt_12hr';
  const blob = `${row.category} ${row.description} ${row.subcategory}`.toLowerCase();
  if (lm >= 1 && lm <= 5 && blob.includes('partition')) return 'suspiciously_low_vs_category_partition';
  return null;
}

export type WorkbookPreflightResult = {
  blocking: string[];
  warnings: string[];
  audit: CatalogSyncRunAuditSummary;
};

/** Max distinct blocking lines surfaced from preflight before truncation. */
export const CATALOG_SYNC_PREFLIGHT_MAX_BLOCKING = 24;

/**
 * Validates fetched workbook rows before the sync transaction. Uses read-only DB for SKU resolution checks.
 */
export async function preflightCatalogWorkbookSync(input: {
  itemRows: string[][];
  modifierRows: string[][];
  bundleRows: string[][];
  aliasRows: string[][] | null;
  attributeRows: string[][] | null;
}): Promise<WorkbookPreflightResult> {
  const blocking: string[] = [];
  const warnings: string[] = [];
  const audit: CatalogSyncRunAuditSummary = {
    tabRows: {
      items: input.itemRows?.length || 0,
      modifiers: input.modifierRows?.length || 0,
      bundles: input.bundleRows?.length || 0,
      aliases: input.aliasRows?.length || 0,
      attributes: input.attributeRows?.length || 0,
    },
  };

  let duplicateSkuConflictCount = 0;
  const duplicateSkuConflictSampleKeys: string[] = [];
  let aliasMultiTargetCount = 0;
  const aliasMultiTargetSampleKeys: string[] = [];
  let laborOutlierCount = 0;
  const laborOutlierSampleLines: string[] = [];
  const orphanBundleSkuSample: string[] = [];
  const orphanBundleModifierSample: string[] = [];
  let orphanAttributeCanonicalCount = 0;
  const orphanAttributeCanonicalSample: string[] = [];
  let orphanAliasCanonicalCount = 0;
  const orphanAliasCanonicalSample: string[] = [];

  const allowedCategoriesRaw = String(process.env.PUBLISH_BLOCKERS_ALLOWED_CATEGORIES || '').trim();
  const allowedCategories = allowedCategoriesRaw
    ? new Set(
        allowedCategoriesRaw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      )
    : null;

  const writeTable = getCatalogItemsWriteTableName();
  const modifiersRead = getCatalogModifiersReadTableName();
  const dbSkus = await dbCatalogAll<{ sku: string }>(
    `SELECT sku FROM ${writeTable} WHERE sku IS NOT NULL AND trim(sku) <> ''`,
    []
  );
  const dbSkuNorm = new Set(dbSkus.map((r) => normalizeSku(r.sku)).filter(Boolean));
  const dbModifierKeys = await dbCatalogAll<{ modifier_key: string }>(`SELECT modifier_key FROM ${modifiersRead}`, []);

  // --- Items: duplicate SKU conflicts + cell issues
  if (input.itemRows && input.itemRows.length > 1) {
    const headers = input.itemRows[0].map(normalizeHeader);
    const skuCol = columnIndex(headers, [
      'sku',
      'item sku',
      'item code',
      'product sku',
      'catalog sku',
      'vendor item',
      'vendor part',
      'vendor sku',
      'mfg item',
      'style number',
    ]);
    const itemKeyCol = columnIndex(headers, ['item id', 'itemid', 'item key', 'search key', 'search_key', 'key']);
    const categoryCol = columnIndex(headers, ['scope category', 'category', 'product category', 'commodity']);
    const descriptionCol = columnIndex(headers, [
      'description',
      'item description',
      'long description',
      'product description',
      'desc',
      'details',
      'specification',
      'spec',
    ]);
    const itemCol = columnIndex(headers, ['item', 'item name', 'itemname', 'product name', 'short description']);
    const uomCol = columnIndex(headers, ['unit', 'uom', 'base unit', 'um', 'measure']);
    const materialCol = columnIndex(headers, [
      'base material cost',
      'material cost',
      'base material',
      'basematerialcost',
      'material price',
      'unit price',
      'item price',
      'list price',
      'sell price',
      'net material',
      'mat cost',
      'price each',
      'each price',
      'material unit cost',
    ]);
    const laborCol = columnIndex(headers, [
      'baselaborminutes',
      'base labor minutes',
      'labor minutes',
      'labor mins',
      'install minutes',
      'install time',
    ]);
    const activeCol = columnIndex(headers, ['active', 'is active', 'isactive', 'enabled']);
    const subcategoryCol = columnIndex(headers, ['subcategory', 'sub category']);

    if (descriptionCol === null && itemCol === null) {
      blocking.push('ITEMS tab is missing required headers (Description / Item name).');
    }

    const lastOccurrenceRowIndexByStableKey = new Map<string, number>();
    for (let j = 1; j < input.itemRows.length; j += 1) {
      const probe = input.itemRows[j];
      if (!probe || probe.length === 0) continue;
      const skuP = getCell(probe, skuCol);
      const itemKeyP = getCell(probe, itemKeyCol);
      const categoryP = getCell(probe, categoryCol);
      const itemNameP = getCell(probe, itemCol);
      const descriptionP = getCell(probe, descriptionCol) || itemNameP;
      if (!descriptionP) continue;
      const stableKeyP = skuP || itemKeyP || stableKeyFallback(categoryP, itemNameP || descriptionP);
      lastOccurrenceRowIndexByStableKey.set(stableKeyP, j);
    }

    let skippedDup = 0;
    let failedVal = 0;

    type SkuSig = { row: number; mat: number; lab: number; desc: string; sku: string };
    const byNormSku = new Map<string, SkuSig[]>();

    for (let i = 1; i < input.itemRows.length; i += 1) {
      const row = input.itemRows[i];
      const sku = getCell(row, skuCol);
      const itemKey = getCell(row, itemKeyCol);
      const category = getCell(row, categoryCol);
      const itemName = getCell(row, itemCol);
      const description = getCell(row, descriptionCol) || itemName;
      if (!description) continue;
      const stableKey = sku || itemKey || stableKeyFallback(category, itemName || description);
      if (lastOccurrenceRowIndexByStableKey.get(stableKey) !== i) {
        skippedDup += 1;
        continue;
      }

      const skuNorm = normalizeSku(sku);
      if (skuNorm) {
        const mat = parseNumberCell(getCell(row, materialCol));
        const lab = parseNumberCell(getCell(row, laborCol));
        if (mat.invalid) {
          failedVal += 1;
          warnings.push(`ITEMS row ${i + 1}: material/price cell is not numeric (SKU ${sku || '(none)'}).`);
        }
        if (lab.invalid) {
          failedVal += 1;
          warnings.push(`ITEMS row ${i + 1}: labor minutes cell is not numeric (SKU ${sku || '(none)'}).`);
        }
        const sig: SkuSig = {
          row: i + 1,
          mat: mat.value,
          lab: lab.value,
          desc: description.trim().toLowerCase(),
          sku,
        };
        const list = byNormSku.get(skuNorm) || [];
        list.push(sig);
        byNormSku.set(skuNorm, list);
      }

      const rawUom = getCell(row, uomCol);
      const uom = normalizeUnit(rawUom);
      if (rawUom.trim() && !CATALOG_ALLOWED_UOM.has(uom)) {
        warnings.push(`ITEMS row ${i + 1}: UOM "${rawUom}" → "${uom}" is not in the standard allow-list (SKU ${sku || '(none)'}).`);
      }

      if (allowedCategories && allowedCategories.size > 0) {
        const cat = String(category ?? '').trim();
        if (!cat || !allowedCategories.has(cat)) {
          blocking.push(
            `ITEMS row ${i + 1}: category "${cat || '(blank)'}" is not in PUBLISH_BLOCKERS_ALLOWED_CATEGORIES allow-list (SKU ${sku || '(none)'}).`
          );
        }
      }

      if (activeCol !== null) {
        const pb = parseBooleanCell(getCell(row, activeCol), true);
        if (pb.ambiguous) {
          warnings.push(`ITEMS row ${i + 1}: Active column value "${getCell(row, activeCol)}" is not a clear boolean (SKU ${sku || '(none)'}).`);
        }
      }

      const active = activeCol === null ? true : parseBooleanCell(getCell(row, activeCol), true).value;
      const laborN = parseNumberCell(getCell(row, laborCol)).value;
      const sus = laborSuspicionReason({
        category: category || '',
        description,
        subcategory: getCell(row, subcategoryCol) || '',
        laborMin: laborN,
        active,
      });
      if (sus) {
        laborOutlierCount += 1;
        pushReviewSample(
          laborOutlierSampleLines,
          `row ${i + 1} · SKU ${sku || '(none)'} · ${sus} · ${laborN} min`
        );
        warnings.push(`ITEMS row ${i + 1}: suspicious labor (${sus}) — ${laborN} min, SKU ${sku || '(none)'}.`);
      }
    }

    audit.itemsSkippedDuplicateRow = skippedDup;

    for (const [skuKey, sigs] of byNormSku) {
      if (sigs.length < 2) continue;
      const ref = sigs[0];
      const conflict = sigs.some((s) => s.desc !== ref.desc || Math.abs(s.mat - ref.mat) > 0.009 || Math.abs(s.lab - ref.lab) > 0.009);
      if (conflict) {
        duplicateSkuConflictCount += 1;
        pushReviewSample(duplicateSkuConflictSampleKeys, skuKey);
        blocking.push(
          `Duplicate canonical SKU "${skuKey}" in ITEMS: conflicting rows ${sigs.map((s) => s.row).join(', ')} (normalized key collision).`
        );
      }
    }

    audit.preflightDuplicatesResolved = Array.from(byNormSku.values()).filter((a) => a.length > 1).length;
    audit.rowsFailedValidation = failedVal;
  }

  // --- Aliases: multi-target collisions in sheet
  if (input.aliasRows && input.aliasRows.length > 1) {
    const headers = input.aliasRows[0].map(normalizeHeader);
    const canonCol = columnIndex(headers, ['canonical_sku', 'canonical sku', 'sku']);
    const typeCol = columnIndex(headers, ['aliastype', 'alias type', 'type']);
    const valueCol = columnIndex(headers, ['aliasvalue', 'alias value', 'value']);
    const activeCol = columnIndex(headers, ['active', 'enabled', 'is active']);
    if (canonCol != null && typeCol != null && valueCol != null) {
      const targetByAlias = new Map<string, Set<string>>();
      for (let i = 1; i < input.aliasRows.length; i += 1) {
        const row = input.aliasRows[i];
        const canonicalSku = String(row[canonCol] ?? '').trim();
        const aliasType = String(row[typeCol] ?? '')
          .trim()
          .toLowerCase()
          .replace(/\s+/g, '_');
        const aliasValue = String(row[valueCol] ?? '').trim();
        const active = activeCol == null ? true : parseBooleanCell(String(row[activeCol] ?? ''), true).value;
        if (!canonicalSku || !aliasType || !aliasValue || !active) continue;
        const key = `${aliasType}|${aliasValue.toLowerCase()}`;
        const set = targetByAlias.get(key) || new Set<string>();
        set.add(canonicalSku.toLowerCase());
        targetByAlias.set(key, set);
      }
      const strictGenericNameMultiTarget = isEnvTruthyFlag(process.env.CATALOG_SYNC_PREFLIGHT_STRICT_GENERIC_NAME_ALIASES);
      for (const [key, set] of targetByAlias) {
        if (set.size > 1) {
          aliasMultiTargetCount += 1;
          pushReviewSample(aliasMultiTargetSampleKeys, key);
          const skuPart = formatSkuSetForMessage(set);
          const base = `ALIASES: alias key "${key}" maps to multiple canonical SKUs (${set.size}): ${skuPart}.`;
          const isGenericNameKey = isGenericNameAliasAggKey(key);
          if (isGenericNameKey && !strictGenericNameMultiTarget) {
            warnings.push(
              `${base} Allowed for generic_name (many catalog rows may share one broad phrase; intake resolves the first phrase match). ` +
                `Set CATALOG_SYNC_PREFLIGHT_STRICT_GENERIC_NAME_ALIASES=1 to treat these as blocking.`
            );
          } else {
            blocking.push(base);
          }
        }
      }
    }
  }

  // --- Bundles: orphan SKU / modifier against sheet+DB SKU universe
  let bundleUnknownSku = 0;
  let bundleUnknownMod = 0;
  if (input.bundleRows && input.itemRows && input.bundleRows.length > 1 && input.itemRows.length > 1) {
    const itemHeaders = input.itemRows[0].map(normalizeHeader);
    const skuCol = columnIndex(itemHeaders, [
      'sku',
      'item sku',
      'item code',
      'product sku',
      'catalog sku',
      'vendor item',
      'vendor part',
      'vendor sku',
      'mfg item',
      'style number',
    ]);
    const itemKeyCol = columnIndex(itemHeaders, ['item id', 'itemid', 'item key', 'search key', 'search_key', 'key']);
    const categoryCol = columnIndex(itemHeaders, ['scope category', 'category', 'product category', 'commodity']);
    const descriptionCol = columnIndex(itemHeaders, [
      'description',
      'item description',
      'long description',
      'product description',
      'desc',
    ]);
    const itemCol = columnIndex(itemHeaders, ['item', 'item name', 'itemname', 'product name', 'short description']);

    const sheetSku = new Set<string>();
    if (skuCol !== null) {
      for (let i = 1; i < input.itemRows.length; i += 1) {
        const s = getCell(input.itemRows[i], skuCol);
        const n = normalizeSku(s);
        if (n) sheetSku.add(n);
      }
    }
    dbSkuNorm.forEach((s) => sheetSku.add(s));

    const modHeaders = input.modifierRows[0].map(normalizeHeader);
    const mkCol = columnIndex(modHeaders, ['modifier key', 'modifierkey', 'key', 'modifier']);
    const nameCol = columnIndex(modHeaders, ['name', 'modifier name', 'modifiername', 'title', 'label']);
    const modifierByCanonicalKey = new Map<string, string>();
    dbModifierKeys.forEach((row) => {
      const key = normalizeModifierToken(row.modifier_key);
      const canonical = canonicalKey(key);
      if (canonical && !modifierByCanonicalKey.has(canonical)) modifierByCanonicalKey.set(canonical, key);
    });
    for (let i = 1; i < input.modifierRows.length; i += 1) {
      const row = input.modifierRows[i];
      const name = getCell(row, nameCol) || getCell(row, mkCol);
      if (!name) continue;
      const modifierKey = (getCell(row, mkCol) || stableKeyFallback('', name)).toUpperCase().replace(/\s+/g, '_');
      const key = normalizeModifierToken(modifierKey);
      const canonical = canonicalKey(key);
      if (canonical && !modifierByCanonicalKey.has(canonical)) modifierByCanonicalKey.set(canonical, key);
    }

    const bHeaders = input.bundleRows[0].map(normalizeHeader);
    const nameBCol = columnIndex(bHeaders, ['bundle name', 'name']);
    const skuListCol = columnIndex(bHeaders, ['included skus', 'included sku', 'skus', 'items', 'included items']);
    const modifierListCol = columnIndex(bHeaders, ['included modifiers', 'modifiers']);
    if (nameBCol !== null) {
      for (let i = 1; i < input.bundleRows.length; i += 1) {
        const row = input.bundleRows[i];
        const bundleName = getCell(row, nameBCol);
        if (!bundleName) continue;
        const skus = splitList(getCell(row, skuListCol));
        for (const tok of skus) {
          const ns = normalizeSku(tok);
          if (ns && !sheetSku.has(ns)) {
            bundleUnknownSku += 1;
            pushReviewSample(orphanBundleSkuSample, tok);
            blocking.push(`BUNDLES row ${i + 1} (${bundleName}): included SKU "${tok}" not found on ITEMS sheet or in existing catalog.`);
          }
        }
        const mods = splitList(getCell(row, modifierListCol));
        for (const tok of mods) {
          const canTok = canonicalKey(tok);
          const matchedKey = canTok ? modifierByCanonicalKey.get(canTok) : null;
          if (!matchedKey) {
            bundleUnknownMod += 1;
            pushReviewSample(orphanBundleModifierSample, tok);
            warnings.push(`BUNDLES row ${i + 1} (${bundleName}): unknown modifier key "${tok}".`);
          }
        }
      }
    }
  }

  audit.bundleUnknownSku = bundleUnknownSku;
  audit.bundleUnknownModifier = bundleUnknownMod;

  if (input.attributeRows && input.itemRows.length > 1) {
    const h = input.attributeRows[0].map(normalizeHeader);
    const canonCol = columnIndex(h, ['canonical_sku', 'canonical sku', 'sku']);
    if (canonCol != null) {
      const itemHeaders = input.itemRows[0].map(normalizeHeader);
      const skuCol = columnIndex(itemHeaders, ['sku', 'item sku', 'catalog sku']);
      const sheet = new Set<string>();
      if (skuCol != null) {
        for (let i = 1; i < input.itemRows.length; i += 1) {
          const n = normalizeSku(getCell(input.itemRows[i], skuCol));
          if (n) sheet.add(n);
        }
      }
      for (let i = 1; i < input.attributeRows.length; i += 1) {
        const sku = String(input.attributeRows[i][canonCol] ?? '').trim();
        if (!sku) continue;
        const n = normalizeSku(sku);
        if (n && !sheet.has(n) && !dbSkuNorm.has(n)) {
          orphanAttributeCanonicalCount += 1;
          pushReviewSample(orphanAttributeCanonicalSample, sku);
          blocking.push(`ATTRIBUTES row ${i + 1}: Canonical_SKU "${sku}" not found in ITEMS sheet or DB.`);
        }
      }
    }
  }

  if (input.aliasRows && input.aliasRows.length > 1 && input.itemRows.length > 1) {
    const h = input.aliasRows[0].map(normalizeHeader);
    const canonCol = columnIndex(h, ['canonical_sku', 'canonical sku', 'sku']);
    if (canonCol != null) {
      const itemHeaders = input.itemRows[0].map(normalizeHeader);
      const skuCol = columnIndex(itemHeaders, ['sku', 'item sku', 'catalog sku']);
      const sheet = new Set<string>();
      if (skuCol != null) {
        for (let i = 1; i < input.itemRows.length; i += 1) {
          const n = normalizeSku(getCell(input.itemRows[i], skuCol));
          if (n) sheet.add(n);
        }
      }
      for (let i = 1; i < input.aliasRows.length; i += 1) {
        const sku = String(input.aliasRows[i][canonCol] ?? '').trim();
        if (!sku) continue;
        const n = normalizeSku(sku);
        if (n && !sheet.has(n) && !dbSkuNorm.has(n)) {
          orphanAliasCanonicalCount += 1;
          pushReviewSample(orphanAliasCanonicalSample, sku);
          blocking.push(`ALIASES row ${i + 1}: Canonical_SKU "${sku}" not found in ITEMS sheet or DB.`);
        }
      }
    }
  }

  const dedupedBlock = Array.from(new Set(blocking));
  const dedupedWarn = Array.from(new Set(warnings));
  audit.blockingIssues = dedupedBlock.length;
  audit.warningsEmitted = dedupedWarn.length;

  const catalogReview: CatalogSyncReviewSummary = {
    duplicateSkuConflictCount,
    duplicateSkuConflictSampleKeys,
    aliasMultiTargetCount,
    aliasMultiTargetSampleKeys,
    laborOutlierCount,
    laborOutlierSampleLines,
    orphanBundleSkuReferenceCount: bundleUnknownSku,
    orphanBundleSkuSample,
    orphanBundleModifierReferenceCount: bundleUnknownMod,
    orphanBundleModifierSample,
    orphanAttributeCanonicalCount,
    orphanAttributeCanonicalSample,
    orphanAliasCanonicalCount,
    orphanAliasCanonicalSample,
  };
  audit.catalogReview = catalogReview;

  return {
    blocking: dedupedBlock.slice(0, CATALOG_SYNC_PREFLIGHT_MAX_BLOCKING),
    warnings: dedupedWarn,
    audit,
  };
}

export function buildCatalogSyncWarningsPayload(warnings: string[], audit?: CatalogSyncRunAuditSummary): string {
  if (!audit) return JSON.stringify(warnings);
  return JSON.stringify({ warnings, audit });
}

export function parseCatalogSyncWarningsPayload(raw: string | null): { warnings: string[]; audit?: CatalogSyncRunAuditSummary } {
  if (!raw) return { warnings: [] };
  try {
    const v = JSON.parse(raw) as unknown;
    if (Array.isArray(v)) return { warnings: v as string[] };
    if (v && typeof v === 'object') {
      const o = v as { warnings?: unknown; audit?: CatalogSyncRunAuditSummary };
      if (Array.isArray(o.warnings)) {
        return { warnings: o.warnings as string[], audit: o.audit };
      }
    }
  } catch {
    /* ignore */
  }
  return { warnings: [] };
}
