import * as xlsx from 'xlsx';
import { parse as parseCsv } from 'csv-parse/sync';
import type { ExtractedSpreadsheetRow, IntakeProjectMetadata, UploadFileType } from '../../../shared/types/intake.ts';
import { extractMetadataFromText, intakeAsText, mergeMetadataHint, normalizeComparableText } from '../metadataExtractorService.ts';
import { analyzeMatrixTakeoffSheet, detectMatrixTakeoffSheet, isTotalsRow, type MatrixSheetAnalysis } from './workbookShapeDetector.ts';
import { parseMatrixTakeoffSheet } from './matrixTakeoffParser.ts';

export interface ExcelParseOutput {
  fileType: Extract<UploadFileType, 'excel' | 'csv'>;
  extractedRows: ExtractedSpreadsheetRow[];
  warnings: string[];
  sourceSummary: {
    fileName: string;
    sheetsProcessed: string[];
  };
  metadata: Partial<IntakeProjectMetadata>;
}

type CanonicalColumn = keyof ExtractedSpreadsheetRow['mappedFields'];

const HEADER_ALIASES: Record<CanonicalColumn, string[]> = {
  roomName: ['room', 'room name', 'area', 'area name', 'space', 'zone', 'phase', 'location'],
  itemDescription: ['item', 'item name', 'description', 'scope item', 'work description', 'product', 'material'],
  quantity: ['qty', 'quantity', 'count', 'amount'],
  unit: ['unit', 'uom', 'measure', 'unit of measure'],
  manufacturer: ['manufacturer', 'mfr', 'brand', 'vendor'],
  model: ['model', 'model number', 'series', 'part number'],
  finish: ['finish', 'color', 'coating'],
  notes: ['notes', 'remarks', 'comments', 'clarifications', 'exclusions', 'inclusions'],
  cost: ['cost', 'price', 'rate', 'amount', 'material cost', 'unit cost'],
};

function tokenize(value: string): string[] {
  return normalizeComparableText(value).split(/\s+/).filter(Boolean);
}

function overlapScore(left: string, right: string): number {
  const leftTokens = tokenize(left);
  const rightTokens = tokenize(right);
  if (!leftTokens.length || !rightTokens.length) return 0;
  const rightSet = new Set(rightTokens);
  const shared = leftTokens.filter((token) => rightSet.has(token)).length;
  if (!shared) return 0;
  return shared / Math.max(leftTokens.length, rightTokens.length);
}

function scoreHeaderRow(row: unknown[]): number {
  const headers = row.map((cell) => intakeAsText(cell)).filter(Boolean);
  if (!headers.length) return 0;

  return headers.reduce((best, header) => {
    const localBest = Object.values(HEADER_ALIASES)
      .flat()
      .reduce((score, alias) => Math.max(score, overlapScore(header, alias)), 0);
    return best + localBest;
  }, 0);
}

function detectHeaderRows(rows: unknown[][]): number[] {
  const headerRows: number[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const score = scoreHeaderRow(row);
    const filled = row.filter((cell) => intakeAsText(cell)).length;
    if (filled >= 2 && score >= 1.6) {
      headerRows.push(index);
    }
  }
  return Array.from(new Set(headerRows));
}

