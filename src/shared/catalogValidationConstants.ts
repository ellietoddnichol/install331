/**
 * Shared catalog validation constants (Sheets sync, audit scripts, publish-blockers report).
 * Keep in sync with scripts/catalog-audit.ts semantics.
 */

/** Normalized UOM codes accepted for publish / workbook validation warnings. */
export const CATALOG_ALLOWED_UOM = new Set(
  'EA,LS,LF,SF,BOX,CASE,ST,SET,STALL,COMPARTMENT,PAIR,ROLL,PER,TBD'.split(',').map((s) => s.trim().toUpperCase())
);
