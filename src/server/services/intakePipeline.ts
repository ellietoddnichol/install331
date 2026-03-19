import * as xlsx from 'xlsx';
import { randomUUID } from 'crypto';
import { parse as parseCsv } from 'csv-parse/sync';
import type { CatalogItem } from '../../types.ts';
import type {
  IntakeParseRequest,
  IntakeParseResult,
  IntakeProjectAssumption,
  IntakeProjectMetadata,
  IntakeReviewLine,
  IntakeRoomCandidate,
  IntakeSourceKind,
  IntakeSourceType,
} from '../../shared/types/intake.ts';
import { listActiveCatalogItems } from '../repos/catalogRepo.ts';
import { buildIntakeDiagnostics } from './intakeDiagnosticsService.ts';
import { buildProposalAssist, extractAssumptionsFromText, inferPricingBasis, mergeAssumptions } from './proposalAssistService.ts';
import { detectSpreadsheetHeaderRow, extractSpreadsheetPreludeText } from './spreadsheetInterpretationService.ts';
import { INTAKE_GEMINI_MODEL } from './structuredExtractionSchemas.ts';
import { classifyIntakeSourceType, deriveDocumentSourceKind } from './fileClassifierService.ts';
import { extractDocumentWithGemini, extractSpreadsheetWithGemini } from './geminiExtractionService.ts';
import { mergeResolvedMetadata as mergeResolvedMetadataFromService, extractMetadataFromText as extractMetadataFromTextFromService, normalizeDateValue as normalizeDateValueFromService } from './metadataExtractorService.ts';
import { buildRoomCandidates as buildRoomCandidatesFromService, toReviewLines as toReviewLinesFromService } from './matchPreparationService.ts';
import { prepareCatalogMatch } from './catalogMatchService.ts';
import { classifyParsedChunk as classifyParsedChunkFromService, normalizeExtractedCategory as normalizeExtractedCategoryFromService, shouldKeepNormalizedLine as shouldKeepNormalizedLineFromService } from './rowClassifierService.ts';
import { parseSpreadsheetInput, extractSpreadsheetStructuredMetadata, type NormalizedIntakeLine as NormalizedIntakeLineFromService } from './spreadsheetInterpreterService.ts';

interface NormalizedIntakeLine {
  roomName: string;
  category: string;
  itemCode: string;
  itemName: string;
  description: string;
  quantity: number;
  unit: string;
  notes: string;
  sourceReference: string;
  laborIncluded: boolean | null;
  materialIncluded: boolean | null;
  confidence: number;
  parserTag: string;
  warnings: string[];
  quantityWasDefaulted?: boolean;
  unitWasDefaulted?: boolean;
}

interface StructuredSpreadsheetResult {
  rows: NormalizedIntakeLine[];
  sourceKind: IntakeSourceKind;
  metadata: Partial<IntakeProjectMetadata>;
  flattenedText: string;
  preludeText: string;
}

const SPREADSHEET_GEMINI_TIMEOUT_MS = Number.parseInt(process.env.INTAKE_SPREADSHEET_GEMINI_TIMEOUT_MS || '12000', 10);

type ParsedChunkType = 'project_metadata' | 'header_row' | 'section_header' | 'actual_scope_line' | 'ignore';

interface ParsedChunkClassification {
  kind: ParsedChunkType;
  metadata: Partial<IntakeProjectMetadata>;
}

interface CatalogInferenceHint {
  category: string;
  itemName: string;
  description: string;
}

