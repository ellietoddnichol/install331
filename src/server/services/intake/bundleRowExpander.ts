/**
 * Pre-match pass: split bundled descriptions like `Grab bar set: 18 in, 36 in` into child rows
 * so each component can match its own catalog item / install family.
 *
 * Input shape is kept structural (no import of NormalizedIntakeLine) so the expander can be
 * unit-tested in isolation and reused on both spreadsheet and PDF intake paths.
 */

export interface ExpandableLineLike {
  description: string;
  itemName?: string;
  quantity: number;
  unit?: string;
  category?: string;
  notes?: string;
  warnings?: string[];
  sourceManufacturer?: string;
  sourceBidBucket?: string;
  sourceSectionHeader?: string;
}

export interface ExpandedChild<T extends ExpandableLineLike> {
  child: T;
  /** 0-based index of this child in the expansion (useful for stable fingerprints). */
  childIndex: number;
  /** Total number of children the parent was expanded into. */
  childCount: number;
  /** Human label describing the expanded variant (e.g. `Grab bar 18"`). */
  variantLabel: string;
}

/** Detection of a single bundled description. Returns null when the line should not be expanded. */
export interface BundleExpansionPlan {
  family: 'grab_bar' | 'partition_set' | 'accessory_kit';
  /** Base name without the size tokens (e.g. `Grab bar`). */
  baseName: string;
  /** Parsed member sizes / identifiers (e.g. [`18"`, `36"`, `42"`]). */
  members: string[];
  /** How many members per set (always equals members.length for simple list bundles). */
  membersPerSet: number;
}

const UNIT_SYNONYMS: Record<string, string> = {
  set: 'set',
  sets: 'set',
  kit: 'kit',
  kits: 'kit',
  bundle: 'bundle',
  bundles: 'bundle',
  pair: 'set',
  pairs: 'set',
  pr: 'set',
};