function bestColumnForAlias(headers: string[], aliases: string[], used: Set<number>): number | null {
  let bestIndex: number | null = null;
  let bestScore = 0;
  headers.forEach((header, index) => {
    if (used.has(index)) return;
    const score = aliases.reduce((currentBest, alias) => Math.max(currentBest, overlapScore(header, alias)), 0);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return bestScore >= 0.45 ? bestIndex : null;
}

function detectColumnMap(headerRow: unknown[]): Partial<Record<CanonicalColumn, number>> {
  const headers = headerRow.map((cell) => intakeAsText(cell));
  const used = new Set<number>();
  const output: Partial<Record<CanonicalColumn, number>> = {};

  (Object.keys(HEADER_ALIASES) as CanonicalColumn[]).forEach((key) => {
    const index = bestColumnForAlias(headers, HEADER_ALIASES[key], used);
    if (index === null) return;
    used.add(index);
    output[key] = index;
  });

  return output;
}

function parseNumericValue(value: unknown): number | null {
  const text = intakeAsText(value).replace(/[$,%(),]/g, '').trim();
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function propagateMergedValues(sheet: xlsx.WorkSheet, rows: unknown[][]): unknown[][] {
  const output = rows.map((row) => [...row]);
  const merges = sheet['!merges'] || [];
  merges.forEach((merge) => {
    const baseValue = output[merge.s.r]?.[merge.s.c];
    for (let rowIndex = merge.s.r; rowIndex <= merge.e.r; rowIndex += 1) {
      for (let columnIndex = merge.s.c; columnIndex <= merge.e.c; columnIndex += 1) {
        if (!intakeAsText(output[rowIndex]?.[columnIndex])) {
          if (!output[rowIndex]) output[rowIndex] = [];
          output[rowIndex][columnIndex] = baseValue;
        }
      }
    }
  });
  return output;
}

function extractMatrixMetadata(rows: unknown[][], analysis: MatrixSheetAnalysis): Partial<IntakeProjectMetadata> {
  if (!analysis.isMatrix || analysis.itemHeaderRow === null) {
    return { sourceFiles: [], assumptions: [], pricingBasis: '' };
  }

  const firstProductColumn = analysis.itemHeaders[0]?.columnIndex ?? Number.MAX_SAFE_INTEGER;
  const metadataLines: string[] = [];

  for (let rowIndex = 0; rowIndex <= analysis.itemHeaderRow; rowIndex += 1) {
    const row = rows[rowIndex] || [];
    const selectedCells = row
      .map((cell, columnIndex) => ({ text: intakeAsText(cell), columnIndex }))
      .filter(({ text }) => Boolean(text))
      .filter(({ text, columnIndex }) => {
        if (/^column\s*\d+$/i.test(text)) return false;
        if (rowIndex < analysis.itemHeaderRow) return true;
        if (columnIndex < firstProductColumn) return true;
        return /^(project|project name|job|job name|client|owner|gc|general contractor|address|location|site|bid date|proposal date|due date|date|estimator|prepared by|package)\s*[:\-]/i.test(text);
      })
      .map(({ text }) => text);

    if (selectedCells.length > 0) metadataLines.push(selectedCells.join(' '));
  }

  return extractMetadataFromText(metadataLines.join('\n'));
}

function extractSectionRows(input: {
  rows: unknown[][];
  headerIndex: number;
  nextHeaderIndex: number;
  sourceSheet: string;
  sourceSheetHidden: boolean;
}): ExtractedSpreadsheetRow[] {
  const { rows, headerIndex, nextHeaderIndex, sourceSheet, sourceSheetHidden } = input;
  const headerRow = rows[headerIndex] || [];
  const columnMap = detectColumnMap(headerRow);
  const output: ExtractedSpreadsheetRow[] = [];

  for (let rowIndex = headerIndex + 1; rowIndex < nextHeaderIndex; rowIndex += 1) {
    const row = rows[rowIndex] || [];
    const populated = row.some((cell) => intakeAsText(cell));
    if (!populated) continue;

    const rawRow: Record<string, unknown> = {};
    headerRow.forEach((header, index) => {
      const key = intakeAsText(header) || `column_${index + 1}`;
      rawRow[key] = row[index] ?? null;
    });

    const itemDescription = columnMap.itemDescription !== undefined ? intakeAsText(row[columnMap.itemDescription]) : '';
    const quantity = columnMap.quantity !== undefined ? parseNumericValue(row[columnMap.quantity]) : null;
    const mappedFields: ExtractedSpreadsheetRow['mappedFields'] = {
      roomName: columnMap.roomName !== undefined ? intakeAsText(row[columnMap.roomName]) || undefined : undefined,
      itemDescription: itemDescription || undefined,
      quantity,
      unit: columnMap.unit !== undefined ? intakeAsText(row[columnMap.unit]) || null : null,
      manufacturer: columnMap.manufacturer !== undefined ? intakeAsText(row[columnMap.manufacturer]) || null : null,
      model: columnMap.model !== undefined ? intakeAsText(row[columnMap.model]) || null : null,
      finish: columnMap.finish !== undefined ? intakeAsText(row[columnMap.finish]) || null : null,
      notes: columnMap.notes !== undefined ? intakeAsText(row[columnMap.notes]) || null : null,
      cost: columnMap.cost !== undefined ? parseNumericValue(row[columnMap.cost]) : null,
    };

    const parsingNotes: string[] = [];
    if (!itemDescription) parsingNotes.push('Item description was not mapped from a recognized header.');
    if (quantity === null) parsingNotes.push('Quantity was missing or not numeric.');
    if (!mappedFields.unit) parsingNotes.push('Unit was not mapped from a recognized header.');

    output.push({
      sourceSheet,
      sourceSheetHidden,
      sourceRowNumber: rowIndex + 1,
      rawRow,
      structureType: 'flat',
      mappedFields,
      parsingNotes,
    });
  }

  return output;
}

function readWorkbook(input: { fileName: string; mimeType: string; dataBase64: string }): { workbook: xlsx.WorkBook; fileType: Extract<UploadFileType, 'excel' | 'csv'> } {
  const fileName = input.fileName.toLowerCase();
  const mimeType = input.mimeType.toLowerCase();

  if (fileName.endsWith('.csv') || mimeType.includes('csv')) {
    const text = Buffer.from(input.dataBase64, 'base64').toString('utf8');
    const rows = parseCsv(text, { relaxColumnCount: true, skipEmptyLines: false }) as unknown[][];
    const worksheet = xlsx.utils.aoa_to_sheet(rows);
    return {
      fileType: 'csv',
      workbook: {
        SheetNames: ['CSV Import'],
        Sheets: { 'CSV Import': worksheet },
        Workbook: { Sheets: [{ name: 'CSV Import', Hidden: 0 }] },
      } as xlsx.WorkBook,
    };
  }

  return {
    fileType: 'excel',
    workbook: xlsx.read(Buffer.from(input.dataBase64, 'base64'), { type: 'buffer', cellFormula: true, cellNF: true, cellText: true }),
  };
}

/** Generic Column1… row + `JOB:` with no value and no data rows — blank matrix template (see repo sample TA Takeoff.xlsx). */
function looksLikeEmptyMatrixTakeoffTemplate(rows: unknown[][]): boolean {
  const r0 = rows[0] || [];
  const labeled = r0.map((cell) => intakeAsText(cell)).filter(Boolean);
  if (labeled.length < 3) return false;
  if (!labeled.every((cell) => /^column\s*\d+$/i.test(cell))) return false;
  const jobCell = intakeAsText((rows[1] || [])[0] || '');
  if (!/^job:\s*$/i.test(jobCell.trim())) return false;
  for (let i = 2; i < Math.min(40, rows.length); i += 1) {
    const row = rows[i] || [];
    if (isTotalsRow(row)) continue;
    if (row.some((cell) => intakeAsText(cell))) return false;
  }
  return true;
}

export function parseExcelUpload(input: { fileName: string; mimeType: string; dataBase64: string }): ExcelParseOutput {
  const { workbook, fileType } = readWorkbook(input);
  const extractedRows: ExtractedSpreadsheetRow[] = [];
  const warnings: string[] = [];
  let metadata: Partial<IntakeProjectMetadata> = { sourceFiles: [], assumptions: [], pricingBasis: '' };

  workbook.SheetNames.forEach((sheetName, sheetIndex) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return;
    const rows = propagateMergedValues(sheet, xlsx.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: null }) as unknown[][]);
    const visibleState = workbook.Workbook?.Sheets?.[sheetIndex]?.Hidden ?? 0;
    const sourceSheetHidden = visibleState !== 0;
    const matrixAnalysis = analyzeMatrixTakeoffSheet({ sheetName, rows });
    const headerRows = detectHeaderRows(rows);

    if (matrixAnalysis.isMatrix && detectMatrixTakeoffSheet({ sheetName, rows })) {
      metadata = mergeMetadataHint(metadata, extractMatrixMetadata(rows, matrixAnalysis));
      const matrixResult = parseMatrixTakeoffSheet({ sheetName, sourceSheetHidden, rows });
      if (matrixResult) {
        extractedRows.push(...matrixResult.extractedRows);
        warnings.push(...matrixResult.warnings);
        return;
      }
    }

    const sheetText = rows
      .slice(0, Math.min(rows.length, 30))
      .map((row) => row.map((cell) => intakeAsText(cell)).filter(Boolean).join(' '))
      .filter(Boolean)
      .join('\n');
    metadata = mergeMetadataHint(metadata, extractMetadataFromText(sheetText));

    if (!headerRows.length) {
      warnings.push(`No confident header row was detected on sheet ${sheetName}.`);
      if (looksLikeEmptyMatrixTakeoffTemplate(rows)) {
        warnings.push(
          `Sheet "${sheetName}" looks like an empty matrix takeoff template (Column1… headers and JOB: with no shorthand row or room quantities). Export a completed grid or fill the template, then re-upload.`
        );
      }
      return;
    }

    headerRows.forEach((headerIndex, index) => {
      const nextHeaderIndex = headerRows[index + 1] ?? rows.length;
      extractedRows.push(...extractSectionRows({ rows, headerIndex, nextHeaderIndex, sourceSheet: sheetName, sourceSheetHidden }));
    });
  });

  if (!extractedRows.length) {
    warnings.push('No structured spreadsheet rows were extracted.');
  }

  return {
    fileType,
    extractedRows,
    warnings,
    sourceSummary: {
      fileName: input.fileName,
      sheetsProcessed: workbook.SheetNames,
    },
    metadata,
  };
}