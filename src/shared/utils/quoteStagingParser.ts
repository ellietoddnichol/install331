import type { SourceQuoteRowType } from '../types/estimator';

export interface QuoteStagedRowDraft {
  lineNumber?: string | null;
  rawDescription: string;
  normalizedDescription?: string | null;
  skuModel?: string | null;
  manufacturer?: string | null;
  qty?: number;
  unit?: string;
  unitCost?: number | null;
  totalCost?: number | null;
  materialCost?: number;
  notes?: string | null;
  rowType: SourceQuoteRowType;
  importSelected?: boolean;
}

export interface QuoteHeaderDraft {
  vendorName?: string;
  quoteNumber?: string;
  quoteDate?: string;
  deliveryDate?: string;
  shipTo?: string;
  notes?: string;
}

const VALID_UNITS = new Set(['EA', 'FRT', 'SRV', 'LF', 'FT', 'SF', 'LS', 'LOT', 'SET', 'HR']);

const ACCESSORY_HINTS = [
  'lock',
  'latch',
  'hinge',
  'trim',
  'panel',
  'filler',
  'hook',
  'bracket',
  'hardware',
];

const MATERIAL_HINTS = [
  'locker',
  'partition',
  'mirror',
  'cabinet',
  'screen',
  'grab bar',
  'dispenser',
];

const FREIGHT_HINTS = ['freight', 'shipping', 'delivery', 'transloading', 'truck'];
const INSTALLATION_HINTS = ['installation', 'install', 'field labor', 'labor'];
const SERVICE_HINTS = ['service', 'startup', 'commissioning', 'inspection'];
const LEGAL_TERMS_HINTS = [
  'indemnify',
  'liability',
  'insurance',
  'workers compensation',
  'worker\'s compensation',
  'liquidated damages',
  'certificate',
  'additional insured',
  'warranty disclaimer',
  'hold harmless',
  'jurisdiction',
  'force majeure',
  'governing law',
];

/** Summary / tax / total lines — never auto-import. */
const SUMMARY_OR_TOTAL_LINE = /^(?:material\s+)?(?:sub\s*total|total)\b|^(?:sales\s+)?tax\b|^grand\s+total\b|^quote\s+total\b|^subtotal\b/i;
const TERMS_HEADER_LINE = /^terms\s+and\s+conditions\b|^payment\s+terms\b/i;

export function normalizeSkuModel(input: string): string | null {
  const hay = String(input || '');
  const bobrickStyle = hay.match(/\b([A-Z]-\d{3,}[A-Z0-9]*)\b/i);
  if (bobrickStyle) return bobrickStyle[1].toUpperCase();
  const general = hay.match(/\b([A-Z0-9]{3,}[A-Z0-9\-]{2,})\b/i);
  if (!general) return null;
  return general[1].toUpperCase();
}