function normalizeInches(token: string): string {
  const raw = token.trim().replace(/[”″]/g, '"'); // curly quotes -> straight
  // `18 in`, `18"`, `18-inch`, `18 inch`
  const match = raw.match(/^(\d{1,3})\s*(?:"|in\.?|inch(?:es)?)?$/i);
  if (!match) return raw;
  return `${match[1]}"`;
}

/**
 * Strip common bundle-prefix noise that the PDF parser leaves attached to the description,
 * e.g. `Sets 8322 Grab Bars – 18", 36"` → `Grab Bars – 18", 36"`.
 * Also returns a multiplier inferred from a leading `N sets` phrase when present.
 */
function stripBundlePrefix(description: string): { cleaned: string; leadingMultiplier: number | null } {
  let cleaned = description.replace(/[–—]/g, '-');
  let leadingMultiplier: number | null = null;
  // `2 sets 8322 ...`
  const leadingNSets = cleaned.match(/^\s*(\d{1,4})\s+sets?\b\s*/i);
  if (leadingNSets) {
    leadingMultiplier = Number(leadingNSets[1]);
    cleaned = cleaned.slice(leadingNSets[0].length);
  } else if (/^\s*sets?\b\s+/i.test(cleaned)) {
    // `Sets 8322 ...` (leading count was already stripped into qty by parser)
    cleaned = cleaned.replace(/^\s*sets?\b\s+/i, '');
  }
  // Strip leading SKU/model token like `8322 ` or `4781-11 `
  cleaned = cleaned.replace(/^\s*[A-Z0-9][A-Z0-9\-_.]{2,}\s+/i, (m) =>
    /grab|bar|set|kit|partition|screen|mirror|disposal|dispenser/i.test(m) ? m : ''
  );
  return { cleaned: cleaned.trim(), leadingMultiplier };
}

/**
 * Parse a bundled description.
 *
 * Examples:
 * - `Grab bar set: 18 in, 36 in` → `{ family: 'grab_bar', baseName: 'Grab bar', members: ['18"', '36"'] }`
 * - `Grab bar set: 18", 36", 42"` → `{ family: 'grab_bar', baseName: 'Grab bar', members: ['18"', '36"', '42"'] }`
 * - `Accessory kit: soap dispenser, paper towel dispenser, mirror` →
 *   `{ family: 'accessory_kit', baseName: 'Accessory kit', members: [...] }`
 */
export function detectBundleExpansion(description: string): BundleExpansionPlan | null {
  if (!description) return null;
  const raw = description.trim();
  if (raw.length === 0 || raw.length > 280) return null;

  // Normalize separators and strip leading `Sets 8322 ...` / `N sets ...` noise that PDF parsing leaves attached.
  const { cleaned: trimmed } = stripBundlePrefix(raw);

  // Grab bar set: sizes. Also accept `Grab Bars - 18", 36"` (no "set" keyword) when two+ sizes follow a dash/colon.
  const grabBarSetMatch = trimmed.match(/^(grab\s+bars?)\s+(?:set|kit|bundle|pair|pack|assembly)\s*[:\-]\s*(.+)$/i);
  const grabBarListMatch = !grabBarSetMatch && trimmed.match(/^(grab\s+bars?)\s*[:\-]\s*(.+)$/i);
  const grabBarMatch = grabBarSetMatch || grabBarListMatch;
  if (grabBarMatch) {
    const rawMembers = splitMemberList(grabBarMatch[2]);
    const members = rawMembers
      .map((m) => normalizeInches(m))
      .filter((m) => /^\d{1,3}"$/.test(m));
    if (members.length >= 2) {
      return {
        family: 'grab_bar',
        baseName: 'Grab bar',
        members,
        membersPerSet: members.length,
      };
    }
  }

  // Partition / urinal-screen set lists
  const partitionMatch = trimmed.match(/^(toilet partition|urinal screen|partition)\s+(?:set|kit|bundle|pack|package)\s*[:\-]\s*(.+)$/i);
  if (partitionMatch) {
    const rawMembers = splitMemberList(partitionMatch[2]);
    const members = rawMembers.map((m) => m.trim()).filter(Boolean);
    if (members.length >= 2) {
      return {
        family: 'partition_set',
        baseName: partitionMatch[1].replace(/\b\w/g, (c) => c.toUpperCase()),
        members,
        membersPerSet: members.length,
      };
    }
  }

  // Generic accessory kit: descriptive members (soap dispenser, paper towel, mirror)
  const kitMatch = trimmed.match(/^((?:[a-z]+\s+){0,3}(?:kit|set|bundle|package))\s*[:\-]\s*(.+)$/i);
  if (kitMatch) {
    const rawMembers = splitMemberList(kitMatch[2]);
    // Require at least 2 alphabetic members for a generic kit; pure sizes are handled above.
    const members = rawMembers
      .map((m) => m.trim())
      .filter((m) => m.length > 0 && /[a-z]{3,}/i.test(m));
    if (members.length >= 2) {
      return {
        family: 'accessory_kit',
        baseName: kitMatch[1].replace(/\b\w/g, (c) => c.toUpperCase()),
        members,
        membersPerSet: members.length,
      };
    }
  }

  return null;
}

function splitMemberList(raw: string): string[] {
  // Allow commas, semicolons, or ampersands as separators. Strip trailing "and" phrasing.
  return raw
    .replace(/\s+and\s+/gi, ',')
    .split(/[,;&]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * True when the parent row's UOM or description implies a multi-set count (e.g. `2 sets`).
 * Returns the multiplier (defaulting to 1). Also normalizes `PAIR` -> 2 where applicable.
 */
export function resolveSetMultiplier(line: ExpandableLineLike): number {
  const qty = Number(line.quantity);
  if (!Number.isFinite(qty) || qty <= 0) return 1;
  const unit = String(line.unit || '').toLowerCase().trim();
  if (unit && UNIT_SYNONYMS[unit]) return qty;
  // PDF deterministic parser frequently drops `unit` to null and leaves the token `Sets` inside
  // the description. Treat that as a set unit so qty multiplies per-member correctly.
  const desc = String(line.description || line.itemName || '');
  if (/^\s*(?:\d{1,4}\s+)?sets?\b/i.test(desc)) return qty;
  return 1;
}

/**
 * Expand a single parent row into N child rows using a BundleExpansionPlan.
 * Each child inherits section context, category, manufacturer, and notes. The parent's quantity
 * is interpreted as "number of sets" (multiplier) so `2 sets` of `Grab bar set: 18, 36` yields
 * `2 x Grab bar 18"` + `2 x Grab bar 36"` (not `1 x` each).
 */
export function expandBundleLine<T extends ExpandableLineLike>(
  line: T,
  plan: BundleExpansionPlan
): Array<ExpandedChild<T>> {
  const multiplier = resolveSetMultiplier(line);
  const children: Array<ExpandedChild<T>> = [];
  const additionalWarnings = [
    `Expanded from bundle line "${line.description.slice(0, 80)}" (${plan.members.length} members x ${multiplier}).`,
  ];
  plan.members.forEach((member, idx) => {
    const variantDescription = buildChildDescription(plan, member);
    const child = {
      ...line,
      description: variantDescription,
      itemName: variantDescription,
      quantity: multiplier,
      unit: 'EA',
      warnings: Array.from(new Set([...(line.warnings ?? []), ...additionalWarnings])),
    } as T;
    children.push({
      child,
      childIndex: idx,
      childCount: plan.members.length,
      variantLabel: variantDescription,
    });
  });
  return children;
}

function buildChildDescription(plan: BundleExpansionPlan, member: string): string {
  switch (plan.family) {
    case 'grab_bar':
      return `${plan.baseName} ${member}`;
    case 'partition_set':
      return `${plan.baseName} - ${member}`;
    case 'accessory_kit':
    default:
      return member;
  }
}

/**
 * Apply bundle expansion to every line in `lines`. Lines that are not bundles are returned unchanged.
 * Order is preserved; a parent line produces N children in place at its position.
 */
export function expandBundleLines<T extends ExpandableLineLike>(lines: T[]): T[] {
  const output: T[] = [];
  for (const line of lines) {
    const plan = detectBundleExpansion(line.description || (line.itemName ?? ''));
    if (!plan) {
      output.push(line);
      continue;
    }
    const expanded = expandBundleLine(line, plan);
    for (const { child } of expanded) {
      output.push(child);
    }
  }
  return output;
}
