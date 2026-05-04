/**
 * Normalization helpers for Google Sheets → `catalog_items` upserts.
 * Rules are conservative: preserve display/raw strings on the row where possible;
 * use normalized keys for matching and duplicate detection.
 */

const SPACE_RE = /\s+/g;

/** Preferred estimator-facing category buckets (main branch). */
export const ESTIMATOR_CATEGORY_MAIN_BUCKETS: readonly string[] = [
  'Toilet Accessories',
  'Toilet Partitions',
  'Visual Display Surfaces',
  'Wall & Door Protection',
  'Fire Protection Specialties',
  'Postal Specialties',
  'Lockers',
  'Storage Specialties',
  'Signage',
  'Access Doors / Panels',
  'Flagpoles',
  'General Requirements / Add-Ins',
] as const;

const MANUFACTURER_ALIAS: Array<{ pattern: RegExp; canonical: string }> = [
  { pattern: /^bobrick\b/i, canonical: 'Bobrick' },
  { pattern: /^bobrick\s+washroom\b/i, canonical: 'Bobrick' },
  { pattern: /^asi\b/i, canonical: 'ASI' },
  { pattern: /^asi\s+global\b/i, canonical: 'ASI' },
  { pattern: /^scranton\s+products\b/i, canonical: 'Scranton' },
];

/** Lowercase, collapsed spaces — for comparison keys only. */
export function normalizeManufacturer(value: string | null | undefined): string {
  let s = String(value ?? '').trim().replace(SPACE_RE, ' ');
  if (!s) return '';
  for (const { pattern, canonical } of MANUFACTURER_ALIAS) {
    if (pattern.test(s)) return canonical;
  }
  return s;
}

/** Comparison form: lowercase, collapsed spaces (does not apply vendor alias table). */
export function manufacturerNormalizedKey(value: string | null | undefined): string {
  return normalizeManufacturer(value).trim().toLowerCase();
}

/** Lowercase, strip spaces and common punctuation for duplicate SKU detection. */
export function normalizeSku(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s\-_.#/]/g, '');
}

/** Light trim for category strings (preserve human-readable `category` column). */
export function normalizeCategory(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .replace(SPACE_RE, ' ');
}

/**
 * Maps a raw sheet category into a coarse estimator bucket; preserves lineage via raw column elsewhere.
 */
export function mapCategoryMain(raw: string | null | undefined): string | null {
  const s = normalizeCategory(raw);
  if (!s) return null;
  const lower = s.toLowerCase();
  if (/washroom|restroom|toilet\s+accessor|bath(accessories)?|dryer|dispenser|mirror|grab|towel|soap/i.test(lower)) {
    if (/partition|compartment|stall|headrail|pilaster|urinal\s+screen/i.test(lower)) return 'Toilet Partitions';
    return 'Toilet Accessories';
  }
  if (/partition|phenolic|hdpe|solid\s+plastic|powder\s+coated|laminate/i.test(lower) && /door|stall/i.test(lower)) {
    return 'Toilet Partitions';
  }
  if (/white\s*board|tack\s*board|tackboard|visual\s+display|marker\s*board/i.test(lower)) return 'Visual Display Surfaces';
  if (/corner\s*guard|crash|wall\s*protection|chair\s*rail|hand\s*rail(?!ing)/i.test(lower)) return 'Wall & Door Protection';
  if (/fire\s*ext|extinguisher|cabinet|fire\s*protection/i.test(lower)) return 'Fire Protection Specialties';
  if (/locker/i.test(lower)) return 'Lockers';
  if (/sign|plaque|directory/i.test(lower)) return 'Signage';
  if (/access\s*door|access\s*panel/i.test(lower)) return 'Access Doors / Panels';
  if (/flag\s*pole|flagpole/i.test(lower)) return 'Flagpoles';
  if (/postal|mailbox/i.test(lower)) return 'Postal Specialties';
  if (/storage|cabinet|shelv/i.test(lower)) return 'Storage Specialties';
  return null;
}

const UNIT_MAP: Array<{ re: RegExp; code: string }> = [
  { re: /^(ea|each|pc|piece)$/i, code: 'EA' },
  { re: /^(lf|lin(\.|ear)?\s*ft|linear\s*ft)$/i, code: 'LF' },
  { re: /^(sf|sq\.?\s*ft|square\s*ft)$/i, code: 'SF' },
  { re: /^(set|kit)$/i, code: 'SET' },
  { re: /^(hr|hour|hours)$/i, code: 'HR' },
  { re: /^(allow|allowance|ls|lump)$/i, code: 'ALLOW' },
];

/** Normalize display units toward estimator-facing codes; unknown values uppercased. */
export function normalizeUnit(raw: string | null | undefined): string {
  const s = String(raw ?? '').trim();
  if (!s) return 'EA';
  const compact = s.replace(/\s+/g, ' ').trim();
  for (const { re, code } of UNIT_MAP) {
    if (re.test(compact)) return code;
  }
  return compact.toUpperCase().slice(0, 12);
}

export type CatalogItemTypeHint =
  | 'sku_item'
  | 'generic_item'
  | 'assembly'
  | 'modifier'
  | 'add_in'
  | 'allowance';

export function inferItemType(params: {
  sku: string;
  category: string;
  description: string;
  tags: string[];
}): CatalogItemTypeHint {
  const tagJoin = (params.tags || []).join(' ').toLowerCase();
  const blob = `${params.description} ${params.category} ${tagJoin}`.toLowerCase();
  if (/\ballowance\b|\ballow\b/i.test(blob)) return 'allowance';
  if (/\bmodifier\b|\bmod\b/i.test(tagJoin)) return 'modifier';
  if (/\badd[\s-]*in\b|\baddon\b/i.test(blob)) return 'add_in';
  if (/\bassembly\b|\bkitted\b/i.test(blob)) return 'assembly';
  if (!String(params.sku || '').trim()) return 'generic_item';
  return 'sku_item';
}

/** Stable key for deduping within a manufacturer scope (not globally unique). */
export function buildCatalogCanonicalKey(input: {
  manufacturerNormalized: string;
  skuNormalized: string;
  description: string;
}): string {
  const m = input.manufacturerNormalized || 'unknown-mfr';
  const s = input.skuNormalized || normalizeSku(input.description).slice(0, 40);
  return `${m}::${s}`;
}
