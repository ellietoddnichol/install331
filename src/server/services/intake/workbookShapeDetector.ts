import type { MatrixItemHeader } from '../../../shared/types/intake.ts';
import { intakeAsText, normalizeComparableText } from '../metadataExtractorService.ts';

export interface ParsedSheet {
  sheetName: string;
  rows: unknown[][];
}

export interface MatrixSheetAnalysis {
  isMatrix: boolean;
  genericHeaderRow: number | null;
  itemHeaderRow: number | null;
  roomColumn: number | null;
  dataStartRow: number | null;
  dataEndRow: number | null;
  itemHeaders: MatrixItemHeader[];
}

const EMPTY_SYMBOLS = new Set(['', '\\', '/', '-', 'n/a', 'na', 'null', 'undefined']);

export function columnLetterFromIndex(index: number): string {
  let remainder = index + 1;
  let output = '';
  while (remainder > 0) {
    const segment = (remainder - 1) % 26;
    output = String.fromCharCode(65 + segment) + output;
    remainder = Math.floor((remainder - 1) / 26);
  }
  return output;
}

function isGenericHeaderCell(value: unknown): boolean {
  return /^column\s*\d+$/i.test(intakeAsText(value));
}

function looksLikeProductHeader(value: unknown): boolean {
  const text = intakeAsText(value);
  const normalized = normalizeComparableText(text);
  if (!normalized || isGenericHeaderCell(text)) return false;
  if (/^(room|area|space|location|phase|item|item description|description|qty|quantity|unit|manufacturer|model|notes|cost)$/i.test(text)) return false;
  if (/^(total|totals|subtotal|summary)$/i.test(text)) return false;
  return normalized.length >= 2 && normalized.length <= 80;
}

function looksLikeRoomName(value: unknown): boolean {
  const text = intakeAsText(value);
  const normalized = normalizeComparableText(text);
  if (!normalized) return false;
  if (/^(total|totals|subtotal|summary|grand total)$/i.test(text)) return false;
  if (/^column\s*\d+$/i.test(text)) return false;
  if (/^\d+(?:\.\d+)?$/.test(text.replace(/,/g, ''))) return false;
  return normalized.split(/\s+/).length <= 8;
}

export function isTotalsRow(values: unknown[]): boolean {
  return values.some((value) => /^(total|totals|subtotal|sub total|grand total|summary)$/i.test(intakeAsText(value)));
}

