import type { IntakeProjectAssumption, IntakeProjectMetadata } from '../../shared/types/intake.ts';
import {
  coerceSafeProjectName,
  isPlausibleProjectTitle,
  stripIntakeControlCharacters,
} from '../../shared/utils/intakeTextGuards.ts';
import { extractAssumptionsFromText, inferPricingBasis, mergeAssumptions } from './proposalAssistService.ts';

export { coerceSafeProjectName, isPlausibleProjectTitle, stripIntakeControlCharacters };

export function intakeAsText(value: unknown): string {
  return String(value ?? '').trim();
}

/** Cut "Project: Foo Client: Bar" → "Foo" for metadata fields. */
function clipCoappendedMetadataLabels(value: string): string {
  const t = intakeAsText(value);
  if (!t) return '';
  const parts = t.split(/\s+(?=Client\s*:|GC\s*:|Owner\s*:|Address\s*:|General\s+Contractor\s*:|Project\s*#\s*|Job\s*#\s*)/i);
  return parts[0]?.trim() || t;
}

const TAKEOFF_FAMILY_TOKENS = new Set(['GB', 'CH', 'SNV', 'SND', 'SD', 'TTD', 'HD', 'SCR', 'SC', 'SCH', 'FSS', 'LTX']);

export function normalizeComparableText(value: unknown): string {
  return intakeAsText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function tokenizeComparableText(value: unknown): string[] {
  return Array.from(new Set(normalizeComparableText(value).split(/\s+/).filter((token) => token.length > 1)));
}

export function looksLikeDateValue(value: unknown): boolean {
  const text = intakeAsText(value);
  if (!text) return false;
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(text)) return true;
  return !Number.isNaN(Date.parse(text));
}

export function normalizeDateValue(value: unknown): string {
  const text = intakeAsText(value);
  if (!looksLikeDateValue(text)) return '';
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

export function hasProjectMetadataValue(metadata: Partial<IntakeProjectMetadata>): boolean {
  return Boolean(
    metadata.projectName ||
      metadata.projectNumber ||
      metadata.bidPackage ||
      metadata.client ||
      metadata.generalContractor ||
      metadata.address ||
      metadata.bidDate ||
      metadata.proposalDate ||
      metadata.estimator
  );
}

/** Map PDF /Trailer Info dictionary fields into intake metadata (fills gaps after body-text extraction). */
export function metadataHintsFromPdfFileInfo(info: Record<string, unknown> | undefined): Partial<IntakeProjectMetadata> {
  if (!info || typeof info !== 'object') return {};
  const title = intakeAsText(info.Title);
  const author = intakeAsText(info.Author);
  const out: Partial<IntakeProjectMetadata> = {
    sourceFiles: [],
    assumptions: [],
    pricingBasis: '',
  };
  if (isPlausibleProjectTitle(title)) out.projectName = title;
  if (author && author.length > 1 && author.length < 160) out.estimator = author;
  return out;
}

export function mergeMetadataHint(left: Partial<IntakeProjectMetadata>, right: Partial<IntakeProjectMetadata>): Partial<IntakeProjectMetadata> {
  return {
    projectName: left.projectName || right.projectName || '',
    projectNumber: left.projectNumber || right.projectNumber || '',
    bidPackage: left.bidPackage || right.bidPackage || '',
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

export function detectLabeledValue(lines: string[], patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const matched = lines.find((line) => pattern.test(line));
    if (!matched) continue;
    const extracted = matched.replace(pattern, '').replace(/^[:\-\s]+/, '').trim();
    if (extracted) return extracted;
  }
  return '';
}

function isTakeoffFamilyToken(token: string): boolean {
  return TAKEOFF_FAMILY_TOKENS.has(token.toUpperCase());
}

function looksLikeTakeoffToken(token: string): boolean {
  const cleaned = token.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9/\-]+$/g, '');
  if (!cleaned) return false;
  if (/^w\/$/i.test(cleaned)) return true;
  if (isTakeoffFamilyToken(cleaned)) return true;
  if (/^\d{2,4}$/.test(cleaned)) return true;
  if (/^[A-Z]{1,5}-[A-Z0-9-]+$/.test(cleaned)) return true;
  if (/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9-]+$/.test(cleaned) && /^[A-Z0-9-]+$/.test(cleaned)) return true;
  return false;
}

function looksLikeTakeoffStartToken(token: string): boolean {
  const cleaned = token.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9/\-]+$/g, '');
  if (!cleaned) return false;
  if (isTakeoffFamilyToken(cleaned)) return true;
  if (/^[A-Z]{1,5}-[A-Z0-9-]+$/.test(cleaned)) return true;
  if (/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9-]+$/.test(cleaned) && /^[A-Z0-9-]+$/.test(cleaned)) return true;
  return false;
}

