import * as xlsx from 'xlsx';
import { parse as parseCsv } from 'csv-parse/sync';
import type { CatalogItem } from '../../types.ts';
import type { IntakeCatalogMatch, IntakeProjectMetadata, IntakeSourceKind } from '../../shared/types/intake.ts';
import { detectSpreadsheetHeaderRow, extractSpreadsheetPreludeText } from './spreadsheetInterpretationService.ts';
import { shouldSkipSpreadsheetSheet } from './fileClassifierService.ts';
import {
  extractMetadataFromText,
  intakeAsText,
  mergeMetadataAssumptions,
  mergeMetadataHint,
  normalizeComparableText,
  normalizeDateValue,
} from './metadataExtractorService.ts';
import { classifyParsedChunk, inferCategoryFromText, looksLikeHeaderChunk, normalizeExtractedCategory } from './rowClassifierService.ts';
import { extractAssumptionsFromText, inferPricingBasis } from './proposalAssistService.ts';

export interface NormalizedIntakeLine {
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
  catalogMatch?: IntakeCatalogMatch | null;
  suggestedMatch?: IntakeCatalogMatch | null;
}

export interface StructuredSpreadsheetResult {
  rows: NormalizedIntakeLine[];
  sourceKind: IntakeSourceKind;
  metadata: Partial<IntakeProjectMetadata>;
  flattenedText: string;
  preludeText: string;
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
  const normalized = intakeAsText(value).toLowerCase();
  if (!normalized) return null;
  if (['yes', 'y', 'true', '1', 'included', 'inc'].includes(normalized)) return true;
  if (['no', 'n', 'false', '0', 'excluded', 'excl'].includes(normalized)) return false;
  return null;
}

function normalizeRoomName(value: unknown): string {
  return intakeAsText(value) || 'General';
}

function isPositiveNumberText(value: unknown): boolean {
  const text = intakeAsText(value).replace(/,/g, '');
  return Boolean(text) && /^\d+(?:\.\d+)?$/.test(text) && Number(text) > 0;
}

function looksLikeUnitValue(value: unknown): boolean {
  const text = intakeAsText(value).toUpperCase();
  if (!text) return false;
  return /^(EA|EACH|LF|LN ?FT|FT|SF|SQ ?FT|SY|SQ ?YD|LS|LOT|SET|PAIR|PR|HR|DAY|WK|MO|BOX|PKG|CASE|CS|GAL|LB)$/.test(text);
}

function looksLikeRoomLabel(value: unknown): boolean {
  const text = intakeAsText(value);
  const normalized = normalizeComparableText(text);
  if (!normalized) return false;
  if (isPositiveNumberText(text) || looksLikeUnitValue(text) || looksLikeItemCode(text)) return false;
  if (inferCategoryFromText(text)) return false;
  if (/^(project|client|owner|gc|general contractor|address|bid date|proposal date|date|estimator|prepared by|notes?)\b/.test(normalized)) return false;
  const tokenCount = normalized.split(/\s+/).filter(Boolean).length;
  return tokenCount >= 1 && tokenCount <= 5 && normalized.length <= 40;
}

function normalizeHeader(value: unknown): string {
  return intakeAsText(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
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
        .map((header, index) => ({ header: intakeAsText(header), index }))
        .filter(({ index, header }) => index !== roomColumn && Boolean(header))
    : [];
  const matrixPopulatedColumns = matrixCandidateColumns.filter(({ index }) => (numericColumns.get(index) || 0) >= 2).length;
  const matrixDataRows = sample.filter((row) => {
    if (roomColumn < 0 || !intakeAsText(row[roomColumn])) return false;
    return matrixCandidateColumns.some(({ index }) => parsePositiveNumber(row[index], 0) > 0);
  }).length;

  if (mapping.qty === null && mapping.room !== null && matrixCandidateColumns.length >= 2 && matrixPopulatedColumns >= 2 && matrixDataRows >= 2) {
    return 'spreadsheet-matrix';
  }
  if (mapping.qty !== null && (mapping.item !== null || mapping.description !== null)) return 'spreadsheet-row';
  if (numericHeavyColumns > 0) return 'spreadsheet-mixed';
  return 'spreadsheet-unstructured';
}

function normalizeCompactCode(value: unknown): string {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, '').trim();
}

function codeFamily(value: unknown): string {
  const normalized = String(value ?? '').toUpperCase().trim();
  const match = normalized.match(/^[A-Z]{1,6}/);
  return match ? match[0] : '';
}

