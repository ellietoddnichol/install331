import type { IntakeProjectMetadata } from '../../shared/types/intake.ts';
import {
  looksLikeIntakeContactOrNonScopeLine,
  looksLikeIntakePricingSummaryOrDisclaimerLine,
  looksLikeIntakeSectionHeaderOrTitleLine,
} from '../../shared/utils/intakeTextGuards.ts';
import { matchesDiv10CommercialOrMetadataLine } from './bidReasoning/div10BidReasoningService.ts';
import { extractMetadataFromCells, hasProjectMetadataValue, intakeAsText, normalizeComparableText } from './metadataExtractorService.ts';

export type ParsedChunkType =
  | 'project_metadata'
  | 'header_row'
  | 'section_header'
  | 'actual_scope_line'
  | 'bundle_item'
  | 'pricing_notice'
  | 'adder_option'
  | 'logistics_note'
  | 'ignore';

export interface ParsedChunkClassification {
  kind: ParsedChunkType;
  metadata: Partial<IntakeProjectMetadata>;
}

/** Rolling parse-time state carried from a section header down onto each child scope line. */
export interface SectionContext {
  manufacturer: string;
  category: string;
  bidBucket: string;
  sectionHeader: string;
}

export const EMPTY_SECTION_CONTEXT: SectionContext = {
  manufacturer: '',
  category: '',
  bidBucket: '',
  sectionHeader: '',
};

const BID_BUCKET_PATTERNS: Array<{ pattern: RegExp; label: (m: RegExpExecArray) => string }> = [
  { pattern: /\bbase\s*bid\b/i, label: () => 'Base Bid' },
  { pattern: /\balt(?:ernate)?\.?\s*(\d+)\b/i, label: (m) => `Alt ${m[1]}` },
  { pattern: /\ballowance\b/i, label: () => 'Allowance' },
  { pattern: /\bdeduct(ion|)?\s*alt(?:ernate)?\.?\s*(\d+)?\b/i, label: (m) => `Deduct Alt ${m[2] ?? ''}`.trim() },
  { pattern: /\bvoluntary\s*alt(?:ernate)?\.?\s*(\d+)?\b/i, label: (m) => `Voluntary Alt ${m[1] ?? ''}`.trim() },
  { pattern: /\bunit\s*price(s)?\b/i, label: () => 'Unit Prices' },
  { pattern: /\bexcluded\b/i, label: () => 'Excluded' },
  { pattern: /\ballowances?\b/i, label: () => 'Allowance' },
];

/** Known Division 10-ish manufacturers that commonly appear as section prefixes. */
const KNOWN_MANUFACTURER_TOKENS = new Set([
  'scranton',
  'scranton products',
  'bradley',
  'asi',
  'asi group',
  'bobrick',
  'koala',
  'bradley corporation',
  'general partitions',
  'gp',
  'hadrian',
  'global partitions',
  'metpar',
  'accurate partitions',
  'sunroc',
  'sloan',
  'gamco',
  'mcgard',
  'american specialties',
  'baltimore partitions',
  'salsbury',
  'hollman',
  'lyon',
  'penco',
  'republic',
  'list industries',
]);

function titleCaseToken(token: string): string {
  return token
    .split(/\s+/)
    .map((part) => (part.length === 0 ? part : part[0].toUpperCase() + part.slice(1).toLowerCase()))
    .join(' ');
}

function matchBidBucket(text: string): string {
  for (const { pattern, label } of BID_BUCKET_PATTERNS) {
    const match = pattern.exec(text);
    if (match) return label(match);
  }
  return '';
}

/**
 * Parse a section header line like "Scranton - Toilet Partitions - Base Bid" or
 * "Bradley Toilet Accessories / Alt 1 Bid" into normalized fields.
 * Returns null when the text cannot be interpreted as a section header.
 */
