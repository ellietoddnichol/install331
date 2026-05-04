/**
 * Heuristics for determining whether a parsed scope line represents physically installable scope,
 * even when no exact catalog SKU match has been found. Output is intentionally category-level
 * (not product-level) so downstream labor generation can fall back to an install-family default.
 *
 * Design principles:
 * - Pure function, no I/O.
 * - Section context (from "Brand - Category - Bucket" headers) takes priority when present.
 * - Textual detection is used as a fallback and also to distinguish install variants within a
 *   category (e.g. `grab_bar_18` vs `grab_bar_36`, `partition_compartment` vs `urinal_screen`).
 * - Returned install scope types are strings (not enums) so the install-labor-family registry can
 *   evolve without rippling through every call site. The canonical set is enumerated in
 *   KNOWN_INSTALL_SCOPE_TYPES for use by tests / UI badges.
 */

import { normalizeComparableText } from '../metadataExtractorService.ts';

export const KNOWN_INSTALL_SCOPE_TYPES = [
  'partition_compartment',
  'urinal_screen',
  'pilaster',
  'partition_hardware',
  'mirror',
  'grab_bar_18',
  'grab_bar_24',
  'grab_bar_30',
  'grab_bar_36',
  'grab_bar_42',
  'grab_bar',
  'sanitary_napkin_disposal',
  'soap_dispenser',
  'paper_towel_dispenser',
  'hand_dryer',
  'toilet_tissue_dispenser',
  'fire_extinguisher_cabinet',
  'locker',
  'bench',
  'access_door',
  'signage',
  'accessory_generic',
] as const;

export type InstallScopeType = (typeof KNOWN_INSTALL_SCOPE_TYPES)[number];

export interface InstallabilityInput {
  itemName?: string | null;
  description?: string | null;
  category?: string | null;
  sourceManufacturer?: string | null;
  sourceSectionHeader?: string | null;
  unit?: string | null;
}

export interface InstallabilityResult {
  isInstallableScope: boolean;
  installScopeType: InstallScopeType | null;
  /** Why this decision was reached, for UI transparency. */
  reason: string;
}

const NON_INSTALLABLE_KEYWORDS = [
  'material total',
  'subtotal',
  'sub total',
  'grand total',
  'sales tax',
  'freight',
  'shipping',
  'bond',
  'receive and unload',
  'by others',
  'labor by',
];

/** Match a scope type from a normalized text blob. Returns null when no confident match. */
function detectInstallScopeType(normalized: string): InstallScopeType | null {
  if (!normalized) return null;

  // Grab bars with size extraction
  if (/\bgrab\s*bar/.test(normalized)) {
    const sizeMatch = normalized.match(/\b(18|24|30|36|42)\s*(?:"|in|inch)?\b/);
    if (sizeMatch) {
      const candidate = `grab_bar_${sizeMatch[1]}` as InstallScopeType;
      if ((KNOWN_INSTALL_SCOPE_TYPES as readonly string[]).includes(candidate)) return candidate;
    }
    return 'grab_bar';
  }

  // Partitions / urinal screens / pilasters
  if (/\burinal\s*screen/.test(normalized)) return 'urinal_screen';
  if (/\bpilaster/.test(normalized)) return 'pilaster';
  if (/(toilet\s*partition|partition\s*compartment|compartments?\b.*(partition|hdpe|phenolic|stainless)|hdpe\s*toilet\s*partition|phenolic\s*partition)/.test(normalized)) {
    return 'partition_compartment';
  }
  if (/\bpartition\s*hardware\b/.test(normalized)) return 'partition_hardware';

  // Mirrors
  if (/\bmirror\b/.test(normalized)) return 'mirror';

  // Dispensers / disposals / other toilet accessories
  if (/(sanitary\s*napkin|napkin\s*disposal)/.test(normalized)) return 'sanitary_napkin_disposal';
  if (/(soap\s*dispenser|liquid\s*soap)/.test(normalized)) return 'soap_dispenser';
  if (/(paper\s*towel|towel\s*dispenser)/.test(normalized)) return 'paper_towel_dispenser';
  if (/(hand\s*dryer|xlerator|dyson\s*airblade)/.test(normalized)) return 'hand_dryer';
  if (/(toilet\s*tissue|tissue\s*dispenser|toilet\s*paper\s*dispenser)/.test(normalized)) return 'toilet_tissue_dispenser';

  // Fire protection specialties
  if (/fire\s*extinguisher\s*(cabinet|box)/.test(normalized)) return 'fire_extinguisher_cabinet';

  // Lockers / benches
  if (/\blocker\b/.test(normalized)) return 'locker';
  if (/\bbench\b/.test(normalized)) return 'bench';

  // Access doors / signage
  if (/(access\s*door|access\s*panel)/.test(normalized)) return 'access_door';
  if (/(sign|plaque|marker|wayfinding)/.test(normalized)) return 'signage';

  // Generic toilet accessory fallback - only if category strongly implies accessories.
  return null;
}

export function evaluateInstallability(input: InstallabilityInput): InstallabilityResult {
  const pieces = [input.itemName, input.description, input.category, input.sourceSectionHeader]
    .map((v) => (v ?? '').toString())
    .join(' | ');
  const normalized = normalizeComparableText(pieces);
  if (!normalized) {
    return { isInstallableScope: false, installScopeType: null, reason: 'empty_text' };
  }

  for (const bad of NON_INSTALLABLE_KEYWORDS) {
    if (normalized.includes(bad)) {
      return { isInstallableScope: false, installScopeType: null, reason: `non_installable_keyword:${bad}` };
    }
  }

  const detected = detectInstallScopeType(normalized);
  if (detected) {
    return { isInstallableScope: true, installScopeType: detected, reason: `matched:${detected}` };
  }

  // Category-only fallback: if the row sits under a known installable category header but the
  // text was not specific enough to pick a scope type, still mark it installable so labor
  // generation can use a category-level default.
  const categoryNormalized = normalizeComparableText([input.category, input.sourceSectionHeader].join(' '));
  if (/(toilet accessor|toilet partition|locker|fire protection|signage|access door)/.test(categoryNormalized)) {
    return {
      isInstallableScope: true,
      installScopeType: 'accessory_generic',
      reason: 'category_installable_fallback',
    };
  }

  return { isInstallableScope: false, installScopeType: null, reason: 'no_match' };
}
