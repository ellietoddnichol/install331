/**
 * Deterministic rules to pull quantity, unit, and clean descriptions from a single text line
 * (PDF takeoffs, pasted schedules). Goal: fill fields without LLM noise.
 */
import { intakeAsText } from '../metadataExtractorService.ts';

const LEADING_JUNK = /^[\s•\-\*·–—‣▪►]+/;

/** Uppercase UOM tokens we accept when they appear immediately after qty. */
const UNIT_AFTER_QTY = new Set([
  'EA',
  'EACH',
  'LF',
  'FT',
  'SF',
  'SY',
  'CY',
  'LS',
  'SET',
  'PAIR',
  'PR',
  'HR',
  'DAY',
  'WK',
  'BOX',
  'PKG',
  'CASE',
  'CS',
  'GAL',
  'QT',
  'SHT',
  'ROLL',
  'YD',
  'YD2',
]);

function normalizeUnitToken(raw: string): string {
  const u = raw.toUpperCase().replace(/\.$/, '');
  if (u === 'EACH') return 'EA';
  if (u === 'FT' || u === 'LFT') return 'LF';
  return u;
}

function stripLeadingJunk(line: string): string {
  return intakeAsText(line.replace(LEADING_JUNK, '').trim());
}

export type ParsedLeadingFields = {
  quantity: number | null;
  unit: string | null;
  description: string;
};

/**
 * Parse optional leading quantity and UOM, return cleaned description.
 */
export function parseLineLeadingQtyUnit(raw: string): ParsedLeadingFields {
  let line = stripLeadingJunk(raw);
  if (!line) return { quantity: null, unit: null, description: '' };

  // (2 Grab Bar 36 inch) — entire line wrapped in parens
  let m = /^\((\d+(?:\.\d+)?)\s+([^)]+)\)\s*$/.exec(line);
  if (m) {
    return { quantity: Number(m[1]), unit: null, description: stripLeadingJunk(m[2] || '') };
  }

  // (12) rest  or  (12 EA) rest
  m = /^\((\d+(?:\.\d+)?)\)\s*(?:(EA|LF|SF|EACH|FT|SY|CY|LS|SET|PAIR|PR|HR|BOX|PKG|GAL|QT|SHT|ROLL|YD)\b\s*)?(.*)$/i.exec(line);
  if (m) {
    const qty = Number(m[1]);
    const uTok = m[2]?.toUpperCase();
    const rest = stripLeadingJunk(m[3] || '');
    if (uTok && UNIT_AFTER_QTY.has(normalizeUnitToken(uTok))) {
      return { quantity: qty, unit: normalizeUnitToken(uTok), description: rest };
    }
    return { quantity: qty, unit: null, description: rest };
  }

  // Qty: 3 … / Quantity 2 EA …
  m = /^(?:qty|quantity)\s*[:\-#]?\s*(\d+(?:\.\d+)?)\s*(?:(EA|LF|SF|EACH|FT|SY|CY|LS|SET|PAIR|PR|HR|BOX|PKG|GAL|QT|SHT|ROLL)\b\s*)?(.*)$/i.exec(line);
  if (m) {
    const qty = Number(m[1]);
    const uTok = m[2]?.toUpperCase();
    const rest = stripLeadingJunk(m[3] || '');
    if (uTok && UNIT_AFTER_QTY.has(normalizeUnitToken(uTok))) {
      return { quantity: qty, unit: normalizeUnitToken(uTok), description: rest };
    }
    return { quantity: qty, unit: null, description: rest };
  }

  // N UOM rest — before generic "N rest"
  m = /^(\d+(?:\.\d+)?)\s+(EA|LF|SF|EACH|FT|SY|CY|LS|SET|PAIR|PR|HR|BOX|PKG|CASE|CS|GAL|QT|SHT|ROLL|YD)\b\s+(.*)$/i.exec(line);
  if (m) {
    return {
      quantity: Number(m[1]),
      unit: normalizeUnitToken(m[2]),
      description: stripLeadingJunk(m[3] || ''),
    };
  }

  // 2x description / 2 x description
  m = /^(\d+(?:\.\d+)?)\s*[xX]\s+(.*)$/.exec(line);
  if (m) {
    return { quantity: Number(m[1]), unit: null, description: stripLeadingJunk(m[2] || '') };
  }

  // 2 - description / 2 – description
  m = /^(\d+(?:\.\d+)?)\s*[-–—]\s+(.*)$/.exec(line);
  if (m) {
    return { quantity: Number(m[1]), unit: null, description: stripLeadingJunk(m[2] || '') };
  }

  // N word … — if second token is a unit, consume it (e.g. "4 EA" already handled; "12 LF" handled)
  m = /^(\d{1,5}(?:\.\d+)?)\s+(\S+)(?:\s+(.*))?$/.exec(line);
  if (m) {
    const qty = Number(m[1]);
    const second = m[2];
    const tail = m[3] !== undefined ? stripLeadingJunk(m[3]) : '';
    // Avoid treating years as quantities (e.g. "2024 building renovation")
    if (qty >= 1900 && qty <= 2100) {
      return { quantity: null, unit: null, description: line };
    }
    const uNorm = normalizeUnitToken(second);
    if (UNIT_AFTER_QTY.has(uNorm)) {
      return { quantity: qty, unit: uNorm, description: tail };
    }
    return { quantity: qty, unit: null, description: stripLeadingJunk(`${second} ${tail}`.trim()) };
  }

  return { quantity: null, unit: null, description: line };
}

