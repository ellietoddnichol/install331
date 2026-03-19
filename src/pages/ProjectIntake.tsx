import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileUp, FolderInput, PlusCircle, Save, Search, Upload, WandSparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { PricingMode, ProjectJobConditions, ProjectRecord, RoomRecord, SettingsRecord, TakeoffLineRecord } from '../shared/types/estimator';
import { IntakeParseResult, IntakeReviewLine } from '../shared/types/intake';
import { CatalogItem } from '../types';
import {
  createDefaultProjectJobConditions,
  normalizeProjectJobConditions,
  recommendDeliveryPlan,
  recommendedPhasedWorkMultiplier,
} from '../shared/utils/jobConditions';
import { collectPastProjectDateErrors, mapProjectDateErrors } from '../shared/utils/projectDateValidation';
import { OFFICE_ADDRESS, getDistanceInMiles } from '../utils/geo';
import { formatNumberSafe } from '../utils/numberFormat';

type CreationMode = 'blank' | 'takeoff' | 'document' | 'template';
type IntakeStep = 1 | 2 | 3 | 4 | 5;

interface ParserReviewSummary {
  status: string | null;
  fileType: string | null;
  overallConfidence: number | null;
  recommendedAction: string | null;
  parserStrategy: string | null;
  validationErrors: string[];
  validationWarnings: string[];
  parseWarnings: string[];
  sourceSummary: IntakeParseResult['sourceSummary'] | null;
}

interface WarningGroupSummary {
  key: string;
  label: string;
  count: number;
  tone: 'danger' | 'warning' | 'info';
  examples: string[];
}

interface LineSuggestion {
  id: string;
  include: boolean;
  roomName: string;
  rawText: string;
  itemName: string;
  description: string;
  qty: number;
  unit: string;
  category: string | null;
  sourceReference: string;
  sku: string | null;
  catalogItemId: string | null;
  materialCost: number;
  laborMinutes: number;
  notes: string;
  laborIncluded: boolean | null;
  materialIncluded: boolean | null;
  matched: boolean;
  matchConfidence?: 'strong' | 'possible' | 'none';
  matchReason?: string;
}

type SourceKind =
  | 'spreadsheet-row'
  | 'spreadsheet-matrix'
  | 'spreadsheet-mixed'
  | 'pdf-document'
  | 'text-document'
  | 'semi-structured-text';

interface ParsedImportLine {
  projectName: string;
  projectNumber?: string;
  client?: string;
  address?: string;
  bidDate?: string;
  category: string;
  itemCode: string;
  itemName: string;
  description: string;
  qty: number;
  unit: string;
  laborIncluded: boolean | null;
  materialIncluded: boolean | null;
  notes: string;
  roomName: string;
  sourceReference: string;
}

interface InferredColumnMap {
  project: number | null;
  projectNumber: number | null;
  client: number | null;
  address: number | null;
  bidDate: number | null;
  category: number | null;
  itemCode: number | null;
  item: number | null;
  description: number | null;
  qty: number | null;
  unit: number | null;
  laborIncluded: number | null;
  materialIncluded: number | null;
  notes: number | null;
  room: number | null;
}

interface StructuredSpreadsheetResult {
  rows: ParsedImportLine[];
  sourceKind: SourceKind;
  dominantProjectName: string;
  dominantProjectNumber: string;
  dominantClient: string;
  dominantAddress: string;
  dominantBidDate: string;
  hasRoomColumn: boolean;
}

interface GeminiIntakeLine {
  roomArea: string;
  category: string;
  itemCode: string;
  itemName: string;
  description: string;
  quantity: number;
  unit: string;
  notes: string;
}

interface GeminiIntakeResult {
  projectName: string;
  projectNumber: string;
  client: string;
  address: string;
  bidDate: string;
  rooms: string[];
  parsedLines: GeminiIntakeLine[];
  warnings: string[];
}

interface GeminiQuality {
  uncertain: boolean;
  warnings: string[];
}

interface NewCatalogDraft {
  description: string;
  sku: string;
  category: string;
  unit: CatalogItem['uom'];
  materialCost: number;
  laborMinutes: number;
}

interface RoomSuggestion {
  id: string;
  include: boolean;
  roomName: string;
}

function normalizeRoomName(roomName: string): string {
  return roomName.trim() || 'General';
}

function parseRoomNamesInput(value: string): string[] {
  return Array.from(new Set(
    value
      .split(/\r?\n|,/)
      .map((entry) => normalizeRoomName(entry))
      .filter(Boolean)
  ));
}

function makeId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function parseQtyAndText(line: string): { qty: number; text: string } {
  const qtyMatch = line.match(/^(\d+(?:\.\d+)?)\s*[xX-]?\s+(.*)$/);
  if (!qtyMatch) return { qty: 1, text: line.trim() };
  return { qty: Number(qtyMatch[1]) || 1, text: (qtyMatch[2] || '').trim() };
}

function normalizeComparableText(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokenizeText(value: string): string[] {
  return Array.from(new Set(
    normalizeComparableText(value)
      .split(/\s+/)
      .filter((token) => token.length > 1)
  ));
}

function looksLikeDate(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) return false;
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(normalized)) return true;
  return !Number.isNaN(Date.parse(normalized));
}

function normalizeDateString(value: string | null | undefined): string | null {
  const raw = String(value || '').trim();
  if (!raw || !looksLikeDate(raw)) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function countSharedTokens(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) return 0;
  const rightSet = new Set(right);
  return left.reduce((count, token) => count + (rightSet.has(token) ? 1 : 0), 0);
}

function scoreTokenOverlap(query: string, candidate: string): number {
  const queryTokens = tokenizeText(query);
  const candidateTokens = tokenizeText(candidate);
  if (queryTokens.length === 0 || candidateTokens.length === 0) return 0;

  const shared = countSharedTokens(queryTokens, candidateTokens);
  if (shared === 0) return 0;

  return shared / Math.max(queryTokens.length, candidateTokens.length);
}

function mergeSourceNote(currentNotes: string | null | undefined, sourceLabel: string): string {
  const sourceNote = `Source file: ${sourceLabel}`;
  const existing = String(currentNotes || '').trim();
  if (!existing) return sourceNote;
  if (existing.includes(sourceNote)) return existing;
  return `${sourceNote}; ${existing}`;
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function findColumnIndex(headers: string[], aliases: string[]): number | null {
  for (let i = 0; i < headers.length; i += 1) {
    const header = headers[i];
    if (!header) continue;
    if (aliases.some((alias) => header === alias || header.includes(alias))) {
      return i;
    }
  }
  return null;
}

function detectSpreadsheetColumns(headers: string[]): InferredColumnMap {
  const normalized = headers.map((header) => normalizeHeader(String(header || '')));

  return {
    project: findColumnIndex(normalized, ['project', 'project name', 'job']),
    projectNumber: findColumnIndex(normalized, ['project number', 'job number', 'bid package', 'package']),
    client: findColumnIndex(normalized, ['client', 'gc', 'general contractor', 'owner']),
    address: findColumnIndex(normalized, ['address', 'location', 'site']),
    bidDate: findColumnIndex(normalized, ['bid date', 'proposal date', 'due date', 'date']),
    category: findColumnIndex(normalized, ['scope category', 'category', 'scope']),
    itemCode: findColumnIndex(normalized, ['item code', 'sku', 'code', 'search key']),
    item: findColumnIndex(normalized, ['item', 'item name', 'scope item']),
    description: findColumnIndex(normalized, ['description', 'desc', 'work description']),
    qty: findColumnIndex(normalized, ['quantity', 'qty']),
    unit: findColumnIndex(normalized, ['unit', 'uom']),
    laborIncluded: findColumnIndex(normalized, ['labor included', 'labor']),
    materialIncluded: findColumnIndex(normalized, ['material included', 'material']),
    notes: findColumnIndex(normalized, ['notes', 'remarks', 'comment']),
    room: findColumnIndex(normalized, ['room', 'area', 'location', 'zone']),
  };
}

function parseNumber(value: unknown, fallback = 1): number {
  const asNumber = Number(String(value ?? '').replace(/,/g, '').trim());
  if (!Number.isFinite(asNumber) || asNumber <= 0) return fallback;
  return asNumber;
}

function parseFlag(value: unknown): boolean | null {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return null;
  if (['yes', 'y', 'true', '1', 'included', 'inc'].includes(normalized)) return true;
  if (['no', 'n', 'false', '0', 'excluded', 'excl'].includes(normalized)) return false;
  return null;
}

function mostCommonValue(values: string[]): string {
  const bucket = new Map<string, number>();
  values.forEach((value) => {
    if (!value) return;
    bucket.set(value, (bucket.get(value) || 0) + 1);
  });

  let winner = '';
  let count = 0;
  bucket.forEach((currentCount, value) => {
    if (currentCount > count) {
      winner = value;
      count = currentCount;
    }
  });

  return winner;
}

function inferSpreadsheetSourceKind(rows: string[][], mapping: InferredColumnMap): SourceKind {
  const sample = rows.slice(1, 26);
  const numericColumns = new Map<number, number>();

  sample.forEach((row) => {
    row.forEach((cell, index) => {
      if (cell && /^\d+(?:\.\d+)?$/.test(cell.replace(/,/g, ''))) {
        numericColumns.set(index, (numericColumns.get(index) || 0) + 1);
      }
    });
  });

  const qtyMapped = mapping.qty !== null;
  const numericHeavyColumns = Array.from(numericColumns.values()).filter((count) => count >= 4).length;

  if (!qtyMapped && mapping.room !== null && numericHeavyColumns >= 2) {
    return 'spreadsheet-matrix';
  }

  if (qtyMapped && (mapping.item !== null || mapping.description !== null)) {
    return 'spreadsheet-row';
  }

  return 'spreadsheet-mixed';
}

function parseMatrixSpreadsheetRows(rows: string[][], mapping: InferredColumnMap, sourceReference: string): ParsedImportLine[] {
  const headers = rows[0];
  const roomCol = mapping.room ?? 0;
  const firstDataCol = Math.max(roomCol + 1, 1);
  const parsed: ParsedImportLine[] = [];

  for (let r = 1; r < rows.length; r += 1) {
    const row = rows[r];
    const roomName = row[roomCol] || 'General Scope';
    if (!roomName) continue;

    for (let c = firstDataCol; c < row.length; c += 1) {
      const value = row[c];
      const qty = parseNumber(value, 0);
      if (qty <= 0) continue;
      const itemName = headers[c] || `Column ${c + 1}`;

      parsed.push({
        projectName: '',
        category: '',
        itemCode: '',
        itemName,
        description: itemName,
        qty,
        unit: 'EA',
        laborIncluded: null,
        materialIncluded: null,
        notes: '',
        roomName,
        sourceReference,
      });
    }
  }

  return parsed;
}

function parseMixedSpreadsheetRows(rows: string[][], sourceReference: string): ParsedImportLine[] {
  const parsed: ParsedImportLine[] = [];
  let currentCategory = '';

  rows.slice(1).forEach((row) => {
    const line = row.filter(Boolean).join(' ').trim();
    if (!line) return;

    if (row.filter(Boolean).length === 1 && line.length < 48) {
      currentCategory = line;
      return;
    }

    const { qty, text } = parseQtyAndText(line);
    parsed.push({
      projectName: '',
      category: currentCategory,
      itemCode: '',
      itemName: text,
      description: text,
      qty,
      unit: 'EA',
      laborIncluded: null,
      materialIncluded: null,
      notes: '',
      roomName: 'General Scope',
      sourceReference,
    });
  });

  return parsed;
}

function parseStructuredSpreadsheetRows(rows: Array<Array<string | number | boolean | null | undefined>>, sourceReference: string): StructuredSpreadsheetResult | null {
  const nonEmptyRows = rows
    .map((row) => row.map((cell) => String(cell ?? '').trim()))
    .filter((row) => row.some((cell) => cell.length > 0));

  if (nonEmptyRows.length < 2) return null;

  const headers = nonEmptyRows[0];
  const mapping = detectSpreadsheetColumns(headers);

  const sourceKind = inferSpreadsheetSourceKind(nonEmptyRows, mapping);

  const looksStructured =
    sourceKind === 'spreadsheet-matrix' ||
    sourceKind === 'spreadsheet-row' ||
    sourceKind === 'spreadsheet-mixed';

  if (!looksStructured) return null;

  if (sourceKind === 'spreadsheet-matrix') {
    const matrixRows = parseMatrixSpreadsheetRows(nonEmptyRows, mapping, sourceReference);
    if (!matrixRows.length) return null;
    return {
      rows: matrixRows,
      sourceKind,
      dominantProjectName: '',
      dominantProjectNumber: '',
      dominantClient: '',
      dominantAddress: '',
      dominantBidDate: '',
      hasRoomColumn: mapping.room !== null,
    };
  }

  if (sourceKind === 'spreadsheet-mixed') {
    const mixedRows = parseMixedSpreadsheetRows(nonEmptyRows, sourceReference);
    if (!mixedRows.length) return null;
    return {
      rows: mixedRows,
      sourceKind,
      dominantProjectName: '',
      dominantProjectNumber: '',
      dominantClient: '',
      dominantAddress: '',
      dominantBidDate: '',
      hasRoomColumn: false,
    };
  }

  const parsedRows: ParsedImportLine[] = [];

  for (let i = 1; i < nonEmptyRows.length; i += 1) {
    const row = nonEmptyRows[i];

    const projectName = mapping.project !== null ? String(row[mapping.project] || '').trim() : '';
    const projectNumber = mapping.projectNumber !== null ? String(row[mapping.projectNumber] || '').trim() : '';
    const client = mapping.client !== null ? String(row[mapping.client] || '').trim() : '';
    const address = mapping.address !== null ? String(row[mapping.address] || '').trim() : '';
    const bidDate = mapping.bidDate !== null ? String(row[mapping.bidDate] || '').trim() : '';
    const category = mapping.category !== null ? String(row[mapping.category] || '').trim() : '';
    const itemCode = mapping.itemCode !== null ? String(row[mapping.itemCode] || '').trim() : '';
    const itemName = mapping.item !== null ? String(row[mapping.item] || '').trim() : '';
    const description = mapping.description !== null ? String(row[mapping.description] || '').trim() : '';
    const qty = mapping.qty !== null ? parseNumber(row[mapping.qty], 1) : 1;
    const unit = mapping.unit !== null ? String(row[mapping.unit] || '').trim() || 'EA' : 'EA';
    const notes = mapping.notes !== null ? String(row[mapping.notes] || '').trim() : '';
    const roomName = mapping.room !== null ? String(row[mapping.room] || '').trim() : '';

    if (!itemName && !description && !category) continue;

    parsedRows.push({
      projectName,
      projectNumber,
      client,
      address,
      bidDate,
      category,
      itemCode,
      itemName,
      description,
      qty,
      unit,
      laborIncluded: mapping.laborIncluded !== null ? parseFlag(row[mapping.laborIncluded]) : null,
      materialIncluded: mapping.materialIncluded !== null ? parseFlag(row[mapping.materialIncluded]) : null,
      notes,
      roomName,
      sourceReference,
    });
  }

  if (parsedRows.length === 0) return null;

  return {
    rows: parsedRows,
    sourceKind,
    dominantProjectName: mostCommonValue(parsedRows.map((line) => line.projectName)),
    dominantProjectNumber: mostCommonValue(parsedRows.map((line) => line.projectNumber || '')),
    dominantClient: mostCommonValue(parsedRows.map((line) => line.client || '')),
    dominantAddress: mostCommonValue(parsedRows.map((line) => line.address || '')),
    dominantBidDate: mostCommonValue(parsedRows.map((line) => normalizeDateString(line.bidDate) || '')),
    hasRoomColumn: mapping.room !== null,
  };
}

function parseDocumentMetadata(text: string): Partial<ProjectRecord> {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const findValue = (pattern: RegExp): string | null => {
    const matched = lines.find((line) => pattern.test(line));
    if (!matched) return null;
    const colonMatch = matched.match(/^[^:]{1,40}:\s*(.+)$/);
    if (colonMatch) return colonMatch[1].trim() || null;
    const dashMatch = matched.match(/^[^-]{1,40}-\s*(.+)$/);
    if (dashMatch) return dashMatch[1].trim() || null;
    return null;
  };

  const inferredProjectLine = lines
    .slice(0, 16)
    .find((line) => {
      if (line.length < 6 || line.length > 96) return false;
      if (/^(client|gc|general contractor|address|location|site|date|bid date|project number|job number|scope of work|proposal|invitation to bid)\b/i.test(line)) return false;
      if (/^(section|division)\b/i.test(line)) return false;
      if (looksLikeDate(line) || /^\d+$/.test(line)) return false;
      return tokenizeText(line).length >= 2;
    }) || null;

  return {
    projectName: findValue(/project\s*name|job\s*name|project\b/i) ?? inferredProjectLine ?? 'Imported Project',
    projectNumber: findValue(/project\s*#|project\s*number|bid\s*package/i) ?? null,
    clientName: findValue(/client|gc|general\s*contractor/i) ?? null,
    address: findValue(/address|location|site/i) ?? null,
    bidDate: normalizeDateString(findValue(/bid\s*date|proposal\s*date|due\s*date|date/i)),
  };
}

function detectRoomsFromText(text: string): string[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const roomLines = lines
    .filter((line) => /^(room|area|zone)\s*[:\-]/i.test(line))
    .map((line) => line.replace(/^(room|area|zone)\s*[:\-]/i, '').trim())
    .filter(Boolean);

  if (roomLines.length > 0) {
    return Array.from(new Set(roomLines));
  }

  return [];
}

function detectScopeLinesFromText(text: string): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^(project|client|gc|address|date|room|area|zone)\s*[:\-]/i.test(line));

  return lines.slice(0, 200);
}