function inferFromCatalogByCode(catalog: CatalogItem[], itemCode: string): { category: string; itemName: string; description: string } | null {
  const compactCode = normalizeCompactCode(itemCode);
  const family = codeFamily(itemCode);
  if (!compactCode && !family) return null;

  const exact = compactCode ? catalog.find((item) => normalizeCompactCode(item.sku) === compactCode) : null;
  if (exact) {
    return {
      category: exact.category || '',
      itemName: exact.description || exact.sku || '',
      description: exact.description || exact.sku || '',
    };
  }

  const familyMatches = family ? catalog.filter((item) => codeFamily(item.sku) === family) : [];
  if (!familyMatches.length) return null;

  const first = familyMatches[0];
  return {
    category: first.category || '',
    itemName: first.description || first.sku || '',
    description: first.description || first.sku || '',
  };
}

function expandMatrixHeaderItem(header: string): { itemCode: string; itemName: string; description: string; category: string } {
  const itemCode = intakeAsText(header);
  const normalizedCode = itemCode.toUpperCase();

  const patterns: Array<{ pattern: RegExp; build: (match: RegExpMatchArray) => string }> = [
    { pattern: /^GB[- ]?(\d{2})$/, build: (match) => `Grab Bar ${match[1]}" Stainless Steel` },
    { pattern: /^PTD[- ]?\w*$/, build: () => 'Paper Towel Dispenser, Surface Mounted' },
    { pattern: /^SD[- ]?\w*$/, build: () => 'Soap Dispenser' },
    { pattern: /^ND[- ]?\w*$/, build: () => 'Sanitary Napkin Disposal' },
    { pattern: /^M[- ]?(\d{2,4})$/, build: (match) => `Mirror ${match[1]}` },
    { pattern: /^TP[- ]?\w*$/, build: () => 'Toilet Partition' },
    { pattern: /^US[- ]?\w*$/, build: () => 'Urinal Screen' },
    { pattern: /^AP[- ]?\w*$/, build: () => 'Access Panel' },
    { pattern: /^WB[- ]?\w*$/, build: () => 'Whiteboard' },
  ];

  for (const { pattern, build } of patterns) {
    const match = normalizedCode.match(pattern);
    if (!match) continue;
    const itemName = build(match);
    return {
      itemCode,
      itemName,
      description: itemName,
      category: inferCategoryFromText(itemName),
    };
  }

  return {
    itemCode,
    itemName: itemCode,
    description: itemCode,
    category: inferCategoryFromText(itemCode),
  };
}

function looksLikeItemCode(value: string): boolean {
  const raw = intakeAsText(value);
  const text = raw.toUpperCase();
  if (!text) return false;
  if (looksLikeUnitValue(raw)) return false;
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
  return { qty: parsePositiveNumber(matched[1], 1), text: intakeAsText(matched[2]) };
}

function buildLooseSpreadsheetRows(
  rows: string[][],
  sourceReference: string,
  catalog: CatalogItem[],
  preludeMetadata: Partial<IntakeProjectMetadata>
): NormalizedIntakeLine[] {
  const outputRows: NormalizedIntakeLine[] = [];
  let currentCategory = '';

  rows.forEach((row, rowIndex) => {
    const compactCells = row.map((cell) => intakeAsText(cell)).filter(Boolean);
    if (!compactCells.length) return;

    const classification = classifyParsedChunk(compactCells, rowIndex, preludeMetadata);
    const line = compactCells.join(' ').trim();
    if (!line) return;

    if (classification.kind === 'project_metadata' || classification.kind === 'header_row' || classification.kind === 'ignore') return;
    if (classification.kind === 'section_header') {
      const sectionCategory = normalizeExtractedCategory('', line) || inferCategoryFromText(line);
      if (sectionCategory) currentCategory = sectionCategory;
      return;
    }

    const firstNumericIndex = compactCells.findIndex((cell) => isPositiveNumberText(cell));
    const quantity = firstNumericIndex >= 0 ? parsePositiveNumber(compactCells[firstNumericIndex], 1) : parseQtyAndText(line).qty;
    const unit = compactCells.find((cell) => looksLikeUnitValue(cell)) || 'EA';
    const itemCode = compactCells.find((cell) => looksLikeItemCode(cell)) || '';
    const roomName = compactCells.length >= 3 && looksLikeRoomLabel(compactCells[0]) ? normalizeRoomName(compactCells[0]) : 'General Scope';
    const catalogHint = itemCode ? inferFromCatalogByCode(catalog, itemCode) : null;

    const descriptionParts = compactCells.filter((cell, index) => {
      if (!cell) return false;
      if (roomName !== 'General Scope' && index === 0) return false;
      if (cell === itemCode) return false;
      if (looksLikeUnitValue(cell)) return false;
      if (firstNumericIndex >= 0 && index === firstNumericIndex) return false;
      return true;
    });

    const description = descriptionParts.join(' ').trim() || parseQtyAndText(line).text || catalogHint?.description || '';
    const category = currentCategory || normalizeExtractedCategory('', `${itemCode} ${description}`) || catalogHint?.category || '';
    if (!description && !category && !itemCode) return;

    outputRows.push({
      roomName,
      category,
      itemCode,
      itemName: catalogHint?.itemName || description,
      description: description || catalogHint?.description || catalogHint?.itemName || itemCode,
      quantity,
      unit,
      notes: '',
      sourceReference,
      laborIncluded: null,
      materialIncluded: null,
      confidence: 0.42,
      parserTag: 'spreadsheet-mixed',
      warnings: ['Parsed from weak spreadsheet structure using loose row inference.'],
      quantityWasDefaulted: firstNumericIndex < 0,
      unitWasDefaulted: unit === 'EA',
    });
  });

  return outputRows;
}

