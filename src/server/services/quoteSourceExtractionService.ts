import * as xlsx from 'xlsx';
import { parse as parseCsv } from 'csv-parse/sync';
import { getProjectFile } from '../repos/projectFilesRepo.ts';
import type { SourceQuoteRecord } from '../../shared/types/estimator.ts';
import {
  classifyQuoteRow,
  extractQuoteHeaderFromText,
  isLikelyTermsPage,
  normalizeSkuModel,
  parseFreeformPricedQuoteLines,
  parseQuoteRowsFromRecords,
  parseQuotePasteText,
  parseTabularQuoteText,
  shouldImportRowType,
  type QuoteHeaderDraft,
  type QuoteStagedRowDraft,
} from '../../shared/utils/quoteStagingParser.ts';
import { resolveUploadPdfProvider } from './intake/documentAiConfig.ts';
import { parsePdfUpload } from './intake/pdfParser.ts';

function parseDateLoose(input: string | undefined): string | null {
  const value = String(input || '').trim();
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().slice(0, 10);
}

function parseMoneyToken(token: string): number | null {
  const cleaned = String(token || '').replace(/[$,()]/g, '').trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

const VALID_UNITS = new Set([
  'EA',
  'EACH',
  'PCS',
  'PC',
  'PR',
  'FRT',
  'SRV',
  'LF',
  'FT',
  'SF',
  'SY',
  'LS',
  'LOT',
  'SET',
  'HR',
  'BOX',
  'GAL',
  'QT',
  'SHT',
  'ROLL',
  'PKG',
]);

function normalizeUnitToken(token: string): string {
  const unit = String(token || '').trim().toUpperCase();
  if (unit === 'EACH') return 'EA';
  if (unit === 'SERVICE') return 'SRV';
  if (unit === 'FREIGHT') return 'FRT';
  if (unit === 'SQ' || unit === 'SQFT' || unit === 'SQFT.') return 'SF';
  return unit;
}

function isValidUnitToken(token: string): boolean {
  const unit = normalizeUnitToken(token);
  return VALID_UNITS.has(unit) || VALID_UNITS.has(String(token || '').trim().toUpperCase());
}

function parseQtyToken(token: string): number | null {
  const cleaned = String(token || '').replace(/,/g, '').trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizePdfLine(line: string): string {
  return String(line || '')
    .replace(/[|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeNoiseKey(line: string): string {
  return line
    .toLowerCase()
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim();
}

function shouldIgnoreLineAsNoise(line: string): boolean {
  const lower = line.toLowerCase();
  if (!line || line.length < 3) return true;
  if (/^page\s+\d+/i.test(line)) return true;
  if (/(bill to|ship to|supplier|vendor id|req\.?\s*no|continued|subtotal|customer copy|purchase order|quote|po\s*number|invoice|terms and conditions|remit to|purchaser)/i.test(lower)) {
    // Keep freight descriptions that include ship-to context.
    if (/(freight|transload|truck)/i.test(lower)) return false;
    return true;
  }
  if (/(phone|fax|www\.|@)/i.test(lower) && line.length < 120) return true;
  if (/\b(tx|ca|ny|fl|wa|pa)\s+\d{5}(?:-\d{4})?\b/i.test(lower) && line.length < 80) return true;
  if (/^\d+\s+of\s+\d+$/i.test(lower)) return true;
  return false;
}

type ParsedTail = {
  qty: number;
  unit: string;
  unitCost: number;
  totalCost: number;
  descriptionText: string;
  lineNumber: string | null;
};

function parsePricedTailFromText(text: string, options?: { allowPriceOnly?: boolean }): ParsedTail | null {
  const tokens = String(text || '').split(/\s+/).filter(Boolean);
  if (tokens.length < 4) return null;

  const totalCost = parseMoneyToken(tokens[tokens.length - 1]);
  const unitCost = parseMoneyToken(tokens[tokens.length - 2]);
  const unit = normalizeUnitToken(tokens[tokens.length - 3] || '');
  const qty = parseQtyToken(tokens[tokens.length - 4]);

  if (qty == null || unitCost == null || totalCost == null) return null;
  if (!isValidUnitToken(tokens[tokens.length - 3] || '')) return null;

  const descriptionTokens = tokens.slice(0, Math.max(0, tokens.length - 4));
  let lineNumber: string | null = null;
  if (descriptionTokens[0] && /^\d{1,4}$/.test(descriptionTokens[0])) {
    lineNumber = descriptionTokens.shift() || null;
  }
  const descriptionText = descriptionTokens.join(' ').trim();
  if (!descriptionText && !options?.allowPriceOnly) return null;

  return {
    qty,
    unit,
    unitCost,
    totalCost,
    descriptionText,
    lineNumber,
  };
}

function tryParseInlinePricedLine(line: string): ParsedTail | null {
  const trimmed = normalizePdfLine(line);
  const m = trimmed.match(
    /^(.+?)\s+(\d+(?:\.\d+)?)\s+([A-Za-z]{2,6})\s+\$?\s*([\d,]+(?:\.\d{2,4})?)\s+\$?\s*([\d,]+(?:\.\d{2,4})?)\s*$/i,
  );
  if (!m) return null;
  const unit = normalizeUnitToken(m[3] || '');
  if (!isValidUnitToken(m[3] || '')) return null;
  const qty = parseQtyToken(m[2]);
  const unitCost = parseMoneyToken(m[4]);
  const totalCost = parseMoneyToken(m[5]);
  if (qty == null || unitCost == null || totalCost == null) return null;
  return {
    qty,
    unit,
    unitCost,
    totalCost,
    descriptionText: String(m[1] || '').trim(),
    lineNumber: null,
  };
}

function isLikelyDescriptionContinuation(line: string): boolean {
  if (!line || line.length < 3) return false;
  if (/^\d{1,4}\s*$/.test(line)) return false;
  if (/^(total|subtotal|tax|page)\b/i.test(line)) return false;
  if (/^\$?[\d,.]+\s+\$?[\d,.]+$/.test(line)) return false;
  return true;
}

function parseStandaloneMoney(line: string): number | null {
  const cleaned = String(line || '').trim();
  if (!/^\$?\s*\d+(?:,\d{3})*(?:\.\d{2,4})\s*$/.test(cleaned)) return null;
  return parseMoneyToken(cleaned);
}

function parseStandaloneQty(line: string): number | null {
  const cleaned = String(line || '').trim();
  if (!/^\d{1,4}(?:\.\d{1,2})?\s*$/.test(cleaned)) return null;
  return parseQtyToken(cleaned);
}

function isLikelySkuLine(line: string): boolean {
  return /^\d{3,}[A-Z][A-Z0-9]{3,}$/i.test(String(line || '').trim());
}

type SectionCandidate = {
  rawDescription: string;
  skuModel: string | null;
};

function parseColumnBlockRows(lines: string[]): QuoteStagedRowDraft[] {
  const sectionStarts = lines
    .map((line, index) => (/^description$/i.test(line.trim()) ? index : -1))
    .filter((index) => index >= 0);
  const ranges: Array<{ start: number; end: number }> = [];
  if (sectionStarts.length === 0) {
    ranges.push({ start: 0, end: lines.length - 1 });
  } else {
    sectionStarts.forEach((start, i) => {
      const end = i + 1 < sectionStarts.length ? sectionStarts[i + 1] - 1 : lines.length - 1;
      ranges.push({ start, end });
    });
  }

  const rows: QuoteStagedRowDraft[] = [];
  for (const range of ranges) {
    const section = lines.slice(range.start, range.end + 1);
    const descriptionCandidates: SectionCandidate[] = [];
    for (let i = 0; i < section.length; i += 1) {
      const current = section[i] || '';
      if (!isLikelySkuLine(current)) continue;

      const sku = normalizeSkuModel(current);
      const descParts: string[] = [];
      for (let j = i + 1; j < Math.min(section.length, i + 7); j += 1) {
        const probe = section[j] || '';
        if (!probe) break;
        if (isLikelySkuLine(probe)) break;
        if (/^(quantity|unit cost|total cost|po number|po date|fob|delivery date|supplier|send billing|page\s+\d+)/i.test(probe)) break;
        if (parseStandaloneMoney(probe) != null) break;
        if (isValidUnitToken(probe)) break;
        if (parseStandaloneQty(probe) != null && probe.includes('.')) break;
        descParts.push(probe);
      }

      const merged = descParts.join(' ').replace(/\s+/g, ' ').trim();
      if (merged) {
        descriptionCandidates.push({
          rawDescription: merged,
          skuModel: sku,
        });
      }
    }

    const n = descriptionCandidates.length;
    if (n === 0) continue;

    const totals = section.map(parseStandaloneMoney).filter((v): v is number => v != null);
    const units = section.map((line) => String(line || '').trim().toUpperCase()).filter((u) => isValidUnitToken(u));
    const qtys = section.map(parseStandaloneQty).filter((v): v is number => v != null);
    const unitCosts = section
      .map((line) => {
        const cleaned = String(line || '').trim();
        if (!/^\$?\s*\d+(?:,\d{3})*(?:\.\d{4})\s*$/.test(cleaned)) return null;
        return parseMoneyToken(cleaned);
      })
      .filter((v): v is number => v != null);

    if (totals.length < n || qtys.length < n) continue;

    for (let i = 0; i < n; i += 1) {
      const desc = descriptionCandidates[i]?.rawDescription || '';
      if (!desc) continue;
      const qty = qtys[i] ?? 1;
      const inferredUnit = /(freight|transload|truck)/i.test(desc)
        ? 'FRT'
        : /(installation|install|service)/i.test(desc)
          ? 'SRV'
          : 'EA';
      const unit = units[i] || inferredUnit;
      const totalCost = totals[i] ?? 0;
      const unitCost = unitCosts[i] ?? (qty > 0 ? Number((totalCost / qty).toFixed(4)) : 0);
      const rowType = classifyQuoteRow({ description: desc, unit, unitCost, totalCost });
      rows.push({
        rawDescription: desc,
        normalizedDescription: desc,
        skuModel: descriptionCandidates[i]?.skuModel || normalizeSkuModel(desc),
        qty,
        unit,
        unitCost,
        totalCost,
        materialCost: Number(unitCost || 0),
        rowType,
        importSelected: shouldImportRowType(rowType),
      });
    }
  }

  return rows;
}

export function extractRowsFromPdfPages(pageTexts: string[]): QuoteStagedRowDraft[] {
  const lineFrequency = new Map<string, number>();
  const normalizedPages = pageTexts.map((page) =>
    String(page || '')
      .split(/\r?\n/)
      .map(normalizePdfLine)
      .filter(Boolean)
  );

  normalizedPages.forEach((lines) => {
    const seenOnPage = new Set<string>();
    lines.forEach((line) => {
      const key = normalizeNoiseKey(line);
      if (!key || seenOnPage.has(key)) return;
      seenOnPage.add(key);
      lineFrequency.set(key, (lineFrequency.get(key) || 0) + 1);
    });
  });

  const rows: QuoteStagedRowDraft[] = [];

  normalizedPages.forEach((pageLines) => {
    const pageText = pageLines.join('\n');

    const filteredLines = pageLines.filter((line) => {
      const key = normalizeNoiseKey(line);
      const repeatedNoise = (lineFrequency.get(key) || 0) >= 2 && shouldIgnoreLineAsNoise(line);
      return !(repeatedNoise || shouldIgnoreLineAsNoise(line));
    });

    const hasDescriptionHeader = filteredLines.some((line) => /^description$/i.test(line.trim()));
    const blockRows = parseColumnBlockRows(filteredLines);
    // Column-vector PDFs label a Description block; POs with inline SKUs must use line stitching below.
    if (hasDescriptionHeader && blockRows.length > 0) {
      rows.push(...blockRows);
      return;
    }

    if (isLikelyTermsPage(pageText)) return;

    for (let index = 0; index < filteredLines.length; index += 1) {
      const primary = filteredLines[index] || '';
      if (!primary) continue;

      let tail: ParsedTail | null = tryParseInlinePricedLine(primary);
      let consumedTo = index;

      if (!tail) {
        for (let end = index; end <= Math.min(filteredLines.length - 1, index + 8); end += 1) {
          const candidate = filteredLines.slice(index, end + 1).join(' ');
          const parsed =
            parsePricedTailFromText(candidate) ||
            parsePricedTailFromText(candidate, { allowPriceOnly: true });
          if (parsed) {
            tail = parsed;
            consumedTo = end;
            break;
          }
        }
      }

      if (!tail) continue;

      const prelude: string[] = [];
      if (!tail.descriptionText) {
        for (let back = index - 1; back >= Math.max(0, index - 6); back -= 1) {
          const prev = filteredLines[back] || '';
          if (!prev) continue;
          if (
            parsePricedTailFromText(prev, { allowPriceOnly: true }) ||
            tryParseInlinePricedLine(prev)
          ) {
            break;
          }
          if (isLikelySkuLine(prev)) continue;
          if (isLikelyDescriptionContinuation(prev)) prelude.unshift(prev);
          else if (prelude.length > 0) break;
        }
      } else if (index > 0) {
        const prev = filteredLines[index - 1] || '';
        if (
          isLikelyDescriptionContinuation(prev) &&
          !parsePricedTailFromText(prev, { allowPriceOnly: true }) &&
          !tryParseInlinePricedLine(prev)
        ) {
          prelude.push(prev);
        }
      }

      const stitchedDescription = [...prelude, tail.descriptionText].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
      if (!stitchedDescription) continue;

      const rowType = classifyQuoteRow({
        description: stitchedDescription,
        unit: tail.unit,
        unitCost: tail.unitCost,
        totalCost: tail.totalCost,
      });

      const materialCost = tail.unitCost ?? (tail.qty > 0 ? Number((tail.totalCost / tail.qty).toFixed(2)) : 0);
      rows.push({
        lineNumber: tail.lineNumber,
        rawDescription: stitchedDescription,
        normalizedDescription: stitchedDescription,
        skuModel: normalizeSkuModel(stitchedDescription),
        qty: tail.qty,
        unit: tail.unit,
        unitCost: tail.unitCost,
        totalCost: tail.totalCost,
        materialCost,
        rowType,
        importSelected: shouldImportRowType(rowType),
      });

      index = consumedTo;
    }
  });

  const deduped = rows.filter((row) => row.rawDescription.trim().length > 0);
  const seen = new Set<string>();
  return deduped.filter((row) => {
    const key = `${row.skuModel || ''}|${row.rawDescription.toLowerCase()}|${row.qty}|${row.unit}|${row.totalCost ?? 0}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseQuoteRowsFromFile(input: { fileName: string; mimeType: string; dataBase64: string }): Promise<{ rows: QuoteStagedRowDraft[]; header: QuoteHeaderDraft; warnings: string[] }> {
  const lowerName = String(input.fileName || '').toLowerCase();
  const lowerMime = String(input.mimeType || '').toLowerCase();

  if (lowerName.endsWith('.csv') || lowerName.endsWith('.tsv') || lowerName.endsWith('.txt') || lowerMime.includes('csv') || lowerMime.includes('tab-separated')) {
    const rawText = Buffer.from(input.dataBase64, 'base64').toString('utf8');
    const rows = parseTabularQuoteText(rawText);
    const header = extractQuoteHeaderFromText(rawText);
    return Promise.resolve({ rows, header, warnings: [] });
  }

  if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls') || lowerMime.includes('spreadsheet') || lowerMime.includes('excel')) {
    const workbook = xlsx.read(Buffer.from(input.dataBase64, 'base64'), { type: 'buffer' });
    const records: Array<Record<string, unknown>> = [];
    workbook.SheetNames.forEach((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) return;
      const rows = xlsx.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      records.push(...rows);
    });
    const rows = parseQuoteRowsFromRecords(records);
    return Promise.resolve({ rows, header: {}, warnings: [] });
  }

  if (lowerName.endsWith('.pdf') || lowerMime.includes('pdf')) {
    return parsePdfUpload(input).then((pdf) => {
      const pageTexts = pdf.document.pages.map((page) => page.text);
      let rows = extractRowsFromPdfPages(pageTexts);
      const docText = String(pdf.document.documentText || '').trim();
      const warnings = [...pdf.warnings, ...pdf.document.extractionWarnings];

      if (rows.length === 0 && docText.length > 20) {
        const docLineRows = extractRowsFromPdfPages([docText]);
        if (docLineRows.length > 0) {
          rows = docLineRows;
          warnings.push('Parsed priced lines from full document text (page layout was not tabular).');
        } else {
          const freeformRows = parseFreeformPricedQuoteLines(docText);
          const pasteRows =
            freeformRows.length > 0
              ? freeformRows
              : parseQuotePasteText(docText).filter((row) => shouldImportRowType(row.rowType));
          if (pasteRows.length > 0) {
            rows = pasteRows;
            warnings.push('PDF table layout was not detected; parsed priced lines from extracted document text.');
          } else {
            warnings.push(
              `PDF text was extracted (${docText.length} chars, provider=${resolveUploadPdfProvider()}) but no priced rows matched. Check qty/unit/price columns or paste rows manually.`,
            );
          }
        }
      } else if (rows.length === 0) {
        warnings.push(
          'PDF produced little or no text. Confirm Document AI env vars (GOOGLE_CLOUD_PROJECT_ID, DOCUMENT_AI_PROCESSOR_ID) and UPLOAD_PDF_PROVIDER=google-document-ai.',
        );
      }

      const header = extractQuoteHeaderFromText(docText);
      return { rows, header, warnings };
    });
  }

  const fallbackText = Buffer.from(input.dataBase64, 'base64').toString('utf8');
  const rows = parseQuotePasteText(fallbackText);
  return Promise.resolve({ rows, header: extractQuoteHeaderFromText(fallbackText), warnings: ['Unrecognized file type. Parsed as plain text quote.'] });
}

export async function extractSourceQuoteFromAttachedFile(input: {
  quote: SourceQuoteRecord;
}): Promise<{ header: QuoteHeaderDraft; rows: QuoteStagedRowDraft[]; warnings: string[] }> {
  const fileId = String(input.quote.sourceFileId || '').trim();
  if (!fileId) {
    throw new Error('This quote has no attached source file.');
  }
  const file = await getProjectFile(input.quote.projectId, fileId);
  if (!file) {
    throw new Error('Attached quote file could not be found.');
  }

  return parseQuoteRowsFromFile({
    fileName: file.fileName,
    mimeType: file.mimeType,
    dataBase64: file.dataBase64,
  }).then((parsed) => ({
    header: {
      vendorName: parsed.header.vendorName,
      quoteNumber: parsed.header.quoteNumber,
      quoteDate: parseDateLoose(parsed.header.quoteDate || ''),
      deliveryDate: parseDateLoose(parsed.header.deliveryDate || ''),
      shipTo: parsed.header.shipTo,
      notes: parsed.header.notes,
    },
    rows: parsed.rows,
    warnings: parsed.warnings,
  }));
}

export function parsePastedQuoteTable(text: string): QuoteStagedRowDraft[] {
  return parseQuotePasteText(text);
}

export function parseCsvRowsForQuoteStaging(csvText: string): QuoteStagedRowDraft[] {
  const records = parseCsv(csvText, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as Array<Record<string, unknown>>;
  return parseQuoteRowsFromRecords(records);
}