function parseRawTextLinesToRows(lines: string[], sourceReference: string): ParsedImportLine[] {
  return lines
    .map((line) => line.trim())
    .filter((line) => line.length > 2)
    .filter((line) => !/^(section|clarifications|exclusions|terms|inclusions?)\b/i.test(line))
    .map((line) => {
      const { qty, text } = parseQtyAndText(line);
      const normalizedText = text || line;
      return {
        projectName: '',
        category: '',
        itemCode: '',
        itemName: normalizedText,
        description: normalizedText,
        qty,
        unit: 'EA',
        laborIncluded: null,
        materialIncluded: null,
        notes: '',
        roomName: '',
        sourceReference,
      };
    });
}

function classifyUploadedFile(file: File, extractedText: string): SourceKind {
  const lower = file.name.toLowerCase();
  const mime = (file.type || '').toLowerCase();
  const sample = extractedText.slice(0, 6000).toLowerCase();

  if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.csv') || mime.includes('spreadsheet') || mime.includes('csv')) {
    return 'spreadsheet-row';
  }

  if (lower.endsWith('.pdf') || mime.includes('pdf')) {
    if (/(proposal|invitation|request for bid|rfp|scope of work)/i.test(sample)) {
      return 'pdf-document';
    }
    return 'semi-structured-text';
  }

  if (/(scope|bid|project|estimate)/i.test(sample)) {
    return 'text-document';
  }

  return 'semi-structured-text';
}

function parseAdaptiveTextDocument(text: string, sourceReference: string): { metadata: Partial<ProjectRecord>; lines: ParsedImportLine[]; kind: SourceKind } {
  const metadata = parseDocumentMetadata(text);
  const rawLines = detectScopeLinesFromText(text);
  const lines = parseRawTextLinesToRows(rawLines, sourceReference);

  const kind: SourceKind = /\.pdf$/i.test(sourceReference) ? 'pdf-document' : 'text-document';
  return { metadata, lines, kind };
}

function evaluateGeminiQuality(result: GeminiIntakeResult): GeminiQuality {
  const warnings = [...(result.warnings || [])];
  const parsedLines = Array.isArray(result.parsedLines) ? result.parsedLines : [];

  if (parsedLines.length === 0) {
    warnings.push('Gemini returned no structured lines.');
  }

  const sparseLines = parsedLines.filter((line) => {
    const hasName = String(line.itemName || '').trim().length > 0;
    const hasDescription = String(line.description || '').trim().length > 0;
    const hasQty = Number.isFinite(Number(line.quantity)) && Number(line.quantity) > 0;
    return !(hasName || hasDescription) || !hasQty;
  }).length;

  if (sparseLines > 0) {
    warnings.push(`${sparseLines} extracted line(s) are incomplete.`);
  }

  return {
    uncertain: warnings.length > 0,
    warnings,
  };
}

function areSpreadsheetRowsAligned(localRow: ParsedImportLine, geminiRow: GeminiIntakeLine): boolean {
  const localQty = Number(localRow.qty);
  const geminiQty = Number(geminiRow.quantity);
  if (Number.isFinite(localQty) && Number.isFinite(geminiQty) && Math.abs(localQty - geminiQty) > 0.0001) {
    return false;
  }

  const localCode = normalizeComparableText(localRow.itemCode);
  const geminiCode = normalizeComparableText(geminiRow.itemCode);
  if (localCode && geminiCode) {
    return localCode === geminiCode;
  }

  const localIdentity = normalizeComparableText(localRow.itemName || localRow.description);
  const geminiIdentity = normalizeComparableText(geminiRow.itemName || geminiRow.description);
  if (!localIdentity || !geminiIdentity) {
    return false;
  }

  return localIdentity.includes(geminiIdentity) || geminiIdentity.includes(localIdentity);
}

function mergeSpreadsheetNotes(existing: string, enriched: string): string {
  const a = String(existing || '').trim();
  const b = String(enriched || '').trim();
  if (!a) return b;
  if (!b) return a;
  if (a.includes(b) || b.includes(a)) return a.length >= b.length ? a : b;
  return `${a} | ${b}`;
}

function buildGeminiFallbackWarning(error: unknown, mode: 'spreadsheet' | 'document'): string {
  const raw = error instanceof Error ? error.message : String(error || '');
  const normalized = raw.toLowerCase();

  if (normalized.includes('gemini_api_key') && normalized.includes('missing')) {
    return mode === 'spreadsheet'
      ? 'Spreadsheet parsed locally. AI enrichment skipped because GEMINI_API_KEY/GOOGLE_GEMINI_API_KEY is not configured on the server.'
      : 'Gemini extraction skipped because GEMINI_API_KEY/GOOGLE_GEMINI_API_KEY is not configured on the server. Raw lines were preserved for manual review.';
  }

  return mode === 'spreadsheet'
    ? 'Spreadsheet parsed locally. AI enrichment was unavailable, so deterministic parsing was used.'
    : 'Gemini extraction was unavailable. Raw lines were preserved for manual review.';
}

async function extractTextFromUploadedTakeoffFile(file: File): Promise<string> {
  const fileName = file.name.toLowerCase();

  if (fileName.endsWith('.csv') || fileName.endsWith('.txt')) {
    return file.text();
  }

  if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
    const xlsx = await import('xlsx');
    const buffer = await file.arrayBuffer();
    const workbook = xlsx.read(buffer, { type: 'array' });
    const chunks: string[] = [];

    workbook.SheetNames.forEach((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      const rows = xlsx.utils.sheet_to_json<Array<string | number>>(sheet, { header: 1 });
      rows.forEach((row) => {
        const line = (row || []).map((cell) => String(cell ?? '').trim()).filter(Boolean).join(' ');
        if (line) chunks.push(line);
      });
    });

    return chunks.join('\n');
  }

  if (fileName.endsWith('.pdf')) {
    const buffer = await file.arrayBuffer();
    const asText = new TextDecoder('latin1').decode(buffer);
    const matches = asText.match(/\(([^\)]{2,})\)/g) || [];
    const extracted = matches
      .map((token) => token.slice(1, -1))
      .map((token) => token.replace(/\\[rn]/g, ' '))
      .join('\n');

    return extracted || asText;
  }

  return file.text();
}

async function toBase64Payload(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function isLikelyBinaryBuffer(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer.slice(0, Math.min(buffer.byteLength, 4096)));
  if (bytes.length === 0) return false;

  let suspicious = 0;
  for (const b of bytes) {
    if (b === 0) return true;
    if (b < 7 || (b > 13 && b < 32)) suspicious += 1;
  }

  return suspicious / bytes.length > 0.08;
}

function geminiLinesToParsedRows(lines: GeminiIntakeLine[], sourceReference: string): ParsedImportLine[] {
  return lines.map((line) => ({
    projectName: '',
    category: line.category || '',
    itemCode: line.itemCode || '',
    itemName: line.itemName || line.description || '',
    description: line.description || line.itemName || '',
    qty: Number.isFinite(Number(line.quantity)) && Number(line.quantity) > 0 ? Number(line.quantity) : 1,
    unit: line.unit || 'EA',
    laborIncluded: null,
    materialIncluded: null,
    notes: line.notes || '',
    roomName: line.roomArea || 'General Scope',
    sourceReference,
  }));
}