export function parseSpreadsheetRows(rows: Array<Array<string | number | boolean | null | undefined>>, sourceReference: string, catalog: CatalogItem[]): StructuredSpreadsheetResult | null {
  const normalizedRows = rows.map((row) => row.map((cell) => intakeAsText(cell))).filter((row) => row.some(Boolean));
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

  if (sourceKind === 'spreadsheet-unstructured') {
    const looseRows = buildLooseSpreadsheetRows(normalizedRows, sourceReference, catalog, preludeMetadata);
    if (!looseRows.length) return null;
    return {
      rows: looseRows,
      sourceKind: 'spreadsheet-mixed',
      metadata: {
        ...preludeMetadata,
        sourceFiles: [],
        assumptions: preludeMetadata.assumptions || [],
        pricingBasis: preludeMetadata.pricingBasis || '',
      },
      flattenedText,
      preludeText,
    };
  }

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
        const itemHeader = intakeAsText(tableRows[0][columnIndex]) || `Column ${columnIndex + 1}`;
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
          confidence: 0.72,
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
        category: currentCategory || inferCategoryFromText(text),
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
      const rawItem = mapping.item !== null ? intakeAsText(row[mapping.item]) : '';
      const rawDescription = mapping.description !== null ? intakeAsText(row[mapping.description]) : '';
      const rawCategory = mapping.category !== null ? intakeAsText(row[mapping.category]) : '';
      const explicitItemCode = mapping.itemCode !== null ? intakeAsText(row[mapping.itemCode]) : '';
      const quantityText = mapping.qty !== null ? intakeAsText(row[mapping.qty]) : '';
      const explicitUnit = mapping.unit !== null ? intakeAsText(row[mapping.unit]) : '';
      const roomName = mapping.room !== null ? normalizeRoomName(row[mapping.room]) : 'General Scope';

      if (!rawItem && !rawDescription && !rawCategory && !quantityText) continue;
      if (looksLikeHeaderChunk(row.map((cell) => intakeAsText(cell)))) continue;

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
        category: category || inferCategoryFromText(`${inferredItemCode} ${itemName} ${description}`),
        itemCode: inferredItemCode,
        itemName: itemName || description,
        description: description || itemName,
        quantity: parsedQuantity.value,
        unit: explicitUnit || 'EA',
        notes: mapping.notes !== null ? intakeAsText(row[mapping.notes]) : '',
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

  if (!outputRows.length) {
    const looseRows = buildLooseSpreadsheetRows(tableRows.slice(1), sourceReference, catalog, preludeMetadata);
    if (!looseRows.length) return null;
    return {
      rows: looseRows,
      sourceKind: 'spreadsheet-mixed',
      metadata: {
        ...preludeMetadata,
        sourceFiles: [],
        assumptions: preludeMetadata.assumptions || [],
        pricingBasis: preludeMetadata.pricingBasis || '',
      },
      flattenedText,
      preludeText,
    };
  }

  const dataRows = tableRows.slice(1);
  const projectNumber = (mapping.projectNumber !== null ? mostCommon(dataRows.map((row) => intakeAsText(row[mapping.projectNumber ?? -1]))) : '') || preludeMetadata.projectNumber || preludeMetadata.bidPackage || '';
  const bidPackage = preludeMetadata.bidPackage || projectNumber || '';

  const metadata: Partial<IntakeProjectMetadata> = {
    projectName: (mapping.project !== null ? mostCommon(dataRows.map((row) => intakeAsText(row[mapping.project ?? -1]))) : '') || preludeMetadata.projectName || '',
    projectNumber,
    bidPackage,
    client: (mapping.client !== null ? mostCommon(dataRows.map((row) => intakeAsText(row[mapping.client ?? -1]))) : '') || preludeMetadata.client || '',
    generalContractor: preludeMetadata.generalContractor || '',
    address: (mapping.address !== null ? mostCommon(dataRows.map((row) => intakeAsText(row[mapping.address ?? -1]))) : '') || preludeMetadata.address || '',
    bidDate: (mapping.bidDate !== null ? mostCommon(dataRows.map((row) => normalizeDateValue(row[mapping.bidDate ?? -1]))) : '') || preludeMetadata.bidDate || '',
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

export function parseSpreadsheetInput(input: {
  fileName: string;
  mimeType: string;
  dataBase64: string;
  catalog: CatalogItem[];
}): StructuredSpreadsheetResult[] {
  const parsedSheets: StructuredSpreadsheetResult[] = [];
  const lowerName = input.fileName.toLowerCase();
  const lowerMime = input.mimeType.toLowerCase();

  if (lowerName.endsWith('.csv') || lowerMime.includes('csv')) {
    const csvText = Buffer.from(input.dataBase64, 'base64').toString('utf8');
    const rows = parseCsv(csvText, {
      relax_column_count: true,
      skip_empty_lines: true,
      trim: true,
    }) as Array<Array<string | number | boolean | null | undefined>>;
    const parsed = parseSpreadsheetRows(rows, input.fileName, input.catalog);
    if (parsed) parsedSheets.push(parsed);
    return parsedSheets;
  }

  const workbook = xlsx.read(Buffer.from(input.dataBase64, 'base64'), { type: 'buffer' });
  workbook.SheetNames.forEach((sheetName) => {
    if (shouldSkipSpreadsheetSheet(sheetName)) return;
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json<Array<string | number | boolean | null | undefined>>(sheet, { header: 1, defval: '' });
    const parsed = parseSpreadsheetRows(rows, `${input.fileName}:${sheetName}`, input.catalog);
    if (parsed) parsedSheets.push(parsed);
  });

  return parsedSheets;
}

export function extractSpreadsheetStructuredMetadata(parsedSheets: StructuredSpreadsheetResult[], fileName: string): {
  flattenedText: string;
  preludeText: string;
  deterministicRows: NormalizedIntakeLine[];
  metadata: Partial<IntakeProjectMetadata>;
} {
  const deterministicRows = parsedSheets.flatMap((sheet) => sheet.rows);
  const flattenedText = parsedSheets.map((sheet) => sheet.flattenedText).filter(Boolean).join('\n');
  const preludeText = parsedSheets.map((sheet) => sheet.preludeText).filter(Boolean).join('\n');

  return {
    flattenedText,
    preludeText,
    deterministicRows,
    metadata: {
      projectName: mostCommon(parsedSheets.map((sheet) => sheet.metadata.projectName || '')),
      projectNumber: mostCommon(parsedSheets.map((sheet) => sheet.metadata.projectNumber || sheet.metadata.bidPackage || '')),
      bidPackage: mostCommon(parsedSheets.map((sheet) => sheet.metadata.bidPackage || sheet.metadata.projectNumber || '')),
      client: mostCommon(parsedSheets.map((sheet) => sheet.metadata.client || '')),
      generalContractor: mostCommon(parsedSheets.map((sheet) => sheet.metadata.generalContractor || '')),
      address: mostCommon(parsedSheets.map((sheet) => sheet.metadata.address || '')),
      bidDate: mostCommon(parsedSheets.map((sheet) => sheet.metadata.bidDate || '')),
      proposalDate: mostCommon(parsedSheets.map((sheet) => sheet.metadata.proposalDate || '')),
      estimator: mostCommon(parsedSheets.map((sheet) => sheet.metadata.estimator || '')),
      sourceFiles: [fileName],
      assumptions: mergeMetadataAssumptions(parsedSheets.flatMap((sheet) => sheet.metadata.assumptions || []), extractAssumptionsFromText(`${preludeText}\n${flattenedText}`)),
      pricingBasis: inferPricingBasis(`${preludeText}\n${flattenedText}`, deterministicRows.map((row) => row.unit)),
    },
  };
}