export function parseSectionHeaderText(text: string): SectionContext | null {
  const compact = intakeAsText(text);
  if (!compact) return null;
  if (!looksLikeSectionHeader(compact)) {
    // Also accept longer multi-part headers like "Brand - Category - Bucket" even if they fail the narrow guard.
    if (!/[\-–—|/·•]/.test(compact)) return null;
    if (compact.length > 160) return null;
    if (/\d{3,}/.test(compact)) return null;
  }
  const parts = compact.split(/\s*[\-–—|/·•]\s*|\s+\-\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  let manufacturer = '';
  let category = '';
  let bidBucket = '';

  for (const part of parts) {
    const lower = part.toLowerCase();
    if (!manufacturer && KNOWN_MANUFACTURER_TOKENS.has(lower)) {
      manufacturer = titleCaseToken(part);
      continue;
    }
    if (!bidBucket) {
      const bucket = matchBidBucket(part);
      if (bucket) {
        bidBucket = bucket;
        continue;
      }
    }
    if (!category) {
      const inferred = inferCategoryFromText(part);
      if (inferred) {
        category = inferred;
        continue;
      }
    }
  }

  // If no known manufacturer matched but first token is Title Case and not a category/bucket, treat as manufacturer.
  if (!manufacturer && parts.length >= 2) {
    const first = parts[0];
    const firstLower = first.toLowerCase();
    const firstIsCategory = Boolean(inferCategoryFromText(first));
    const firstIsBucket = Boolean(matchBidBucket(first));
    if (!firstIsCategory && !firstIsBucket && /^[A-Z]/.test(first) && first.length <= 32 && !/\d/.test(first)) {
      manufacturer = titleCaseToken(first);
    }
    if (!category) {
      for (const part of parts.slice(1)) {
        const inferred = inferCategoryFromText(part);
        if (inferred) {
          category = inferred;
          break;
        }
      }
    }
  }

  if (!manufacturer && !category && !bidBucket) return null;

  return {
    manufacturer,
    category,
    bidBucket,
    sectionHeader: compact,
  };
}

export interface RowClassifierLineLike {
  roomName: string;
  category: string;
  itemCode: string;
  itemName: string;
  description: string;
  notes: string;
  unit: string;
}

export function inferCategoryFromText(text: string): string {
  const normalized = normalizeComparableText(text);
  if (!normalized) return '';
  if (/(grab bar|toilet accessory|paper towel|soap dispenser|mirror|napkin|dispenser|sanitary|baby change|shower seat|coat hook|robe hook)/.test(normalized)) {
    return 'Toilet Accessories';
  }
  if (/(partition|urinal screen|privacy panel|toilet compartment)/.test(normalized)) return 'Toilet Partitions';
  if (/(locker|bench|z locker|team locker)/.test(normalized)) return 'Lockers';
  if (/(fire extinguisher|extinguisher cabinet|fire hose|cabinet.*extinguisher)/.test(normalized)) return 'Fire Protection Specialties';
  if (/(sign|plaque|marker|wayfinding|room id|ada sign|exit sign|directory)/.test(normalized)) return 'Signage';
  if (/(access panel|access door)/.test(normalized)) return 'Access Doors';
  if (/(whiteboard|map rail|marker board|tackboard|visual display|bulletin board)/.test(normalized)) return 'Visual Display Boards';
  if (/(corner guard|wall protection|crash rail|chair rail)/.test(normalized)) return 'Wall Protection';
  if (/(mop|broom|utility shelf|custodial|janitor)/.test(normalized)) return 'Custodial';
  if (/(shelving|wire deck|storage rack|pallet rack|cantilever rack)/.test(normalized)) return 'Shelving';
  if (/(hollow metal|hm door|metal frame|borrowed lite|steel door)/.test(normalized)) return 'Doors & Frames';
  if (/(overhead door|rolling door|coiling door|garage door)/.test(normalized)) return 'Overhead Doors';
  if (/(storefront|curtain wall|glazing|glass|window|skylight)/.test(normalized)) return 'Glazing';
  if (/(acoustic|ceiling tile|grid ceiling|suspension system|lay.in)/.test(normalized)) return 'Ceilings';
  if (/(resilient flooring|vinyl tile|carpet|ceramic tile|stone flooring|epoxy floor)/.test(normalized)) return 'Flooring';
  if (/(handrail|guardrail|stair rail|pipe rail)/.test(normalized)) return 'Rails';
  return '';
}

export function normalizeExtractedCategory(candidate: string, context: string): string {
  const inferred = inferCategoryFromText(context);
  const normalizedCandidate = normalizeComparableText(candidate);
  if (!normalizedCandidate) return inferred;
  if (/^(specialt(?:y|ies)|general|general scope|misc|miscellaneous|other)$/.test(normalizedCandidate)) {
    return inferred || candidate;
  }
  return candidate;
}

export function looksLikeHeaderChunk(cells: string[]): boolean {
  const normalizedCells = cells.map((cell) => normalizeComparableText(cell)).filter(Boolean);
  if (!normalizedCells.length) return false;

  const joined = normalizedCells.join(' ');
  const headerHits = normalizedCells.reduce((count, cell) => count + Number(
    [
      'room', 'room area', 'area', 'scope category', 'category', 'item', 'item name', 'description', 'quantity', 'qty', 'unit', 'uom', 'notes', 'labor included', 'material included', 'item code', 'sku'
    ].some((alias) => cell === alias || cell.includes(alias))
  ), 0);

  return headerHits >= 3 || /(room|area).*(category|scope).*(item).*(description).*(qty|quantity).*(unit|uom)/.test(joined);
}

export function looksLikeProjectMetadataChunk(text: string, lineIndex: number, knownMetadata?: Partial<IntakeProjectMetadata>): boolean {
  const normalized = normalizeComparableText(text);
  if (!normalized) return false;
  if (/\b(project|job|client|owner|gc|general contractor|address|location|site|bid date|proposal date|due date|estimator|prepared by|package)\b/.test(normalized)) return true;
  if (/\b(project|job|package)\b.*\b(bid date|proposal date|client|gc|address|estimator)\b/.test(normalized)) return true;

  const metadataValues = [
    knownMetadata?.projectName,
    knownMetadata?.projectNumber,
    knownMetadata?.bidPackage,
    knownMetadata?.client,
    knownMetadata?.generalContractor,
    knownMetadata?.address,
    knownMetadata?.bidDate,
    knownMetadata?.proposalDate,
    knownMetadata?.estimator,
  ].map((value) => normalizeComparableText(value)).filter(Boolean);

  if (metadataValues.includes(normalized)) return true;
  if (lineIndex < 4 && !/\d/.test(normalized) && normalized.split(/\s+/).length >= 2 && normalized.length <= 96 && !inferCategoryFromText(text)) return true;
  return false;
}

export function looksLikeSectionHeader(text: string): boolean {
  const normalized = normalizeComparableText(text);
  if (!normalized) return false;
  if (/^(clarifications?|exclusions?|inclusions?|alternates?|terms(?: and conditions)?|notes?)$/.test(normalized)) return false;
  if (normalized.length > 64 || /\d/.test(normalized)) return false;
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length < 1 || words.length > 6) return false;
  if (/^(project|client|gc|general contractor|address|bid date|proposal date|estimator|room|area|item|description|quantity|unit)$/.test(normalized)) return false;
  return Boolean(inferCategoryFromText(text) || /^[A-Za-z][A-Za-z/&,\- ]+$/.test(text));
}