function sanitizeProjectNameCandidate(value: string): string {
  const candidate = clipCoappendedMetadataLabels(
    intakeAsText(stripIntakeControlCharacters(String(value || ''))).replace(/\s+/g, ' ').trim()
  );
  if (!candidate) return '';

  const tokens = candidate.split(/\s+/).filter(Boolean);
  if (tokens.length < 5) {
    return isPlausibleProjectTitle(candidate) ? candidate : '';
  }

  for (let index = 2; index <= tokens.length - 3; index += 1) {
    if (!looksLikeTakeoffStartToken(tokens[index])) continue;
    const window = tokens.slice(index, Math.min(tokens.length, index + 8));
    const takeoffLikeCount = window.filter(looksLikeTakeoffToken).length;
    const naturalWordCount = window.filter((token) => /[a-z]/.test(token) && !/^w\/$/i.test(token)).length;
    if (takeoffLikeCount < 4 || naturalWordCount > 2) continue;

    const prefix = tokens.slice(0, index).join(' ').trim();
    if (tokenizeComparableText(prefix).length >= 2 && isPlausibleProjectTitle(prefix)) {
      return prefix;
    }
  }

  return isPlausibleProjectTitle(candidate) ? candidate : '';
}

export function detectAddressFromLines(lines: string[]): string {
  const labeled = lines.find((line) => /^(address|site|location)\s*[:\-]/i.test(line));
  if (labeled) return labeled.replace(/^(address|site|location)\s*[:\-]/i, '').trim();

  const addressLike = lines.find((line) => /\b\d{1,6}\s+[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+){0,5}\s(?:st|street|rd|road|ave|avenue|blvd|drive|dr|ln|lane|way|ct|court|pl|place|pkwy|parkway)\b/i.test(line));
  return addressLike || '';
}

export function detectProjectNameFromLines(lines: string[]): string {
  const labeled = detectLabeledValue(lines, [/^project(?:\s+name)?\s*[:\-]?/i, /^job(?:\s+name)?\s*[:\-]?/i]);
  if (labeled) return sanitizeProjectNameCandidate(labeled);

  return sanitizeProjectNameCandidate(
    lines.slice(0, 18).find((line) => {
      const text = intakeAsText(line);
      if (text.length < 6 || text.length > 96) return false;
      if (!isPlausibleProjectTitle(text)) return false;
      if (/^(client|gc|general contractor|address|location|site|date|bid date|project number|job number|scope of work|proposal|invitation to bid|section|division)\b/i.test(text)) return false;
      if (looksLikeDateValue(text) || /^\d+$/.test(text)) return false;
      return tokenizeComparableText(text).length >= 2;
    }) || ''
  );
}