export function parseQuantityCell(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  const text = intakeAsText(value).trim();
  if (!text) return null;
  if (EMPTY_SYMBOLS.has(text.toLowerCase())) return null;
  const normalized = text.replace(/[,$]/g, '');
  const numeric = Number(normalized);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

export function findRealItemHeaderRow(sheet: ParsedSheet): number | null {
  let bestRow: number | null = null;
  let bestScore = 0;

  for (let rowIndex = 0; rowIndex < Math.min(sheet.rows.length, 8); rowIndex += 1) {
    const row = sheet.rows[rowIndex] || [];
    const productLikeCount = row.filter(looksLikeProductHeader).length;
    const genericCount = row.filter(isGenericHeaderCell).length;
    const priorGenericBonus = rowIndex > 0 && (sheet.rows[rowIndex - 1] || []).filter(isGenericHeaderCell).length >= 3 ? 3 : 0;
    const score = productLikeCount - (genericCount * 2) + priorGenericBonus;
    if ((productLikeCount >= 3 || (priorGenericBonus > 0 && productLikeCount >= 2)) && score > bestScore) {
      bestScore = score;
      bestRow = rowIndex;
    }
  }

  return bestScore >= 2 ? bestRow : null;
}

export function findRoomNameColumn(sheet: ParsedSheet, itemHeaderRow: number): number | null {
  let bestColumn: number | null = null;
  let bestScore = 0;
  const startRow = itemHeaderRow + 1;
  const endRow = Math.min(sheet.rows.length, startRow + 25);

  for (let columnIndex = 0; columnIndex < 6; columnIndex += 1) {
    let roomLikes = 0;
    let quantityLikes = 0;
    for (let rowIndex = startRow; rowIndex < endRow; rowIndex += 1) {
      const row = sheet.rows[rowIndex] || [];
      if (isTotalsRow(row)) continue;
      const cell = row[columnIndex];
      if (looksLikeRoomName(cell)) roomLikes += 1;
      if (parseQuantityCell(cell) !== null) quantityLikes += 1;
    }
    const score = roomLikes - (quantityLikes * 2);
    if (roomLikes >= 2 && score > bestScore) {
      bestScore = score;
      bestColumn = columnIndex;
    }
  }

  return bestColumn;
}

function buildItemHeaders(sheet: ParsedSheet, itemHeaderRow: number, roomColumn: number): MatrixItemHeader[] {
  const row = sheet.rows[itemHeaderRow] || [];
  return row
    .map((cell, columnIndex) => ({
      columnIndex,
      columnLetter: columnLetterFromIndex(columnIndex),
      rawHeader: intakeAsText(cell),
    }))
    .filter((header) => header.columnIndex !== roomColumn)
    .filter((header) => looksLikeProductHeader(header.rawHeader));
}

export function detectMatrixTakeoffSheet(sheet: ParsedSheet): boolean {
  return analyzeMatrixTakeoffSheet(sheet).isMatrix;
}

export function analyzeMatrixTakeoffSheet(sheet: ParsedSheet): MatrixSheetAnalysis {
  const itemHeaderRow = findRealItemHeaderRow(sheet);
  if (itemHeaderRow === null) {
    return { isMatrix: false, genericHeaderRow: null, itemHeaderRow: null, roomColumn: null, dataStartRow: null, dataEndRow: null, itemHeaders: [] };
  }

  const genericHeaderRow = itemHeaderRow > 0 && (sheet.rows[itemHeaderRow - 1] || []).filter(isGenericHeaderCell).length >= 3
    ? itemHeaderRow - 1
    : null;
  const roomColumn = findRoomNameColumn(sheet, itemHeaderRow);
  if (roomColumn === null) {
    return { isMatrix: false, genericHeaderRow, itemHeaderRow, roomColumn: null, dataStartRow: null, dataEndRow: null, itemHeaders: [] };
  }

  const itemHeaders = buildItemHeaders(sheet, itemHeaderRow, roomColumn);
  let dataStartRow: number | null = null;
  let dataEndRow: number | null = null;
  let populatedQuantityColumns = 0;
  let dataRowsWithQuantities = 0;

  itemHeaders.forEach((header) => {
    let hits = 0;
    for (let rowIndex = itemHeaderRow + 1; rowIndex < sheet.rows.length; rowIndex += 1) {
      const row = sheet.rows[rowIndex] || [];
      if (isTotalsRow(row)) break;
      if (parseQuantityCell(row[header.columnIndex]) !== null) hits += 1;
    }
    if (hits > 0) populatedQuantityColumns += 1;
  });

  for (let rowIndex = itemHeaderRow + 1; rowIndex < sheet.rows.length; rowIndex += 1) {
    const row = sheet.rows[rowIndex] || [];
    if (row.every((cell) => !intakeAsText(cell))) continue;
    if (isTotalsRow(row)) {
      if (dataStartRow !== null && dataEndRow === null) dataEndRow = rowIndex - 1;
      break;
    }
    const roomCell = intakeAsText(row[roomColumn]);
    const hasQuantity = itemHeaders.some((header) => parseQuantityCell(row[header.columnIndex]) !== null);
    if (!roomCell || !hasQuantity) continue;
    if (dataStartRow === null) dataStartRow = rowIndex;
    dataEndRow = rowIndex;
    dataRowsWithQuantities += 1;
  }

  const isMatrix = itemHeaders.length >= 2
    && dataStartRow !== null
    && dataEndRow !== null
    && populatedQuantityColumns >= 2
    && dataRowsWithQuantities >= 1
    && (genericHeaderRow !== null || itemHeaders.length >= 3);
  return {
    isMatrix,
    genericHeaderRow,
    itemHeaderRow,
    roomColumn,
    dataStartRow,
    dataEndRow,
    itemHeaders,
  };
}