/** Collapse whitespace; trim schedule noise. */
export function compactDescription(text: string): string {
  return intakeAsText(text).replace(/\s+/g, ' ').replace(/\s+([.,;:])\s*/g, '$1 ').trim();
}

export type LabeledMfrModel = {
  manufacturer: string | null;
  model: string | null;
  finish: string | null;
};

function extractLabeled(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const matched = text.match(pattern);
    if (matched?.[1]) return intakeAsText(matched[1]) || null;
  }
  return null;
}

const KNOWN_BRANDS =
  /\b(Bobrick|Bradley|ASI|Gamco|Frost|Hadrian|Scranton|AJW|Glynn-Johnson|Norton|LCN|IVES|Hager|McKinney|Rockwood|Trimco|Detex|Von Duprin|Corbin|Yale|Sargent|Schlage|Dorma|Stanley|Steelcraft|Curries|CEC|Baron|Ceco|Mesker|Koala|Bobrick Washroom)\b/i;

/** "Bobrick B-6806" style when brand is known */
function extractBrandModelPrefix(text: string): { manufacturer: string | null; model: string | null } {
  const t = compactDescription(text);
  const brandMatch = t.match(KNOWN_BRANDS);
  if (!brandMatch) return { manufacturer: null, model: null };
  const brand = brandMatch[1];
  const after = t.slice(t.indexOf(brandMatch[0]) + brandMatch[0].length);
  const modelMatch = after.match(/^\s*[,:]?\s*([A-Z0-9][A-Z0-9\-_/]{1,28})\b/);
  if (modelMatch) {
    return { manufacturer: brand, model: modelMatch[1] };
  }
  return { manufacturer: null, model: null };
}

/**
 * Pull manufacturer / model / finish from inline labels and common product patterns.
 */
export function extractManufacturerModelFinish(text: string): LabeledMfrModel {
  const manufacturer =
    extractLabeled(text, [
      /\b(?:mfg|mfr|manufacturer|mfgr)\s*[:\-]\s*([^,;\n]+?)(?=\s+(?:model|series|finish|brand|part|cat)\b)/i,
      /\b(?:mfg|mfr|manufacturer|mfgr)\s*[:\-]\s*([^,;\n]+)/i,
      /\bbrand\s*[:\-]\s*([^,;\n]+)/i,
    ]) || extractBrandModelPrefix(text).manufacturer;

  const model =
    extractLabeled(text, [
      /\b(?:model|mod|catalog|cat|part)\s*[#:\-]?\s*([A-Za-z0-9][A-Za-z0-9\-_/]{1,40})/i,
      /\bseries\s*[:\-]\s*([A-Za-z0-9][A-Za-z0-9\-_/]{1,32})/i,
    ]) || extractBrandModelPrefix(text).model;

  const finish =
    extractLabeled(text, [
      /\bfinish\s*[:\-]\s*([^,;\n]+)/i,
      /\bcolor\s*[:\-]\s*([^,;\n]+)/i,
      /\b(powder coat[^,;\n]{0,48})/i,
    ]);

  return {
    manufacturer: manufacturer ? compactDescription(manufacturer) : null,
    model: model ? compactDescription(model) : null,
    finish: finish ? compactDescription(finish) : null,
  };
}

/**
 * When unit column was empty but text says "per LF" / "priced LF" / "(EA)".
 */
export function inferUnitFromDescription(description: string): string | null {
  const d = compactDescription(description).toUpperCase();
  if (/\bPER\s+(LF|LINEAL\s*FT|LINEAR\s*FT)\b/.test(d) || /\b(?:priced|qty)\s+LF\b/.test(d)) return 'LF';
  if (/\bPER\s+(SF|SQ\s*FT|SQFT)\b/.test(d) || /\bSF\s+(MAT|MATERIAL|AREA)\b/.test(d)) return 'SF';
  if (/\bPER\s+EA\b/.test(d) || /\(\s*EA\s*\)\s*$/i.test(description.trim())) return 'EA';
  if (/\bPER\s+(CY|CUBIC\s*YARD)\b/.test(d)) return 'CY';
  if (/\bPER\s+(HR|HOUR)\b/.test(d)) return 'HR';
  if (/\bLUMP\s+SUM\b/.test(d) || /\bL\.?\s*S\.?\b/.test(d)) return 'LS';
  return null;
}
