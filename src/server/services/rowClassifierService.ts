import type { IntakeProjectMetadata } from '../../shared/types/intake.ts';
import { extractMetadataFromCells, hasProjectMetadataValue, intakeAsText, normalizeComparableText } from './metadataExtractorService.ts';

export type ParsedChunkType = 'project_metadata' | 'header_row' | 'section_header' | 'actual_scope_line' | 'ignore';

export interface ParsedChunkClassification {
  kind: ParsedChunkType;
  metadata: Partial<IntakeProjectMetadata>;
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
  if (/(grab bar|toilet accessory|paper towel|soap dispenser|mirror|napkin|dispenser|sanitary)/.test(normalized)) return 'Toilet Accessories';
  if (/(partition|urinal screen|privacy panel)/.test(normalized)) return 'Toilet Partitions';
  if (/(locker|bench)/.test(normalized)) return 'Lockers';
  if (/(fire extinguisher|cabinet)/.test(normalized)) return 'Fire Protection Specialties';
  if (/(sign|plaque|marker|wayfinding)/.test(normalized)) return 'Signage';
  if (/(access panel|access door)/.test(normalized)) return 'Access Doors';
  if (/(whiteboard|map rail|marker board|tackboard|visual display)/.test(normalized)) return 'Visual Display Boards';
  if (/(corner guard|wall protection)/.test(normalized)) return 'Wall Protection';
  if (/(mop|broom|utility shelf|custodial)/.test(normalized)) return 'Custodial';
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

export function classifyParsedChunk(cells: string[], lineIndex: number, knownMetadata?: Partial<IntakeProjectMetadata>): ParsedChunkClassification {
  const compactCells = cells.map((cell) => intakeAsText(cell)).filter(Boolean);
  const text = compactCells.join(' ');
  const metadata = extractMetadataFromCells(compactCells);

  if (!text) return { kind: 'ignore', metadata };
  if (looksLikeHeaderChunk(compactCells)) return { kind: 'header_row', metadata };
  if (hasProjectMetadataValue(metadata) || looksLikeProjectMetadataChunk(text, lineIndex, knownMetadata)) return { kind: 'project_metadata', metadata };
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
  const classification = classifyParsedChunk([
    line.roomName,
    line.category,
    line.itemCode,
    line.itemName,
    line.description,
    line.notes,
  ], lineIndex, knownMetadata);

  if (classification.kind !== 'actual_scope_line') return false;
  const identity = intakeAsText(line.description || line.itemName);
  if (!identity) return false;
  if (looksLikeHeaderChunk([line.itemName, line.description, line.category, line.unit, line.notes])) return false;
  if (looksLikeProjectMetadataChunk(identity, lineIndex, knownMetadata)) return false;
  return true;
}