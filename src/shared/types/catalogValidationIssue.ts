/**
 * Catalog audit / future `catalog_validation_issues` table.
 * Use these codes in `scripts/catalog-audit.ts` reports and Phase 2+ storage.
 */
export const CATALOG_ISSUE_TYPES = [
  'DUPLICATE_SKU',
  'DUPLICATE_NAME_CLUSTER',
  'EMPTY_SKU',
  'VARIANT_TOKEN_IN_TEXT',
  'ZERO_MATERIAL_TANGIBLE',
  'SUSPICIOUS_NUMERIC',
  'UOM_ANOMALY',
  'MODIFIER_PCT_IN_FLAT_SUSPECT',
  'DELIMITER_INCONSISTENT',
  'MISSING_CSI',
  'UNMAPPED_CATEGORY_CSI',
  'LEGACY_ALIAS_CANDIDATE',
  'BUNDLE_DANGLING_REFERENCE',
  'BUNDLE_DANGLING_SUSPECT',
  'TAGS_OR_JSON_INVALID',
] as const;

export type CatalogValidationIssueType = (typeof CATALOG_ISSUE_TYPES)[number];
