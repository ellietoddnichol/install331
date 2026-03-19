import type { ExtractedSpreadsheetRow } from '../../../shared/types/intake.ts';
import { intakeAsText } from '../metadataExtractorService.ts';
import { interpretTakeoffHeader } from './headerInterpreter.ts';
import { analyzeMatrixTakeoffSheet, parseQuantityCell, isTotalsRow, type ParsedSheet } from './workbookShapeDetector.ts';

export interface MatrixTakeoffParseResult {
  extractedRows: ExtractedSpreadsheetRow[];
  warnings: string[];
}

export function unpivotMatrixTakeoff(input: {
  sheetName: string;
  sourceSheetHidden: boolean;
  rows: unknown[][];
}): ExtractedSpreadsheetRow[] {
  const sheet: ParsedSheet = { sheetName: input.sheetName, rows: input.rows };
  const analysis = analyzeMatrixTakeoffSheet(sheet);
  if (!analysis.isMatrix || analysis.roomColumn === null || analysis.dataStartRow === null || analysis.dataEndRow === null) {
    return [];
  }

  const output: ExtractedSpreadsheetRow[] = [];
  for (let rowIndex = analysis.dataStartRow; rowIndex <= analysis.dataEndRow; rowIndex += 1) {
    const row = input.rows[rowIndex] || [];
    if (isTotalsRow(row)) continue;
    const roomName = intakeAsText(row[analysis.roomColumn]);
    if (!roomName) continue;

    analysis.itemHeaders.forEach((header) => {
      const quantity = parseQuantityCell(row[header.columnIndex]);
      if (quantity === null) return;

      const interpretation = interpretTakeoffHeader(header.rawHeader);
      output.push({
        sourceSheet: input.sheetName,
        sourceSheetHidden: input.sourceSheetHidden,
        sourceRowNumber: rowIndex + 1,
        sourceColumn: header.columnLetter,
        rawRow: {
          roomName,
          rawHeader: header.rawHeader,
          quantity,
          sourceColumn: header.columnLetter,
        },
        rawHeader: header.rawHeader,
        normalizedSearchText: interpretation.normalizedSearchText,
        parsedTokens: interpretation.parsedTokens,
        structureType: 'matrix',
        mappedFields: {
          roomName,
          itemDescription: header.rawHeader,
          quantity,
          unit: 'EA',
          manufacturer: null,
          model: interpretation.modelTokens[0] || null,
          finish: null,
          notes: null,
          cost: null,
        },
        parsingNotes: [
          `Extracted from matrix takeoff column ${header.columnLetter}.`,
          `Raw header preserved as "${header.rawHeader}".`,
        ],
      });
    });
  }

  return output;
}

export function parseMatrixTakeoffSheet(input: {
  sheetName: string;
  sourceSheetHidden: boolean;
  rows: unknown[][];
}): MatrixTakeoffParseResult | null {
  const extractedRows = unpivotMatrixTakeoff(input);
  if (!extractedRows.length) return null;

  const warnings: string[] = [];
  if (input.rows.some((row) => isTotalsRow(row))) {
    warnings.push(`Ignored totals or summary rows on sheet ${input.sheetName}.`);
  }
  if (input.rows.some((row) => row.some((cell) => ['\\', '/', '-'].includes(intakeAsText(cell).trim())))) {
    warnings.push(`Ignored symbolic blank quantity cells on sheet ${input.sheetName}.`);
  }

  return { extractedRows, warnings };
}