function asText(value: unknown): string {
  return String(value ?? '').trim();
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function hasProjectMetadataValue(metadata: Partial<IntakeProjectMetadata>): boolean {
  return Boolean(
    metadata.projectName ||
      metadata.projectNumber ||
      metadata.client ||
      metadata.generalContractor ||
      metadata.address ||
      metadata.bidDate ||
      metadata.proposalDate ||
      metadata.estimator
  );
}

function mergeMetadataHint(left: Partial<IntakeProjectMetadata>, right: Partial<IntakeProjectMetadata>): Partial<IntakeProjectMetadata> {
  return {
    projectName: left.projectName || right.projectName || '',
    projectNumber: left.projectNumber || right.projectNumber || '',
    client: left.client || right.client || '',
    generalContractor: left.generalContractor || right.generalContractor || '',
    address: left.address || right.address || '',
    bidDate: left.bidDate || right.bidDate || '',
    proposalDate: left.proposalDate || right.proposalDate || '',
    estimator: left.estimator || right.estimator || '',
    sourceFiles: Array.from(new Set([...(left.sourceFiles || []), ...(right.sourceFiles || [])].filter(Boolean))),
    assumptions: mergeAssumptions(left.assumptions || [], right.assumptions || []),
    pricingBasis: left.pricingBasis || right.pricingBasis || '',
  };
}

function normalizeComparableText(value: unknown): string {
  return asText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokenize(value: unknown): string[] {
  return Array.from(new Set(normalizeComparableText(value).split(/\s+/).filter((token) => token.length > 1)));
}

function overlap(left: string[], right: string[]): number {
  if (!left.length || !right.length) return 0;
  const rightSet = new Set(right);
  const shared = left.reduce((count, token) => count + (rightSet.has(token) ? 1 : 0), 0);
  return shared ? shared / Math.max(left.length, right.length) : 0;
}

function looksLikeDate(value: unknown): boolean {
  const text = asText(value);
  if (!text) return false;
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(text)) return true;
  return !Number.isNaN(Date.parse(text));
}

function normalizeDate(value: unknown): string {
  const text = asText(value);
  if (!looksLikeDate(text)) return '';
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function parsePositiveNumber(value: unknown, fallback = 1): number {
  const parsed = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parsePositiveNumberWithDefault(value: unknown, fallback = 1): { value: number; defaulted: boolean } {
  const raw = String(value ?? '').replace(/,/g, '').trim();
  const parsed = Number(raw);
  if (Number.isFinite(parsed) && parsed > 0) {
    return { value: parsed, defaulted: false };
  }
  return { value: fallback, defaulted: true };
}

function parseFlag(value: unknown): boolean | null {
  const normalized = asText(value).toLowerCase();
  if (!normalized) return null;
  if (['yes', 'y', 'true', '1', 'included', 'inc'].includes(normalized)) return true;
  if (['no', 'n', 'false', '0', 'excluded', 'excl'].includes(normalized)) return false;
  return null;
}

function normalizeRoomName(value: unknown): string {
  return asText(value) || 'General';
}

function mostCommon(values: string[]): string {
  const counts = new Map<string, number>();
  values.filter(Boolean).forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));

  let winner = '';
  let count = 0;
  counts.forEach((currentCount, value) => {
    if (currentCount > count) {
      winner = value;
      count = currentCount;
    }
  });
  return winner;
}

function normalizeHeader(value: unknown): string {
  return asText(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function extractMetadataFromCells(cells: string[]): Partial<IntakeProjectMetadata> {
  let output: Partial<IntakeProjectMetadata> = {
    sourceFiles: [],
    assumptions: [],
    pricingBasis: '',
  };
  const compactCells = cells.map((cell) => asText(cell)).filter(Boolean);
  const assignValue = (label: string, value: string) => {
    if (!value) return;
    if (/^(project|project name|job|job name)$/.test(label)) output.projectName = output.projectName || value;
    else if (/^(project number|project no|job number|bid package|package|pkg)$/.test(label)) output.projectNumber = output.projectNumber || value;
    else if (/^(client|owner)$/.test(label)) output.client = output.client || value;
    else if (/^(gc|general contractor)$/.test(label)) output.generalContractor = output.generalContractor || value;
    else if (/^(client gc|client general contractor|client contractor|client owner gc)$/.test(label)) {
      output.client = output.client || value;
      output.generalContractor = output.generalContractor || value;
    } else if (/^(address|site address|site|location)$/.test(label)) output.address = output.address || value;
    else if (/^(bid date|due date|date)$/.test(label)) output.bidDate = output.bidDate || normalizeDate(value);
    else if (/^(proposal date)$/.test(label)) output.proposalDate = output.proposalDate || normalizeDate(value);
    else if (/^(estimator|prepared by)$/.test(label)) output.estimator = output.estimator || value;
  };

  for (let index = 0; index < compactCells.length; index += 1) {
    const label = normalizeHeader(compactCells[index]);
    const nextValue = asText(compactCells[index + 1]);
    if (label && nextValue) assignValue(label, nextValue);

    const colonMatch = compactCells[index].match(/^(project(?:\s+name)?|job(?:\s+name)?|project\s*(?:#|number)?|job\s*(?:#|number)?|bid\s*(?:package|pkg)?|client|owner|gc|general contractor|address|site address|location|site|bid date|proposal date|due date|date|estimator|prepared by)\s*[:\-]\s*(.+)$/i);
    if (!colonMatch) continue;
    assignValue(normalizeHeader(colonMatch[1]), asText(colonMatch[2]));
  }

  const lineText = compactCells.join(' ');
  if (!hasProjectMetadataValue(output)) {
    output = mergeMetadataHint(output, {
      projectName: detectLabeledValue([lineText], [/^project(?:\s+name)?\s*[:\-]?/i, /^job(?:\s+name)?\s*[:\-]?/i]),
      projectNumber: detectLabeledValue([lineText], [/^project\s*(?:#|number)\s*[:\-]?/i, /^job\s*(?:#|number)\s*[:\-]?/i, /^bid\s*(?:package|pkg)\s*[:\-]?/i]),
      client: detectLabeledValue([lineText], [/^client\s*[:\-]?/i, /^owner\s*[:\-]?/i]),
      generalContractor: detectLabeledValue([lineText], [/^gc\s*[:\-]?/i, /^general contractor\s*[:\-]?/i]),
      address: detectAddress([lineText]),
      bidDate: normalizeDate(detectLabeledValue([lineText], [/^bid\s*date\s*[:\-]?/i, /^due\s*date\s*[:\-]?/i, /^date\s*[:\-]?/i])),
      proposalDate: normalizeDate(detectLabeledValue([lineText], [/^proposal\s*date\s*[:\-]?/i])),
      estimator: detectLabeledValue([lineText], [/^estimator\s*[:\-]?/i, /^prepared by\s*[:\-]?/i]),
      sourceFiles: [],
      assumptions: extractAssumptionsFromText(lineText),
      pricingBasis: inferPricingBasis(lineText, []),
    });
  }

  return output;
}

function looksLikeHeaderChunk(cells: string[]): boolean {
  const normalizedCells = cells.map((cell) => normalizeHeader(cell)).filter(Boolean);
  if (!normalizedCells.length) return false;

  const joined = normalizedCells.join(' ');
  const headerHits = normalizedCells.reduce((count, cell) => count + Number(
    [
      'room', 'room area', 'area', 'scope category', 'category', 'item', 'item name', 'description', 'quantity', 'qty', 'unit', 'uom', 'labor included', 'material included', 'notes', 'item code', 'sku'
    ].some((alias) => cell === alias || cell.includes(alias))
  ), 0);

  return headerHits >= 3 || /(room|area).*(category|scope).*(item).*(description).*(qty|quantity).*(unit|uom)/.test(joined);
}

function looksLikeProjectMetadataChunk(text: string, lineIndex: number, knownMetadata?: Partial<IntakeProjectMetadata>): boolean {
  const normalized = normalizeComparableText(text);
  if (!normalized) return false;
  if (/\b(project|job|client|owner|gc|general contractor|address|location|site|bid date|proposal date|due date|estimator|prepared by)\b/.test(normalized)) return true;
  if (/\b(project|job)\b.*\b(bid date|proposal date|client|gc|address|estimator)\b/.test(normalized)) return true;

  const metadataValues = [
    knownMetadata?.projectName,
    knownMetadata?.projectNumber,
    knownMetadata?.client,
    knownMetadata?.generalContractor,
    knownMetadata?.address,
    knownMetadata?.bidDate,
    knownMetadata?.proposalDate,
    knownMetadata?.estimator,
  ].map((value) => normalizeComparableText(value)).filter(Boolean);

  if (metadataValues.includes(normalized)) return true;
  if (lineIndex < 4 && !/\d/.test(normalized) && normalized.split(/\s+/).length >= 2 && normalized.length <= 96 && !inferCategory(text)) return true;
  return false;
}

function looksLikeSectionHeader(text: string): boolean {
  const normalized = normalizeComparableText(text);
  if (!normalized) return false;
  if (/^(clarifications?|exclusions?|inclusions?|alternates?|terms(?: and conditions)?|notes?)$/.test(normalized)) return false;
  if (normalized.length > 64 || /\d/.test(normalized)) return false;
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length < 1 || words.length > 6) return false;
  if (/^(project|client|gc|general contractor|address|bid date|proposal date|estimator|room|area|item|description|quantity|unit)$/.test(normalized)) return false;
  return Boolean(inferCategory(text) || /^[A-Za-z][A-Za-z/&,\- ]+$/.test(text));
}

function looksLikeIgnoreChunk(text: string): boolean {
  const normalized = normalizeComparableText(text);
  if (!normalized) return true;
  if (/^(clarifications?|exclusions?|inclusions?|alternates?|terms(?: and conditions)?|proposal|scope of work|invitation to bid)$/.test(normalized)) return true;
  if (/^(we propose to|the following|furnish and install|base bid|bid package)\b/.test(normalized)) return true;
  if (normalized.length > 180 && !/^\d/.test(normalized)) return true;
  return false;
}

function classifyParsedChunk(cells: string[], lineIndex: number, knownMetadata?: Partial<IntakeProjectMetadata>): ParsedChunkClassification {
  const compactCells = cells.map((cell) => asText(cell)).filter(Boolean);
  const text = compactCells.join(' ');
  const metadata = extractMetadataFromCells(compactCells);

  if (!text) return { kind: 'ignore', metadata };
  if (looksLikeHeaderChunk(compactCells)) return { kind: 'header_row', metadata };
  if (hasProjectMetadataValue(metadata) || looksLikeProjectMetadataChunk(text, lineIndex, knownMetadata)) return { kind: 'project_metadata', metadata };
  if (looksLikeIgnoreChunk(text)) return { kind: 'ignore', metadata };
  if (compactCells.length === 1 && looksLikeSectionHeader(text)) return { kind: 'section_header', metadata };

  const quantityHint = /^\d+(?:\.\d+)?\s*[xX-]?\s+/.test(text);
  const structuredHint = compactCells.length >= 2;
  const scopeHint = Boolean(inferCategory(text)) || /\b(grab bar|mirror|dispenser|partition|cabinet|sign|locker|bench|panel|board|marker|whiteboard|tackboard|fire extinguisher)\b/i.test(text);
  return {
    kind: quantityHint || structuredHint || scopeHint ? 'actual_scope_line' : 'ignore',
    metadata,
  };
}

function shouldKeepNormalizedLine(line: NormalizedIntakeLine, lineIndex: number, knownMetadata?: Partial<IntakeProjectMetadata>): boolean {
  const classification = classifyParsedChunk([
    line.roomName,
    line.category,
    line.itemCode,
    line.itemName,
    line.description,
    line.notes,
  ], lineIndex, knownMetadata);

  if (classification.kind !== 'actual_scope_line') return false;
  const identity = asText(line.description || line.itemName);
  if (!identity) return false;
  if (looksLikeHeaderChunk([line.itemName, line.description, line.category, line.unit, line.notes])) return false;
  if (looksLikeProjectMetadataChunk(identity, lineIndex, knownMetadata)) return false;
  return true;
}

function findColumn(headers: string[], aliases: string[]): number | null {
  for (let index = 0; index < headers.length; index += 1) {
    const header = headers[index];
    if (!header) continue;
    if (aliases.some((alias) => header === alias || header.includes(alias))) {
      return index;
    }
  }
  return null;
}

function inferCategory(text: string): string {
  const normalized = normalizeComparableText(text);
  if (!normalized) return '';
  if (/(grab bar|toilet accessory|paper towel|soap dispenser|mirror|napkin|dispenser|sanitary)/.test(normalized)) return 'Toilet Accessories';
  if (/(partition|urinal screen|privacy panel)/.test(normalized)) return 'Toilet Partitions';
  if (/(locker|bench)/.test(normalized)) return 'Lockers';
  if (/(fire extinguisher|cabinet)/.test(normalized)) return 'Fire Protection Specialties';
  if (/(sign|plaque|marker|wayfinding)/.test(normalized)) return 'Signage';
  if (/(access panel|access door)/.test(normalized)) return 'Access Doors';
  return '';
}

function normalizeCompactCode(value: unknown): string {
  return String(value ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .trim();
}

function codeFamily(value: unknown): string {
  const normalized = String(value ?? '').toUpperCase().trim();
  const match = normalized.match(/^[A-Z]{1,6}/);
  return match ? match[0] : '';
}

function inferFromCatalogByCode(catalog: CatalogItem[], itemCode: string): CatalogInferenceHint | null {
  const compactCode = normalizeCompactCode(itemCode);
  const family = codeFamily(itemCode);
  if (!compactCode && !family) return null;

  const exact = compactCode
    ? catalog.find((item) => normalizeCompactCode(item.sku) === compactCode)
    : null;

  if (exact) {
    return {
      category: exact.category || '',
      itemName: exact.description || exact.sku || '',
      description: exact.description || exact.sku || '',
    };
  }

  const familyMatches = family
    ? catalog.filter((item) => codeFamily(item.sku) === family)
    : [];

  if (!familyMatches.length) return null;

  const first = familyMatches[0];
  return {
    category: first.category || '',
    itemName: first.description || first.sku || '',
    description: first.description || first.sku || '',
  };
}

function normalizeExtractedCategory(candidate: string, context: string): string {
  const inferred = inferCategory(context);
  const normalizedCandidate = normalizeComparableText(candidate);
  if (!normalizedCandidate) return inferred;
  if (/^(specialt(?:y|ies)|general|general scope|misc|miscellaneous|other)$/.test(normalizedCandidate)) {
    return inferred || candidate;
  }
  return candidate;
}

function expandMatrixHeaderItem(header: string): { itemCode: string; itemName: string; description: string; category: string } {
  const itemCode = asText(header);
  const normalizedCode = itemCode.toUpperCase();

  const patterns: Array<{ pattern: RegExp; build: (match: RegExpMatchArray) => string }> = [
    { pattern: /^GB[- ]?(\d{2})$/, build: (match) => `Grab Bar ${match[1]}\" Stainless Steel` },
    { pattern: /^PTD[- ]?\w*$/, build: () => 'Paper Towel Dispenser, Surface Mounted' },
    { pattern: /^SD[- ]?\w*$/, build: () => 'Soap Dispenser' },
    { pattern: /^ND[- ]?\w*$/, build: () => 'Sanitary Napkin Disposal' },
    { pattern: /^M[- ]?(\d{2,4})$/, build: (match) => `Mirror ${match[1]}` },
    { pattern: /^TP[- ]?\w*$/, build: () => 'Toilet Partition' },
    { pattern: /^US[- ]?\w*$/, build: () => 'Urinal Screen' },
    { pattern: /^AP[- ]?\w*$/, build: () => 'Access Panel' },
    { pattern: /^FEC[- ]?\w*$/, build: () => 'Fire Extinguisher Cabinet' },
    { pattern: /^FE[- ]?\w*$/, build: () => 'Fire Extinguisher' },
  ];

  for (const { pattern, build } of patterns) {
    const match = normalizedCode.match(pattern);
    if (!match) continue;
    const itemName = build(match);
    return {
      itemCode,
      itemName,
      description: itemName,
      category: inferCategory(itemName),
    };
  }

  return {
    itemCode,
    itemName: itemCode,
    description: itemCode,
    category: inferCategory(itemCode),
  };
}

function looksLikeItemCode(value: string): boolean {
  const raw = asText(value);
  const text = raw.toUpperCase();
  if (!text) return false;
  if (text.length > 24) return false;
  if (!/^[A-Z0-9][A-Z0-9\-./ ]+$/.test(text)) return false;
  if (/[a-z]{3,}/.test(raw)) return false;

  const tokens = raw.split(/\s+/).filter(Boolean);
  if (tokens.length > 3) return false;

  return /\d/.test(text) || /[-/]/.test(text) || /^[A-Z]{2,6}$/.test(text);
}

function parseQtyAndText(line: string): { qty: number; text: string } {
  const matched = line.match(/^([0-9]+(?:\.[0-9]+)?)\s*[xX-]?\s+(.*)$/);
  if (!matched) return { qty: 1, text: line.trim() };
  return { qty: parsePositiveNumber(matched[1], 1), text: asText(matched[2]) };
}

function extractTextFromPdfBuffer(buffer: Buffer): string {
  const latin = new TextDecoder('latin1').decode(buffer);
  const matches = latin.match(/\(([^\)]{2,})\)/g) || [];
  const extracted = matches
    .map((token) => token.slice(1, -1))
    .map((token) => token.replace(/\\[rn]/g, ' '))
    .join('\n');
  return extracted || latin;
}

function decodeDocumentText(dataBase64: string, fileName: string, mimeType: string): string {
  const buffer = Buffer.from(dataBase64, 'base64');
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith('.pdf') || mimeType.toLowerCase().includes('pdf')) {
    return extractTextFromPdfBuffer(buffer);
  }

  return new TextDecoder('utf-8', { fatal: false }).decode(buffer);
}

function classifySource(fileName: string, mimeType: string, explicit?: IntakeSourceType): IntakeSourceType {
  if (explicit) return explicit;
  const lowerName = fileName.toLowerCase();
  const lowerMime = mimeType.toLowerCase();
  if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls') || lowerName.endsWith('.csv') || lowerMime.includes('spreadsheet') || lowerMime.includes('excel') || lowerMime.includes('csv')) {
    return 'spreadsheet';
  }
  if (lowerName.endsWith('.pdf') || lowerMime.includes('pdf')) return 'pdf';
  return 'document';
}

function shouldSkipSpreadsheetSheet(sheetName: string): boolean {
  const normalized = normalizeComparableText(sheetName);
  if (!normalized) return false;
  return /^(readme|instructions|instruction|notes|legend|cover|summary|how to use|help)$/.test(normalized);
}

function detectSpreadsheetColumns(headers: string[]) {
  return {
    project: findColumn(headers, ['project', 'project name', 'job']),
    projectNumber: findColumn(headers, ['project number', 'job number', 'bid package', 'package', 'pkg']),
    client: findColumn(headers, ['client', 'gc', 'general contractor', 'owner']),
    address: findColumn(headers, ['address', 'site address', 'location', 'site']),
    bidDate: findColumn(headers, ['bid date', 'proposal date', 'due date', 'date']),
    category: findColumn(headers, ['scope category', 'category', 'scope']),
    itemCode: findColumn(headers, ['item code', 'sku', 'code', 'search key']),
    item: findColumn(headers, ['item', 'item name', 'scope item']),
    description: findColumn(headers, ['description', 'desc', 'work description']),
    qty: findColumn(headers, ['quantity', 'qty']),
    unit: findColumn(headers, ['unit', 'uom']),
    laborIncluded: findColumn(headers, ['labor included', 'labor']),
    materialIncluded: findColumn(headers, ['material included', 'material']),
    notes: findColumn(headers, ['notes', 'remarks', 'comment']),
    room: findColumn(headers, ['room', 'area', 'location', 'zone']),
  };
}

function inferSpreadsheetKind(rows: string[][], mapping: ReturnType<typeof detectSpreadsheetColumns>): IntakeSourceKind {
  const sample = rows.slice(1, 26);
  const numericColumns = new Map<number, number>();

  sample.forEach((row) => {
    row.forEach((cell, index) => {
      if (cell && /^\d+(?:\.\d+)?$/.test(cell.replace(/,/g, ''))) {
        numericColumns.set(index, (numericColumns.get(index) || 0) + 1);
      }
    });
  });

  const numericHeavyColumns = Array.from(numericColumns.values()).filter((count) => count >= 4).length;
  const roomColumn = mapping.room ?? -1;
  const matrixCandidateColumns = roomColumn >= 0
    ? rows[0]
        .map((header, index) => ({ header: asText(header), index }))
        .filter(({ index, header }) => index !== roomColumn && Boolean(header))
    : [];
  const matrixPopulatedColumns = matrixCandidateColumns.filter(({ index }) => (numericColumns.get(index) || 0) >= 2).length;
  const matrixDataRows = sample.filter((row) => {
    if (roomColumn < 0 || !asText(row[roomColumn])) return false;
    return matrixCandidateColumns.some(({ index }) => parsePositiveNumber(row[index], 0) > 0);
  }).length;

  if (mapping.qty === null && mapping.room !== null && matrixCandidateColumns.length >= 2 && matrixPopulatedColumns >= 2 && matrixDataRows >= 2) {
    return 'spreadsheet-matrix';
  }
  if (mapping.qty !== null && (mapping.item !== null || mapping.description !== null)) return 'spreadsheet-row';
  if (numericHeavyColumns > 0) return 'spreadsheet-mixed';
  return 'spreadsheet-unstructured';
}

function parseSpreadsheetRows(rows: Array<Array<string | number | boolean | null | undefined>>, sourceReference: string, catalog: CatalogItem[]): StructuredSpreadsheetResult | null {
  const normalizedRows = rows
    .map((row) => row.map((cell) => asText(cell)))
    .filter((row) => row.some(Boolean));

  if (normalizedRows.length < 2) return null;

  const headerRowIndex = detectSpreadsheetHeaderRow(normalizedRows);
  const tableRows = normalizedRows.slice(headerRowIndex);
  if (tableRows.length < 2) return null;

  const headers = tableRows[0].map((header) => normalizeHeader(header));
  const mapping = detectSpreadsheetColumns(headers);
  const sourceKind = inferSpreadsheetKind(tableRows, mapping);
  const flattenedText = normalizedRows.map((row) => row.filter(Boolean).join(' ')).filter(Boolean).join('\n');
  const preludeText = extractSpreadsheetPreludeText(normalizedRows, headerRowIndex);
  const classifiedMetadata = normalizedRows.reduce<Partial<IntakeProjectMetadata>>((metadata, row, index) => {
    const classification = classifyParsedChunk(row, index);
    return classification.kind === 'project_metadata' ? mergeMetadataHint(metadata, classification.metadata) : metadata;
  }, { sourceFiles: [], assumptions: [], pricingBasis: '' });
  const preludeMetadata = mergeMetadataHint(extractMetadataFromText(preludeText), classifiedMetadata);

  if (sourceKind === 'spreadsheet-unstructured') return null;

  const outputRows: NormalizedIntakeLine[] = [];

  if (sourceKind === 'spreadsheet-matrix') {
    const roomColumn = mapping.room ?? 0;
    const firstDataColumn = Math.max(roomColumn + 1, 1);
    for (let rowIndex = 1; rowIndex < tableRows.length; rowIndex += 1) {
      const row = tableRows[rowIndex];
      const classification = classifyParsedChunk(row, headerRowIndex + rowIndex, preludeMetadata);
      if (classification.kind !== 'actual_scope_line') continue;
      const roomName = normalizeRoomName(row[roomColumn] || 'General Scope');
      for (let columnIndex = firstDataColumn; columnIndex < row.length; columnIndex += 1) {
        const quantity = parsePositiveNumber(row[columnIndex], 0);
        if (quantity <= 0) continue;
        const itemHeader = asText(tableRows[0][columnIndex]) || `Column ${columnIndex + 1}`;
        const itemDetails = expandMatrixHeaderItem(itemHeader);
        const catalogHint = inferFromCatalogByCode(catalog, itemDetails.itemCode);
        outputRows.push({
          roomName,
          category: itemDetails.category || catalogHint?.category || '',
          itemCode: itemDetails.itemCode,
          itemName: itemDetails.itemName || catalogHint?.itemName || itemDetails.description,
          description: itemDetails.description || catalogHint?.description || itemDetails.itemName,
          quantity,
          unit: 'EA',
          notes: '',
          sourceReference,
          laborIncluded: null,
          materialIncluded: null,
          confidence: 0.68,
          parserTag: 'spreadsheet-matrix',
          warnings: [],
          quantityWasDefaulted: false,
          unitWasDefaulted: true,
        });
      }
    }
  } else if (sourceKind === 'spreadsheet-mixed') {
    let currentCategory = '';
    tableRows.slice(1).forEach((row, relativeIndex) => {
      const classification = classifyParsedChunk(row, headerRowIndex + relativeIndex + 1, preludeMetadata);
      const line = row.filter(Boolean).join(' ').trim();
      if (!line) return;
      if (classification.kind === 'project_metadata' || classification.kind === 'header_row' || classification.kind === 'ignore') return;
      if (classification.kind === 'section_header' || (row.filter(Boolean).length === 1 && line.length < 48)) {
        currentCategory = line;
        return;
      }
      const { qty, text } = parseQtyAndText(line);
      outputRows.push({
        roomName: 'General Scope',
        category: currentCategory || inferCategory(text),
        itemCode: '',
        itemName: text,
        description: text,
        quantity: qty,
        unit: 'EA',
        notes: '',
        sourceReference,
        laborIncluded: null,
        materialIncluded: null,
        confidence: 0.5,
        parserTag: 'spreadsheet-mixed',
        warnings: [],
        quantityWasDefaulted: qty === 1,
        unitWasDefaulted: true,
      });
    });
  } else {
    const dataRows = tableRows.slice(1);
    for (let rowIndex = 0; rowIndex < dataRows.length; rowIndex += 1) {
      const row = dataRows[rowIndex];
      const rawItem = mapping.item !== null ? asText(row[mapping.item]) : '';
      const rawDescription = mapping.description !== null ? asText(row[mapping.description]) : '';
      const rawCategory = mapping.category !== null ? asText(row[mapping.category]) : '';
      const explicitItemCode = mapping.itemCode !== null ? asText(row[mapping.itemCode]) : '';
      const quantityText = mapping.qty !== null ? asText(row[mapping.qty]) : '';
      const explicitUnit = mapping.unit !== null ? asText(row[mapping.unit]) : '';
      const roomName = mapping.room !== null ? normalizeRoomName(row[mapping.room]) : 'General Scope';

      if (!rawItem && !rawDescription && !rawCategory && !quantityText) continue;
      if (looksLikeHeaderChunk(row.map((cell) => asText(cell)))) continue;

      const inferredItemCode = explicitItemCode || (looksLikeItemCode(rawItem) ? rawItem : '');
      const expandedItem = inferredItemCode ? expandMatrixHeaderItem(inferredItemCode) : null;
      const catalogHint = inferredItemCode ? inferFromCatalogByCode(catalog, inferredItemCode) : null;
      const itemName = rawDescription
        ? (rawItem && rawItem !== inferredItemCode ? rawItem : rawDescription)
        : catalogHint?.itemName || expandedItem?.itemName || rawItem || '';
      const description = rawDescription || catalogHint?.description || expandedItem?.description || (rawItem && rawItem !== inferredItemCode ? rawItem : '') || rawItem || '';
      const category = normalizeExtractedCategory(rawCategory, `${inferredItemCode} ${itemName} ${description}`) || expandedItem?.category || catalogHint?.category || '';
      if (!itemName && !description && !category) continue;
      const parsedQuantity = mapping.qty !== null ? parsePositiveNumberWithDefault(row[mapping.qty], 1) : { value: 1, defaulted: true };
      outputRows.push({
        roomName,
        category: category || inferCategory(`${inferredItemCode} ${itemName} ${description}`),
        itemCode: inferredItemCode,
        itemName: itemName || description,
        description: description || itemName,
        quantity: parsedQuantity.value,
        unit: explicitUnit || 'EA',
        notes: mapping.notes !== null ? asText(row[mapping.notes]) : '',
        sourceReference,
        laborIncluded: mapping.laborIncluded !== null ? parseFlag(row[mapping.laborIncluded]) : null,
        materialIncluded: mapping.materialIncluded !== null ? parseFlag(row[mapping.materialIncluded]) : null,
        confidence: 0.82,
        parserTag: 'spreadsheet-row',
        warnings: [],
        quantityWasDefaulted: parsedQuantity.defaulted,
        unitWasDefaulted: !explicitUnit,
      });
    }
  }

  if (!outputRows.length) return null;

  const dataRows = tableRows.slice(1);

  const metadata: Partial<IntakeProjectMetadata> = {
    projectName: (mapping.project !== null ? mostCommon(dataRows.map((row) => asText(row[mapping.project ?? -1]))) : '') || preludeMetadata.projectName || '',
    projectNumber: (mapping.projectNumber !== null ? mostCommon(dataRows.map((row) => asText(row[mapping.projectNumber ?? -1]))) : '') || preludeMetadata.projectNumber || '',
    client: (mapping.client !== null ? mostCommon(dataRows.map((row) => asText(row[mapping.client ?? -1]))) : '') || preludeMetadata.client || '',
    generalContractor: preludeMetadata.generalContractor || '',
    address: (mapping.address !== null ? mostCommon(dataRows.map((row) => asText(row[mapping.address ?? -1]))) : '') || preludeMetadata.address || '',
    bidDate: (mapping.bidDate !== null ? mostCommon(dataRows.map((row) => normalizeDate(row[mapping.bidDate ?? -1]))) : '') || preludeMetadata.bidDate || '',
    proposalDate: preludeMetadata.proposalDate || '',
    estimator: preludeMetadata.estimator || '',
    sourceFiles: [],
    assumptions: preludeMetadata.assumptions || [],
    pricingBasis: preludeMetadata.pricingBasis || '',
  };

  return {
    rows: outputRows,
    sourceKind,
    metadata,
    flattenedText,
    preludeText,
  };
}

function detectAddress(lines: string[]): string {
  const labeled = lines.find((line) => /^(address|site|location)\s*[:\-]/i.test(line));
  if (labeled) return labeled.replace(/^(address|site|location)\s*[:\-]/i, '').trim();

  const addressLike = lines.find((line) => /\b\d{1,6}\s+[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+){0,5}\s(?:st|street|rd|road|ave|avenue|blvd|drive|dr|ln|lane|way|ct|court|pl|place|pkwy|parkway)\b/i.test(line));
  return addressLike || '';
}

function detectLabeledValue(lines: string[], patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const matched = lines.find((line) => pattern.test(line));
    if (!matched) continue;
    const extracted = matched.replace(pattern, '').replace(/^[:\-\s]+/, '').trim();
    if (extracted) return extracted;
  }
  return '';
}

function detectProjectName(lines: string[]): string {
  const labeled = detectLabeledValue(lines, [/^project(?:\s+name)?\s*[:\-]?/i, /^job(?:\s+name)?\s*[:\-]?/i]);
  if (labeled) return labeled;

  return (
    lines.slice(0, 18).find((line) => {
      const text = asText(line);
      if (text.length < 6 || text.length > 96) return false;
      if (/^(client|gc|general contractor|address|location|site|date|bid date|project number|job number|scope of work|proposal|invitation to bid|section|division)\b/i.test(text)) return false;
      if (looksLikeDate(text) || /^\d+$/.test(text)) return false;
      return tokenize(text).length >= 2;
    }) || ''
  );
}

function extractMetadataFromText(text: string): Partial<IntakeProjectMetadata> {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 120);
  return {
    projectName: detectProjectName(lines),
    projectNumber: detectLabeledValue(lines, [/^project\s*(?:#|number)\s*[:\-]?/i, /^job\s*(?:#|number)\s*[:\-]?/i, /^bid\s*(?:package|pkg)\s*[:\-]?/i]),
    client: detectLabeledValue(lines, [/^client\s*[:\-]?/i, /^owner\s*[:\-]?/i]),
    generalContractor: detectLabeledValue(lines, [/^gc\s*[:\-]?/i, /^general contractor\s*[:\-]?/i]),
    address: detectAddress(lines),
    bidDate: normalizeDate(detectLabeledValue(lines, [/^bid\s*date\s*[:\-]?/i, /^proposal\s*date\s*[:\-]?/i, /^due\s*date\s*[:\-]?/i, /^date\s*[:\-]?/i])),
    proposalDate: normalizeDate(detectLabeledValue(lines, [/^proposal\s*date\s*[:\-]?/i, /^date\s*[:\-]?/i])),
    estimator: detectLabeledValue(lines, [/^estimator\s*[:\-]?/i, /^prepared by\s*[:\-]?/i]),
    sourceFiles: [],
    assumptions: extractAssumptionsFromText(text),
    pricingBasis: inferPricingBasis(text, []),
  };
}

function detectScopeLinesFromText(text: string, sourceReference: string): NormalizedIntakeLine[] {
  const rawLines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 2).slice(0, 240);
  const knownMetadata = extractMetadataFromText(text);
  let currentSection = '';

  return rawLines.flatMap((line, index) => {
    const classification = classifyParsedChunk([line], index, knownMetadata);
    if (classification.kind === 'section_header') {
      currentSection = line;
      return [];
    }
    if (classification.kind !== 'actual_scope_line') return [];

    const { qty, text: parsedText } = parseQtyAndText(line);
    const description = parsedText || line;
    return [{
      roomName: 'General',
      category: inferCategory(description) || inferCategory(currentSection) || currentSection,
      itemCode: '',
      itemName: description,
      description,
      quantity: qty,
      unit: 'EA',
      notes: '',
      sourceReference,
      laborIncluded: null,
      materialIncluded: null,
      confidence: 0.42,
      parserTag: 'text-fallback',
      warnings: [],
    }];
  });
}

function lineAlignmentLooksSafe(localLine: NormalizedIntakeLine, geminiLine: { quantity: number; itemCode: string; itemName: string; description: string }): boolean {
  const localCode = normalizeComparableText(localLine.itemCode);
  const geminiCode = normalizeComparableText(geminiLine.itemCode);
  if (localCode && geminiCode) {
    if (localCode !== geminiCode) return false;
    if (!localLine.quantityWasDefaulted && Math.abs(localLine.quantity - Number(geminiLine.quantity || 0)) > 0.0001) return false;
    return true;
  }
  const localIdentity = normalizeComparableText(localLine.itemName || localLine.description);
  const geminiIdentity = normalizeComparableText(geminiLine.itemName || geminiLine.description);
  const identityAligned = Boolean(localIdentity && geminiIdentity && (localIdentity.includes(geminiIdentity) || geminiIdentity.includes(localIdentity)));
  if (!identityAligned) return false;
  if (!localLine.quantityWasDefaulted && Math.abs(localLine.quantity - Number(geminiLine.quantity || 0)) > 0.0001) return false;
  return true;
}

function filterSpreadsheetGeminiWarnings(warnings: string[]): string[] {
  return warnings.filter((warning) => !/normalizedrows.*quantity.*unit.*overrid/i.test(warning));
}

function mergeMetadata(primary: Partial<IntakeProjectMetadata>, secondary: Partial<IntakeProjectMetadata>, sources: string[]): IntakeProjectMetadata {
  const projectName = primary.projectName || secondary.projectName || 'Imported Project';
  const projectNumber = primary.projectNumber || secondary.projectNumber || '';
  const client = primary.client || secondary.client || '';
  const generalContractor = primary.generalContractor || secondary.generalContractor || '';
  const address = primary.address || secondary.address || '';
  const bidDate = primary.bidDate || secondary.bidDate || '';
  const proposalDate = primary.proposalDate || secondary.proposalDate || '';
  const estimator = primary.estimator || secondary.estimator || '';
  const sourceFiles = Array.from(new Set([...(primary.sourceFiles || []), ...(secondary.sourceFiles || [])].filter(Boolean)));
  const assumptions = mergeAssumptions(primary.assumptions || [], secondary.assumptions || []);
  const pricingBasis = primary.pricingBasis || secondary.pricingBasis || '';
  const filledCount = [projectName, projectNumber, client, generalContractor, address, bidDate, proposalDate, estimator].filter(Boolean).length;
  return {
    projectName,
    projectNumber,
    client,
    generalContractor,
    address,
    bidDate,
    proposalDate,
    estimator,
    sourceFiles,
    assumptions,
    pricingBasis,
    confidence: Number(Math.min(1, 0.2 + (filledCount * 0.16)).toFixed(2)),
    sources: Array.from(new Set(sources.filter(Boolean))),
  };
}

function buildRoomCandidates(lines: IntakeReviewLine[]): IntakeRoomCandidate[] {
  const counts = new Map<string, { lineCount: number; confidenceSum: number; sourceReference: string }>();
  lines.forEach((line) => {
    const roomName = normalizeRoomName(line.roomName);
    const current = counts.get(roomName) || { lineCount: 0, confidenceSum: 0, sourceReference: line.sourceReference };
    current.lineCount += 1;
    current.confidenceSum += line.confidence;
    current.sourceReference = current.sourceReference || line.sourceReference;
    counts.set(roomName, current);
  });

  return Array.from(counts.entries())
    .map(([roomName, entry]) => ({
      roomName,
      sourceReference: entry.sourceReference,
      lineCount: entry.lineCount,
      confidence: Number((entry.confidenceSum / Math.max(1, entry.lineCount)).toFixed(2)),
    }))
    .sort((left, right) => right.lineCount - left.lineCount || left.roomName.localeCompare(right.roomName));
}

function toReviewLines(lines: NormalizedIntakeLine[], catalog: CatalogItem[], matchCatalog: boolean): IntakeReviewLine[] {
  return lines.map((line) => {
    const description = line.description || line.itemName;
    const { catalogMatch, suggestedMatch } = matchCatalog
      ? prepareCatalogMatch({
          itemCode: line.itemCode,
          itemName: line.itemName,
          description,
          category: line.category,
          notes: line.notes,
          unit: line.unit,
        }, catalog)
      : { catalogMatch: null, suggestedMatch: null };

    const resolvedCategory = line.category || catalogMatch?.category || suggestedMatch?.category || '';
    const completeness = description && line.quantity > 0 && line.unit ? 'complete' : 'partial';
    const warnings = [...line.warnings];
    if (!resolvedCategory) warnings.push('Category could not be confidently inferred.');
    if (!catalogMatch && !suggestedMatch) warnings.push('No catalog match identified.');
    const matchStatus = catalogMatch ? 'matched' : suggestedMatch ? 'suggested' : 'needs_match';
    const matchExplanation = catalogMatch?.reason || suggestedMatch?.reason || 'No confident catalog candidate was found.';

    return {
      lineId: randomUUID(),
      roomName: normalizeRoomName(line.roomName),
      itemName: line.itemName || description,
      description,
      category: resolvedCategory,
      itemCode: line.itemCode,
      quantity: line.quantity,
      unit: line.unit || 'EA',
      notes: line.notes,
      sourceReference: line.sourceReference,
      laborIncluded: line.laborIncluded,
      materialIncluded: line.materialIncluded,
      confidence: Number(line.confidence.toFixed(2)),
      completeness,
      matchStatus,
      matchedCatalogItemId: catalogMatch?.catalogItemId || suggestedMatch?.catalogItemId || null,
      matchExplanation,
      catalogMatch,
      suggestedMatch,
      warnings: Array.from(new Set(warnings)),
    };
  });
}

function buildDiagnostics(sourceKind: IntakeSourceKind, parserStrategy: string, metadata: IntakeProjectMetadata, reviewLines: IntakeReviewLine[], warnings: string[]) {
  return buildIntakeDiagnostics({
    sourceKind,
    parseStrategy: parserStrategy,
    metadata,
    reviewLines,
    warnings,
    modelUsed: INTAKE_GEMINI_MODEL,
    webEnrichmentUsed: false,
  });
}

function deriveSourceKindFromDocument(fileName: string, mimeType: string, text: string): IntakeSourceKind {
  const lowerName = fileName.toLowerCase();
  const sample = text.slice(0, 6000).toLowerCase();
  if (lowerName.endsWith('.pdf') || mimeType.toLowerCase().includes('pdf')) return 'pdf-document';
  if (/(proposal|invitation|request for bid|scope of work|estimate)/i.test(sample)) return 'text-document';
  return 'semi-structured-text';
}

export async function parseIntakeRequest(input: IntakeParseRequest): Promise<IntakeParseResult> {
  const fileName = asText(input.fileName) || 'upload';
  const mimeType = asText(input.mimeType) || 'application/octet-stream';
  const sourceType = classifyIntakeSourceType(fileName, mimeType, input.sourceType);
  const matchCatalog = input.matchCatalog !== false;
  const catalog = matchCatalog ? listActiveCatalogItems() : [];
  const warnings: string[] = [];

  if (sourceType === 'spreadsheet') {
    if (!input.dataBase64) throw new Error('dataBase64 is required for spreadsheet parsing.');
    const parsedSheets = parseSpreadsheetInput({ fileName, mimeType, dataBase64: input.dataBase64, catalog });
    const { deterministicRows, flattenedText, preludeText, metadata: structuredMetadata } = extractSpreadsheetStructuredMetadata(parsedSheets, fileName);

    if (!deterministicRows.length) {
      warnings.push('Spreadsheet structure was weak; falling back to text extraction heuristics.');
      const fallbackText = flattenedText || decodeDocumentText(input.dataBase64, fileName, mimeType);
      const fallbackLines = detectScopeLinesFromText(fallbackText, fileName);
      const metadata = mergeResolvedMetadataFromService(extractMetadataFromTextFromService(fallbackText), structuredMetadata, ['spreadsheet-fallback', 'text-heuristics']);
      const reviewLines = toReviewLinesFromService(fallbackLines as unknown as NormalizedIntakeLineFromService[], catalog, matchCatalog);
      const proposalAssist = buildProposalAssist({
        metadata,
        assumptions: metadata.assumptions,
        lineDescriptions: reviewLines.map((line) => line.description),
      });
      return {
        sourceType,
        sourceKind: 'spreadsheet-unstructured',
        project: metadata,
        projectMetadata: metadata,
        rooms: buildRoomCandidatesFromService(reviewLines),
        parsedLines: reviewLines,
        reviewLines,
        warnings,
        diagnostics: buildDiagnostics('spreadsheet-unstructured', 'spreadsheet-fallback', metadata, reviewLines, warnings),
        proposalAssist,
      };
    }

    let normalizedLines = deterministicRows as unknown as NormalizedIntakeLineFromService[];
    let metadataSources = ['spreadsheet-structure'];

    try {
      const gemini = await withTimeout(
        extractSpreadsheetWithGemini({
          fileName,
          mimeType,
          sourceType: 'spreadsheet',
          extractedText: `${preludeText}\n${flattenedText}`,
          normalizedRows: deterministicRows.map((row) => ({
            roomArea: row.roomName,
            category: row.category,
            itemCode: row.itemCode,
            itemName: row.itemName,
            description: row.description,
            quantity: row.quantity,
            unit: row.unit,
            notes: row.notes,
          })),
        }),
        SPREADSHEET_GEMINI_TIMEOUT_MS,
        'Spreadsheet parsed locally. AI enrichment timed out, so deterministic parsing was used.'
      );

      warnings.push(...filterSpreadsheetGeminiWarnings(gemini.warnings));
      const geminiLines = gemini.parsedLines.map((line) => ({
        roomName: normalizeRoomName(line.roomArea || 'General'),
        category: normalizeExtractedCategoryFromService(line.category, `${line.itemName} ${line.description}`),
        itemCode: line.itemCode || '',
        itemName: line.itemName || line.description || '',
        description: line.description || line.itemName || '',
        quantity: parsePositiveNumber(line.quantity, 1),
        unit: line.unit || 'EA',
        notes: line.notes || '',
        sourceReference: fileName,
        laborIncluded: null,
        materialIncluded: null,
        confidence: 0.88,
        parserTag: 'gemini-spreadsheet',
        warnings: [],
      })).filter((line, index) => shouldKeepNormalizedLineFromService(line, index, structuredMetadata));

      const alignmentSafe = geminiLines.length === deterministicRows.length && deterministicRows.every((row, index) => lineAlignmentLooksSafe(row, gemini.parsedLines[index]));
      if (alignmentSafe) {
        normalizedLines = deterministicRows.map((row, index) => {
          const enriched = geminiLines[index];
          return {
            ...row,
            roomName: row.roomName || enriched.roomName,
            category: row.category || enriched.category,
            itemCode: row.itemCode || enriched.itemCode,
            itemName: row.itemName || enriched.itemName,
            description: row.description || enriched.description,
            quantity: row.quantityWasDefaulted ? enriched.quantity : row.quantity,
            unit: row.unitWasDefaulted ? enriched.unit : row.unit,
            notes: [row.notes, enriched.notes].filter(Boolean).join(' | '),
            confidence: Math.max(row.confidence, enriched.confidence),
            parserTag: 'spreadsheet-structure+gemini',
            quantityWasDefaulted: false,
            unitWasDefaulted: false,
          };
        });
        metadataSources.push('gemini-enrichment');
      } else if (geminiLines.length > 0) {
        warnings.push('Gemini spreadsheet enrichment was returned, but the row order or quantities did not align cleanly with the spreadsheet parse, so the deterministic spreadsheet parse was kept.');
      }

      const metadata = mergeResolvedMetadataFromService(
        {
          projectName: gemini.projectName,
          projectNumber: gemini.projectNumber,
          bidPackage: gemini.bidPackage || gemini.projectNumber,
          client: gemini.client,
          generalContractor: gemini.generalContractor,
          address: gemini.address,
          bidDate: normalizeDateValueFromService(gemini.bidDate),
          proposalDate: normalizeDateValueFromService(gemini.proposalDate),
          estimator: gemini.estimator,
          sourceFiles: [fileName],
          assumptions: gemini.assumptions,
          pricingBasis: inferPricingBasis(`${preludeText}\n${flattenedText}`, normalizedLines.map((line) => line.unit), gemini.pricingBasis),
        },
        structuredMetadata,
        [...metadataSources, 'text-heuristics']
      );
      const reviewLines = toReviewLinesFromService(normalizedLines, catalog, matchCatalog);
      const enrichedMetadata = mergeResolvedMetadataFromService(metadata, extractMetadataFromTextFromService(`${preludeText}\n${flattenedText}`), [...metadata.sources, 'text-heuristics']);
      const proposalAssist = buildProposalAssist({
        metadata: enrichedMetadata,
        assumptions: mergeAssumptions(enrichedMetadata.assumptions, gemini.assumptions),
        lineDescriptions: reviewLines.map((line) => line.description),
        geminiAssist: gemini.proposalAssist,
      });
      return {
        sourceType,
        sourceKind: parsedSheets[0]?.sourceKind || 'spreadsheet-row',
        project: enrichedMetadata,
        projectMetadata: enrichedMetadata,
        rooms: buildRoomCandidatesFromService(reviewLines),
        parsedLines: reviewLines,
        reviewLines,
        warnings: Array.from(new Set(warnings)),
        diagnostics: buildDiagnostics(parsedSheets[0]?.sourceKind || 'spreadsheet-row', 'spreadsheet-structure+gemini', enrichedMetadata, reviewLines, warnings),
        proposalAssist,
      };
    } catch (error: any) {
      warnings.push(error.message || 'Gemini enrichment failed for spreadsheet parsing.');
      const metadata = mergeResolvedMetadataFromService(structuredMetadata, extractMetadataFromTextFromService(`${preludeText}\n${flattenedText}`), ['spreadsheet-structure', 'text-heuristics']);
      const reviewLines = toReviewLinesFromService(normalizedLines, catalog, matchCatalog);
      const proposalAssist = buildProposalAssist({
        metadata,
        assumptions: metadata.assumptions,
        lineDescriptions: reviewLines.map((line) => line.description),
      });
      return {
        sourceType,
        sourceKind: parsedSheets[0]?.sourceKind || 'spreadsheet-row',
        project: metadata,
        projectMetadata: metadata,
        rooms: buildRoomCandidatesFromService(reviewLines),
        parsedLines: reviewLines,
        reviewLines,
        warnings: Array.from(new Set(warnings)),
        diagnostics: buildDiagnostics(parsedSheets[0]?.sourceKind || 'spreadsheet-row', 'spreadsheet-structure', metadata, reviewLines, warnings),
        proposalAssist,
      };
    }
  }

  const extractedText = input.extractedText || (input.dataBase64 ? decodeDocumentText(input.dataBase64, fileName, mimeType) : '');
  const heuristicMetadata = extractMetadataFromTextFromService(extractedText);
  const sourceKind = deriveDocumentSourceKind(fileName, mimeType, extractedText);
  const fallbackLines = detectScopeLinesFromText(extractedText, fileName);

  try {
    const gemini = await extractDocumentWithGemini({
      fileName,
      mimeType,
      sourceType,
      dataBase64: input.dataBase64,
      extractedText,
    });

    warnings.push(...gemini.warnings);
    const geminiLines: NormalizedIntakeLine[] = gemini.parsedLines.map((line) => ({
      roomName: normalizeRoomName(line.roomArea || 'General'),
      category: normalizeExtractedCategoryFromService(line.category, `${line.itemName} ${line.description}`),
      itemCode: line.itemCode || '',
      itemName: line.itemName || line.description || '',
      description: line.description || line.itemName || '',
      quantity: parsePositiveNumber(line.quantity, 1),
      unit: line.unit || 'EA',
      notes: line.notes || '',
      sourceReference: fileName,
      laborIncluded: null,
      materialIncluded: null,
      confidence: 0.9,
      parserTag: sourceType === 'pdf' ? 'gemini-pdf' : 'gemini-document',
      warnings: [],
    })).filter((line, index) => shouldKeepNormalizedLineFromService(line, index, heuristicMetadata));

    const usableGeminiLines = geminiLines.filter((line) => line.description && line.quantity > 0);
    const normalizedLines = usableGeminiLines.length ? usableGeminiLines : fallbackLines;
    if (!usableGeminiLines.length) warnings.push('Gemini did not return enough structured lines; fallback text extraction was used for review.');

    const metadata = mergeResolvedMetadataFromService(
      {
        projectName: gemini.projectName,
        projectNumber: gemini.projectNumber,
        bidPackage: gemini.bidPackage || gemini.projectNumber,
        client: gemini.client,
        generalContractor: gemini.generalContractor,
        address: gemini.address,
        bidDate: normalizeDateValueFromService(gemini.bidDate),
        proposalDate: normalizeDateValueFromService(gemini.proposalDate),
        estimator: gemini.estimator,
        sourceFiles: [fileName],
        assumptions: gemini.assumptions,
        pricingBasis: inferPricingBasis(extractedText, normalizedLines.map((line) => line.unit), gemini.pricingBasis),
      },
      heuristicMetadata,
      ['gemini', 'text-heuristics']
    );
    const reviewLines = toReviewLinesFromService(normalizedLines as unknown as NormalizedIntakeLineFromService[], catalog, matchCatalog);
    const proposalAssist = buildProposalAssist({
      metadata,
      assumptions: metadata.assumptions,
      lineDescriptions: reviewLines.map((line) => line.description),
      geminiAssist: gemini.proposalAssist,
    });
    return {
      sourceType,
      sourceKind,
      project: metadata,
      projectMetadata: metadata,
      rooms: buildRoomCandidatesFromService(reviewLines),
      parsedLines: reviewLines,
      reviewLines,
      warnings: Array.from(new Set(warnings)),
      diagnostics: buildDiagnostics(sourceKind, usableGeminiLines.length ? 'gemini-first' : 'gemini+fallback', metadata, reviewLines, warnings),
      proposalAssist,
    };
  } catch (error: any) {
    warnings.push(error.message || 'Gemini extraction failed; fallback text parsing used.');
    const metadata = mergeResolvedMetadataFromService({ ...heuristicMetadata, sourceFiles: [fileName] }, {}, ['text-heuristics']);
    const reviewLines = toReviewLinesFromService(fallbackLines as unknown as NormalizedIntakeLineFromService[], catalog, matchCatalog);
    const proposalAssist = buildProposalAssist({
      metadata,
      assumptions: metadata.assumptions,
      lineDescriptions: reviewLines.map((line) => line.description),
    });
    return {
      sourceType,
      sourceKind,
      project: metadata,
      projectMetadata: metadata,
      rooms: buildRoomCandidatesFromService(reviewLines),
      parsedLines: reviewLines,
      reviewLines,
      warnings: Array.from(new Set(warnings)),
      diagnostics: buildDiagnostics(sourceKind, 'text-fallback', metadata, reviewLines, warnings),
      proposalAssist,
    };
  }
}