function parseMoney(input: string): number | null {
  const cleaned = String(input || '').replace(/[$,()]/g, '').trim();
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

function parseQty(input: string): number | null {
  const cleaned = String(input || '').replace(/,/g, '').trim();
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function normalizeUnit(input: string): string {
  const token = String(input || '').trim().toUpperCase();
  if (!token) return 'EA';
  if (token === 'EACH') return 'EA';
  if (token === 'SERVICE') return 'SRV';
  if (token === 'FREIGHT') return 'FRT';
  return token;
}

function hasAny(text: string, needles: string[]): boolean {
  const lower = String(text || '').toLowerCase();
  return needles.some((needle) => lower.includes(needle));
}

function stripTrailingMoneyLabel(description: string): string {
  return String(description || '')
    .replace(/\s*[:]\s*\$?[\d,]+(?:\.\d{2})?\s*$/i, '')
    .replace(/\s+\$?[\d,]+(?:\.\d{2})?\s*$/i, '')
    .trim();
}

export function isQuoteSummaryOrTermsLine(description: string): boolean {
  const trimmed = String(description || '').trim();
  if (!trimmed) return false;
  const label = stripTrailingMoneyLabel(trimmed).toLowerCase();
  if (TERMS_HEADER_LINE.test(label)) return true;
  if (SUMMARY_OR_TOTAL_LINE.test(label)) return true;
  if (/^total$/i.test(label) && !hasAny(trimmed, MATERIAL_HINTS)) return true;
  return false;
}

export function classifyQuoteRow(input: {
  description: string;
  unit?: string | null;
  unitCost?: number | null;
  totalCost?: number | null;
}): SourceQuoteRowType {
  const description = String(input.description || '').trim();
  const lower = description.toLowerCase();
  const unit = normalizeUnit(input.unit || '');
  const hasPrice = Number(input.unitCost || 0) > 0 || Number(input.totalCost || 0) > 0;

  if (!description) return 'ignore';
  if (isQuoteSummaryOrTermsLine(description)) {
    return TERMS_HEADER_LINE.test(stripTrailingMoneyLabel(description).toLowerCase()) ? 'note' : 'ignore';
  }
  if (!hasPrice && hasAny(lower, LEGAL_TERMS_HINTS)) return 'ignore';
  if (!hasPrice && lower.length > 180) return 'note';
  if (unit === 'FRT' || hasAny(lower, FREIGHT_HINTS)) return 'freight';
  if (unit === 'SRV' && hasAny(lower, INSTALLATION_HINTS)) return 'installation';
  if (hasAny(lower, INSTALLATION_HINTS)) return hasPrice ? 'installation' : 'note';
  if (unit === 'SRV' || hasAny(lower, SERVICE_HINTS)) return 'service';
  if (hasAny(lower, MATERIAL_HINTS)) return 'material';
  if (hasAny(lower, ACCESSORY_HINTS)) return 'accessory';
  return hasPrice ? 'material' : 'note';
}

/** Billable material rows auto-select for import; freight/fees and narrative rows do not. */
export function shouldImportRowType(rowType: SourceQuoteRowType): boolean {
  return rowType === 'material' || rowType === 'accessory' || rowType === 'installation' || rowType === 'service';
}

function parseDelimitedLine(line: string, delimiter: ',' | '\t'): string[] {
  const out: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === delimiter && !inQuotes) {
      out.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  out.push(current.trim());
  return out;
}

function detectColumnIndex(headers: string[], keys: string[]): number {
  const normalized = headers.map((h) => h.toLowerCase());
  for (const key of keys) {
    const exact = normalized.findIndex((h) => h === key);
    if (exact >= 0) return exact;
  }
  for (const key of keys) {
    const partial = normalized.findIndex((h) => h.includes(key));
    if (partial >= 0) return partial;
  }
  return -1;
}

function rowFromCells(cells: string[], idx: {
  lineNumber: number;
  description: number;
  manufacturer: number;
  skuModel: number;
  qty: number;
  unit: number;
  unitCost: number;
  totalCost: number;
  notes: number;
}): QuoteStagedRowDraft | null {
  const description = String(cells[idx.description >= 0 ? idx.description : 0] || '').trim();
  if (!description) return null;

  const qty = parseQty(cells[idx.qty]);
  const unit = normalizeUnit(cells[idx.unit] || 'EA');
  const unitCost = parseMoney(cells[idx.unitCost]);
  const totalCost = parseMoney(cells[idx.totalCost]);
  const rowType = classifyQuoteRow({ description, unit, unitCost, totalCost });
  const materialCost = unitCost != null
    ? unitCost
    : totalCost != null && qty && qty > 0
      ? Number((totalCost / qty).toFixed(2))
      : 0;

  return {
    lineNumber: idx.lineNumber >= 0 ? (String(cells[idx.lineNumber] || '').trim() || null) : null,
    rawDescription: description,
    normalizedDescription: description,
    manufacturer: idx.manufacturer >= 0 ? (String(cells[idx.manufacturer] || '').trim() || null) : null,
    skuModel: idx.skuModel >= 0
      ? (String(cells[idx.skuModel] || '').trim() || normalizeSkuModel(description))
      : normalizeSkuModel(description),
    qty: qty ?? 1,
    unit,
    unitCost,
    totalCost,
    materialCost,
    notes: idx.notes >= 0 ? (String(cells[idx.notes] || '').trim() || null) : null,
    rowType,
    importSelected: shouldImportRowType(rowType),
  };
}

export function parseTabularQuoteText(text: string): QuoteStagedRowDraft[] {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const delimiter: ',' | '\t' = lines.some((line) => line.includes('\t')) ? '\t' : ',';
  const rows = lines.map((line) => parseDelimitedLine(line, delimiter));
  const first = rows[0] || [];
  const hasHeader = first.some((cell) => /item|line|description|qty|quantity|unit|cost|total|model|sku|notes?/i.test(cell));
  const header = hasHeader ? first : [];
  const dataRows = hasHeader ? rows.slice(1) : rows;

  const idx = {
    lineNumber: header.length ? detectColumnIndex(header, ['line', 'line number', 'item', 'item no']) : 0,
    description: header.length ? detectColumnIndex(header, ['description', 'item description', 'product']) : 1,
    manufacturer: header.length ? detectColumnIndex(header, ['manufacturer', 'mfr', 'brand']) : -1,
    skuModel: header.length ? detectColumnIndex(header, ['sku', 'model', 'item number', 'part']) : -1,
    qty: header.length ? detectColumnIndex(header, ['qty', 'quantity']) : 2,
    unit: header.length ? detectColumnIndex(header, ['unit', 'uom']) : 3,
    unitCost: header.length ? detectColumnIndex(header, ['unit cost', 'unit price', 'price']) : 4,
    totalCost: header.length ? detectColumnIndex(header, ['total', 'ext total', 'line total']) : 5,
    notes: header.length ? detectColumnIndex(header, ['notes', 'remarks']) : -1,
  };

  return dataRows
    .map((cells) => rowFromCells(cells, idx))
    .filter((row): row is QuoteStagedRowDraft => Boolean(row));
}

export function parseQuoteRowsFromRecords(records: Array<Record<string, unknown>>): QuoteStagedRowDraft[] {
  if (records.length === 0) return [];
  const headers = Object.keys(records[0] || {});
  const headerLine = headers.join(',');
  const body = records.map((record) => headers.map((h) => String(record[h] ?? '')).join(',')).join('\n');
  return parseTabularQuoteText(`${headerLine}\n${body}`);
}

function isValidUnitToken(token: string): boolean {
  return VALID_UNITS.has(normalizeUnit(token));
}

function buildStagedRow(input: {
  rawDescription: string;
  qty: number;
  unit: string;
  unitCost: number | null;
  totalCost: number | null;
  skuModel?: string | null;
  manufacturer?: string | null;
  lineNumber?: string | null;
}): QuoteStagedRowDraft {
  const rawDescription = String(input.rawDescription || '').trim();
  const qty = input.qty > 0 ? input.qty : 1;
  const unit = normalizeUnit(input.unit);
  const unitCost = input.unitCost;
  const totalCost = input.totalCost;
  const materialCost = unitCost != null
    ? unitCost
    : totalCost != null && qty > 0
      ? Number((totalCost / qty).toFixed(2))
      : 0;
  const rowType = classifyQuoteRow({ description: rawDescription, unit, unitCost, totalCost });

  return {
    lineNumber: input.lineNumber ?? null,
    rawDescription,
    normalizedDescription: rawDescription,
    skuModel: input.skuModel ?? normalizeSkuModel(rawDescription),
    manufacturer: input.manufacturer ?? null,
    qty,
    unit,
    unitCost,
    totalCost,
    materialCost,
    rowType,
    importSelected: shouldImportRowType(rowType),
  };
}

type ParsedTailPrices = {
  descriptionRemainder: string;
  unitCost: number | null;
  totalCost: number | null;
};

function extractPricesFromDescriptionTail(text: string): ParsedTailPrices {
  let rest = String(text || '').trim();

  const eachDash = rest.match(/^(.*?)(?:\s*-\s*)?\$?\s*([\d,]+(?:\.\d{2})?)\s+each\s*(?:-\s*)?\$?\s*([\d,]+(?:\.\d{2})?)\s*$/i);
  if (eachDash) {
    return {
      descriptionRemainder: eachDash[1].trim(),
      unitCost: parseMoney(eachDash[2]),
      totalCost: parseMoney(eachDash[3]),
    };
  }

  const twoMoney = rest.match(/^(.*?)\s+\$?\s*([\d,]+(?:\.\d{2})?)\s+\$?\s*([\d,]+(?:\.\d{2})?)\s*$/);
  if (twoMoney) {
    const unitCost = parseMoney(twoMoney[2]);
    const totalCost = parseMoney(twoMoney[3]);
    if (unitCost != null && totalCost != null) {
      return { descriptionRemainder: twoMoney[1].trim(), unitCost, totalCost };
    }
  }

  const oneMoney = rest.match(/^(.*?)\s+\$?\s*([\d,]+(?:\.\d{2})?)\s*$/);
  if (oneMoney) {
    const totalCost = parseMoney(oneMoney[2]);
    return { descriptionRemainder: oneMoney[1].trim(), unitCost: null, totalCost };
  }

  return { descriptionRemainder: rest, unitCost: null, totalCost: null };
}

function parseFreeformPricedLine(line: string): QuoteStagedRowDraft | null {
  const trimmed = String(line || '').trim();
  if (!trimmed) return null;
  if (/^(material|terms|notes?)\s*:\s*$/i.test(trimmed)) return null;
  if (isLikelyTermsPage(trimmed)) return null;

  const freightColon = trimmed.match(/^freight\s*:\s*\$?\s*([\d,.]+)\s*$/i);
  if (freightColon) {
    const totalCost = parseMoney(freightColon[1]) ?? 0;
    return buildStagedRow({
      rawDescription: 'Freight',
      qty: 1,
      unit: 'FRT',
      unitCost: totalCost,
      totalCost,
    });
  }

  if (isQuoteSummaryOrTermsLine(trimmed)) {
    const rowType = TERMS_HEADER_LINE.test(stripTrailingMoneyLabel(trimmed).toLowerCase()) ? 'note' : 'ignore';
    return {
      rawDescription: trimmed,
      normalizedDescription: trimmed,
      qty: 1,
      unit: 'EA',
      unitCost: parseMoney(trimmed),
      totalCost: parseMoney(trimmed),
      materialCost: 0,
      rowType,
      importSelected: false,
    };
  }

  const qtyUnitMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s+([A-Za-z]{2,6})\s+(.+)$/i);
  if (!qtyUnitMatch) return null;

  const qty = parseQty(qtyUnitMatch[1]) ?? 1;
  const unitToken = qtyUnitMatch[2];
  if (!isValidUnitToken(unitToken)) return null;

  const unit = normalizeUnit(unitToken);
  const { descriptionRemainder, unitCost, totalCost } = extractPricesFromDescriptionTail(qtyUnitMatch[3]);
  if (unitCost == null && totalCost == null) return null;

  const rawDescription = descriptionRemainder.replace(/\s+/g, ' ').trim();
  if (!rawDescription) return null;

  const resolvedUnitCost = unitCost ?? (totalCost != null && qty > 0 ? Number((totalCost / qty).toFixed(2)) : null);
  const resolvedTotal = totalCost ?? (resolvedUnitCost != null ? Number((resolvedUnitCost * qty).toFixed(2)) : null);

  return buildStagedRow({
    rawDescription,
    qty,
    unit,
    unitCost: resolvedUnitCost,
    totalCost: resolvedTotal,
  });
}

/**
 * Parses vendor-style freeform quote lines (qty unit description … prices).
 * Use {@link parseQuotePasteText} to route between table and freeform input.
 */
export function parseFreeformPricedQuoteLines(text: string): QuoteStagedRowDraft[] {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];
  if (isLikelyTermsPage(lines.join('\n'))) return [];

  const rows: QuoteStagedRowDraft[] = [];
  for (const line of lines) {
    const row = parseFreeformPricedLine(line);
    if (row) rows.push(row);
  }
  return rows;
}