export function extractMetadataFromText(text: string): Partial<IntakeProjectMetadata> {
  const cleaned = stripIntakeControlCharacters(String(text || ''));
  const lines = cleaned
    .split(/\r?\n|\f/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 120);
  const projectNumber = detectLabeledValue(lines, [/^project\s*(?:#|number)\s*[:\-]?/i, /^job\s*(?:#|number)\s*[:\-]?/i, /^bid\s*(?:package|pkg)\s*[:\-]?/i]);
  const bidPackage = detectLabeledValue(lines, [/^bid\s*(?:package|pkg)\s*[:\-]?/i, /^package\s*[:\-]?/i]);
  return {
    projectName: detectProjectNameFromLines(lines),
    projectNumber,
    bidPackage: bidPackage || projectNumber,
    client: detectLabeledValue(lines, [/^client\s*[:\-]?/i, /^owner\s*[:\-]?/i]),
    generalContractor: detectLabeledValue(lines, [/^gc\s*[:\-]?/i, /^general contractor\s*[:\-]?/i]),
    address: detectAddressFromLines(lines),
    bidDate: normalizeDateValue(detectLabeledValue(lines, [/^bid\s*date\s*[:\-]?/i, /^proposal\s*date\s*[:\-]?/i, /^due\s*date\s*[:\-]?/i, /^date\s*[:\-]?/i])),
    proposalDate: normalizeDateValue(detectLabeledValue(lines, [/^proposal\s*date\s*[:\-]?/i, /^date\s*[:\-]?/i])),
    estimator: detectLabeledValue(lines, [/^estimator\s*[:\-]?/i, /^prepared by\s*[:\-]?/i]),
    sourceFiles: [],
    assumptions: extractAssumptionsFromText(cleaned),
    pricingBasis: inferPricingBasis(cleaned, []),
  };
}

export function extractMetadataFromCells(cells: string[]): Partial<IntakeProjectMetadata> {
  let output: Partial<IntakeProjectMetadata> = {
    sourceFiles: [],
    assumptions: [],
    pricingBasis: '',
  };
  const compactCells = cells.map((cell) => intakeAsText(cell)).filter(Boolean);

  const assignValue = (label: string, value: string) => {
    if (!value) return;
    if (/^(project|project name|job|job name)$/.test(label)) {
      if (!output.projectName && isPlausibleProjectTitle(value)) output.projectName = value;
      return;
    }
    else if (/^(project number|project no|job number)$/.test(label)) output.projectNumber = output.projectNumber || value;
    else if (/^(bid package|package|pkg)$/.test(label)) {
      output.bidPackage = output.bidPackage || value;
      output.projectNumber = output.projectNumber || value;
    } else if (/^(client|owner)$/.test(label)) output.client = output.client || value;
    else if (/^(gc|general contractor)$/.test(label)) output.generalContractor = output.generalContractor || value;
    else if (/^(address|site address|site|location)$/.test(label)) output.address = output.address || value;
    else if (/^(bid date|due date|date)$/.test(label)) output.bidDate = output.bidDate || normalizeDateValue(value);
    else if (/^(proposal date)$/.test(label)) output.proposalDate = output.proposalDate || normalizeDateValue(value);
    else if (/^(estimator|prepared by)$/.test(label)) output.estimator = output.estimator || value;
  };

  for (let index = 0; index < compactCells.length; index += 1) {
    const label = normalizeComparableText(compactCells[index]);
    const nextValue = intakeAsText(compactCells[index + 1]);
    if (label && nextValue) assignValue(label, nextValue);

    const colonMatch = compactCells[index].match(/^(project(?:\s+name)?|job(?:\s+name)?|project\s*(?:#|number)?|job\s*(?:#|number)?|bid\s*(?:package|pkg)?|client|owner|gc|general contractor|address|site address|location|site|bid date|proposal date|due date|date|estimator|prepared by)\s*[:\-]\s*(.+)$/i);
    if (colonMatch) assignValue(normalizeComparableText(colonMatch[1]), intakeAsText(colonMatch[2]));
  }

  const lineText = compactCells.join(' ');
  const lineLooksMetadata = /\b(project|job|client|owner|gc|general contractor|address|location|site|bid date|proposal date|due date|estimator|prepared by|package)\b/i.test(lineText);
  if (!hasProjectMetadataValue(output) && (compactCells.length <= 2 || lineLooksMetadata)) {
    output = mergeMetadataHint(output, extractMetadataFromText(lineText));
  }

  return output;
}

export function mergeResolvedMetadata(primary: Partial<IntakeProjectMetadata>, secondary: Partial<IntakeProjectMetadata>, sources: string[]): IntakeProjectMetadata {
  const primaryName = sanitizeProjectNameCandidate(primary.projectName || '');
  const secondaryName = sanitizeProjectNameCandidate(secondary.projectName || '');
  const projectName = coerceSafeProjectName(primaryName || secondaryName || '', 'Imported Project');
  const projectNumber = primary.projectNumber || secondary.projectNumber || primary.bidPackage || secondary.bidPackage || '';
  const bidPackage = primary.bidPackage || secondary.bidPackage || projectNumber || '';
  const client = primary.client || secondary.client || '';
  const generalContractor = primary.generalContractor || secondary.generalContractor || '';
  const address = primary.address || secondary.address || '';
  const bidDate = primary.bidDate || secondary.bidDate || '';
  const proposalDate = primary.proposalDate || secondary.proposalDate || '';
  const estimator = primary.estimator || secondary.estimator || '';
  const sourceFiles = Array.from(new Set([...(primary.sourceFiles || []), ...(secondary.sourceFiles || [])].filter(Boolean)));
  const assumptions = mergeAssumptions(primary.assumptions || [], secondary.assumptions || []);
  const pricingBasis = primary.pricingBasis || secondary.pricingBasis || '';
  const filledCount = [projectName, projectNumber, bidPackage, client, generalContractor, address, bidDate, proposalDate, estimator].filter(Boolean).length;

  return {
    projectName,
    projectNumber,
    bidPackage,
    client,
    generalContractor,
    address,
    bidDate,
    proposalDate,
    estimator,
    sourceFiles,
    assumptions,
    pricingBasis,
    confidence: Number(Math.min(1, 0.2 + (filledCount * 0.14)).toFixed(2)),
    sources: Array.from(new Set(sources.filter(Boolean))),
  };
}

export function mergeMetadataAssumptions(primary: IntakeProjectAssumption[], secondary: IntakeProjectAssumption[]): IntakeProjectAssumption[] {
  return mergeAssumptions(primary, secondary);
}