export function looksLikeIgnoreChunk(text: string): boolean {
  const normalized = normalizeComparableText(text);
  if (!normalized) return true;
  if (/^(clarifications?|exclusions?|inclusions?|alternates?|terms(?: and conditions)?|proposal|scope of work|invitation to bid)$/.test(normalized)) return true;
  if (/^(we propose to|the following|furnish and install|base bid|bid package)\b/.test(normalized)) return true;
  if (normalized.length > 180 && !/^\d/.test(normalized)) return true;
  return false;
}

/** Detect a pricing notice / subtotal / "labor by quote" line that should not be priced as a takeoff row. */
export function looksLikePricingNotice(text: string): boolean {
  const normalized = normalizeComparableText(text);
  if (!normalized) return false;
  if (/\b(material total|sub ?total|grand total|total material|total labor|total (of )?material)\b/.test(normalized)) return true;
  if (/\b(if labor (is )?needed|labor (is )?by (quote|others)|quote(d)? separately|call for (a )?quote)\b/.test(normalized)) return true;
  if (/\b(material only|labor only|material and labor|includes material only)\b/.test(normalized)) return true;
  return false;
}

/** Detect an optional adder / toggle line ("Add for sales tax", "Bond: Y/N", "Performance bond if required"). */
export function looksLikeAdderOption(text: string): boolean {
  const normalized = normalizeComparableText(text);
  if (!normalized) return false;
  if (/^(add (for|to)|adder for|optional adder|add on|bond|performance bond|bid bond|surety)\b/.test(normalized)) return true;
  if (/\b(y\s*\/\s*n|yes\s*\/\s*no|if required|if requested)\b/.test(normalized) && normalized.length <= 120) return true;
  if (/^add(s)? (for|to) (sales )?tax\b/.test(normalized)) return true;
  return false;
}