function looksLikeDelimitedTable(text: string): boolean {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return false;
  if (lines.some((line) => line.includes('\t'))) return true;
  const commaRows = lines.filter((line) => (line.match(/,/g) || []).length >= 2);
  if (commaRows.length >= 2) return true;
  const first = lines[0] || '';
  return /(^|,)\s*(item|line|description|qty|quantity|unit|uom|cost|total|model|sku)/i.test(first);
}

/**
 * Routes pasted quote text: delimited tables use {@link parseTabularQuoteText};
 * otherwise tries {@link parseFreeformPricedQuoteLines}, then falls back to tabular.
 */
export function parseQuotePasteText(text: string): QuoteStagedRowDraft[] {
  if (looksLikeDelimitedTable(text)) {
    return parseTabularQuoteText(text);
  }
  const freeform = parseFreeformPricedQuoteLines(text);
  if (freeform.length > 0) return freeform;
  return parseTabularQuoteText(text);
}

function normalizeHeaderLine(line: string): string {
  return line.toLowerCase().replace(/\s+/g, ' ').replace(/[|]/g, ' ').trim();
}

export function extractQuoteHeaderFromText(text: string): QuoteHeaderDraft {
  const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const all = lines.join('\n');

  const quoteNumberMatch = all.match(/\b(?:quote|po|purchase order)\s*(?:#|no\.?|number)?\s*[:\-]?\s*([A-Z0-9\-]{4,})/i);
  const quoteDateMatch = all.match(/\b(?:quote|po|purchase order)?\s*date\s*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})/i);
  const deliveryDateMatch = all.match(/\bdelivery\s*date\s*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})/i);

  const shipToStart = lines.findIndex((line) => /^ship\s*to\b/i.test(line));
  let shipTo: string | undefined;
  if (shipToStart >= 0) {
    const block = lines.slice(shipToStart, Math.min(lines.length, shipToStart + 4));
    shipTo = block.join(' | ');
  }

  const vendorLine = lines.find((line) => {
    const normalized = normalizeHeaderLine(line);
    if (normalized.includes('ship to') || normalized.includes('bill to')) return false;
    if (normalized.includes('purchase order') || normalized.includes('quote')) return false;
    return /\b(inc|llc|ltd|corp|co\.?|systems|industries|supply|hollman)\b/i.test(line);
  });

  return {
    vendorName: vendorLine,
    quoteNumber: quoteNumberMatch?.[1],
    quoteDate: quoteDateMatch?.[1],
    deliveryDate: deliveryDateMatch?.[1],
    shipTo,
  };
}

export function isLikelyTermsPage(pageText: string): boolean {
  const lines = String(pageText || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return false;
  const text = lines.join(' ').toLowerCase();
  const legalHits = LEGAL_TERMS_HINTS.reduce((sum, token) => (text.includes(token) ? sum + 1 : sum), 0);
  const pricedLineCandidates = lines.filter((line) => {
    const tokens = line.split(/\s+/);
    if (tokens.length < 5) return false;
    const maybeTotal = parseMoney(tokens[tokens.length - 1]);
    const maybeUnitCost = parseMoney(tokens[tokens.length - 2]);
    return maybeTotal != null && maybeUnitCost != null;
  }).length;
  return legalHits >= 3 && pricedLineCandidates === 0;
}
