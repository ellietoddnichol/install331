import type { CatalogSyncRunAuditSummary } from './types/catalogSyncAudit.ts';

/** Review queues surfaced for CSV export + Catalog manual-review UI (aligned with `catalogReview` buckets). */
export const CATALOG_REVIEW_QUEUE_KEYS = [
  'duplicate_sku_groups',
  'alias_collisions',
  'labor_outliers',
  'orphan_bundle_skus',
  'unknown_modifiers',
  'orphan_attribute_skus',
  'orphan_alias_skus',
] as const;

export type CatalogReviewQueueKey = (typeof CATALOG_REVIEW_QUEUE_KEYS)[number];

export function isCatalogReviewQueueKey(raw: string): raw is CatalogReviewQueueKey {
  return (CATALOG_REVIEW_QUEUE_KEYS as readonly string[]).includes(raw);
}

/** Map one warning/blocking/message line to at most one queue (first match wins). */
export function classifyCatalogReviewLine(line: string): CatalogReviewQueueKey | null {
  const s = line.trim();
  if (!s) return null;

  if (/^ALIASES: alias key/i.test(s)) return 'alias_collisions';
  if (/^ALIASES row .*not found/i.test(s)) return 'orphan_alias_skus';
  if (/^ALIASES:\s+could not resolve canonical_sku/i.test(s)) return 'orphan_alias_skus';

  if (/duplicate canonical sku/i.test(s)) return 'duplicate_sku_groups';

  if (/suspicious labor/i.test(s)) return 'labor_outliers';

  if (/BUNDLES row .*unknown modifier/i.test(s)) return 'unknown_modifiers';

  if (/BUNDLES row .*included sku .*not found/i.test(s)) return 'orphan_bundle_skus';
  if (/BUNDLES row .*unknown sku/i.test(s)) return 'orphan_bundle_skus';

  if (/^ATTRIBUTES row .*not found/i.test(s)) return 'orphan_attribute_skus';
  if (/^ATTRIBUTES:\s+could not resolve canonical_sku/i.test(s)) return 'orphan_attribute_skus';

  return null;
}

/** Combine persisted warnings with normalized blocking lines stored on the sync attempt message. */
export function mergeCatalogReviewSources(warnings: string[], message: string | null | undefined): string[] {
  const out: string[] = [...warnings];
  if (message?.trim()) {
    const stripped = message.replace(/^Catalog sync blocked \(preflight validation\):\s*/i, '').trim();
    for (const ln of stripped.split('\n')) {
      const t = ln.trim();
      if (t) out.push(t);
    }
  }
  return Array.from(new Set(out));
}

export function linesForCatalogReviewQueue(queue: CatalogReviewQueueKey, mergedLines: string[]): string[] {
  return mergedLines.filter((l) => classifyCatalogReviewLine(l) === queue);
}

/** Synthetic detail lines when structured warnings/message produced no classified rows but audit retained capped samples. */
export function augmentCatalogReviewLinesFromAudit(queue: CatalogReviewQueueKey, audit?: CatalogSyncRunAuditSummary): string[] {
  const cr = audit?.catalogReview;
  if (!cr) return [];

  switch (queue) {
    case 'duplicate_sku_groups':
      return cr.duplicateSkuConflictSampleKeys.map(
        (k) => `Duplicate canonical SKU "${k}" (audit sample; full rows live in workbook ITEMS)`
      );
    case 'alias_collisions':
      return cr.aliasMultiTargetSampleKeys.map((k) => `ALIASES: alias key "${k}" (audit sample)`);
    case 'labor_outliers':
      return cr.laborOutlierSampleLines.map(
        (ln) => `ITEMS row —: suspicious labor (audit sample) — ${ln}`
      );
    case 'orphan_bundle_skus':
      return cr.orphanBundleSkuSample.filter(Boolean).map(
        (sku) =>
          `BUNDLES row — (audit sample): included SKU "${sku}" not found on ITEMS sheet or in existing catalog.`
      );
    case 'unknown_modifiers':
      return cr.orphanBundleModifierSample.filter(Boolean).map(
        (mod) => `BUNDLES row — (audit sample): unknown modifier key "${mod}".`
      );
    case 'orphan_attribute_skus':
      return cr.orphanAttributeCanonicalSample.filter(Boolean).map(
        (sku) => `ATTRIBUTES row —: Canonical_SKU "${sku}" not found in ITEMS sheet or DB.`
      );
    case 'orphan_alias_skus':
      return cr.orphanAliasCanonicalSample.filter(Boolean).map(
        (sku) => `ALIASES row —: Canonical_SKU "${sku}" not found in ITEMS sheet or DB.`
      );
    default:
      return [];
  }
}

/** Prefer classified workbook/engine lines; fall back to capped audit samples only when nothing classified. */
export function resolveCatalogReviewExportLines(
  queue: CatalogReviewQueueKey,
  mergedLines: string[],
  audit?: CatalogSyncRunAuditSummary
): string[] {
  const matched = linesForCatalogReviewQueue(queue, mergedLines);
  if (matched.length) return matched;
  return augmentCatalogReviewLinesFromAudit(queue, audit);
}

/** Best-effort primary token for catalog search deep-links (SKU, modifier token, or alias key fragment). */
export function guessCatalogReviewSkuToken(line: string): string | null {
  const dup = line.match(/Duplicate canonical SKU "([^"]+)"/i);
  if (dup?.[1]) return dup[1].trim();

  const canon = line.match(/Canonical_SKU "([^"]+)"/i);
  if (canon?.[1]) return canon[1].trim();

  const skuQuoted = line.match(/\bSKU "([^"]+)"/i);
  if (skuQuoted?.[1] && skuQuoted[1] !== '(none)') return skuQuoted[1].trim();

  const incl = line.match(/included SKU "([^"]+)"/i);
  if (incl?.[1]) return incl[1].trim();

  const unkSku = line.match(/unknown SKU "([^"]+)"/i);
  if (unkSku?.[1]) return unkSku[1].trim();

  const unkMod = line.match(/unknown modifier key "([^"]+)"/i);
  if (unkMod?.[1]) return unkMod[1].trim();

  const aliasKey = line.match(/alias key "([^"]+)"/i);
  if (aliasKey?.[1]) return aliasKey[1].trim();

  const laborBare = line.match(/SKU\s+([^·,\s]+)/);
  if (laborBare?.[1] && laborBare[1] !== '(none)') return laborBare[1].replace(/[).]+$/, '').trim();

  return null;
}

export function catalogReviewCatalogSearchPath(token: string | null | undefined): string {
  const t = String(token ?? '').trim();
  if (!t) return '/catalog';
  return `/catalog?q=${encodeURIComponent(t)}`;
}