/** Detect a logistics / project-condition note ("Customer to receive and unload", "Ship to jobsite"). */
export function looksLikeLogisticsNote(text: string): boolean {
  const normalized = normalizeComparableText(text);
  if (!normalized) return false;
  if (/\b(customer to (receive|unload|store|sign)|receive and unload|ship (to )?(jobsite|site)|freight (on|included|separate)|delivery (included|separate|not included))\b/.test(normalized)) return true;
  if (/\b(install by (others|gc)|by (general contractor|others)|not our scope)\b/.test(normalized)) return true;
  return false;
}

/** Detect a bundled-item description ("Grab bar set: 18 in, 36 in"). */
export function looksLikeBundleItemLine(text: string): boolean {
  const normalized = normalizeComparableText(text);
  if (!normalized) return false;
  if (!/\bset\b/.test(normalized) && !/\bbundle\b/.test(normalized) && !/\bkit\b/.test(normalized)) return false;
  if (/\b\d+\s*(in|")\b.*,\s*\d+\s*(in|")\b/.test(normalized)) return true;
  if (/\bset\s*:\s*\d/.test(normalized)) return true;
  if (/\bkit\s*of\s*\d/.test(normalized)) return true;
  return false;
}

export function classifyParsedChunk(cells: string[], lineIndex: number, knownMetadata?: Partial<IntakeProjectMetadata>): ParsedChunkClassification {
  const compactCells = cells.map((cell) => intakeAsText(cell)).filter(Boolean);
  const text = compactCells.join(' ');
  const metadata = extractMetadataFromCells(compactCells);

  if (!text) return { kind: 'ignore', metadata };
  if (matchesDiv10CommercialOrMetadataLine(text)) return { kind: 'ignore', metadata };
  if (looksLikeIntakePricingSummaryOrDisclaimerLine(text)) return { kind: 'pricing_notice', metadata };
  if (looksLikeHeaderChunk(compactCells)) return { kind: 'header_row', metadata };
  if (hasProjectMetadataValue(metadata) || looksLikeProjectMetadataChunk(text, lineIndex, knownMetadata)) return { kind: 'project_metadata', metadata };
  if (looksLikePricingNotice(text)) return { kind: 'pricing_notice', metadata };
  if (looksLikeAdderOption(text)) return { kind: 'adder_option', metadata };
  if (looksLikeLogisticsNote(text)) return { kind: 'logistics_note', metadata };
  if (looksLikeBundleItemLine(text)) return { kind: 'bundle_item', metadata };
  if (looksLikeIgnoreChunk(text)) return { kind: 'ignore', metadata };
  if (compactCells.length === 1 && looksLikeSectionHeader(text)) return { kind: 'section_header', metadata };

  const quantityHint = /^\d+(?:\.\d+)?\s*[xX-]?\s+/.test(text);
  const structuredHint = compactCells.length >= 2;
  const scopeHint = Boolean(inferCategoryFromText(text)) || /\b(grab bar|mirror|dispenser|partition|cabinet|sign|locker|bench|panel|board|marker|whiteboard|tackboard|fire extinguisher|corner guard|shelf)\b/i.test(text);

  return {
    kind: quantityHint || structuredHint || scopeHint ? 'actual_scope_line' : 'ignore',
    metadata,
  };
}

export function shouldKeepNormalizedLine(line: RowClassifierLineLike, lineIndex: number, knownMetadata?: Partial<IntakeProjectMetadata>): boolean {
  const identity = intakeAsText(line.description || line.itemName);
  if (!identity) return false;
  if (looksLikeIntakeContactOrNonScopeLine(identity)) return false;
  if (matchesDiv10CommercialOrMetadataLine(identity)) return false;
  if (looksLikeIntakeSectionHeaderOrTitleLine(identity)) return false;

  const classification = classifyParsedChunk([
    line.roomName,
    line.category,
    line.itemCode,
    line.itemName,
    line.description,
    line.notes,
  ], lineIndex, knownMetadata);

  // Bundle items are real installable scope; they're only flagged so we can pre-expand them before matching.
  if (classification.kind !== 'actual_scope_line' && classification.kind !== 'bundle_item') return false;
  if (looksLikeHeaderChunk([line.itemName, line.description, line.category, line.unit, line.notes])) return false;
  if (looksLikeProjectMetadataChunk(identity, lineIndex, knownMetadata)) return false;
  if (looksLikeIntakePricingSummaryOrDisclaimerLine(identity)) return false;
  return true;
}