function suggestCatalogMatch(input: { itemName?: string; category?: string | null; description?: string; rawText?: string }, catalog: CatalogItem[]): CatalogItem | null {
  const itemName = String(input.itemName || '').trim();
  const category = String(input.category || '').trim();
  const description = String(input.description || '').trim();
  const raw = String(input.rawText || '').trim();
  const normalized = normalizeComparableText(`${itemName} ${description} ${category} ${raw}`);

  if (!normalized) return null;

  const bySku = catalog.find((candidate) => {
    const sku = normalizeComparableText(candidate.sku);
    return sku && normalized.includes(sku);
  });
  if (bySku) return bySku;

  let best: CatalogItem | null = null;
  let bestScore = 0;

  for (const candidate of catalog) {
    const candidateSearch = [
      candidate.sku,
      candidate.description,
      candidate.category,
      candidate.subcategory,
      candidate.family,
      candidate.manufacturer,
      candidate.model,
      candidate.notes,
      ...(candidate.tags || []),
    ].filter(Boolean).join(' ');

    const exactDescriptionBoost = normalizeComparableText(candidate.description) === normalizeComparableText(description || itemName) ? 8 : 0;
    const itemOverlap = scoreTokenOverlap(`${itemName} ${description}`, candidate.description);
    const categoryOverlap = scoreTokenOverlap(category, `${candidate.category} ${candidate.subcategory || ''} ${candidate.family || ''}`);
    const searchOverlap = scoreTokenOverlap(`${itemName} ${description} ${raw}`, candidateSearch);
    const manufacturerModelBoost = scoreTokenOverlap(raw, `${candidate.manufacturer || ''} ${candidate.model || ''}`) > 0.5 ? 2 : 0;
    const score = exactDescriptionBoost + (itemOverlap * 8) + (categoryOverlap * 3) + (searchOverlap * 5) + manufacturerModelBoost;

    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return bestScore >= 4.5 ? best : null;
}

function dedupeSuggestions(lines: LineSuggestion[]): LineSuggestion[] {
  const bucket = new Map<string, LineSuggestion>();

  for (const line of lines) {
    const key = `${normalizeRoomName(line.roomName)}|${line.description.toLowerCase()}|${line.sku || ''}`;
    if (!bucket.has(key)) {
      bucket.set(key, { ...line });
      continue;
    }

    const existing = bucket.get(key)!;
    existing.qty += line.qty;
    existing.include = existing.include || line.include;
  }

  return Array.from(bucket.values());
}

function mapIntakeSourceKind(sourceKind: IntakeParseResult['sourceKind']): SourceKind {
  if (sourceKind === 'spreadsheet-unstructured') return 'spreadsheet-mixed';
  return sourceKind;
}

function buildIntakeLineSuggestion(line: IntakeReviewLine, fallbackSource: string): LineSuggestion {
  const preferredMatch = line.catalogMatch ?? line.suggestedMatch;
  const notes = [line.notes, ...line.warnings].filter(Boolean).join(' | ');

  return {
    id: makeId('line-suggest'),
    include: true,
    roomName: normalizeRoomName(line.roomName || 'General'),
    rawText: line.description || line.itemName,
    itemName: line.itemName || line.description,
    description: preferredMatch?.description || line.description || line.itemName,
    qty: Number(line.quantity) || 1,
    unit: line.unit || preferredMatch?.unit || 'EA',
    category: line.category || preferredMatch?.category || null,
    sourceReference: line.sourceReference || fallbackSource,
    sku: preferredMatch?.sku || null,
    catalogItemId: preferredMatch?.catalogItemId || null,
    materialCost: preferredMatch?.materialCost || 0,
    laborMinutes: preferredMatch?.laborMinutes || 0,
    notes,
    laborIncluded: line.laborIncluded,
    materialIncluded: line.materialIncluded,
    matched: !!preferredMatch,
    matchConfidence: preferredMatch?.confidence || 'none',
    matchReason: preferredMatch?.reason || '',
  };
}

function buildIntakeParsedImportLine(line: IntakeReviewLine, fallbackSource: string): ParsedImportLine {
  return {
    projectName: '',
    projectNumber: '',
    client: '',
    address: '',
    bidDate: '',
    category: line.category,
    itemCode: line.itemCode,
    itemName: line.itemName || line.description,
    description: line.description || line.itemName,
    qty: Number(line.quantity) || 1,
    unit: line.unit || 'EA',
    laborIncluded: line.laborIncluded,
    materialIncluded: line.materialIncluded,
    notes: [line.notes, ...line.warnings].filter(Boolean).join(' | '),
    roomName: normalizeRoomName(line.roomName || 'General'),
    sourceReference: line.sourceReference || fallbackSource,
  };
}

function buildIntakeRoomSuggestions(result: IntakeParseResult, lines: LineSuggestion[]): RoomSuggestion[] {
  const roomNames = result.rooms.length > 0
    ? result.rooms.map((room) => room.roomName)
    : lines.map((line) => line.roomName);

  return (roomNames.length > 0 ? Array.from(new Set(roomNames.map(normalizeRoomName))) : ['General']).map((roomName) => ({
    id: makeId('room-suggest'),
    include: true,
    roomName,
  }));
}

function buildIntakeWarnings(result: IntakeParseResult): string[] {
  const categoryReviewCount = result.reviewLines.filter((line) =>
    (line.warnings || []).includes('Category could not be confidently inferred.')
  ).length;
  const catalogReviewCount = result.reviewLines.filter((line) =>
    (line.warnings || []).includes('No catalog match identified.')
  ).length;

  const summaryWarnings: string[] = [];
  if (categoryReviewCount > 0) {
    summaryWarnings.push(
      `${categoryReviewCount} imported line${categoryReviewCount === 1 ? '' : 's'} need category review.`
    );
  }
  if (catalogReviewCount > 0) {
    summaryWarnings.push(
      `${catalogReviewCount} imported line${catalogReviewCount === 1 ? '' : 's'} need catalog matching.`
    );
  }

  return Array.from(new Set([...result.warnings, ...result.diagnostics.warnings, ...summaryWarnings].filter(Boolean)));
}

function normalizeWarningGroupKey(warning: string): string {
  const value = String(warning || '').trim();
  if (!value) return 'other';
  const normalized = value.toLowerCase();
  if (normalized.includes('could not be matched to the catalog') || normalized.includes('no catalog match identified')) return 'catalog-match-missing';
  if (normalized.includes('uncertain catalog match')) return 'catalog-match-uncertain';
  if (normalized.includes('catalog coverage may be missing')) return 'catalog-coverage-gap';
  if (normalized.includes('category could not be confidently inferred')) return 'category-inference';
  if (normalized.includes('possible room header')) return 'room-header';
  if (normalized.includes('ignored totals or summary rows')) return 'totals-rows';
  if (normalized.includes('duplicate')) return 'duplicates';
  if (normalized.includes('manual template')) return 'manual-template';
  return normalized
    .replace(/inventory list:\d+/g, 'inventory list:#')
    .replace(/row\s+\d+/g, 'row #')
    .replace(/page\s+\d+/g, 'page #')
    .replace(/"[^"]+"/g, '"header"');
}

function describeWarningGroup(key: string, examples: string[]): Pick<WarningGroupSummary, 'label' | 'tone'> {
  if (key === 'catalog-match-missing') return { label: 'Missing catalog matches', tone: 'danger' };
  if (key === 'catalog-match-uncertain') return { label: 'Uncertain catalog matches', tone: 'warning' };
  if (key === 'catalog-coverage-gap') return { label: 'Catalog coverage gaps', tone: 'warning' };
  if (key === 'category-inference') return { label: 'Category review needed', tone: 'warning' };
  if (key === 'room-header') return { label: 'Possible room-header false positives', tone: 'info' };
  if (key === 'totals-rows') return { label: 'Totals rows ignored', tone: 'info' };
  if (key === 'duplicates') return { label: 'Possible duplicate lines', tone: 'warning' };
  if (key === 'manual-template') return { label: 'Manual template fallback', tone: 'danger' };
  return { label: examples[0] || 'Other warnings', tone: 'info' };
}

function buildWarningGroupSummaries(input: {
  intakeWarnings: string[];
  validationWarnings: string[];
  parseWarnings: string[];
}): WarningGroupSummary[] {
  const grouped = new Map<string, { count: number; examples: string[] }>();
  [...input.intakeWarnings, ...input.validationWarnings, ...input.parseWarnings]
    .filter(Boolean)
    .forEach((warning) => {
      const key = normalizeWarningGroupKey(warning);
      const current = grouped.get(key) || { count: 0, examples: [] };
      current.count += 1;
      if (!current.examples.includes(warning) && current.examples.length < 3) current.examples.push(warning);
      grouped.set(key, current);
    });

  return Array.from(grouped.entries())
    .map(([key, value]) => ({
      key,
      count: value.count,
      examples: value.examples,
      ...describeWarningGroup(key, value.examples),
    }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

function buildParserReviewSummary(result: IntakeParseResult): ParserReviewSummary {
  return {
    status: result.status || null,
    fileType: result.fileType || null,
    overallConfidence: result.confidence?.overallConfidence ?? null,
    recommendedAction: result.confidence?.recommendedAction || null,
    parserStrategy: result.diagnostics?.parseStrategy || null,
    validationErrors: result.validation?.errors || [],
    validationWarnings: result.validation?.warnings || [],
    parseWarnings: result.parseWarnings || [],
    sourceSummary: result.sourceSummary || null,
  };
}

function formatConfidencePercent(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a';
  return `${Math.round(value * 100)}%`;
}

function formatRecommendedAction(action: string | null | undefined): string {
  if (!action) return 'Unknown';
  if (action === 'auto-import') return 'Auto-import';
  if (action === 'review-before-import') return 'Review before import';
  if (action === 'manual-template') return 'Manual template';
  return action;
}

function formatParserStrategy(value: string | null | undefined): string {
  return value ? value.replace(/-/g, ' ') : 'Unknown';
}

function sumReviewLineQuantity(lines: Array<{ qty?: number | null; quantity?: number | null }>): number {
  return Number(lines.reduce((total, line) => total + Number(line.qty ?? line.quantity ?? 0), 0).toFixed(2));
}

function mergeDistinctText(base: string | null | undefined, additions: Array<string | null | undefined>): string {
  const parts = [String(base || '').trim(), ...additions.map((value) => String(value || '').trim())]
    .filter(Boolean);
  return Array.from(new Set(parts)).join('\n');
}

function summarizeAssumptions(result: IntakeParseResult): string {
  const assumptions = result.projectMetadata.assumptions || [];
  return assumptions.map((assumption) => assumption.text).filter(Boolean).join('\n');
}

function createInitialProjectDraft(settings?: SettingsRecord | null): Partial<ProjectRecord> {
  return {
    projectName: '',
    projectNumber: '',
    clientName: '',
    generalContractor: '',
    estimator: '',
    address: '',
    proposalDate: '',
    projectType: 'Commercial',
    projectSize: 'Medium',
    floorLevel: 'Ground',
    accessDifficulty: 'Easy',
    installHeight: 'Standard',
    materialHandling: 'Standard',
    wallSubstrate: 'Drywall',
    laborBurdenPercent: settings?.defaultLaborBurdenPercent ?? 25,
    overheadPercent: settings?.defaultOverheadPercent ?? 15,
    profitPercent: settings?.defaultProfitPercent ?? 10,
    taxPercent: settings?.defaultTaxPercent ?? 8.25,
    pricingMode: 'labor_and_material',
    selectedScopeCategories: [],
    bidDate: '',
    dueDate: '',
    notes: '',
    specialNotes: '',
    jobConditions: createDefaultProjectJobConditions(),
  };
}

function mergeDetectedCategories(existing: string[] | undefined, additions: Array<string | null | undefined>): string[] {
  return Array.from(new Set([
    ...(existing || []).map((entry) => String(entry || '').trim()).filter(Boolean),
    ...additions.map((entry) => String(entry || '').trim()).filter(Boolean),
  ])).sort();
}

export function ProjectIntake() {
  const navigate = useNavigate();
  const { userEmail } = useAuth();

  const [mode, setMode] = useState<CreationMode>('blank');
  const [step, setStep] = useState<IntakeStep>(1);
  const [creating, setCreating] = useState(false);

  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [settingsDefaults, setSettingsDefaults] = useState<SettingsRecord | null>(null);

  const [sourceProjectId, setSourceProjectId] = useState('');
  const [takeoffUploadedFile, setTakeoffUploadedFile] = useState<File | null>(null);
  const [takeoffFileName, setTakeoffFileName] = useState('');
  const [takeoffFileText, setTakeoffFileText] = useState('');
  const [takeoffStructuredLines, setTakeoffStructuredLines] = useState<ParsedImportLine[]>([]);
  const [takeoffStructuredProjectName, setTakeoffStructuredProjectName] = useState('');
  const [takeoffStructuredKind, setTakeoffStructuredKind] = useState<SourceKind | ''>('');
  const [takeoffHasRoomColumn, setTakeoffHasRoomColumn] = useState(false);
  const [takeoffParsedFromServer, setTakeoffParsedFromServer] = useState(false);
  const [takeoffUploadState, setTakeoffUploadState] = useState<'idle' | 'processing' | 'ready' | 'error'>('idle');
  const [takeoffUploadMessage, setTakeoffUploadMessage] = useState('');
  const [takeoffDragOver, setTakeoffDragOver] = useState(false);
  const [takeoffImportText, setTakeoffImportText] = useState('');
  const [uploadedDocumentFile, setUploadedDocumentFile] = useState<File | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [uploadedText, setUploadedText] = useState('');
  const [intakeWarnings, setIntakeWarnings] = useState<string[]>([]);

  const [createConfirmedOnly, setCreateConfirmedOnly] = useState(true);
  const [catalogPickerLineId, setCatalogPickerLineId] = useState<string | null>(null);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [newCatalogLineId, setNewCatalogLineId] = useState<string | null>(null);
  const [newCatalogDraft, setNewCatalogDraft] = useState<NewCatalogDraft | null>(null);

  const [projectDraft, setProjectDraft] = useState<Partial<ProjectRecord>>(() => createInitialProjectDraft());
  const [distanceCalculating, setDistanceCalculating] = useState(false);
  const [distanceError, setDistanceError] = useState<string | null>(null);
  const [distanceMessage, setDistanceMessage] = useState('No calculated distance yet.');
  const [projectDateErrors, setProjectDateErrors] = useState<Partial<Record<'bidDate' | 'proposalDate' | 'dueDate', string>>>({});
  const [parserReviewSummary, setParserReviewSummary] = useState<ParserReviewSummary | null>(null);

  const [roomSuggestions, setRoomSuggestions] = useState<RoomSuggestion[]>([]);
  const [lineSuggestions, setLineSuggestions] = useState<LineSuggestion[]>([]);
  const [blankUsesRooms, setBlankUsesRooms] = useState(true);
  const [blankRoomNames, setBlankRoomNames] = useState('');

  useEffect(() => {
    if (!userEmail) return;
    setProjectDraft((prev) => {
      if (String(prev.estimator || '').trim()) return prev;
      return {
        ...prev,
        estimator: userEmail,
      };
    });
  }, [userEmail]);

  useEffect(() => {
    void (async () => {
      const [projectData, catalogData, settingsData] = await Promise.all([api.getV1Projects(), api.getCatalog(), api.getV1Settings()]);
      setProjects(projectData);
      setCatalog(catalogData);
      setSettingsDefaults(settingsData);

      const defaults = createInitialProjectDraft(settingsData);
      setProjectDraft((prev) => ({
        ...defaults,
        ...prev,
        laborBurdenPercent: prev.laborBurdenPercent ?? defaults.laborBurdenPercent,
        overheadPercent: prev.overheadPercent ?? defaults.overheadPercent,
        profitPercent: prev.profitPercent ?? defaults.profitPercent,
        taxPercent: prev.taxPercent ?? defaults.taxPercent,
        selectedScopeCategories: Array.isArray(prev.selectedScopeCategories) ? prev.selectedScopeCategories : defaults.selectedScopeCategories,
        jobConditions: normalizeProjectJobConditions({
          ...defaults.jobConditions,
          ...(prev.jobConditions || {}),
        }),
      }));
    })();
  }, []);

  const availableProjectSources = useMemo(
    () => projects.filter((project) => project.id !== sourceProjectId),
    [projects, sourceProjectId]
  );

  const matchedSuggestions = useMemo(
    () => lineSuggestions.filter((line) => line.matched),
    [lineSuggestions]
  );

  const parsedQuantityTotal = useMemo(
    () => sumReviewLineQuantity(lineSuggestions),
    [lineSuggestions]
  );

  const groupedWarningSummaries = useMemo(
    () => buildWarningGroupSummaries({
      intakeWarnings,
      validationWarnings: parserReviewSummary?.validationWarnings || [],
      parseWarnings: parserReviewSummary?.parseWarnings || [],
    }),
    [intakeWarnings, parserReviewSummary]
  );

  const unmatchedSuggestions = useMemo(
    () => lineSuggestions.filter((line) => !line.matched),
    [lineSuggestions]
  );

  const filteredCatalog = useMemo(() => {
    const q = catalogSearch.toLowerCase();
    if (!q) return catalog;
    return catalog.filter((item) =>
      item.description.toLowerCase().includes(q) ||
      item.sku.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q)
    );
  }, [catalog, catalogSearch]);

  const scopeCategoryOptions = useMemo(
    () => Array.from(new Set([
      ...catalog.map((item) => String(item.category || '').trim()),
      ...lineSuggestions.map((line) => String(line.category || '').trim()),
    ].filter(Boolean))).sort(),
    [catalog, lineSuggestions]
  );

  const basicsChecklist = useMemo(() => {
    const missing: string[] = [];
    if (!String(projectDraft.projectName || '').trim()) missing.push('Project name');
    if (!String(projectDraft.clientName || '').trim()) missing.push('Client');
    if (!String(projectDraft.address || '').trim()) missing.push('Site address');
    if (!String(projectDraft.projectType || '').trim()) missing.push('Project type');
    if (!String(projectDraft.bidDate || '').trim()) {
      missing.push('Bid due date');
    }
    return missing;
  }, [projectDraft.address, projectDraft.bidDate, projectDraft.clientName, projectDraft.projectName, projectDraft.projectType]);

  const unifiedProjectDate = projectDraft.bidDate || projectDraft.proposalDate || projectDraft.dueDate || '';

  const pricingChecklist = useMemo(() => {
    const missing: string[] = [];
    if (!String(projectDraft.pricingMode || '').trim()) missing.push('Pricing mode');
    if (scopeCategoryOptions.length > 0 && !(projectDraft.selectedScopeCategories || []).length) {
      missing.push('At least one scope category');
    }
    if (Number(normalizeProjectJobConditions(projectDraft.jobConditions).installerCount || 0) <= 0) {
      missing.push('Crew size');
    }
    return missing;
  }, [projectDraft.jobConditions, projectDraft.pricingMode, projectDraft.selectedScopeCategories, scopeCategoryOptions.length]);

  const includedRoomCount = useMemo(
    () => roomSuggestions.filter((room) => room.include).length,
    [roomSuggestions]
  );

  const includedLineCount = useMemo(
    () => lineSuggestions.filter((line) => (createConfirmedOnly ? line.include : true)).length,
    [createConfirmedOnly, lineSuggestions]
  );

  function patchProjectDraft(updates: Partial<ProjectRecord>) {
    setProjectDraft((prev) => ({ ...prev, ...updates }));
  }

  function patchProjectDate(value: string) {
    patchProjectDraft({ bidDate: value, proposalDate: value, dueDate: value });
  }

  function patchDraftJobConditions(updates: Partial<ProjectJobConditions>) {
    setProjectDraft((prev) => ({
      ...prev,
      jobConditions: normalizeProjectJobConditions({
        ...(prev.jobConditions || createDefaultProjectJobConditions()),
        ...updates,
      }),
    }));
  }

  function applyDraftDeliveryRecommendation(distance: number | null, options?: { difficulty?: ProjectJobConditions['deliveryDifficulty']; force?: boolean }) {
    const nextJobConditions = normalizeProjectJobConditions(projectDraft.jobConditions);
    if (!options?.force && !nextJobConditions.deliveryAutoCalculated && nextJobConditions.deliveryValue > 0) {
      return;
    }

    const recommendation = recommendDeliveryPlan(distance, options?.difficulty ?? nextJobConditions.deliveryDifficulty);
    patchDraftJobConditions({
      ...recommendation,
      deliveryAutoCalculated: true,
    });
  }

  function promptForPhasedWorkDraft(enable: boolean) {
    if (!enable) {
      patchDraftJobConditions({ phasedWork: false, phasedWorkPhases: 1, phasedWorkMultiplier: 0 });
      return;
    }

    const current = normalizeProjectJobConditions(projectDraft.jobConditions);
    const response = window.prompt('How many phases should this job be split into?', String(Math.max(2, current.phasedWorkPhases || 2)));
    if (response === null) return;
    const phaseCount = Math.max(2, Number(response) || 2);
    patchDraftJobConditions({
      phasedWork: true,
      phasedWorkPhases: phaseCount,
      phasedWorkMultiplier: recommendedPhasedWorkMultiplier(phaseCount),
    });
  }

  async function refreshDraftDistance(addressOverride?: string, silentOnFailure = false): Promise<number | null> {
    const address = String(addressOverride ?? projectDraft.address ?? '').trim();
    if (!address) {
      patchDraftJobConditions({ travelDistanceMiles: null, deliveryRequired: false, deliveryPricingMode: 'included', deliveryValue: 0, deliveryLeadDays: 0 });
      setDistanceError(null);
      setDistanceMessage('Add a site address to calculate travel distance.');
      return null;
    }

    setDistanceCalculating(true);
    setDistanceError(null);
    setDistanceMessage('Calculating travel distance...');
    try {
      const distance = await getDistanceInMiles(address);
      if (distance === null) {
        patchDraftJobConditions({ travelDistanceMiles: null });
        const errorMessage = 'Unable to calculate distance from the current address.';
        setDistanceError(errorMessage);
        setDistanceMessage(errorMessage);
        return null;
      }

      patchDraftJobConditions({
        travelDistanceMiles: distance,
        remoteTravel: distance > 50 ? true : normalizeProjectJobConditions(projectDraft.jobConditions).remoteTravel,
      });
      applyDraftDeliveryRecommendation(distance, { force: normalizeProjectJobConditions(projectDraft.jobConditions).deliveryAutoCalculated });
      setDistanceMessage(`${formatNumberSafe(distance, 1)} miles from office.`);
      return distance;
    } catch (error) {
      console.error('Distance lookup failed', error);
      const errorMessage = 'Distance lookup failed.';
      setDistanceError(errorMessage);
      setDistanceMessage(errorMessage);
      if (!silentOnFailure) {
        patchDraftJobConditions({ travelDistanceMiles: null });
      }
      return null;
    } finally {
      setDistanceCalculating(false);
    }
  }

  function applyIntakeParseToDraft(result: IntakeParseResult, sourceLabel: string) {
    const importedAddress = result.projectMetadata.address || projectDraft.address;
    const assumptionNotes = summarizeAssumptions(result);
    setProjectDraft((prev) => ({
      ...prev,
      projectName: prev.projectName || result.projectMetadata.projectName || prev.projectName,
      projectNumber: prev.projectNumber || result.projectMetadata.projectNumber || prev.projectNumber,
      clientName: prev.clientName || result.projectMetadata.client || prev.clientName,
      generalContractor: prev.generalContractor || result.projectMetadata.generalContractor || prev.generalContractor,
      estimator: prev.estimator || result.projectMetadata.estimator || prev.estimator,
      address: prev.address || result.projectMetadata.address || prev.address,
      bidDate: prev.bidDate || normalizeDateString(result.projectMetadata.bidDate || result.projectMetadata.proposalDate) || prev.bidDate,
      proposalDate: prev.proposalDate || normalizeDateString(result.projectMetadata.proposalDate) || prev.proposalDate,
      pricingMode: prev.pricingMode || result.projectMetadata.pricingBasis || prev.pricingMode,
      notes: mergeDistinctText(mergeSourceNote(prev.notes, sourceLabel), [assumptionNotes]),
      specialNotes: mergeDistinctText(prev.specialNotes, [result.proposalAssist.scopeSummaryDraft, result.proposalAssist.clarificationsDraft, result.proposalAssist.exclusionsDraft]),
    }));

    if (String(importedAddress || '').trim()) {
      void refreshDraftDistance(importedAddress, true);
    }
  }

  function applyIntakeParseToReview(result: IntakeParseResult, fallbackSource: string) {
    const suggestions = dedupeSuggestions(result.reviewLines.map((line) => buildIntakeLineSuggestion(line, fallbackSource)));
    setLineSuggestions(suggestions);
    setRoomSuggestions(buildIntakeRoomSuggestions(result, suggestions));
    setIntakeWarnings(buildIntakeWarnings(result));
      setParserReviewSummary(buildParserReviewSummary(result));
    setProjectDraft((prev) => ({
      ...prev,
      selectedScopeCategories: prev.selectedScopeCategories && prev.selectedScopeCategories.length > 0
        ? prev.selectedScopeCategories
        : mergeDetectedCategories(prev.selectedScopeCategories, suggestions.map((line) => line.category)),
    }));
    return suggestions;
  }

  function hasUsableTakeoffSource(): boolean {
    return !!takeoffFileText.trim() || !!takeoffImportText.trim() || !!sourceProjectId || takeoffStructuredLines.length > 0 || (takeoffParsedFromServer && lineSuggestions.length > 0);
  }

  async function loadTakeoffSource() {
    const combinedText = [takeoffFileText, takeoffImportText].filter(Boolean).join('\n');
    const hasStructuredSource = takeoffStructuredLines.length > 0;
    const hasServerParsedSource = takeoffParsedFromServer && lineSuggestions.length > 0;
    const hasTextSource = combinedText.trim().length > 0;
    const hasProjectSource = !!sourceProjectId;

    if (!hasStructuredSource && !hasServerParsedSource && !hasTextSource && !hasProjectSource) {
      alert(takeoffFileName ? 'The uploaded takeoff file has not produced usable scope lines yet. Wait for parsing to finish, try the file again, or paste/import text.' : 'Upload a takeoff file or paste takeoff text before continuing.');
      return;
    }

    let importedFromProject: LineSuggestion[] = [];
    let importedFromStructured: LineSuggestion[] = [];
    let roomNames: string[] = [];

    if (sourceProjectId) {
      const [sourceProject, sourceRooms, sourceLines] = await Promise.all([
        api.getV1Project(sourceProjectId),
        api.getV1Rooms(sourceProjectId),
        api.getV1TakeoffLines(sourceProjectId)
      ]);

      setProjectDraft((prev) => ({
        ...prev,
        projectName: prev.projectName || (sourceProject.projectName ? `${sourceProject.projectName} - New` : ''),
        clientName: prev.clientName || sourceProject.clientName,
        address: prev.address || sourceProject.address,
        bidDate: prev.bidDate || sourceProject.bidDate,
        notes: mergeSourceNote(prev.notes, takeoffFileName || 'pasted text') + (sourceProjectId ? `; optional project source: ${sourceProject.id}` : '')
      }));

      roomNames = sourceRooms.map((room) => room.roomName);

      importedFromProject = sourceLines.map((line) => {
        const match = line.catalogItemId
          ? catalog.find((item) => item.id === line.catalogItemId)
          : suggestCatalogMatch({ itemName: line.description, category: line.category, description: line.description }, catalog);
        const roomName = sourceRooms.find((room) => room.id === line.roomId)?.roomName || 'General';

        return {
          id: makeId('line-suggest'),
          include: true,
          roomName,
          rawText: line.description,
          itemName: line.description,
          description: line.description,
          qty: line.qty,
          unit: line.unit,
          category: match?.category || line.category || null,
          sourceReference: `project:${sourceProject.id}`,
          sku: match?.sku || line.sku || null,
          catalogItemId: match?.id || line.catalogItemId || null,
          materialCost: match?.baseMaterialCost ?? line.materialCost,
          laborMinutes: match?.baseLaborMinutes ?? line.laborMinutes,
          notes: `Imported from optional project source ${line.id}`,
          laborIncluded: null,
          materialIncluded: null,
          matched: !!match
        };
      });
    }

    if (hasServerParsedSource) {
      if (takeoffStructuredProjectName) {
        applyIntakeParseToDraft({
          sourceType: 'document',
          sourceKind: 'text-document',
          projectMetadata: {
            projectName: takeoffStructuredProjectName,
            projectNumber: '',
            bidPackage: '',
            client: '',
            generalContractor: '',
            address: '',
            bidDate: '',
            proposalDate: '',
            estimator: '',
            sourceFiles: [],
            assumptions: [],
            pricingBasis: '',
            confidence: 1,
            sources: [],
          },
          project: {
            projectName: takeoffStructuredProjectName,
            projectNumber: '',
            bidPackage: '',
            client: '',
            generalContractor: '',
            address: '',
            bidDate: '',
            proposalDate: '',
            estimator: '',
            sourceFiles: [],
            assumptions: [],
            pricingBasis: '',
            confidence: 1,
            sources: [],
          },
          rooms: [],
          parsedLines: [],
          reviewLines: [],
          warnings: [],
          proposalAssist: {
            introDraft: '',
            scopeSummaryDraft: '',
            clarificationsDraft: '',
            exclusionsDraft: '',
          },
          diagnostics: {
            parserStrategy: 'review-state',
            parseStrategy: 'review-state',
            sourceKind: 'text-document',
            metadataSources: [],
            metadataFound: [],
            metadataMissing: ['projectNumber', 'client', 'generalContractor', 'address', 'bidDate', 'proposalDate', 'estimator'],
            warnings: [],
            totalLines: 0,
            completeLines: 0,
            matchedLines: 0,
            needsMatchLines: 0,
            modelUsed: 'review-state',
            confidenceSummary: { metadata: 1, lineExtraction: 0, matching: 0, overall: 0.33 },
            confidenceNarrative: 'Review-state placeholder diagnostics.',
            webEnrichmentUsed: false,
          },
        }, takeoffFileName || 'uploaded takeoff');
      }

      roomNames = [...roomNames, ...roomSuggestions.filter((room) => room.include).map((room) => room.roomName)];
      importedFromStructured = lineSuggestions.map((line) => ({
        ...line,
        id: makeId('line-suggest'),
      }));
    } else if (hasStructuredSource) {
      const dominantProjectNumber = mostCommonValue(takeoffStructuredLines.map((line) => line.projectNumber || ''));
      const dominantClient = mostCommonValue(takeoffStructuredLines.map((line) => line.client || ''));
      const dominantAddress = mostCommonValue(takeoffStructuredLines.map((line) => line.address || ''));
      const dominantBidDate = mostCommonValue(takeoffStructuredLines.map((line) => normalizeDateString(line.bidDate) || ''));

      if (takeoffStructuredProjectName) {
        setProjectDraft((prev) => ({
          ...prev,
          projectName: prev.projectName || takeoffStructuredProjectName,
          projectNumber: prev.projectNumber || dominantProjectNumber,
          clientName: prev.clientName || dominantClient,
          address: prev.address || dominantAddress,
          bidDate: prev.bidDate || dominantBidDate,
          notes: mergeSourceNote(prev.notes, takeoffFileName || 'spreadsheet upload'),
        }));
      }

      if (takeoffHasRoomColumn) {
        roomNames = [
          ...roomNames,
          ...takeoffStructuredLines.map((line) => normalizeRoomName(line.roomName)).filter(Boolean),
        ];
      } else {
        roomNames.push('General Scope');
      }

      importedFromStructured = takeoffStructuredLines.map((line) => {
        const match = suggestCatalogMatch(
          {
            itemName: line.itemName,
            category: line.category,
            description: line.description,
            rawText: `${line.itemName} ${line.description}`,
          },
          catalog
        );

        const flags = [
          line.laborIncluded !== null ? `Labor Included: ${line.laborIncluded ? 'Yes' : 'No'}` : '',
          line.materialIncluded !== null ? `Material Included: ${line.materialIncluded ? 'Yes' : 'No'}` : '',
          line.notes,
        ].filter(Boolean);

        return {
          id: makeId('line-suggest'),
          include: true,
          roomName: takeoffHasRoomColumn ? normalizeRoomName(line.roomName) : 'General Scope',
          rawText: `${line.itemName || line.description}`.trim(),
          itemName: line.itemName,
          description: line.description || line.itemName,
          qty: line.qty,
          unit: line.unit || match?.uom || 'EA',
          category: line.category || match?.category || null,
          sourceReference: line.sourceReference || takeoffFileName || 'spreadsheet',
          sku: match?.sku || null,
          catalogItemId: match?.id || null,
          materialCost: match?.baseMaterialCost || 0,
          laborMinutes: match?.baseLaborMinutes || 0,
          notes: flags.join(' | '),
          laborIncluded: line.laborIncluded,
          materialIncluded: line.materialIncluded,
          matched: !!match,
        } as LineSuggestion;
      });
    }

    if (hasTextSource) {
      const documentMetadata = parseDocumentMetadata(combinedText);
      const detectedRooms = detectRoomsFromText(combinedText);
      if (detectedRooms.length > 0) roomNames = [...roomNames, ...detectedRooms];

      setProjectDraft((prev) => ({
        ...prev,
        projectName: prev.projectName || documentMetadata.projectName || (takeoffFileName ? takeoffFileName.replace(/\.[^/.]+$/, '') : 'Takeoff Imported Project'),
        projectNumber: prev.projectNumber || documentMetadata.projectNumber || prev.projectNumber,
        clientName: prev.clientName || documentMetadata.clientName || prev.clientName,
        address: prev.address || documentMetadata.address || prev.address,
        bidDate: prev.bidDate || documentMetadata.bidDate || prev.bidDate,
        notes: mergeSourceNote(prev.notes, takeoffFileName || 'pasted text')
      }));
    }

    const uniqueRooms = Array.from(new Set(roomNames.map(normalizeRoomName))).filter(Boolean);
    setRoomSuggestions(
      (uniqueRooms.length > 0 ? uniqueRooms : ['General']).map((name) => ({
        id: makeId('room-suggest'),
        include: true,
        roomName: name
      }))
    );

    const fallbackRoom = uniqueRooms[0] || 'General';
    const textRows = parseRawTextLinesToRows(
      detectScopeLinesFromText(combinedText),
      takeoffFileName || 'pasted takeoff'
    );
    const importedFromText = textRows.map((line) => {
      const match = suggestCatalogMatch(
        {
          itemName: line.itemName,
          category: line.category,
          description: line.description,
          rawText: `${line.itemName} ${line.description} ${line.notes || ''}`,
        },
        catalog
      );

      return {
        id: makeId('line-suggest'),
        include: true,
        roomName: normalizeRoomName(line.roomName || fallbackRoom || 'General Scope'),
        rawText: line.description,
        itemName: line.itemName,
        description: match?.description || line.description,
        qty: line.qty,
        unit: line.unit || match?.uom || 'EA',
        category: line.category || match?.category || null,
        sourceReference: line.sourceReference || takeoffFileName || 'pasted takeoff',
        sku: match?.sku || null,
        catalogItemId: match?.id || null,
        materialCost: match?.baseMaterialCost || 0,
        laborMinutes: match?.baseLaborMinutes || 0,
        notes: line.notes || `Imported from ${takeoffFileName || 'pasted takeoff'}`,
        laborIncluded: line.laborIncluded,
        materialIncluded: line.materialIncluded,
        matched: !!match,
      } as LineSuggestion;
    });
    setLineSuggestions(dedupeSuggestions([...importedFromProject, ...importedFromStructured, ...importedFromText]));
  }

  async function handleTakeoffFileUpload(file: File): Promise<boolean> {
    setTakeoffUploadedFile(file);
    setTakeoffFileName(file.name);
    setIntakeWarnings([]);
    setTakeoffParsedFromServer(false);
    setTakeoffUploadState('processing');
    setTakeoffUploadMessage('Reading uploaded takeoff file...');
    const fileName = file.name.toLowerCase();

    try {
      const lowerMime = (file.type || '').toLowerCase();
      const sourceType =
        fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv') || lowerMime.includes('spreadsheet') || lowerMime.includes('excel') || lowerMime.includes('csv')
          ? 'spreadsheet'
          : fileName.endsWith('.pdf') || lowerMime.includes('pdf')
            ? 'pdf'
            : 'document';

      const extractedText = sourceType === 'document' ? await extractTextFromUploadedTakeoffFile(file) : undefined;
      const result = await api.parseV1Intake({
        fileName: file.name,
        mimeType: file.type || (sourceType === 'spreadsheet' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : sourceType === 'pdf' ? 'application/pdf' : 'text/plain'),
        sourceType,
        dataBase64: await toBase64Payload(file),
        extractedText,
        matchCatalog: true,
      });

      applyIntakeParseToDraft(result, file.name);
      applyIntakeParseToReview(result, file.name);
      setTakeoffParsedFromServer(true);
      setTakeoffStructuredLines(result.reviewLines.map((line) => buildIntakeParsedImportLine(line, file.name)));
      setTakeoffStructuredProjectName(result.projectMetadata.projectName || '');
      setTakeoffStructuredKind(mapIntakeSourceKind(result.sourceKind));
      setTakeoffHasRoomColumn(result.rooms.length > 0 || result.reviewLines.some((line) => !!line.roomName));
      setTakeoffFileText('');
      setTakeoffUploadState(result.reviewLines.length > 0 ? 'ready' : 'error');
      setTakeoffUploadMessage(
        result.reviewLines.length > 0
          ? `Parsed ${result.reviewLines.length} takeoff lines totaling ${formatNumberSafe(sumReviewLineQuantity(result.reviewLines))} units from ${file.name} using the server intake pipeline.`
          : `No usable takeoff lines were found in ${file.name}.`
      );
      return result.reviewLines.length > 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Takeoff upload failed.';
      setTakeoffParsedFromServer(false);
      setTakeoffUploadState('error');
      setTakeoffUploadMessage(message);
      setIntakeWarnings((prev) => Array.from(new Set([...prev, message])));
      return false;
    }
  }

  async function handleDocumentUpload(file: File) {
    setUploadedDocumentFile(file);
    setUploadedFileName(file.name);
    setIntakeWarnings([]);

    const lower = file.name.toLowerCase();
    const mime = (file.type || '').toLowerCase();

    const isSpreadsheetFile =
      lower.endsWith('.xlsx') ||
      lower.endsWith('.xls') ||
      lower.endsWith('.csv') ||
      mime.includes('spreadsheet') ||
      mime.includes('excel') ||
      mime.includes('csv');

    if (isSpreadsheetFile) {
      setIntakeWarnings(['Spreadsheet file detected. Parsed using the takeoff spreadsheet pipeline.']);
      await handleTakeoffFileUpload(file);
      return;
    }

    const buffer = await file.arrayBuffer();
    if (isLikelyBinaryBuffer(buffer) && !lower.endsWith('.pdf')) {
      setUploadedText('');
      setIntakeWarnings([
        'Unsupported binary document for text parsing. Upload PDF/TXT for document intake, or use Create from Takeoff for spreadsheets.',
      ]);
      return;
    }

    const text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
    setUploadedText(text || file.name);

    try {
      const sourceType: 'pdf' | 'document' = lower.endsWith('.pdf') ? 'pdf' : 'document';
      const result = await api.parseV1Intake({
        fileName: file.name,
        mimeType: file.type || (sourceType === 'pdf' ? 'application/pdf' : 'text/plain'),
        sourceType,
        dataBase64: await toBase64Payload(file),
        extractedText: sourceType === 'document' ? text : undefined,
        matchCatalog: true,
      });

      if (result.reviewLines.length > 0) {
        applyIntakeParseToDraft(result, file.name);
        applyIntakeParseToReview(result, file.name);
        return;
      }
    } catch (_error) {
      // Fall through to raw-line preservation parser.
      setIntakeWarnings(['Gemini extraction failed. Preserving raw lines for manual review.']);
    }

    const adaptive = parseAdaptiveTextDocument(text, file.name);
    const metadata = adaptive.metadata;
    setProjectDraft((prev) => ({
      ...prev,
      projectName: metadata.projectName || prev.projectName,
      projectNumber: metadata.projectNumber || prev.projectNumber,
      clientName: metadata.clientName || prev.clientName,
      address: metadata.address || prev.address,
      bidDate: metadata.bidDate || prev.bidDate,
      notes: mergeSourceNote(prev.notes, file.name)
    }));

    const rooms = Array.from(new Set(adaptive.lines.map((line) => normalizeRoomName(line.roomName)).filter(Boolean))).filter(Boolean);
    setRoomSuggestions(
      (rooms.length > 0 ? rooms : ['General']).map((roomName) => ({
        id: makeId('room-suggest'),
        include: true,
        roomName: normalizeRoomName(roomName)
      }))
    );

    const parsed = adaptive.lines.map((line) => {
      const roomFromLine = line.roomName || 'General';
      const match = suggestCatalogMatch({ itemName: line.itemName, category: line.category, description: line.description, rawText: `${line.description} ${line.notes || ''}` }, catalog);

      return {
        id: makeId('line-suggest'),
        include: true,
        roomName: roomFromLine,
        rawText: line.description,
        itemName: line.itemName,
        description: match?.description || line.description,
        qty: line.qty,
        unit: line.unit || match?.uom || 'EA',
        category: line.category || match?.category || null,
        sourceReference: file.name,
        sku: match?.sku || null,
        catalogItemId: match?.id || null,
        materialCost: match?.baseMaterialCost || 0,
        laborMinutes: match?.baseLaborMinutes || 0,
        notes: line.notes || `Parsed from ${file.name}`,
        laborIncluded: null,
        materialIncluded: null,
        matched: !!match
      } as LineSuggestion;
    });

    setLineSuggestions(dedupeSuggestions(parsed));
  }

  function applyExistingCatalogMatch(lineId: string, item: CatalogItem) {
    setLineSuggestions((prev) =>
      prev.map((line) => {
        if (line.id !== lineId) return line;
        return {
          ...line,
          matched: true,
          include: true,
          description: item.description,
          category: item.category,
          sku: item.sku,
          unit: item.uom,
          catalogItemId: item.id,
          materialCost: item.baseMaterialCost,
          laborMinutes: item.baseLaborMinutes,
          notes: `${line.notes}; matched to catalog ${item.sku}`,
          laborIncluded: line.laborIncluded,
          materialIncluded: line.materialIncluded,
        };
      })
    );
    setCatalogPickerLineId(null);
    setCatalogSearch('');
  }

  function openNewCatalogFromLine(lineId: string) {
    const line = lineSuggestions.find((entry) => entry.id === lineId);
    if (!line) return;

    setNewCatalogLineId(lineId);
    setNewCatalogDraft({
      description: line.description || line.rawText,
      sku: line.sku || `SKU-${Math.floor(Math.random() * 100000)}`,
      category: line.category || 'Division 10',
      unit: (line.unit || 'EA') as CatalogItem['uom'],
      materialCost: line.materialCost || 0,
      laborMinutes: line.laborMinutes || 0,
    });
  }

  async function createCatalogItemFromLine() {
    if (!newCatalogLineId || !newCatalogDraft) return;

    const created = await api.createCatalogItem({
      id: crypto.randomUUID(),
      sku: newCatalogDraft.sku,
      category: newCatalogDraft.category,
      description: newCatalogDraft.description,
      uom: newCatalogDraft.unit,
      baseMaterialCost: newCatalogDraft.materialCost,
      baseLaborMinutes: newCatalogDraft.laborMinutes,
      taxable: true,
      adaFlag: false,
      active: true,
      tags: [],
    });

    setCatalog((prev) => [created, ...prev]);
    applyExistingCatalogMatch(newCatalogLineId, created);
    setNewCatalogLineId(null);
    setNewCatalogDraft(null);
  }

  function ignoreLine(lineId: string) {
    setLineSuggestions((prev) =>
      prev.map((line) =>
        line.id === lineId ? { ...line, include: false, notes: `${line.notes}; ignored` } : line
      )
    );
  }

  function reincludeLine(lineId: string) {
    setLineSuggestions((prev) =>
      prev.map((line) =>
        line.id === lineId ? { ...line, include: true } : line
      )
    );
  }

  function patchLineSuggestion(lineId: string, updates: Partial<LineSuggestion>) {
    setLineSuggestions((prev) => prev.map((line) => (line.id === lineId ? { ...line, ...updates } : line)));
  }

  function loadBlankDefaults() {
    const parsedRooms = parseRoomNamesInput(blankRoomNames);
    const nextRooms = blankUsesRooms
      ? (parsedRooms.length > 0 ? parsedRooms : ['Room 101'])
      : ['Project Scope'];

    setRoomSuggestions(nextRooms.map((roomName) => ({ id: makeId('room-suggest'), include: true, roomName })));
    setLineSuggestions([]);
    setParserReviewSummary(null);
    setProjectDraft((prev) => ({
      ...prev,
      projectName: prev.projectName || 'New Project'
    }));
  }

  function loadTemplateDefaults() {
    setParserReviewSummary(null);
    setProjectDraft((prev) => ({
      ...prev,
      projectName: prev.projectName || 'Division 10 Template Project',
      projectType: 'Commercial',
      projectSize: 'Medium',
      notes: 'Created from Division 10 starter template'
    }));

    setRoomSuggestions([
      { id: makeId('room-suggest'), include: true, roomName: 'Main Restroom' },
      { id: makeId('room-suggest'), include: true, roomName: 'Lobby' },
    ]);

    const starter = parseRawTextLinesToRows(
      ['2 Grab Bar 36', '1 Mirror 18x36', '1 Paper Towel Dispenser'],
      'Template seed'
    ).map((line) => {
      const match = suggestCatalogMatch({ itemName: line.itemName, description: line.description, rawText: line.description }, catalog);
      return {
        id: makeId('line-suggest'),
        include: true,
        roomName: 'Main Restroom',
        rawText: line.description,
        itemName: line.itemName,
        description: match?.description || line.description,
        qty: line.qty,
        unit: match?.uom || line.unit || 'EA',
        category: match?.category || null,
        sourceReference: 'Template seed',
        sku: match?.sku || null,
        catalogItemId: match?.id || null,
        materialCost: match?.baseMaterialCost || 0,
        laborMinutes: match?.baseLaborMinutes || 0,
        notes: `Template seed: ${line.description}`,
        laborIncluded: null,
        materialIncluded: null,
        matched: !!match,
      } as LineSuggestion;
    });
    setLineSuggestions(dedupeSuggestions(starter));
  }

  function applyManualTemplateFallback() {
    setMode('template');
    loadTemplateDefaults();
    setStep(3);
  }

  async function prepareModeData(): Promise<boolean> {
    if (mode === 'blank') {
      loadBlankDefaults();
      return true;
    }

    if (mode === 'template') {
      loadTemplateDefaults();
      return true;
    }

    if (mode === 'takeoff') {
      if (takeoffUploadState === 'processing') {
        alert('Your takeoff file is still being processed. Wait for parsing to finish, then continue to review.');
        return false;
      }

      let hasSource = hasUsableTakeoffSource();
      if (!hasSource && takeoffUploadedFile) {
        hasSource = await handleTakeoffFileUpload(takeoffUploadedFile);
      }

      if (!hasSource) {
        alert(takeoffFileName ? `The uploaded file "${takeoffFileName}" is not ready yet or did not produce readable takeoff content. ${takeoffUploadMessage || 'Try the file again, wait for parsing to finish, or paste/import text.'}` : 'Upload a takeoff file, paste takeoff text, or select an optional project takeoff.');
        return false;
      }
      if (takeoffParsedFromServer && !sourceProjectId && !takeoffImportText.trim()) {
        return true;
      }
      await loadTakeoffSource();
      return true;
    }

    if (mode === 'document') {
      if (!uploadedText.trim() && lineSuggestions.length === 0) {
        alert('Upload a source file first.');
        return false;
      }
      return true;
    }

    return false;
  }

  async function proceedToBasics() {
    try {
      const ready = await prepareModeData();
      if (ready) setStep(3);
    } catch (error) {
      setIntakeWarnings([buildGeminiFallbackWarning(error, 'document')]);
      alert('Unable to review source items. Check the file/text and try again.');
    }
  }

  function proceedToPricingSetup() {
    const dateErrors = collectPastProjectDateErrors({
      bidDate: projectDraft.bidDate,
      proposalDate: projectDraft.proposalDate,
      dueDate: projectDraft.dueDate,
    });
    if (dateErrors.length > 0) {
      setProjectDateErrors(mapProjectDateErrors(dateErrors));
      alert(dateErrors[0].message);
      return;
    }
    if (basicsChecklist.length > 0) {
      alert(`Complete the required project basics before continuing:\n- ${basicsChecklist.join('\n- ')}`);
      return;
    }
    setStep(4);
  }

  function proceedToReviewItems() {
    if (pricingChecklist.length > 0) {
      alert(`Complete the pricing and scope setup before reviewing items:\n- ${pricingChecklist.join('\n- ')}`);
      return;
    }
    setStep(5);
  }

  async function handleCreateProject() {
    if (creating) return;
    const dateErrors = collectPastProjectDateErrors({
      bidDate: projectDraft.bidDate,
      proposalDate: projectDraft.proposalDate,
      dueDate: projectDraft.dueDate,
    });
    if (dateErrors.length > 0) {
      setProjectDateErrors(mapProjectDateErrors(dateErrors));
      alert(dateErrors[0].message);
      return;
    }
    if (basicsChecklist.length > 0) {
      alert(`Complete the required project basics before creating the project:\n- ${basicsChecklist.join('\n- ')}`);
      return;
    }
    if (pricingChecklist.length > 0) {
      alert(`Complete the pricing and scope setup before creating the project:\n- ${pricingChecklist.join('\n- ')}`);
      return;
    }

    setCreating(true);

    try {
      const uploadedSourceFile = mode === 'takeoff' ? takeoffUploadedFile : mode === 'document' ? uploadedDocumentFile : null;
      const normalizedJobConditions = normalizeProjectJobConditions(projectDraft.jobConditions);
      if ((projectDraft.address || '').trim() && normalizedJobConditions.travelDistanceMiles === null) {
        const distance = await refreshDraftDistance(projectDraft.address, true);
        if (distance !== null) {
          normalizedJobConditions.travelDistanceMiles = distance;
          if (distance > 50) normalizedJobConditions.remoteTravel = true;
          if (normalizedJobConditions.deliveryAutoCalculated) {
            Object.assign(normalizedJobConditions, recommendDeliveryPlan(distance, normalizedJobConditions.deliveryDifficulty));
          }
        }
      }

      const createdProject = await api.createV1Project({
        projectNumber: projectDraft.projectNumber || null,
        projectName: projectDraft.projectName || 'Untitled Project',
        clientName: projectDraft.clientName || null,
        generalContractor: projectDraft.generalContractor || null,
        estimator: projectDraft.estimator || null,
        bidDate: projectDraft.bidDate || null,
        proposalDate: projectDraft.proposalDate || null,
        dueDate: projectDraft.dueDate || null,
        address: projectDraft.address || null,
        projectType: projectDraft.projectType || null,
        projectSize: projectDraft.projectSize || null,
        floorLevel: projectDraft.floorLevel || null,
        accessDifficulty: projectDraft.accessDifficulty || null,
        installHeight: projectDraft.installHeight || null,
        materialHandling: projectDraft.materialHandling || null,
        wallSubstrate: projectDraft.wallSubstrate || null,
        laborBurdenPercent: Number(projectDraft.laborBurdenPercent ?? settingsDefaults?.defaultLaborBurdenPercent ?? 25),
        overheadPercent: Number(projectDraft.overheadPercent ?? settingsDefaults?.defaultOverheadPercent ?? 15),
        profitPercent: Number(projectDraft.profitPercent ?? settingsDefaults?.defaultProfitPercent ?? 10),
        taxPercent: Number(projectDraft.taxPercent ?? settingsDefaults?.defaultTaxPercent ?? 8.25),
        pricingMode: (projectDraft.pricingMode as PricingMode) || 'labor_and_material',
        selectedScopeCategories: projectDraft.selectedScopeCategories || [],
        jobConditions: normalizedJobConditions,
        notes: projectDraft.notes || null,
        specialNotes: projectDraft.specialNotes || null
      });

      const includedRooms = roomSuggestions.filter((room) => room.include);
      const createdRooms = includedRooms.length > 0
        ? await Promise.all(
            includedRooms.map((room) =>
              api.createV1Room({
                projectId: createdProject.id,
                roomName: normalizeRoomName(room.roomName)
              })
            )
          )
        : [await api.createV1Room({ projectId: createdProject.id, roomName: 'General' })];

      const roomMap = new Map<string, string>();
      for (const room of createdRooms) {
        roomMap.set(normalizeRoomName(room.roomName), room.id);
      }

      const linesToCreate = lineSuggestions.filter((line) => (createConfirmedOnly ? line.include : true));
      if (linesToCreate.length > 0) {
        const payload = linesToCreate.map((line) => ({
          projectId: createdProject.id,
          roomId: roomMap.get(normalizeRoomName(line.roomName)) || createdRooms[0].id,
          sourceType: mode,
          sourceRef: line.sourceReference || (mode === 'takeoff' ? (takeoffFileName || sourceProjectId || null) : (uploadedFileName || sourceProjectId || null)),
          description: line.description,
          sku: line.sku,
          category: line.category,
          qty: line.qty,
          unit: line.unit,
          materialCost: line.materialCost,
          laborMinutes: line.laborMinutes,
          laborCost: 0,
          catalogItemId: line.catalogItemId,
          notes: line.notes,
        }));
        await api.finalizeV1ParserLines(payload);
      }

      if (uploadedSourceFile) {
        try {
          await api.uploadV1ProjectFile({
            projectId: createdProject.id,
            fileName: uploadedSourceFile.name,
            mimeType: uploadedSourceFile.type || 'application/octet-stream',
            sizeBytes: uploadedSourceFile.size,
            dataBase64: await toBase64Payload(uploadedSourceFile),
          });
        } catch (fileError) {
          console.error(fileError);
          alert('Project created, but the original uploaded source file could not be attached.');
        }
      }

      navigate(`/project/${createdProject.id}?tab=takeoff`);
    } catch (error) {
      console.error(error);
      alert('Failed to create project from reviewed items.');
    } finally {
      setCreating(false);
    }
  }

  useEffect(() => {
    setProjectDateErrors(mapProjectDateErrors(collectPastProjectDateErrors({
      bidDate: projectDraft.bidDate,
      proposalDate: projectDraft.proposalDate,
      dueDate: projectDraft.dueDate,
    })));
  }, [projectDraft.bidDate, projectDraft.proposalDate, projectDraft.dueDate]);

  return (
    <div className="ui-page space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/')} className="ui-btn-secondary h-9 w-9 grid place-items-center px-0">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <p className="ui-label">New Project Workflow</p>
          <h1 className="text-2xl font-semibold text-slate-900 mt-1">Create New Project</h1>
          <p className="text-sm text-slate-500">Choose a creation path, parse source data, and confirm rooms/items before project creation.</p>
        </div>
      </div>

      <div className="ui-surface p-2 flex flex-wrap items-center gap-2 text-xs font-medium">
        {[
          '1. Start Type',
          '2. Source',
          '3. Project Basics',
          '4. Pricing + Scope',
          '5. Review Items',
        ].map((label, index) => {
          const active = step >= index + 1;
          return (
            <span key={label} className={`px-2.5 py-1 rounded-md ${active ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-600'}`}>
              {label}
            </span>
          );
        })}
      </div>

      {step === 1 && (
        <section className="ui-surface p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-800">How do you want to start?</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {[
              { key: 'blank', label: 'Blank Project', desc: 'Start with a clean project and add rooms and lines manually.', icon: PlusCircle },
              { key: 'takeoff', label: 'Create from Takeoff', desc: 'Upload a takeoff and review matched items before creating.', icon: FolderInput },
              { key: 'document', label: 'Create from Document', desc: 'Upload a scope or bid document and review extracted items.', icon: FileUp },
              { key: 'template', label: 'Use Template', desc: 'Start from a standard template and adjust during review.', icon: WandSparkles },
            ].map((option) => {
              const active = mode === option.key;
              return (
                <button
                  key={option.key}
                  onClick={() => setMode(option.key as CreationMode)}
                  className={`text-left border rounded-lg p-3.5 transition ${active ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-slate-200 bg-slate-50/40 hover:border-slate-300'}`}
                >
                  <div className="flex items-start gap-2">
                    <option.icon className={`w-4 h-4 mt-0.5 ${active ? 'text-blue-700' : 'text-slate-500'}`} />
                    <div>
                      <p className="text-sm font-medium text-slate-900">{option.label}</p>
                      <p className="text-xs text-slate-500 mt-1">{option.desc}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex justify-end pt-1">
            <button onClick={() => setStep(2)} className="h-9 px-4 rounded-md bg-blue-700 text-white text-sm font-medium hover:bg-blue-800">
              Next
            </button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="ui-surface p-5 space-y-5">
          <h2 className="text-sm font-semibold text-slate-800">Source Details</h2>

          {mode === 'takeoff' && (
            <>
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Upload Takeoff File</p>
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setTakeoffDragOver(true);
                  }}
                  onDragLeave={() => setTakeoffDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setTakeoffDragOver(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) void handleTakeoffFileUpload(file);
                  }}
                  className={`border-2 border-dashed rounded-lg p-5 bg-slate-50 ${takeoffDragOver ? 'border-blue-400 bg-blue-50' : 'border-slate-300'}`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Upload className="w-4 h-4 text-slate-500" />
                    <p className="text-sm font-medium text-slate-800">Upload Takeoff File</p>
                  </div>
                  <p className="text-xs text-slate-500 mb-2">Upload a PDF, Excel, or CSV takeoff file.</p>
                  <p className="text-xs text-slate-500 mb-3">Drag and drop here, or browse for a file.</p>
                  <input
                    type="file"
                    accept=".pdf,.xlsx,.xls,.csv"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleTakeoffFileUpload(file);
                    }}
                    className="block w-full text-sm"
                  />
                  {takeoffFileName && (
                    <p className={`text-xs mt-3 ${takeoffUploadState === 'error' ? 'text-red-700' : takeoffUploadState === 'ready' ? 'text-emerald-700' : 'text-amber-700'}`}>
                      {takeoffUploadState === 'processing' ? `Processing file: ${takeoffFileName}` : takeoffUploadState === 'error' ? `File needs attention: ${takeoffFileName}` : `Source file loaded: ${takeoffFileName}`}
                    </p>
                  )}
                  {takeoffUploadMessage ? <p className="text-xs text-slate-500 mt-1">{takeoffUploadMessage}</p> : null}
                  {takeoffStructuredKind && (
                    <p className="text-xs text-slate-600 mt-1">Detected structure: {takeoffStructuredKind.replace(/-/g, ' ')}</p>
                  )}
                  {intakeWarnings.length > 0 && (
                    <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-2">
                      <p className="text-xs font-semibold text-amber-800">Extraction warnings</p>
                      <ul className="mt-1 space-y-1">
                        {intakeWarnings.map((warning, index) => (
                          <li key={`${warning}-${index}`} className="text-xs text-amber-800">- {warning}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>

              <label className="block text-xs text-slate-600 space-y-1">
                Paste Takeoff Text (optional)
                <textarea
                  rows={5}
                  value={takeoffImportText}
                  onChange={(e) => setTakeoffImportText(e.target.value)}
                  placeholder="Paste takeoff lines (one item per line)"
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm"
                />
              </label>

              <label className="block text-xs text-slate-600 space-y-1">
                Optional: Use Existing Project Takeoff (secondary source)
                <select
                  value={sourceProjectId}
                  onChange={(e) => setSourceProjectId(e.target.value)}
                  className="mt-1 h-9 w-full rounded border border-slate-300 px-2 text-sm"
                >
                  <option value="">None</option>
                  {availableProjectSources.map((project) => (
                    <option key={project.id} value={project.id}>{project.projectName} ({project.id.slice(0, 8)})</option>
                  ))}
                </select>
              </label>
            </>
          )}

          {mode === 'document' && (
            <>
              <label className="block text-xs text-slate-600 space-y-1">
                Upload Source File
                <input
                  type="file"
                  accept=".pdf,.txt,.csv"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleDocumentUpload(file);
                  }}
                  className="mt-1 block w-full text-sm"
                />
              </label>
              <p className="text-xs text-slate-500">
                {uploadedFileName ? `Source file loaded: ${uploadedFileName}` : 'No file uploaded yet.'}
              </p>
              {intakeWarnings.length > 0 && (
                <div className="rounded border border-amber-300 bg-amber-50 p-2">
                  <p className="text-xs font-semibold text-amber-800">Extraction warnings</p>
                  <ul className="mt-1 space-y-1">
                    {intakeWarnings.map((warning, index) => (
                      <li key={`${warning}-${index}`} className="text-xs text-amber-800">- {warning}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {mode === 'blank' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Rooms / Areas</p>
                  <h3 className="text-sm font-semibold text-slate-900 mt-1">Decide how the project will be organized before you create it.</h3>
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={blankUsesRooms} onChange={(e) => setBlankUsesRooms(e.target.checked)} />
                  Track this project by rooms / areas
                </label>
                {blankUsesRooms ? (
                  <label className="block text-xs text-slate-600 space-y-1">
                    Room Names
                    <textarea
                      rows={5}
                      value={blankRoomNames}
                      onChange={(e) => setBlankRoomNames(e.target.value)}
                      placeholder={'Lobby\nMain Restroom\nBreak Room'}
                      className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm"
                    />
                    <span className="block text-[11px] text-slate-500">Enter one room per line. If left blank, a starter room will be created for you.</span>
                  </label>
                ) : (
                  <p className="text-xs text-slate-500">The project will start with one project-wide scope bucket instead of room-by-room organization.</p>
                )}
              </div>
            </div>
          )}

          {mode === 'template' && (
            <p className="text-sm text-slate-600">No source file needed for this start type. Continue to review.</p>
          )}

          <div className="flex justify-between pt-1">
            <button onClick={() => setStep(1)} className="h-9 px-4 rounded-md border border-slate-300 text-sm font-medium hover:bg-slate-50">Back</button>
            <button onClick={() => void proceedToBasics()} disabled={takeoffUploadState === 'processing'} className="ui-btn-primary h-9 px-4 disabled:opacity-50">{takeoffUploadState === 'processing' ? 'Processing Upload...' : 'Continue to Basics'}</button>
          </div>
        </section>
      )}

      {(step === 3 || step === 4 || step === 5) && (
        <section className="space-y-5">
          {(step === 3 || step === 4) && (
            <div className="ui-surface p-5 space-y-3">
              <h2 className="text-sm font-semibold text-slate-800">{step === 3 ? 'Project Basics' : 'Pricing + Scope Setup'}</h2>
              <p className="text-xs text-slate-500">{step === 3 ? 'Capture the required intake details before pricing and review.' : 'Set pricing basis, active scope categories, and job conditions before project creation.'}</p>
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.9fr)]">
                <div className="space-y-4">
                  {step === 3 ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Job Basics</p>
                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label className="text-xs text-slate-600">Project Name<input className="ui-input mt-1" value={projectDraft.projectName || ''} onChange={(e) => patchProjectDraft({ projectName: e.target.value })} /></label>
                    <label className="text-xs text-slate-600">Bid Package / Job #<input className="ui-input mt-1" value={projectDraft.projectNumber || ''} onChange={(e) => patchProjectDraft({ projectNumber: e.target.value })} /></label>
                    <label className="text-xs text-slate-600">Client<input className="ui-input mt-1" value={projectDraft.clientName || ''} onChange={(e) => patchProjectDraft({ clientName: e.target.value })} /></label>
                    <label className="text-xs text-slate-600">GC<input className="ui-input mt-1" value={projectDraft.generalContractor || ''} onChange={(e) => patchProjectDraft({ generalContractor: e.target.value })} /></label>
                    <label className="text-xs text-slate-600">Estimator<input className="ui-input mt-1" value={projectDraft.estimator || ''} onChange={(e) => patchProjectDraft({ estimator: e.target.value })} /></label>
                    <label className="text-xs text-slate-600">Project Type
                      <select className="ui-input mt-1" value={projectDraft.projectType || 'Commercial'} onChange={(e) => patchProjectDraft({ projectType: e.target.value })}>
                        <option value="Commercial">Commercial</option>
                        <option value="Residential">Residential</option>
                        <option value="Industrial">Industrial</option>
                        <option value="Institutional">Institutional</option>
                        <option value="Multi-Family">Multi-Family</option>
                      </select>
                    </label>
                    <label className="text-xs text-slate-600 md:col-span-2">Bid Due Date<input type="date" className={`ui-input mt-1 ${projectDateErrors.bidDate ? 'border-red-300 ring-1 ring-red-200' : ''}`} value={unifiedProjectDate} onChange={(e) => patchProjectDate(e.target.value)} />{projectDateErrors.bidDate ? <span className="mt-1 block text-[11px] text-red-600">{projectDateErrors.bidDate}</span> : null}</label>
                    <label className="text-xs text-slate-600 md:col-span-2">Site Address
                      <textarea
                        rows={2}
                        className="ui-input mt-1 min-h-[84px] py-2"
                        value={projectDraft.address || ''}
                        onChange={(e) => {
                          patchProjectDraft({ address: e.target.value });
                          setDistanceError(null);
                          setDistanceMessage('Address updated. Recalculate travel distance.');
                          patchDraftJobConditions({ travelDistanceMiles: null });
                        }}
                      />
                    </label>
                  </div>
                </div>
                  ) : null}

                  {step === 4 ? (
                    <>
                <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Pricing</p>
                      <p className="mt-1 text-xs text-slate-500">Set markups, crew assumptions, and adders now.</p>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-[11px] font-medium text-slate-600 shadow-sm ring-1 ring-slate-200">Settings defaults loaded</span>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <label className="text-xs text-slate-600">Price Mode
                      <select className="ui-input mt-1" value={(projectDraft.pricingMode as PricingMode) || 'labor_and_material'} onChange={(e) => patchProjectDraft({ pricingMode: e.target.value as PricingMode })}>
                        <option value="material_only">Material Only</option>
                        <option value="labor_only">Install Only</option>
                        <option value="labor_and_material">Material + Install</option>
                      </select>
                    </label>
                    <label className="text-xs text-slate-600">Burden %<input type="number" step="0.01" className="ui-input mt-1" value={projectDraft.laborBurdenPercent ?? ''} onChange={(e) => patchProjectDraft({ laborBurdenPercent: Number(e.target.value) || 0 })} /></label>
                    <label className="text-xs text-slate-600">Overhead %<input type="number" step="0.01" className="ui-input mt-1" value={projectDraft.overheadPercent ?? ''} onChange={(e) => patchProjectDraft({ overheadPercent: Number(e.target.value) || 0 })} /></label>
                    <label className="text-xs text-slate-600">Profit %<input type="number" step="0.01" className="ui-input mt-1" value={projectDraft.profitPercent ?? ''} onChange={(e) => patchProjectDraft({ profitPercent: Number(e.target.value) || 0 })} /></label>
                    <label className="text-xs text-slate-600">Tax %<input type="number" step="0.01" className="ui-input mt-1" value={projectDraft.taxPercent ?? ''} onChange={(e) => patchProjectDraft({ taxPercent: Number(e.target.value) || 0 })} /></label>
                    <label className="text-xs text-slate-600">Labor Factor<input type="number" step="0.01" className="ui-input mt-1" value={normalizeProjectJobConditions(projectDraft.jobConditions).laborRateMultiplier} onChange={(e) => patchDraftJobConditions({ laborRateMultiplier: Number(e.target.value) || 1 })} /></label>
                    <label className="text-xs text-slate-600">Adder %<input type="number" step="0.01" className="ui-input mt-1" value={normalizeProjectJobConditions(projectDraft.jobConditions).estimateAdderPercent} onChange={(e) => patchDraftJobConditions({ estimateAdderPercent: Number(e.target.value) || 0 })} /></label>
                    <label className="text-xs text-slate-600">Adder $<input type="number" step="0.01" className="ui-input mt-1" value={normalizeProjectJobConditions(projectDraft.jobConditions).estimateAdderAmount} onChange={(e) => patchDraftJobConditions({ estimateAdderAmount: Number(e.target.value) || 0 })} /></label>
                    <label className="text-xs text-slate-600">Crew Size<input type="number" min={1} className="ui-input mt-1" value={normalizeProjectJobConditions(projectDraft.jobConditions).installerCount} onChange={(e) => patchDraftJobConditions({ installerCount: Number(e.target.value) || 1 })} /></label>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Scope Categories</p>
                  <p className="mt-1 text-xs text-slate-500">Pick the scope buckets this job should keep active.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {scopeCategoryOptions.map((category) => {
                      const active = (projectDraft.selectedScopeCategories || []).includes(category);
                      return (
                        <button
                          key={category}
                          type="button"
                          onClick={() => patchProjectDraft({
                            selectedScopeCategories: active
                              ? (projectDraft.selectedScopeCategories || []).filter((entry) => entry !== category)
                              : [...(projectDraft.selectedScopeCategories || []), category].sort(),
                          })}
                          className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${active ? 'bg-blue-700 text-white shadow-sm' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`}
                        >
                          {category}
                        </button>
                      );
                    })}
                    {scopeCategoryOptions.length === 0 ? <p className="text-xs text-slate-500">Categories appear after review lines load.</p> : null}
                  </div>
                </div>
                    </>
                  ) : null}
                </div>

                <div className="space-y-4">
                  {step === 3 ? (
                    <>
                      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Required Before Pricing</p>
                        <div className="mt-3 space-y-2">
                          {['Project name', 'Client', 'Site address', 'Project type', 'Bid due date'].map((label) => {
                            const missing = basicsChecklist.includes(label);
                            return (
                              <div key={label} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm">
                                <span className="text-slate-700">{label}</span>
                                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${missing ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                                  {missing ? 'Required' : 'Ready'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Source Summary</p>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                            <p className="text-slate-500">Creation mode</p>
                            <p className="mt-1 font-semibold text-slate-900 capitalize">{mode.replace(/_/g, ' ')}</p>
                          </div>
                          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                            <p className="text-slate-500">Detected items</p>
                            <p className="mt-1 font-semibold text-slate-900">{lineSuggestions.length}</p>
                          </div>
                          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                            <p className="text-slate-500">Detected rooms</p>
                            <p className="mt-1 font-semibold text-slate-900">{roomSuggestions.length || 1}</p>
                          </div>
                          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                            <p className="text-slate-500">Warnings</p>
                            <p className="mt-1 font-semibold text-slate-900">{intakeWarnings.length}</p>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : null}

                  {step === 4 ? (
                    <>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Travel Distance</p>
                      <p className="mt-1 text-xs text-slate-500">Office: {OFFICE_ADDRESS}</p>
                    </div>
                    <button type="button" onClick={() => void refreshDraftDistance()} className="ui-btn-secondary h-9 px-3 text-[11px]" disabled={distanceCalculating}>{distanceCalculating ? 'Calculating...' : 'Calc Miles'}</button>
                  </div>
                  <div className="mt-3 rounded-2xl bg-slate-50/80 p-3 text-sm text-slate-700 ring-1 ring-slate-200/80">
                    <p className="font-medium text-slate-900">{normalizeProjectJobConditions(projectDraft.jobConditions).travelDistanceMiles !== null ? `${formatNumberSafe(normalizeProjectJobConditions(projectDraft.jobConditions).travelDistanceMiles, 1)} miles from office.` : distanceMessage}</p>
                    {distanceError ? <p className="mt-1 text-xs text-red-600">{distanceError}</p> : null}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Job Conditions</p>
                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label className="text-xs text-slate-600">Project Size
                      <select className="ui-input mt-1" value={projectDraft.projectSize || 'Medium'} onChange={(e) => patchProjectDraft({ projectSize: e.target.value })}>
                        <option value="Small">Small</option>
                        <option value="Medium">Medium</option>
                        <option value="Large">Large</option>
                      </select>
                    </label>
                    <label className="text-xs text-slate-600">Floor Level
                      <select className="ui-input mt-1" value={projectDraft.floorLevel || 'Ground'} onChange={(e) => patchProjectDraft({ floorLevel: e.target.value })}>
                        <option value="Ground">Ground</option>
                        <option value="2-3">2-3</option>
                        <option value="4+">4+</option>
                      </select>
                    </label>
                    <label className="text-xs text-slate-600">Access Difficulty
                      <select className="ui-input mt-1" value={projectDraft.accessDifficulty || 'Easy'} onChange={(e) => patchProjectDraft({ accessDifficulty: e.target.value })}>
                        <option value="Easy">Easy</option>
                        <option value="Moderate">Moderate</option>
                        <option value="Difficult">Difficult</option>
                      </select>
                    </label>
                    <label className="text-xs text-slate-600">Install Height
                      <select className="ui-input mt-1" value={projectDraft.installHeight || 'Standard'} onChange={(e) => patchProjectDraft({ installHeight: e.target.value })}>
                        <option value="Standard">Standard</option>
                        <option value="Ladder">Ladder</option>
                        <option value="Lift">Lift</option>
                        <option value="Scaffold">Scaffold</option>
                      </select>
                    </label>
                    <label className="text-xs text-slate-600">Material Handling
                      <select className="ui-input mt-1" value={projectDraft.materialHandling || 'Standard'} onChange={(e) => patchProjectDraft({ materialHandling: e.target.value })}>
                        <option value="Standard">Standard</option>
                        <option value="Manual">Manual</option>
                        <option value="Multiple Moves">Multiple Moves</option>
                      </select>
                    </label>
                    <label className="text-xs text-slate-600">Wall Substrate
                      <select className="ui-input mt-1" value={projectDraft.wallSubstrate || 'Drywall'} onChange={(e) => patchProjectDraft({ wallSubstrate: e.target.value })}>
                        <option value="Drywall">Drywall</option>
                        <option value="CMU">CMU</option>
                        <option value="Concrete">Concrete</option>
                        <option value="Tile">Tile</option>
                      </select>
                    </label>
                    <label className="text-xs text-slate-600">Floors<input type="number" min={1} className="ui-input mt-1" value={normalizeProjectJobConditions(projectDraft.jobConditions).floors} onChange={(e) => patchDraftJobConditions({ floors: Number(e.target.value) || 1 })} /></label>
                    <label className="text-xs text-slate-600">Tax / Location Note<input className="ui-input mt-1" value={normalizeProjectJobConditions(projectDraft.jobConditions).locationLabel || ''} onChange={(e) => patchDraftJobConditions({ locationLabel: e.target.value })} /></label>
                    <label className="text-xs text-slate-600">Tax Override %<input type="number" step="0.01" className="ui-input mt-1" value={normalizeProjectJobConditions(projectDraft.jobConditions).locationTaxPercent ?? ''} onChange={(e) => patchDraftJobConditions({ locationTaxPercent: e.target.value === '' ? null : Number(e.target.value) })} /></label>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Job Adders</p>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {[
                      ['prevailingWage', 'Prevailing wage'],
                      ['occupiedBuilding', 'Occupied building'],
                      ['restrictedAccess', 'Restricted access'],
                      ['nightWork', 'Night work'],
                      ['phasedWork', 'Phased work'],
                      ['remoteTravel', 'Remote travel'],
                      ['scheduleCompression', 'Schedule compression'],
                      ['smallJobFactor', 'Small job factor'],
                      ['deliveryRequired', 'Delivery required'],
                    ].map(([key, label]) => {
                      const active = Boolean(normalizeProjectJobConditions(projectDraft.jobConditions)[key as keyof ProjectJobConditions]);
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => {
                            if (key === 'phasedWork') {
                              promptForPhasedWorkDraft(!active);
                              return;
                            }

                            if (key === 'deliveryRequired') {
                              if (active) {
                                patchDraftJobConditions({ deliveryRequired: false, deliveryAutoCalculated: false });
                                return;
                              }

                              applyDraftDeliveryRecommendation(normalizeProjectJobConditions(projectDraft.jobConditions).travelDistanceMiles, { force: true });
                              return;
                            }

                            patchDraftJobConditions({ [key]: !active } as Partial<ProjectJobConditions>);
                          }}
                          className={`flex items-center justify-between rounded-2xl px-3 py-3 text-left text-sm transition ${active ? 'bg-blue-50 text-blue-800 ring-1 ring-blue-200' : 'bg-slate-50 text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100'}`}
                        >
                          <span>{label}</span>
                          <span className={`h-2.5 w-2.5 rounded-full ${active ? 'bg-blue-700' : 'bg-slate-300'}`} />
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label className="text-xs text-slate-600">Delivery Mode
                      <select className="ui-input mt-1" value={normalizeProjectJobConditions(projectDraft.jobConditions).deliveryPricingMode} onChange={(e) => patchDraftJobConditions({ deliveryPricingMode: e.target.value as ProjectJobConditions['deliveryPricingMode'], deliveryAutoCalculated: false })}>
                        <option value="included">Included</option>
                        <option value="flat">Flat</option>
                        <option value="percent">Percent</option>
                      </select>
                    </label>
                    <label className="text-xs text-slate-600">Delivery $<input type="number" step="0.01" className="ui-input mt-1" value={normalizeProjectJobConditions(projectDraft.jobConditions).deliveryValue} onChange={(e) => patchDraftJobConditions({ deliveryValue: Number(e.target.value) || 0, deliveryAutoCalculated: false })} /></label>
                    <label className="text-xs text-slate-600">Delivery Lead Time (business days)<input type="number" min={0} className="ui-input mt-1" value={normalizeProjectJobConditions(projectDraft.jobConditions).deliveryLeadDays} onChange={(e) => patchDraftJobConditions({ deliveryLeadDays: Number(e.target.value) || 0, deliveryAutoCalculated: false })} /></label>
                    <div className="rounded-2xl bg-slate-50 px-3 py-3 text-xs text-slate-600 ring-1 ring-slate-200">
                      <p className="font-medium text-slate-900">Delivery recommendation</p>
                      <p className="mt-1">{normalizeProjectJobConditions(projectDraft.jobConditions).deliveryRequired ? `${formatNumberSafe(normalizeProjectJobConditions(projectDraft.jobConditions).travelDistanceMiles || 0, 1)} miles mapped to ${normalizeProjectJobConditions(projectDraft.jobConditions).deliveryLeadDays} business day${normalizeProjectJobConditions(projectDraft.jobConditions).deliveryLeadDays === 1 ? '' : 's'} and ${normalizeProjectJobConditions(projectDraft.jobConditions).deliveryPricingMode === 'flat' ? formatNumberSafe(normalizeProjectJobConditions(projectDraft.jobConditions).deliveryValue, 2) : normalizeProjectJobConditions(projectDraft.jobConditions).deliveryPricingMode}.` : 'Import or add the job address to auto-fill delivery cost and lead time.'}</p>
                      <button type="button" className="mt-2 text-[11px] font-semibold text-blue-700 hover:text-blue-800" onClick={() => applyDraftDeliveryRecommendation(normalizeProjectJobConditions(projectDraft.jobConditions).travelDistanceMiles, { force: true })}>Refresh delivery recommendation</button>
                    </div>
                  </div>

                  {normalizeProjectJobConditions(projectDraft.jobConditions).phasedWork ? (
                    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                      <label className="text-xs text-slate-600">Phase Count<input type="number" min={2} className="ui-input mt-1" value={normalizeProjectJobConditions(projectDraft.jobConditions).phasedWorkPhases} onChange={(e) => {
                        const phaseCount = Math.max(2, Number(e.target.value) || 2);
                        patchDraftJobConditions({ phasedWorkPhases: phaseCount, phasedWorkMultiplier: recommendedPhasedWorkMultiplier(phaseCount) });
                      }} /></label>
                      <label className="text-xs text-slate-600">Phased Labor Multiplier<input type="number" step="0.01" className="ui-input mt-1" value={normalizeProjectJobConditions(projectDraft.jobConditions).phasedWorkMultiplier} onChange={(e) => patchDraftJobConditions({ phasedWorkMultiplier: Number(e.target.value) || 0 })} /></label>
                    </div>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Notes</p>
                  <div className="mt-3 space-y-3">
                    <label className="text-xs text-slate-600">Proposal Notes
                      <textarea rows={4} className="ui-input mt-1 min-h-[112px] py-2" value={projectDraft.specialNotes || ''} onChange={(e) => patchProjectDraft({ specialNotes: e.target.value })} />
                    </label>
                    <label className="text-xs text-slate-600">Internal Notes
                      <textarea rows={4} className="ui-input mt-1 min-h-[112px] py-2" value={projectDraft.notes || ''} onChange={(e) => patchProjectDraft({ notes: e.target.value })} />
                    </label>
                  </div>
                </div>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-2">
                <button onClick={() => setStep(step === 3 ? 2 : 3)} className="ui-btn-secondary">Back</button>
                <button onClick={() => (step === 3 ? proceedToPricingSetup() : proceedToReviewItems())} className="ui-btn-primary h-9 px-4">
                  {step === 3 ? 'Continue to Pricing' : 'Continue to Review'}
                </button>
              </div>
            </div>
          )}

          {step === 5 && (
            <>
          {parserReviewSummary ? (
            <div className={`rounded-[28px] border p-5 shadow-sm ${
              parserReviewSummary.recommendedAction === 'auto-import'
                ? 'border-emerald-200 bg-emerald-50/80'
                : parserReviewSummary.recommendedAction === 'manual-template'
                  ? 'border-red-200 bg-red-50/80'
                  : 'border-amber-200 bg-amber-50/80'
            }`}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">Parser Review</p>
                  <h3 className="mt-1 text-lg font-semibold text-slate-950">{formatRecommendedAction(parserReviewSummary.recommendedAction)}</h3>
                  <p className="mt-2 text-sm text-slate-700">
                    Strategy: <span className="font-medium">{formatParserStrategy(parserReviewSummary.parserStrategy)}</span>
                    {' · '}
                    Confidence: <span className="font-medium">{formatConfidencePercent(parserReviewSummary.overallConfidence)}</span>
                    {' · '}
                    File type: <span className="font-medium uppercase">{parserReviewSummary.fileType || 'unknown'}</span>
                  </p>
                </div>

                {parserReviewSummary.recommendedAction === 'manual-template' ? (
                  <button onClick={applyManualTemplateFallback} className="inline-flex h-10 items-center rounded-full bg-red-600 px-4 text-[11px] font-semibold text-white hover:bg-red-700">
                    Use Manual Template
                  </button>
                ) : null}
              </div>

              <div className="mt-4 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                  <div className="rounded-2xl border border-white/70 bg-white/70 px-3 py-3">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Overall Confidence</p>
                    <p className="mt-2 text-lg font-semibold text-slate-950">{formatConfidencePercent(parserReviewSummary.overallConfidence)}</p>
                  </div>
                  <div className="rounded-2xl border border-white/70 bg-white/70 px-3 py-3">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Parsed Qty</p>
                    <p className="mt-2 text-lg font-semibold text-slate-950">{formatNumberSafe(parsedQuantityTotal)}</p>
                  </div>
                  <div className="rounded-2xl border border-white/70 bg-white/70 px-3 py-3">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Validation Errors</p>
                    <p className="mt-2 text-lg font-semibold text-slate-950">{parserReviewSummary.validationErrors.length}</p>
                  </div>
                  <div className="rounded-2xl border border-white/70 bg-white/70 px-3 py-3">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Validation Warnings</p>
                    <p className="mt-2 text-lg font-semibold text-slate-950">{parserReviewSummary.validationWarnings.length}</p>
                  </div>
                  <div className="rounded-2xl border border-white/70 bg-white/70 px-3 py-3">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Parse Warnings</p>
                    <p className="mt-2 text-lg font-semibold text-slate-950">{parserReviewSummary.parseWarnings.length}</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/70 bg-white/70 p-4 text-sm text-slate-700">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Source Summary</p>
                  <div className="mt-3 space-y-1.5">
                    <p><span className="font-medium text-slate-900">File:</span> {parserReviewSummary.sourceSummary?.fileName || takeoffFileName || uploadedFileName || 'Current upload'}</p>
                    {parserReviewSummary.sourceSummary?.sheetsProcessed?.length ? <p><span className="font-medium text-slate-900">Sheets:</span> {parserReviewSummary.sourceSummary.sheetsProcessed.join(', ')}</p> : null}
                    {parserReviewSummary.sourceSummary?.pagesProcessed?.length ? <p><span className="font-medium text-slate-900">Pages:</span> {parserReviewSummary.sourceSummary.pagesProcessed.join(', ')}</p> : null}
                  </div>
                </div>
              </div>

              {(parserReviewSummary.validationErrors.length > 0 || parserReviewSummary.validationWarnings.length > 0 || parserReviewSummary.parseWarnings.length > 0) ? (
                <div className="mt-4 grid gap-4 xl:grid-cols-3">
                  <div className="rounded-2xl border border-white/70 bg-white/70 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Validation Errors</p>
                    {parserReviewSummary.validationErrors.length > 0 ? (
                      <ul className="mt-3 space-y-1 text-xs text-red-700">
                        {parserReviewSummary.validationErrors.map((entry) => <li key={entry}>- {entry}</li>)}
                      </ul>
                    ) : <p className="mt-3 text-xs text-slate-500">No blocking validation errors.</p>}
                  </div>
                  <div className="rounded-2xl border border-white/70 bg-white/70 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Validation Warnings</p>
                    {parserReviewSummary.validationWarnings.length > 0 ? (
                      <ul className="mt-3 space-y-1 text-xs text-amber-700">
                        {parserReviewSummary.validationWarnings.map((entry) => <li key={entry}>- {entry}</li>)}
                      </ul>
                    ) : <p className="mt-3 text-xs text-slate-500">No validation warnings.</p>}
                  </div>
                  <div className="rounded-2xl border border-white/70 bg-white/70 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Parser Warnings</p>
                    {parserReviewSummary.parseWarnings.length > 0 ? (
                      <ul className="mt-3 space-y-1 text-xs text-slate-700">
                        {parserReviewSummary.parseWarnings.map((entry) => <li key={entry}>- {entry}</li>)}
                      </ul>
                    ) : <p className="mt-3 text-xs text-slate-500">No parser warnings.</p>}
                  </div>
                </div>
              ) : null}

              {groupedWarningSummaries.length > 0 ? (
                <div className="mt-4 rounded-2xl border border-white/70 bg-white/70 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Grouped Warnings</p>
                      <p className="mt-1 text-xs text-slate-600">Repeated warning variants are collapsed into issue groups so review focuses on root causes.</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                      {groupedWarningSummaries.length} groups
                    </span>
                  </div>
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    {groupedWarningSummaries.map((group) => {
                      const toneClass = group.tone === 'danger'
                        ? 'border-red-200 bg-red-50/70 text-red-900'
                        : group.tone === 'warning'
                          ? 'border-amber-200 bg-amber-50/70 text-amber-900'
                          : 'border-slate-200 bg-slate-50/80 text-slate-900';

                      return (
                        <div key={group.key} className={`rounded-2xl border p-3 ${toneClass}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-xs font-semibold">{group.label}</p>
                              <p className="mt-1 text-[11px] opacity-80">{group.count} occurrence{group.count === 1 ? '' : 's'}</p>
                            </div>
                            <span className="rounded-full bg-white/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]">
                              {group.tone}
                            </span>
                          </div>
                          <ul className="mt-3 space-y-1 text-[11px] opacity-90">
                            {group.examples.map((example) => <li key={example}>- {example}</li>)}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="grid grid-cols-1 xl:grid-cols-[300px_minmax(0,1fr)] gap-4">
            <div className="ui-surface p-4">
              <h3 className="text-sm font-semibold text-slate-800 mb-3">Rooms / Areas</h3>
              <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
                {roomSuggestions.map((room) => (
                  <div key={room.id} className="flex items-center gap-2">
                    <input type="checkbox" checked={room.include} onChange={(e) => setRoomSuggestions((prev) => prev.map((item) => item.id === room.id ? { ...item, include: e.target.checked } : item))} />
                    <input className="ui-input h-8 flex-1" value={room.roomName} onChange={(e) => setRoomSuggestions((prev) => prev.map((item) => item.id === room.id ? { ...item, roomName: e.target.value } : item))} />
                  </div>
                ))}
                {roomSuggestions.length === 0 && <p className="text-xs text-slate-500">No rooms were detected. A General room will be created.</p>}
              </div>
            </div>

            <div className="ui-surface p-4 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-800 mb-2">Matched Items</h3>
                <p className="text-xs text-slate-500 mb-3">These items were auto-linked to your catalog first. Suggested matches are prefilled but labeled for quick review.</p>
                <div className="space-y-2 max-h-[36vh] overflow-y-auto pr-1">
                  {matchedSuggestions.map((line) => (
                    <div key={line.id} className="border border-emerald-200 bg-emerald-50/30 rounded-md p-2">
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={line.include}
                          onChange={(e) => patchLineSuggestion(line.id, { include: e.target.checked })}
                        />
                        <div className="text-xs text-slate-700 flex-1 space-y-2">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            <label className="text-[11px] text-slate-600">Room / Area
                              <input className="ui-input mt-1 h-8" value={line.roomName || ''} onChange={(e) => patchLineSuggestion(line.id, { roomName: e.target.value })} />
                            </label>
                            <label className="text-[11px] text-slate-600">Category
                              <input className="ui-input mt-1 h-8" value={line.category || ''} onChange={(e) => patchLineSuggestion(line.id, { category: e.target.value || null })} />
                            </label>
                            <label className="text-[11px] text-slate-600">Item
                              <input className="ui-input mt-1 h-8" value={line.itemName || ''} onChange={(e) => patchLineSuggestion(line.id, { itemName: e.target.value })} />
                            </label>
                            <label className="text-[11px] text-slate-600">Matched SKU
                              <input className="ui-input mt-1 h-8" value={line.sku || ''} onChange={(e) => patchLineSuggestion(line.id, { sku: e.target.value || null })} />
                            </label>
                            <label className="text-[11px] text-slate-600 md:col-span-2">Description
                              <input className="ui-input mt-1 h-8" value={line.description} onChange={(e) => patchLineSuggestion(line.id, { description: e.target.value })} />
                            </label>
                            <label className="text-[11px] text-slate-600">Quantity
                              <input type="number" className="ui-input mt-1 h-8" value={line.qty} onChange={(e) => patchLineSuggestion(line.id, { qty: Number(e.target.value) || 0 })} />
                            </label>
                            <label className="text-[11px] text-slate-600">Unit
                              <input className="ui-input mt-1 h-8" value={line.unit} onChange={(e) => patchLineSuggestion(line.id, { unit: e.target.value })} />
                            </label>
                            <label className="text-[11px] text-slate-600 md:col-span-2">Notes
                              <input className="ui-input mt-1 h-8" value={line.notes || ''} onChange={(e) => patchLineSuggestion(line.id, { notes: e.target.value })} />
                            </label>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-[11px]">
                            <span className={`inline-flex rounded-full px-2 py-0.5 font-medium ${line.matchConfidence === 'possible' ? 'border border-amber-200 bg-amber-50 text-amber-700' : 'border border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                              {line.matchConfidence === 'possible' ? 'Suggested Match' : 'Matched'}
                            </span>
                            {line.matchReason ? <span className="text-slate-500">{line.matchReason}</span> : null}
                            <span className="text-slate-500">{line.catalogItemId ? `Catalog ID ${line.catalogItemId}` : 'No catalog ID stored'}</span>
                            <span className="text-slate-500">Source {line.sourceReference || 'unknown'}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {matchedSuggestions.length === 0 && <p className="text-xs text-slate-500">No matched items yet.</p>}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100">
                <h3 className="text-sm font-semibold text-slate-800 mb-2">Needs Match</h3>
                <p className="text-xs text-slate-500 mb-3">Choose Match, Add to Catalog, or Ignore for each item.</p>
                <div className="space-y-2 max-h-[42vh] overflow-y-auto pr-1">
                  {unmatchedSuggestions.map((line) => (
                    <div key={line.id} className="border border-amber-200 bg-amber-50/35 rounded-md p-2.5">
                      <div className="text-xs text-slate-700 mb-2 space-y-2">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          <label className="text-[11px] text-slate-600">Room / Area
                            <input className="ui-input mt-1 h-8" value={line.roomName || ''} onChange={(e) => patchLineSuggestion(line.id, { roomName: e.target.value })} />
                          </label>
                          <label className="text-[11px] text-slate-600">Category
                            <input className="ui-input mt-1 h-8" value={line.category || ''} onChange={(e) => patchLineSuggestion(line.id, { category: e.target.value || null })} />
                          </label>
                          <label className="text-[11px] text-slate-600">Item
                            <input className="ui-input mt-1 h-8" value={line.itemName || ''} onChange={(e) => patchLineSuggestion(line.id, { itemName: e.target.value })} />
                          </label>
                          <label className="text-[11px] text-slate-600">Potential SKU
                            <input className="ui-input mt-1 h-8" value={line.sku || ''} onChange={(e) => patchLineSuggestion(line.id, { sku: e.target.value || null })} />
                          </label>
                          <label className="text-[11px] text-slate-600 md:col-span-2">Description
                            <input className="ui-input mt-1 h-8" value={line.description} onChange={(e) => patchLineSuggestion(line.id, { description: e.target.value })} />
                          </label>
                          <label className="text-[11px] text-slate-600">Quantity
                            <input type="number" className="ui-input mt-1 h-8" value={line.qty} onChange={(e) => patchLineSuggestion(line.id, { qty: Number(e.target.value) || 0 })} />
                          </label>
                          <label className="text-[11px] text-slate-600">Unit
                            <input className="ui-input mt-1 h-8" value={line.unit} onChange={(e) => patchLineSuggestion(line.id, { unit: e.target.value })} />
                          </label>
                          <label className="text-[11px] text-slate-600 md:col-span-2">Notes
                            <input className="ui-input mt-1 h-8" value={line.notes || ''} onChange={(e) => patchLineSuggestion(line.id, { notes: e.target.value })} />
                          </label>
                        </div>
                        {!line.include && <p className="text-amber-700 font-semibold">Ignored</p>}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] text-slate-500 mr-auto">Source {line.sourceReference || 'unknown'}</span>
                        <button
                          onClick={() => setCatalogPickerLineId(line.id)}
                          className="ui-btn-secondary h-7 px-2 text-xs"
                        >
                          Match
                        </button>
                        <button
                          onClick={() => openNewCatalogFromLine(line.id)}
                          className="ui-btn-secondary h-7 px-2 text-xs"
                        >
                          Add to Catalog
                        </button>
                        {line.include ? (
                          <button
                            onClick={() => ignoreLine(line.id)}
                            className="h-7 px-2 rounded border border-red-200 text-red-700 bg-white text-xs hover:bg-red-50"
                          >
                            Ignore
                          </button>
                        ) : (
                          <button
                            onClick={() => reincludeLine(line.id)}
                            className="h-7 px-2 rounded border border-emerald-200 text-emerald-700 bg-white text-xs hover:bg-emerald-50"
                          >
                            Include
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {unmatchedSuggestions.length === 0 && <p className="text-xs text-slate-500">No items need a match.</p>}
                </div>
              </div>
            </div>
          </div>

          <div className="ui-surface p-4 sticky bottom-3 z-10 flex items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={createConfirmedOnly} onChange={(e) => setCreateConfirmedOnly(e.target.checked)} />
                Only add confirmed items
              </label>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-700">
                {includedRoomCount || 1} room{includedRoomCount === 1 ? '' : 's'} · {includedLineCount} item{includedLineCount === 1 ? '' : 's'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setStep(4)} className="ui-btn-secondary">Back</button>
              <button onClick={() => void handleCreateProject()} disabled={creating} className="ui-btn-primary h-9 px-4 disabled:opacity-50 inline-flex items-center gap-2">
                <Save className="w-4 h-4" />
                {creating ? 'Creating...' : 'Create Project'}
              </button>
            </div>
          </div>
            </>
          )}
        </section>
      )}

      {catalogPickerLineId && (
        <div className="fixed inset-0 bg-black/40 z-50 p-6 flex items-center justify-center">
          <div className="bg-white w-full max-w-4xl rounded-lg border border-slate-200 overflow-hidden">
            <div className="h-11 px-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">Match Item</h3>
              <button onClick={() => setCatalogPickerLineId(null)} className="h-7 px-2 rounded border border-slate-300 text-xs hover:bg-slate-50">Close</button>
            </div>
            <div className="p-3 border-b border-slate-200">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  placeholder="Search SKU, description, or category"
                  className="w-full h-9 pl-8 pr-2 rounded border border-slate-300 text-sm"
                />
              </div>
            </div>
            <div className="p-3 max-h-[60vh] overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-2">
              {filteredCatalog.map((item) => (
                <button
                  key={item.id}
                  onClick={() => applyExistingCatalogMatch(catalogPickerLineId, item)}
                  className="text-left border border-slate-200 rounded p-2 hover:border-blue-400 hover:bg-blue-50/50"
                >
                  <p className="text-xs text-slate-500">{item.category} · {item.sku}</p>
                  <p className="text-sm font-medium text-slate-900">{item.description}</p>
                </button>
              ))}
              {filteredCatalog.length === 0 && <p className="text-xs text-slate-500">No catalog results.</p>}
            </div>
          </div>
        </div>
      )}

      {newCatalogLineId && newCatalogDraft && (
        <div className="fixed inset-0 bg-black/40 z-50 p-6 flex items-center justify-center">
          <div className="bg-white w-full max-w-2xl rounded-lg border border-slate-200 overflow-hidden">
            <div className="h-11 px-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">Add to Catalog</h3>
              <button onClick={() => { setNewCatalogLineId(null); setNewCatalogDraft(null); }} className="h-7 px-2 rounded border border-slate-300 text-xs hover:bg-slate-50">Close</button>
            </div>
            <div className="p-4 grid grid-cols-2 gap-2">
              <label className="text-xs text-slate-600 col-span-2">Description
                <input className="mt-1 h-8 w-full rounded border border-slate-300 px-2 text-sm" value={newCatalogDraft.description} onChange={(e) => setNewCatalogDraft({ ...newCatalogDraft, description: e.target.value })} />
              </label>
              <label className="text-xs text-slate-600">SKU
                <input className="mt-1 h-8 w-full rounded border border-slate-300 px-2 text-sm" value={newCatalogDraft.sku} onChange={(e) => setNewCatalogDraft({ ...newCatalogDraft, sku: e.target.value })} />
              </label>
              <label className="text-xs text-slate-600">Category
                <input className="mt-1 h-8 w-full rounded border border-slate-300 px-2 text-sm" value={newCatalogDraft.category} onChange={(e) => setNewCatalogDraft({ ...newCatalogDraft, category: e.target.value })} />
              </label>
              <label className="text-xs text-slate-600">Unit
                <select className="mt-1 h-8 w-full rounded border border-slate-300 px-2 text-sm" value={newCatalogDraft.unit} onChange={(e) => setNewCatalogDraft({ ...newCatalogDraft, unit: e.target.value as CatalogItem['uom'] })}>
                  <option value="EA">EA</option>
                  <option value="LF">LF</option>
                  <option value="SF">SF</option>
                  <option value="CY">CY</option>
                  <option value="HR">HR</option>
                </select>
              </label>
              <label className="text-xs text-slate-600">Material Cost
                <input type="number" className="mt-1 h-8 w-full rounded border border-slate-300 px-2 text-sm" value={newCatalogDraft.materialCost} onChange={(e) => setNewCatalogDraft({ ...newCatalogDraft, materialCost: Number(e.target.value) || 0 })} />
              </label>
              <label className="text-xs text-slate-600">Labor Minutes
                <input type="number" className="mt-1 h-8 w-full rounded border border-slate-300 px-2 text-sm" value={newCatalogDraft.laborMinutes} onChange={(e) => setNewCatalogDraft({ ...newCatalogDraft, laborMinutes: Number(e.target.value) || 0 })} />
              </label>
            </div>
            <div className="p-3 border-t border-slate-200 flex justify-end gap-2">
              <button onClick={() => { setNewCatalogLineId(null); setNewCatalogDraft(null); }} className="h-8 px-3 rounded border border-slate-300 text-xs hover:bg-slate-50">Cancel</button>
              <button onClick={() => void createCatalogItemFromLine()} className="h-8 px-3 rounded bg-blue-700 text-white text-xs hover:bg-blue-800">Add & Match</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
