import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronDown, FileUp, FolderInput, Info, PlusCircle, Save, Search, Upload, WandSparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import {
  ModifierRecord,
  PeerIntakeDefaultsResponse,
  PricingMode,
  ProjectJobConditions,
  ProjectRecord,
  ProjectStructuredAssumption,
  RoomRecord,
  SettingsRecord,
  TakeoffLineRecord,
} from '../shared/types/estimator';
import type { IntakeApplicationStatus } from '../shared/types/intake';
import { IntakeAiSuggestions, IntakeParseResult, IntakeReviewLine } from '../shared/types/intake';
import { CatalogItem } from '../types';
import {
  createDefaultProjectJobConditions,
  bondJobConditionsPatchFromAssumptions,
  normalizeProjectJobConditions,
  OFFICE_FIELD_SCHEDULE_DEFAULTS,
  recommendDeliveryPlan,
  recommendedPhasedWorkMultiplier,
} from '../shared/utils/jobConditions';
import { collectPastProjectDateErrors, mapProjectDateErrors } from '../shared/utils/projectDateValidation';
import { OFFICE_ADDRESS, getDistanceInMiles } from '../utils/geo';
import { coerceSafeProjectName, isPlausibleProjectTitle, plausibleTitleFromFileName } from '../shared/utils/intakeTextGuards';
import { formatCurrencySafe, formatNumberSafe } from '../utils/numberFormat';
import { numericInputValue, parseNumericInput } from '../utils/numericInput';
import { SiteAddressAutocomplete } from '../components/intake/SiteAddressAutocomplete';
import { CatalogCategorySelect } from '../components/intake/CatalogCategorySelect';
import {
  clampSuggestionCategories,
  mergeDetectedScopeCategories,
  resolveImportedCategory,
  uniqueSortedCatalogCategories,
} from '../shared/utils/catalogCategories';
import { computeCatalogPeerPricingSuggestion } from '../shared/utils/catalogPeerSuggestions';
import { catalogItemMatchesQuery } from '../shared/utils/catalogItemSearch';
import { computeReviewStepOverallConfidence } from '../shared/utils/reviewStepConfidence';
import {
  buildInitialEstimateReviewState,
  ESTIMATE_REVIEW_HIGH_CONFIDENCE,
  ESTIMATE_REVIEW_LOW_SCORE_THRESHOLD,
  getActiveCatalogMatchForRow,
  inferJobConditionPatchesFromText,
  resolveIntakePersistFieldsForTakeoffLine,
  resolveLineForProjectCreation,
  type EstimateReviewLineState,
} from '../shared/utils/intakeEstimateReview';
import { IntakeEstimateReviewPanel } from '../components/intake/IntakeEstimateReviewPanel';
import { IntakeFieldBadge, IntakeFieldLegend } from '../components/intake/IntakeFieldChrome';
import { createInitialProjectDraft, newIntakeProjectDraftId } from './intake/projectIntakeDraft';
import { generateBidPackageNumberPreview, isBlankOrPlaceholderBidNumber } from '../shared/utils/bidPackageNumber';
import { normalizeProjectSizeSelectValue, PROJECT_JOB_SIZE_OPTIONS } from '../shared/utils/projectJobSizeTiers';

type CreationMode = 'blank' | 'takeoff' | 'document' | 'template';
type IntakeStep = 1 | 2 | 3 | 4 | 5;

type CatalogPickerTarget =
  | { kind: 'line'; lineId: string }
  | { kind: 'fingerprint'; fingerprint: string };

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
  aiSuggestions: IntakeAiSuggestions | null;
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
  /** null while the quantity field is cleared for editing */
  qty: number | null;
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
  suggestedBundleId?: string | null;
  suggestedBundleName?: string | null;
  /** Stable key from server parse; links to estimate draft rows. */
  reviewLineFingerprint?: string;
  catalogAttributeSnapshot?: Array<{
    attributeType: 'finish' | 'coating' | 'grip' | 'mounting' | 'assembly';
    attributeValue: string;
    source: 'user' | 'inferred';
    reason?: string;
  }> | null;
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
  /** null while the field is cleared for editing */
  materialCost: number | null;
  laborMinutes: number | null;
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

  const labeledProject = findValue(/project\s*name|job\s*name|project\b/i);
  const labeledProjectSafe =
    labeledProject && isPlausibleProjectTitle(labeledProject) ? labeledProject : null;

  const inferredProjectLine =
    lines.slice(0, 16).find((line) => {
      if (line.length < 6 || line.length > 96) return false;
      if (/^(client|gc|general contractor|address|location|site|date|bid date|project number|job number|scope of work|proposal|invitation to bid)\b/i.test(line)) return false;
      if (/^(section|division)\b/i.test(line)) return false;
      if (looksLikeDate(line) || /^\d+$/.test(line)) return false;
      if (!isPlausibleProjectTitle(line)) return false;
      return tokenizeText(line).length >= 2;
    }) || null;

  return {
    projectName: labeledProjectSafe ?? inferredProjectLine ?? 'Imported Project',
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
  const canonicalCatalog = catalog.filter((c) => !c.deprecated && c.isCanonical !== false);
  const itemName = String(input.itemName || '').trim();
  const category = String(input.category || '').trim();
  const description = String(input.description || '').trim();
  const raw = String(input.rawText || '').trim();
  const normalized = normalizeComparableText(`${itemName} ${description} ${category} ${raw}`);

  if (!normalized) return null;

  const bySku = canonicalCatalog.find((candidate) => {
    const sku = normalizeComparableText(candidate.sku);
    return sku && normalized.includes(sku);
  });
  if (bySku) return bySku;

  let best: CatalogItem | null = null;
  let bestScore = 0;

  for (const candidate of canonicalCatalog) {
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
    existing.qty = (existing.qty ?? 0) + (line.qty ?? 0);
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
  const bundle = line.bundleMatch ?? line.suggestedBundle;
  const notes = [line.notes, ...line.warnings, bundle ? `Bundle hint: ${bundle.bundleName}` : ''].filter(Boolean).join(' | ');

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
    suggestedBundleId: bundle?.bundleId ?? null,
    suggestedBundleName: bundle?.bundleName ?? null,
    reviewLineFingerprint: line.reviewLineFingerprint,
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

  const merged = [...result.warnings, ...result.diagnostics.warnings, ...summaryWarnings].filter(Boolean);
  return Array.from(new Set(collapseStalePdfRoomWarnings(merged)));
}

/** Older server builds emitted one warning per PDF page for room assignment; collapse for a sane UI. */
function collapseStalePdfRoomWarnings(warnings: string[]): string[] {
  const roomSpam = warnings.filter(
    (w) =>
      /no room assignment/i.test(w) &&
      /multiple rooms/i.test(w) &&
      /page\s+\d+/i.test(w)
  );
  const rest = warnings.filter(
    (w) =>
      !(
        /no room assignment/i.test(w) &&
        /multiple rooms/i.test(w) &&
        /page\s+\d+/i.test(w)
      )
  );
  if (roomSpam.length > 2) {
    rest.push(
      `${roomSpam.length} PDF room-assignment notices were collapsed (older parser). All imported lines use "General"; split rooms in the workspace if needed.`
    );
  } else {
    rest.push(...roomSpam);
  }
  return rest;
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
    aiSuggestions: result.aiSuggestions ?? null,
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
  const [blankQuickAddText, setBlankQuickAddText] = useState('');
  const [blankQuickAddDragOver, setBlankQuickAddDragOver] = useState(false);
  const [uploadedDocumentFile, setUploadedDocumentFile] = useState<File | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [uploadedText, setUploadedText] = useState('');
  const [intakeWarnings, setIntakeWarnings] = useState<string[]>([]);

  const [createConfirmedOnly, setCreateConfirmedOnly] = useState(true);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [newCatalogLineId, setNewCatalogLineId] = useState<string | null>(null);
  const [newCatalogDraft, setNewCatalogDraft] = useState<NewCatalogDraft | null>(null);

  const [projectDraft, setProjectDraft] = useState<Partial<ProjectRecord>>(() => createInitialProjectDraft());
  const [distanceCalculating, setDistanceCalculating] = useState(false);
  const [distanceError, setDistanceError] = useState<string | null>(null);
  const [distanceMessage, setDistanceMessage] = useState('No calculated distance yet.');
  const [projectDateErrors, setProjectDateErrors] = useState<Partial<Record<'bidDate' | 'proposalDate' | 'dueDate', string>>>({});
  const [parserReviewSummary, setParserReviewSummary] = useState<ParserReviewSummary | null>(null);
  const [lastIntakeParse, setLastIntakeParse] = useState<IntakeParseResult | null>(null);
  const [estimateReviewLines, setEstimateReviewLines] = useState<Record<string, EstimateReviewLineState>>({});
  const [estimateReviewJobConditions, setEstimateReviewJobConditions] = useState<Record<string, IntakeApplicationStatus>>({});
  const [estimateReviewProjectMods, setEstimateReviewProjectMods] = useState<Record<string, IntakeApplicationStatus>>({});
  const [intakeModifiers, setIntakeModifiers] = useState<ModifierRecord[]>([]);
  const [catalogPickerTarget, setCatalogPickerTarget] = useState<CatalogPickerTarget | null>(null);
  const [peerIntakeHint, setPeerIntakeHint] = useState<PeerIntakeDefaultsResponse | null>(null);
  const peerHintDismissedForKey = useRef<string | null>(null);
  const [peerSetupAssumptionNote, setPeerSetupAssumptionNote] = useState<string | null>(null);

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
    const onCatalogSynced = () => {
      void api.getCatalog().then(setCatalog);
    };
    window.addEventListener('catalog-synced', onCatalogSynced);
    return () => window.removeEventListener('catalog-synced', onCatalogSynced);
  }, []);

  useEffect(() => {
    void (async () => {
      const [projectData, catalogData, settingsData, modifiersData] = await Promise.all([
        api.getV1Projects(),
        api.getCatalog(),
        api.getV1Settings(),
        api.getV1Modifiers(),
      ]);
      setProjects(projectData);
      setCatalog(catalogData);
      setSettingsDefaults(settingsData);
      setIntakeModifiers(modifiersData);

      const defaults = createInitialProjectDraft(settingsData);
      setProjectDraft((prev) => ({
        ...defaults,
        ...prev,
        id: prev.id || defaults.id || newIntakeProjectDraftId(),
        laborBurdenPercent: prev.laborBurdenPercent ?? defaults.laborBurdenPercent,
        overheadPercent: prev.overheadPercent ?? defaults.overheadPercent,
        profitPercent: prev.profitPercent ?? defaults.profitPercent,
        laborOverheadPercent: prev.laborOverheadPercent ?? defaults.laborOverheadPercent,
        laborProfitPercent: prev.laborProfitPercent ?? defaults.laborProfitPercent,
        subLaborManagementFeeEnabled: prev.subLaborManagementFeeEnabled ?? defaults.subLaborManagementFeeEnabled,
        subLaborManagementFeePercent: prev.subLaborManagementFeePercent ?? defaults.subLaborManagementFeePercent,
        taxPercent: prev.taxPercent ?? defaults.taxPercent,
        selectedScopeCategories: Array.isArray(prev.selectedScopeCategories) ? prev.selectedScopeCategories : defaults.selectedScopeCategories,
        jobConditions: normalizeProjectJobConditions({
          ...defaults.jobConditions,
          ...(prev.jobConditions || {}),
        }),
      }));
    })();
  }, []);

  useEffect(() => {
    const address = String(projectDraft.address || '').trim();
    if (!address || address.length < 8) return;
    const timer = setTimeout(() => {
      void refreshDraftDistance(address, true);
    }, 650);
    return () => clearTimeout(timer);
  }, [projectDraft.address]);

  useEffect(() => {
    if (projectDraft.projectNumberSource === 'manual') return;
    const id = String(projectDraft.id || '').trim();
    if (!id) {
      setProjectDraft((p) => ({ ...p, id: newIntakeProjectDraftId() }));
      return;
    }
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const next = await generateBidPackageNumberPreview({
            projectId: id,
            projectName: String(projectDraft.projectName || ''),
            now: new Date(),
          });
          setProjectDraft((p) => {
            if (p.projectNumberSource === 'manual') return p;
            if (p.projectNumber === next) return p;
            return { ...p, projectNumber: next, projectNumberSource: 'auto' };
          });
        } catch (e) {
          console.warn('Bid package # preview failed', e);
        }
      })();
    }, 200);
    return () => clearTimeout(timer);
  }, [projectDraft.id, projectDraft.projectName, projectDraft.projectNumberSource]);

  useEffect(() => {
    if (step < 3) return;
    const c = String(projectDraft.clientName || '').trim();
    const g = String(projectDraft.generalContractor || '').trim();
    if (!c && !g) {
      setPeerIntakeHint(null);
      return;
    }
    const dismissKey = `${c.toLowerCase()}\t${g.toLowerCase()}`;
    if (peerHintDismissedForKey.current === dismissKey) {
      setPeerIntakeHint(null);
      return;
    }
    const timer = setTimeout(() => {
      void api.getV1PeerIntakeDefaults({ clientName: c || undefined, generalContractor: g || undefined }).then((data) => {
        setPeerIntakeHint(data?.sourceProjectId ? data : null);
      });
    }, 450);
    return () => clearTimeout(timer);
  }, [step, projectDraft.clientName, projectDraft.generalContractor]);

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

  const parserReviewDisplayConfidence = useMemo(() => {
    if (!parserReviewSummary) return null;
    const baseline = parserReviewSummary.overallConfidence ?? 0;
    const overall = computeReviewStepOverallConfidence(lineSuggestions, {
      validationWarnings: parserReviewSummary.validationWarnings,
      parseWarnings: parserReviewSummary.parseWarnings,
      intakeWarnings,
      validationErrors: parserReviewSummary.validationErrors,
      baseline: parserReviewSummary.overallConfidence,
    });
    const hasIncluded = lineSuggestions.some((l) => l.include);
    return {
      overall,
      adjustedFromReview: hasIncluded && Math.abs(overall - baseline) >= 0.02,
    };
  }, [parserReviewSummary, lineSuggestions, intakeWarnings]);

  const unmatchedSuggestions = useMemo(
    () => lineSuggestions.filter((line) => !line.matched),
    [lineSuggestions]
  );

  const filteredCatalog = useMemo(
    () => catalog.filter((item) => catalogItemMatchesQuery(item, catalogSearch)),
    [catalog, catalogSearch]
  );

  const scopeCategoryOptions = useMemo(
    () => Array.from(new Set([
      ...catalog.map((item) => String(item.category || '').trim()),
      ...lineSuggestions.map((line) => String(line.category || '').trim()),
    ].filter(Boolean))).sort(),
    [catalog, lineSuggestions]
  );

  const newCatalogPeerSuggestion = useMemo(() => {
    if (!newCatalogDraft) return null;
    return computeCatalogPeerPricingSuggestion(catalog, {
      description: newCatalogDraft.description,
      category: newCatalogDraft.category,
      uom: newCatalogDraft.unit,
    });
  }, [catalog, newCatalogDraft]);

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

  const draftJob = useMemo(
    () => normalizeProjectJobConditions(projectDraft.jobConditions),
    [projectDraft.jobConditions]
  );

  function resetIntakeAdvancedPricingToOfficeDefaults() {
    if (!settingsDefaults) return;
    setProjectDraft((prev) => ({
      ...prev,
      laborBurdenPercent: settingsDefaults.defaultLaborBurdenPercent,
      overheadPercent: settingsDefaults.defaultOverheadPercent,
      profitPercent: 0,
      taxPercent: settingsDefaults.defaultTaxPercent,
      laborOverheadPercent: settingsDefaults.defaultLaborOverheadPercent,
      laborProfitPercent: 0,
      jobConditions: normalizeProjectJobConditions({
        ...(prev.jobConditions || createDefaultProjectJobConditions()),
        ...OFFICE_FIELD_SCHEDULE_DEFAULTS,
        laborRateMultiplier: 1,
        installerCount: 1,
        estimateAdderPercent: 0,
        estimateAdderAmount: 0,
      }),
    }));
  }

  function matchesIntakeOffice(
    field: 'burden' | 'materialOandP' | 'profit' | 'tax' | 'laborOverhead' | 'laborProfit'
  ): boolean {
    if (!settingsDefaults) return false;
    if (field === 'burden') return Number(projectDraft.laborBurdenPercent) === settingsDefaults.defaultLaborBurdenPercent;
    if (field === 'materialOandP')
      return (
        Number(projectDraft.overheadPercent) === settingsDefaults.defaultOverheadPercent &&
        Number(projectDraft.profitPercent) === 0
      );
    if (field === 'profit') return Number(projectDraft.profitPercent) === settingsDefaults.defaultProfitPercent;
    if (field === 'tax') return Number(projectDraft.taxPercent) === settingsDefaults.defaultTaxPercent;
    if (field === 'laborOverhead') return Number(projectDraft.laborOverheadPercent) === settingsDefaults.defaultLaborOverheadPercent;
    if (field === 'laborProfit') return Number(projectDraft.laborProfitPercent) === 0;
    return false;
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
      projectName: prev.projectName?.trim()
        ? prev.projectName
        : coerceSafeProjectName(result.projectMetadata.projectName || '', '') || 'Imported Project',
      projectNumber: prev.projectNumber || result.projectMetadata.projectNumber || prev.projectNumber,
      projectNumberSource: (() => {
        if (String(prev.projectNumber || '').trim()) return prev.projectNumberSource;
        if (String(result.projectMetadata.projectNumber || '').trim()) return 'manual' as const;
        return prev.projectNumberSource;
      })(),
      clientName: prev.clientName || result.projectMetadata.client || prev.clientName,
      generalContractor: prev.generalContractor || result.projectMetadata.generalContractor || prev.generalContractor,
      estimator: prev.estimator || result.projectMetadata.estimator || prev.estimator,
      address: prev.address || result.projectMetadata.address || prev.address,
      bidDate: prev.bidDate || normalizeDateString(result.projectMetadata.bidDate || result.projectMetadata.proposalDate) || prev.bidDate,
      proposalDate: prev.proposalDate || normalizeDateString(result.projectMetadata.proposalDate) || prev.proposalDate,
      pricingMode: prev.pricingMode || result.projectMetadata.pricingBasis || prev.pricingMode,
      notes: mergeDistinctText(mergeSourceNote(prev.notes, sourceLabel), [assumptionNotes]),
      specialNotes: prev.specialNotes,
      jobConditions: normalizeProjectJobConditions({
        ...(prev.jobConditions || createDefaultProjectJobConditions()),
        ...bondJobConditionsPatchFromAssumptions(result.projectMetadata.assumptions || []),
      }),
    }));

    if (String(importedAddress || '').trim()) {
      void refreshDraftDistance(importedAddress, true);
    }
  }

  function applyIntakeParseToReview(result: IntakeParseResult, fallbackSource: string) {
    const allowed = uniqueSortedCatalogCategories(catalog);
    const raw = dedupeSuggestions(result.reviewLines.map((line) => buildIntakeLineSuggestion(line, fallbackSource)));
    const suggestionsBase = clampSuggestionCategories(raw, catalog);
    const inferredByFingerprint = new Map<string, LineSuggestion['catalogAttributeSnapshot']>();
    for (const row of result.estimateDraft?.lineSuggestions ?? []) {
      if (!row.reviewLineFingerprint) continue;
      if (!row.inferredCatalogAttributeSnapshot || row.inferredCatalogAttributeSnapshot.length === 0) continue;
      inferredByFingerprint.set(
        row.reviewLineFingerprint,
        row.inferredCatalogAttributeSnapshot.map((a) => ({
          attributeType: a.attributeType,
          attributeValue: a.attributeValue,
          source: 'inferred' as const,
          reason: a.reason,
        }))
      );
    }
    const suggestions = suggestionsBase.map((line) => {
      const fp = line.reviewLineFingerprint;
      if (!fp) return line;
      const snap = inferredByFingerprint.get(fp);
      if (!snap) return line;
      return { ...line, catalogAttributeSnapshot: snap };
    });

    const ignoredFps = new Set<string>(
      (result.estimateDraft?.lineSuggestions ?? [])
        .filter((s) => s.applicationStatus === 'ignored')
        .map((s) => s.reviewLineFingerprint)
        .filter(Boolean)
    );
    const suggestionsWithIgnore = ignoredFps.size
      ? suggestions.map((line) =>
          line.reviewLineFingerprint && ignoredFps.has(line.reviewLineFingerprint) ? { ...line, include: false } : line
        )
      : suggestions;

    setLineSuggestions(suggestionsWithIgnore);
    setRoomSuggestions(buildIntakeRoomSuggestions(result, suggestionsWithIgnore));
    setIntakeWarnings(buildIntakeWarnings(result));
    setParserReviewSummary(buildParserReviewSummary(result));
    setLastIntakeParse(result);
    if (result.estimateDraft) {
      const init = buildInitialEstimateReviewState(result.estimateDraft, catalog);
      setEstimateReviewLines(init.lineByFingerprint);
      setEstimateReviewJobConditions(init.jobConditionById);
      setEstimateReviewProjectMods(init.projectModifierById);
    } else {
      setEstimateReviewLines({});
      setEstimateReviewJobConditions({});
      setEstimateReviewProjectMods({});
    }
    setProjectDraft((prev) => ({
      ...prev,
      selectedScopeCategories: prev.selectedScopeCategories && prev.selectedScopeCategories.length > 0
        ? prev.selectedScopeCategories
        : mergeDetectedScopeCategories(prev.selectedScopeCategories, suggestions.map((line) => line.category), allowed),
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
            metadataMissing: ['projectNumber', 'client', 'address', 'bidDate', 'proposalDate', 'estimator'],
            warnings: [],
            totalLines: 0,
            completeLines: 0,
            matchedLines: 0,
            needsMatchLines: 0,
            modelUsed: 'review-state',
            confidenceSummary: { metadata: 1, lineExtraction: 0, matching: 0, overall: 0.33 },
            confidenceNarrative: 'Structured intake review — no automated parse was run for this path.',
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
          projectNumberSource: (() => {
            if (String(prev.projectNumber || '').trim()) return prev.projectNumberSource;
            if (String(dominantProjectNumber || '').trim()) return 'manual' as const;
            return prev.projectNumberSource;
          })(),
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
        projectName:
          prev.projectName ||
          documentMetadata.projectName ||
          plausibleTitleFromFileName(takeoffFileName || '') ||
          'Takeoff Imported Project',
        projectNumber: prev.projectNumber || documentMetadata.projectNumber || prev.projectNumber,
        projectNumberSource: (() => {
          if (String(prev.projectNumber || '').trim()) return prev.projectNumberSource;
          if (String(documentMetadata.projectNumber || '').trim()) return 'manual' as const;
          return prev.projectNumberSource;
        })(),
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
    setLineSuggestions(
      clampSuggestionCategories(dedupeSuggestions([...importedFromProject, ...importedFromStructured, ...importedFromText]), catalog)
    );
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
      setTakeoffStructuredProjectName(coerceSafeProjectName(result.projectMetadata.projectName || '', '') || '');
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
      projectName:
        coerceSafeProjectName(metadata.projectName || '', '') || prev.projectName || 'Imported Project',
      projectNumber: metadata.projectNumber || prev.projectNumber,
      projectNumberSource: String(metadata.projectNumber || '').trim() ? ('manual' as const) : prev.projectNumberSource,
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

  function intakeMemoryFieldsForFingerprint(fingerprint: string | undefined): { itemCode?: string; itemName?: string; description?: string } {
    if (fingerprint) {
      const rl = lastIntakeParse?.reviewLines?.find((l) => l.reviewLineFingerprint === fingerprint);
      if (rl) {
        return { itemCode: rl.itemCode, itemName: rl.itemName, description: rl.description };
      }
      const line = lineSuggestions.find((l) => l.reviewLineFingerprint === fingerprint);
      if (line) {
        return { itemCode: line.sku || undefined, itemName: line.itemName, description: line.description };
      }
    }
    return {};
  }

  function intakeMemoryFieldsForLineId(lineId: string): { itemCode?: string; itemName?: string; description?: string } {
    const line = lineSuggestions.find((l) => l.id === lineId);
    return intakeMemoryFieldsForFingerprint(line?.reviewLineFingerprint);
  }

  function rememberIntakeCatalogChoice(
    catalogItemId: string,
    fields: { itemCode?: string; itemName?: string; description?: string }
  ) {
    void api.postV1IntakeCatalogMemory({ catalogItemId, ...fields }).catch((err) => console.warn('intake catalog memory', err));
  }

  function dismissPeerIntakeHint() {
    const c = String(projectDraft.clientName || '').trim();
    const g = String(projectDraft.generalContractor || '').trim();
    peerHintDismissedForKey.current = `${c.toLowerCase()}\t${g.toLowerCase()}`;
    setPeerIntakeHint(null);
  }

  function applyPeerIntakeHint() {
    if (!peerIntakeHint?.sourceProjectId || !peerIntakeHint.jobConditions) return;
    setProjectDraft((prev) => ({
      ...prev,
      jobConditions: normalizeProjectJobConditions(peerIntakeHint.jobConditions!),
      selectedScopeCategories:
        peerIntakeHint.selectedScopeCategories?.length ? peerIntakeHint.selectedScopeCategories : prev.selectedScopeCategories,
      pricingMode: peerIntakeHint.pricingMode ?? prev.pricingMode,
      taxPercent: peerIntakeHint.taxPercent ?? prev.taxPercent,
    }));
    const label = peerIntakeHint.matchedBy === 'client' ? 'client' : 'general contractor';
    setPeerSetupAssumptionNote(
      `Job setup pre-filled from a recent project for the same ${label}. Review all fields before bidding.`
    );
    setPeerIntakeHint(null);
  }

  function buildStructuredAssumptionsForNewProject(): ProjectStructuredAssumption[] {
    const fromIntake = (lastIntakeParse?.projectMetadata?.assumptions ?? []).map((a) => ({
      id: crypto.randomUUID(),
      source: 'intake' as const,
      ruleId: `intake:${a.kind}`,
      text: a.text,
      confidence: a.confidence,
      appliedFields: ['intake', 'proposal'],
      createdAt: new Date().toISOString(),
    }));
    if (!peerSetupAssumptionNote) return fromIntake;
    return [
      ...fromIntake,
      {
        id: crypto.randomUUID(),
        source: 'peer' as const,
        ruleId: 'peer-intake-defaults',
        text: peerSetupAssumptionNote,
        confidence: 0.85,
        appliedFields: ['jobConditions', 'pricing'],
        createdAt: new Date().toISOString(),
      },
    ];
  }

  function applyCatalogToLineId(lineId: string, item: CatalogItem, matchReason = 'User-selected catalog item') {
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
          matchConfidence: 'strong',
          matchReason,
          catalogAttributeSnapshot: null,
        };
      })
    );
    rememberIntakeCatalogChoice(item.id, intakeMemoryFieldsForLineId(lineId));
  }

  function applyCatalogPickerSelection(item: CatalogItem) {
    const target = catalogPickerTarget;
    if (!target) return;
    if (target.kind === 'line') {
      applyCatalogToLineId(target.lineId, item);
    } else {
      const lineId = lineSuggestions.find((l) => l.reviewLineFingerprint === target.fingerprint)?.id;
      if (lineId) {
        applyCatalogToLineId(lineId, item, 'Estimate review catalog pick');
      } else {
        rememberIntakeCatalogChoice(item.id, intakeMemoryFieldsForFingerprint(target.fingerprint));
      }
      setEstimateReviewLines((prev) => ({
        ...prev,
        [target.fingerprint]: { applicationStatus: 'replaced', selectedCatalogItemId: item.id },
      }));
    }
    setCatalogPickerTarget(null);
    setCatalogSearch('');
  }

  function patchEstimateReviewLine(fingerprint: string, patch: Partial<EstimateReviewLineState>) {
    setEstimateReviewLines((prev) => {
      const cur = prev[fingerprint] ?? { applicationStatus: 'suggested' as const, selectedCatalogItemId: null };
      const merged: EstimateReviewLineState = { ...cur, ...patch };
      if (merged.applicationStatus !== 'accepted') {
        return {
          ...prev,
          [fingerprint]: {
            applicationStatus: merged.applicationStatus,
            selectedCatalogItemId: merged.selectedCatalogItemId,
          },
        };
      }
      return { ...prev, [fingerprint]: merged };
    });
  }

  function maybeCaptureDiv10Training(
    fingerprint: string,
    action: 'accepted' | 'replaced' | 'ignored',
    finalCatalogItemId: string | null
  ) {
    const draft = lastIntakeParse?.estimateDraft;
    const row = draft?.lineSuggestions.find((r) => r.reviewLineFingerprint === fingerprint);
    const reviewLine = lastIntakeParse?.reviewLines.find((r) => r.reviewLineFingerprint === fingerprint);
    if (!row?.div10Brain?.catalogAssist && !row?.div10Brain?.classify) return;
    const lineText = [reviewLine?.description, reviewLine?.itemName].filter(Boolean).join(' ').trim();
    void api
      .postV1IntakeDiv10TrainingCapture({
        reviewLineFingerprint: fingerprint,
        action,
        finalCatalogItemId,
        lineText,
        deterministicSuggestedId: row.suggestedCatalogItemId,
        div10BrainSnapshot: row.div10Brain,
      })
      .catch(() => {});
  }

  function handleAcceptEstimateLine(fingerprint: string) {
    const draft = lastIntakeParse?.estimateDraft;
    const row = draft?.lineSuggestions.find((r) => r.reviewLineFingerprint === fingerprint);
    if (!row) return;
    const st = estimateReviewLines[fingerprint] ?? {
      applicationStatus: row.applicationStatus,
      selectedCatalogItemId: row.suggestedCatalogItemId,
    };
    const catId = st.selectedCatalogItemId ?? row.suggestedCatalogItemId;
    const item = catId ? catalog.find((c) => c.id === catId) : undefined;
    patchEstimateReviewLine(fingerprint, { applicationStatus: 'accepted', selectedCatalogItemId: catId, acceptSource: 'manual' });
    maybeCaptureDiv10Training(fingerprint, 'accepted', catId ?? null);
    const lineId = lineSuggestions.find((l) => l.reviewLineFingerprint === fingerprint)?.id;
    if (item && lineId) {
      applyCatalogToLineId(lineId, item, 'Accepted estimate suggestion');
    } else if (item) {
      rememberIntakeCatalogChoice(item.id, intakeMemoryFieldsForFingerprint(fingerprint));
    }
  }

  function handleReplaceEstimateLineWithCatalogId(fingerprint: string, catalogItemId: string) {
    const item = catalog.find((c) => c.id === catalogItemId);
    patchEstimateReviewLine(fingerprint, { applicationStatus: 'replaced', selectedCatalogItemId: catalogItemId });
    maybeCaptureDiv10Training(fingerprint, 'replaced', catalogItemId);
    const lineId = lineSuggestions.find((l) => l.reviewLineFingerprint === fingerprint)?.id;
    if (item && lineId) {
      applyCatalogToLineId(lineId, item, 'Replaced catalog candidate (estimate review)');
    } else if (item) {
      rememberIntakeCatalogChoice(item.id, intakeMemoryFieldsForFingerprint(fingerprint));
    }
  }

  function handleIgnoreEstimateLine(fingerprint: string) {
    const draft = lastIntakeParse?.estimateDraft;
    const row = draft?.lineSuggestions.find((r) => r.reviewLineFingerprint === fingerprint);
    patchEstimateReviewLine(fingerprint, { applicationStatus: 'ignored', selectedCatalogItemId: null });
    maybeCaptureDiv10Training(fingerprint, 'ignored', null);
    void api
      .postV1IntakeReviewOverride({
        reviewLineFingerprint: fingerprint,
        status: 'ignored',
        reviewLineContentKey: row?.reviewLineContentKey ?? null,
      })
      .catch(() => {});
    const lineId = lineSuggestions.find((l) => l.reviewLineFingerprint === fingerprint)?.id;
    if (lineId) ignoreLine(lineId);
  }

  function bulkAcceptHighConfidenceEstimateRows() {
    const draft = lastIntakeParse?.estimateDraft;
    if (!draft) return;
    const nextReview: Record<string, EstimateReviewLineState> = { ...estimateReviewLines };
    for (const row of draft.lineSuggestions) {
      if (row.scopeBucket !== 'priced_base_scope') continue;
      const st = nextReview[row.reviewLineFingerprint] ?? {
        applicationStatus: row.applicationStatus,
        selectedCatalogItemId: row.suggestedCatalogItemId,
      };
      if (!st || st.applicationStatus !== 'suggested') continue;
      const m = getActiveCatalogMatchForRow(row, st);
      if (m?.confidence === ESTIMATE_REVIEW_HIGH_CONFIDENCE) {
        nextReview[row.reviewLineFingerprint] = {
          applicationStatus: 'accepted',
          selectedCatalogItemId: st.selectedCatalogItemId ?? row.suggestedCatalogItemId,
          acceptSource: 'manual',
        };
      }
    }
    setEstimateReviewLines(nextReview);
    setLineSuggestions((prev) =>
      prev.map((line) => {
        const fp = line.reviewLineFingerprint;
        if (!fp) return line;
        if (nextReview[fp]?.applicationStatus !== 'accepted') return line;
        const row = draft.lineSuggestions.find((r) => r.reviewLineFingerprint === fp);
        if (!row || row.scopeBucket !== 'priced_base_scope') return line;
        const catId = nextReview[fp].selectedCatalogItemId ?? row.suggestedCatalogItemId;
        const item = catId ? catalog.find((c) => c.id === catId) : undefined;
        if (!item) return line;
        return {
          ...line,
          include: true,
          matched: true,
          description: item.description,
          category: item.category,
          sku: item.sku,
          unit: item.uom,
          catalogItemId: item.id,
          materialCost: item.baseMaterialCost,
          laborMinutes: item.baseLaborMinutes,
          matchConfidence: 'strong',
          matchReason: 'Bulk accept high-confidence (estimate review)',
        };
      })
    );
  }

  function bulkIgnoreLowConfidenceEstimateRows() {
    const draft = lastIntakeParse?.estimateDraft;
    if (!draft) return;
    const nextReview: Record<string, EstimateReviewLineState> = { ...estimateReviewLines };
    for (const row of draft.lineSuggestions) {
      const st = nextReview[row.reviewLineFingerprint] ?? {
        applicationStatus: row.applicationStatus,
        selectedCatalogItemId: row.suggestedCatalogItemId,
      };
      if (!st || st.applicationStatus !== 'suggested') continue;
      const m = getActiveCatalogMatchForRow(row, st);
      const low =
        !m ||
        m.confidence === 'none' ||
        (typeof m.score === 'number' && m.score < ESTIMATE_REVIEW_LOW_SCORE_THRESHOLD);
      if (low) {
        nextReview[row.reviewLineFingerprint] = { applicationStatus: 'ignored', selectedCatalogItemId: null };
        void api
          .postV1IntakeReviewOverride({
            reviewLineFingerprint: row.reviewLineFingerprint,
            status: 'ignored',
            reviewLineContentKey: row.reviewLineContentKey,
          })
          .catch(() => {});
      }
    }
    setEstimateReviewLines(nextReview);
    setLineSuggestions((prev) =>
      prev.map((line) => {
        const fp = line.reviewLineFingerprint;
        if (!fp || nextReview[fp]?.applicationStatus !== 'ignored') return line;
        return { ...line, include: false, catalogItemId: null, sku: null, matched: false };
      })
    );
  }

  function bulkAcceptTierAStrongBEstimateRows() {
    const draft = lastIntakeParse?.estimateDraft;
    if (!draft) return;
    const nextReview: Record<string, EstimateReviewLineState> = { ...estimateReviewLines };
    for (const row of draft.lineSuggestions) {
      if (row.scopeBucket !== 'priced_base_scope') continue;
      const st = nextReview[row.reviewLineFingerprint] ?? {
        applicationStatus: row.applicationStatus,
        selectedCatalogItemId: row.suggestedCatalogItemId,
      };
      if (!st || st.applicationStatus !== 'suggested') continue;
      const m = getActiveCatalogMatchForRow(row, st);
      const tier = row.catalogAutoApplyTier || 'C';
      // Accept:
      // - Tier A rows still suggested (unit-compatible strong matches that were not server-auto-accepted).
      // - Tier B rows that have any real catalog match (strong/possible). Tier B by construction has a
      //   catalog or suggested match; this is the "near-safe" fallback for cases where unit compatibility
      //   or score floor kept them out of Tier A.
      const isTierB = tier === 'B';
      const hasUsableMatch = !!m && m.confidence !== 'none';
      const hasAnyCandidate = !!m || row.topCatalogCandidates.length > 0;
      const eligible = tier === 'A' || (isTierB && (hasUsableMatch || hasAnyCandidate));
      if (!eligible) continue;
      const selectedId = st.selectedCatalogItemId ?? row.suggestedCatalogItemId ?? row.topCatalogCandidates[0]?.catalogItemId ?? null;
      if (!selectedId) continue;
      nextReview[row.reviewLineFingerprint] = {
        applicationStatus: 'accepted',
        selectedCatalogItemId: selectedId,
        acceptSource: 'manual',
      };
    }
    setEstimateReviewLines(nextReview);
    setLineSuggestions((prev) =>
      prev.map((line) => {
        const fp = line.reviewLineFingerprint;
        if (!fp) return line;
        if (nextReview[fp]?.applicationStatus !== 'accepted') return line;
        const row = draft.lineSuggestions.find((r) => r.reviewLineFingerprint === fp);
        if (!row || row.scopeBucket !== 'priced_base_scope') return line;
        const catId = nextReview[fp].selectedCatalogItemId ?? row.suggestedCatalogItemId;
        const item = catId ? catalog.find((c) => c.id === catId) : undefined;
        if (!item) return line;
        const tier = row.catalogAutoApplyTier || 'C';
        return {
          ...line,
          include: true,
          matched: true,
          description: item.description,
          category: item.category,
          sku: item.sku,
          unit: item.uom,
          catalogItemId: item.id,
          materialCost: item.baseMaterialCost,
          laborMinutes: item.baseLaborMinutes,
          matchConfidence: tier === 'A' ? 'strong' : 'possible',
          matchReason: `Bulk accept Tier ${tier} (estimate review)`,
        };
      })
    );
  }

  function bulkAcceptAllSuggestedProjectModifiers() {
    const ids = lastIntakeParse?.estimateDraft?.projectSuggestion.suggestedProjectModifierIds ?? [];
    if (!ids.length) return;
    setEstimateReviewProjectMods((prev) => {
      const next = { ...prev };
      for (const id of ids) next[id] = 'accepted';
      return next;
    });
  }

  function setJobConditionReviewStatus(id: string, status: IntakeApplicationStatus) {
    setEstimateReviewJobConditions((prev) => ({ ...prev, [id]: status }));
    if (status === 'accepted') {
      const patch = lastIntakeParse?.estimateDraft?.projectSuggestion.suggestedJobConditionsPatch?.find((p) => p.id === id);
      if (patch) patchDraftJobConditions(inferJobConditionPatchesFromText(patch));
    }
  }

  function applyAllSuggestedJobConditionsToDraft() {
    const patches = lastIntakeParse?.estimateDraft?.projectSuggestion.suggestedJobConditionsPatch ?? [];
    const nextJc: Record<string, IntakeApplicationStatus> = { ...estimateReviewJobConditions };
    let jcPatch: Partial<ProjectJobConditions> = {};
    for (const p of patches) {
      nextJc[p.id] = 'accepted';
      Object.assign(jcPatch, inferJobConditionPatchesFromText(p));
    }
    setEstimateReviewJobConditions(nextJc);
    patchDraftJobConditions(jcPatch);
  }

  function applySuggestedPricingModeFromAi() {
    const pm = lastIntakeParse?.aiSuggestions?.pricingModeSuggested;
    if (
      pm === 'material_only' ||
      pm === 'labor_only' ||
      pm === 'labor_and_material' ||
      pm === 'material_with_optional_install_quote'
    ) {
      patchProjectDraft({ pricingMode: pm });
    }
  }

  function openNewCatalogFromLine(lineId: string) {
    const line = lineSuggestions.find((entry) => entry.id === lineId);
    if (!line) return;

    const allowed = uniqueSortedCatalogCategories(catalog);
    setNewCatalogLineId(lineId);
    setNewCatalogDraft({
      description: line.description || line.rawText,
      sku: line.sku || `SKU-${Math.floor(Math.random() * 100000)}`,
      category: resolveImportedCategory(line.category, allowed) ?? allowed[0] ?? '',
      unit: (line.unit || 'EA') as CatalogItem['uom'],
      materialCost: Number.isFinite(line.materialCost) ? line.materialCost : null,
      laborMinutes: Number.isFinite(line.laborMinutes) ? line.laborMinutes : null,
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
      baseMaterialCost: newCatalogDraft.materialCost ?? 0,
      baseLaborMinutes: newCatalogDraft.laborMinutes ?? 0,
      taxable: true,
      adaFlag: false,
      active: true,
      tags: [],
    });

    setCatalog((prev) => [created, ...prev]);
    applyCatalogToLineId(newCatalogLineId, created);
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
    setLastIntakeParse(null);
    setEstimateReviewLines({});
    setEstimateReviewJobConditions({});
    setEstimateReviewProjectMods({});
    setProjectDraft((prev) => ({
      ...prev,
      projectName: prev.projectName || 'New Project'
    }));
    setBlankQuickAddText('');
  }

  function parseBlankQuickAddLines(text: string): ParsedImportLine[] {
    const lines = String(text || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 260);

    return lines.map((line) => {
      // Supported formats:
      // - "SKU qty" or "qty x SKU"
      // - "Room, SKU, qty" (CSV-ish)
      // - "SKU" (qty defaults to 1)
      const csvParts = line.split(',').map((p) => p.trim()).filter(Boolean);
      if (csvParts.length >= 2) {
        const [a, b, c] = csvParts;
        const aQty = Number(String(a).replace(/,/g, ''));
        const bQty = Number(String(b).replace(/,/g, ''));
        const cQty = Number(String(c || '').replace(/,/g, ''));
        const looksQty = (n: number) => Number.isFinite(n) && n > 0;

        // If first cell is qty -> treat as qty, sku
        if (looksQty(aQty)) {
          return {
            projectName: '',
            category: '',
            itemCode: b || '',
            itemName: b || '',
            description: b || '',
            qty: aQty,
            unit: 'EA',
            laborIncluded: null,
            materialIncluded: null,
            notes: c || '',
            roomName: '',
            sourceReference: 'Blank quick add',
          };
        }

        // If second cell is qty -> treat as sku, qty
        if (looksQty(bQty)) {
          return {
            projectName: '',
            category: '',
            itemCode: a || '',
            itemName: a || '',
            description: a || '',
            qty: bQty,
            unit: 'EA',
            laborIncluded: null,
            materialIncluded: null,
            notes: c || '',
            roomName: '',
            sourceReference: 'Blank quick add',
          };
        }

        // If 3 cells and third is qty -> treat as room, sku, qty
        if (csvParts.length >= 3 && looksQty(cQty)) {
          return {
            projectName: '',
            category: '',
            itemCode: b || '',
            itemName: b || '',
            description: b || '',
            qty: cQty,
            unit: 'EA',
            laborIncluded: null,
            materialIncluded: null,
            notes: '',
            roomName: a || '',
            sourceReference: 'Blank quick add',
          };
        }
      }

      // Fallback: reuse the existing raw text parser (qty defaults to 1).
      return parseRawTextLinesToRows([line], 'Blank quick add')[0]!;
    });
  }

  function applyBlankQuickAddRows(input: {
    rows: ParsedImportLine[];
    metadata?: Partial<ProjectRecord> | null;
  }) {
    const parsed = input.rows;
    if (parsed.length === 0) return;

    if (input.metadata) {
      setProjectDraft((prev) => ({
        ...prev,
        projectName: prev.projectName || input.metadata?.projectName || prev.projectName,
        projectNumber: prev.projectNumber || (input.metadata as any)?.projectNumber || prev.projectNumber,
        projectNumberSource: (() => {
          const metaNum = String((input.metadata as any)?.projectNumber || '').trim();
          if (String(prev.projectNumber || '').trim()) return prev.projectNumberSource;
          if (metaNum) return 'manual' as const;
          return prev.projectNumberSource;
        })(),
        clientName: prev.clientName || (input.metadata as any)?.clientName || prev.clientName,
        address: prev.address || input.metadata?.address || prev.address,
        bidDate: prev.bidDate || (input.metadata as any)?.bidDate || prev.bidDate,
      }));
    }

    const nextRooms = new Set(roomSuggestions.map((r) => normalizeRoomName(r.roomName)));
    const seededRoom = blankUsesRooms ? (roomSuggestions.find((r) => r.include)?.roomName || 'Room 101') : 'Project Scope';

    const added = parsed.map((row) => {
      const raw = `${row.itemCode || ''} ${row.description || row.itemName || ''}`.trim();
      const match = suggestCatalogMatch(
        { itemName: row.itemName, description: row.description, rawText: raw },
        catalog
      );
      const resolvedRoom = normalizeRoomName(row.roomName || seededRoom || 'General Scope');
      if (resolvedRoom && !nextRooms.has(resolvedRoom)) {
        nextRooms.add(resolvedRoom);
      }
      return {
        id: makeId('line-suggest'),
        include: true,
        roomName: resolvedRoom,
        rawText: raw,
        itemName: match?.description || row.itemName || row.description || row.itemCode || raw,
        description: match?.description || row.description || row.itemName || row.itemCode || raw,
        qty: Number.isFinite(Number(row.qty)) && Number(row.qty) > 0 ? Number(row.qty) : 1,
        unit: match?.uom || row.unit || 'EA',
        category: match?.category || null,
        sourceReference: row.sourceReference || 'Blank quick add',
        sku: match?.sku || (row.itemCode ? String(row.itemCode).trim() : null),
        catalogItemId: match?.id || null,
        materialCost: match?.baseMaterialCost || 0,
        laborMinutes: match?.baseLaborMinutes || 0,
        notes: row.notes || '',
        bidBucket: (row as any).bidBucket || null,
        laborIncluded: null,
        materialIncluded: null,
        matched: !!match,
      } as LineSuggestion;
    });

    if (blankUsesRooms) {
      const existing = new Set(roomSuggestions.map((r) => normalizeRoomName(r.roomName)));
      const newRoomSuggestions = Array.from(nextRooms)
        .filter((roomName) => roomName && !existing.has(roomName))
        .map((roomName) => ({ id: makeId('room-suggest'), include: true, roomName }));
      if (newRoomSuggestions.length > 0) {
        setRoomSuggestions((prev) => [...prev, ...newRoomSuggestions]);
      }
    }

    setLineSuggestions((prev) => clampSuggestionCategories(dedupeSuggestions([...prev, ...added]), catalog));
    setBlankQuickAddText('');
  }

  function applyBlankQuickAdd() {
    const parsed = parseBlankQuickAddLines(blankQuickAddText);
    applyBlankQuickAddRows({ rows: parsed, metadata: null });
  }

  async function parsePreferredXlsxTemplate(file: File): Promise<{ rows: ParsedImportLine[]; metadata: Partial<ProjectRecord> }> {
    const xlsx = await import('xlsx');
    const buffer = await file.arrayBuffer();
    const workbook = xlsx.read(buffer, { type: 'array' });
    const sheet = workbook.Sheets['Import'] || workbook.Sheets[workbook.SheetNames[0]];
    const rawRows = xlsx.utils.sheet_to_json<Array<string | number | null | undefined>>(sheet, { header: 1, raw: false, defval: '' });
    const rows = (rawRows || []).map((r) => (r || []).map((c) => String(c ?? '').trim()));

    const metadata: Partial<ProjectRecord> = {};
    const getMeta = (label: string): string => {
      const row = rows.find((r) => String(r[0] || '').trim().toLowerCase() === label.toLowerCase());
      return row ? String(row[1] || '').trim() : '';
    };
    const projectName = getMeta('Project Name');
    const projectNumber = getMeta('Project Number');
    const clientName = getMeta('Client');
    const address = getMeta('Address');
    const bidDate = getMeta('Bid Date');
    if (projectName) metadata.projectName = projectName;
    if (address) metadata.address = address;
    // ProjectIntake draft uses these fields; keep them as (any) so we don't fight type unions here.
    (metadata as any).projectNumber = projectNumber || '';
    (metadata as any).clientName = clientName || '';
    (metadata as any).bidDate = bidDate || '';

    const headerNeedle = ['item code', 'quantity', 'room', 'bid bucket', 'description (only if item code is blank)', 'notes'];
    const headerRowIndex = rows.findIndex((r) => headerNeedle.every((h, idx) => String(r[idx] || '').trim().toLowerCase() === h));
    if (headerRowIndex < 0) {
      return { rows: [], metadata };
    }

    const out: ParsedImportLine[] = [];
    for (let i = headerRowIndex + 1; i < rows.length; i += 1) {
      const r = rows[i] || [];
      const itemCode = String(r[0] || '').trim();
      const qtyRaw = String(r[1] || '').trim();
      const roomName = String(r[2] || '').trim();
      const bidBucket = String(r[3] || '').trim();
      const descriptionFallback = String(r[4] || '').trim();
      const notes = String(r[5] || '').trim();
      if (!itemCode && !descriptionFallback && !qtyRaw && !roomName && !notes) continue;
      const qty = Number(String(qtyRaw).replace(/,/g, '')) || 1;
      out.push({
        projectName: '',
        category: '',
        itemCode,
        itemName: itemCode || descriptionFallback,
        description: descriptionFallback || itemCode,
        qty: qty > 0 ? qty : 1,
        unit: 'EA',
        laborIncluded: null,
        materialIncluded: null,
        notes,
        roomName,
        sourceReference: file.name,
        // extra (not on ParsedImportLine type used elsewhere, but consumed by applyBlankQuickAddRows via any)
        ...(bidBucket ? ({ bidBucket } as any) : null),
      } as any);
    }
    return { rows: out, metadata };
  }

  function loadTemplateDefaults() {
    setParserReviewSummary(null);
    setLastIntakeParse(null);
    setEstimateReviewLines({});
    setEstimateReviewJobConditions({});
    setEstimateReviewProjectMods({});
    setProjectDraft((prev) => ({
      ...prev,
      projectName: prev.projectName || 'Division 10 Template Project',
      projectType: 'Commercial',
      projectSize: 'T3_standard',
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
    setLineSuggestions(clampSuggestionCategories(dedupeSuggestions(starter), catalog));
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
      let normalizedJobConditions = normalizeProjectJobConditions(projectDraft.jobConditions);
      for (const patch of lastIntakeParse?.estimateDraft?.projectSuggestion.suggestedJobConditionsPatch ?? []) {
        const st = estimateReviewJobConditions[patch.id] ?? patch.applicationStatus;
        if (st === 'accepted') {
          normalizedJobConditions = normalizeProjectJobConditions({
            ...normalizedJobConditions,
            ...inferJobConditionPatchesFromText(patch),
          });
        }
      }

      const acceptedModNames = (lastIntakeParse?.estimateDraft?.projectSuggestion.suggestedProjectModifierIds ?? [])
        .filter((id) => (estimateReviewProjectMods[id] ?? 'suggested') === 'accepted')
        .map((id) => intakeModifiers.find((m) => m.id === id)?.name || id);
      let specialNotesAppend = projectDraft.specialNotes || '';
      if (acceptedModNames.length > 0) {
        specialNotesAppend = mergeDistinctText(specialNotesAppend, [
          `Accepted project modifiers (intake review): ${acceptedModNames.join(', ')}`,
        ]);
      }
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
        id: String(projectDraft.id || '').trim() || undefined,
        projectNumber:
          projectDraft.projectNumberSource === 'auto' ? null : (projectDraft.projectNumber || null),
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
        laborBurdenPercent: Number(projectDraft.laborBurdenPercent ?? settingsDefaults?.defaultLaborBurdenPercent ?? 0),
        overheadPercent: Number(projectDraft.overheadPercent ?? settingsDefaults?.defaultOverheadPercent ?? 15),
        profitPercent: Number(projectDraft.profitPercent ?? settingsDefaults?.defaultProfitPercent ?? 10),
        laborOverheadPercent: Number(projectDraft.laborOverheadPercent ?? settingsDefaults?.defaultLaborOverheadPercent ?? 5),
        laborProfitPercent: Number(projectDraft.laborProfitPercent ?? 0),
        subLaborManagementFeeEnabled: Boolean(projectDraft.subLaborManagementFeeEnabled),
        subLaborManagementFeePercent: Number(projectDraft.subLaborManagementFeePercent ?? 5),
        taxPercent: Number(projectDraft.taxPercent ?? settingsDefaults?.defaultTaxPercent ?? 8.25),
        pricingMode: (projectDraft.pricingMode as PricingMode) || 'labor_and_material',
        selectedScopeCategories: projectDraft.selectedScopeCategories || [],
        jobConditions: normalizedJobConditions,
        notes: projectDraft.notes || null,
        specialNotes: specialNotesAppend || null,
        structuredAssumptions: buildStructuredAssumptionsForNewProject(),
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

      const draftForResolve = lastIntakeParse?.estimateDraft;
      const resolvedLineSuggestions = lineSuggestions.map((line) =>
        resolveLineForProjectCreation(line, draftForResolve, estimateReviewLines, createConfirmedOnly)
      );
      const linesToCreate = resolvedLineSuggestions.filter((line) => (createConfirmedOnly ? line.include : true));
      if (linesToCreate.length > 0) {
        const payload = linesToCreate.map((line) => {
          const intakeFields = resolveIntakePersistFieldsForTakeoffLine({
            draft: draftForResolve,
            fingerprint: line.reviewLineFingerprint,
            lineByFingerprint: estimateReviewLines,
            catalogItemId: line.catalogItemId,
          });
          return {
            projectId: createdProject.id,
            roomId: roomMap.get(normalizeRoomName(line.roomName)) || createdRooms[0].id,
            sourceType: mode,
            sourceRef: line.sourceReference || (mode === 'takeoff' ? (takeoffFileName || sourceProjectId || null) : (uploadedFileName || sourceProjectId || null)),
            description: line.description,
            sku: line.sku,
            category: line.category,
            qty: line.qty ?? 0,
            unit: line.unit,
            materialCost: line.materialCost,
            laborMinutes: line.laborMinutes,
            laborCost: 0,
            catalogItemId: line.catalogItemId,
            catalogAttributeSnapshot: line.catalogAttributeSnapshot ?? null,
            notes: line.notes,
            intakeScopeBucket: intakeFields.intakeScopeBucket,
            intakeMatchConfidence: intakeFields.intakeMatchConfidence,
            isInstallableScope: intakeFields.isInstallableScope,
            installScopeType: intakeFields.installScopeType,
            installLaborFamily: intakeFields.installLaborFamily,
            sourceManufacturer: intakeFields.sourceManufacturer,
            sourceBidBucket: intakeFields.sourceBidBucket,
            sourceSectionHeader: intakeFields.sourceSectionHeader,
            generatedLaborMinutes: intakeFields.generatedLaborMinutes,
            laborOrigin: intakeFields.laborOrigin,
          };
        });
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

      navigate(`/project/${createdProject.id}/estimate?view=quantities`);
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
    <div className="ui-page space-y-8">
      <div className="mx-auto w-full max-w-[1600px]">
        <div className="flex flex-wrap items-start gap-4">
          <button type="button" onClick={() => navigate('/')} className="ui-btn-secondary h-9 w-9 shrink-0 grid place-items-center px-0" aria-label="Back to dashboard">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <header className="min-w-0 flex-1 border-b border-slate-200/80 pb-4">
            <div className="flex items-center gap-2.5">
              <span className="ui-status-live">Live</span>
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                Brighten Builders <span className="mx-1 text-slate-300">/</span> Intake Station
              </span>
            </div>
            <h1 className="mt-1.5 text-[24px] font-semibold leading-tight tracking-tight text-slate-950 md:text-[28px]">Create New Project</h1>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.06em] text-slate-500">
              Start Type · Source · Basics · Estimate Setup · Review
            </p>
          </header>
        </div>

        <nav className="mt-5 flex flex-wrap gap-1" aria-label="Creation steps">
          {[
            'Start Type',
            'Source',
            'Project Basics',
            'Estimate Setup',
            'Review Items',
          ].map((label, index) => {
            const current = step === index + 1;
            const done = step > index + 1;
            const num = String(index + 1).padStart(2, '0');
            return (
              <span
                key={label}
                className={`ui-tab-numbered ${current ? 'ui-tab-numbered-active' : done ? '' : 'ui-tab-numbered-disabled'}`}
              >
                <span className="ui-tab-numbered-num">{num}</span>
                <span>{label}</span>
              </span>
            );
          })}
        </nav>
      </div>

      {step === 1 && (
        <section className="ui-surface mx-auto w-full max-w-[1600px] space-y-4 p-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">Step 1</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">How do you want to start?</h2>
            <p className="mt-1 text-sm text-slate-600">Pick one path; you can still edit everything before the project is created.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {[
              { key: 'blank', label: 'Blank Project', desc: 'Start clean and add scope manually.', icon: PlusCircle },
              { key: 'takeoff', label: 'Create from Takeoff', desc: 'Upload takeoff and review matched items.', icon: FolderInput },
              { key: 'document', label: 'Create from Document', desc: 'Upload source document and review extracted items.', icon: FileUp },
              { key: 'template', label: 'Use Template', desc: 'Start from a template and adjust.', icon: WandSparkles },
            ].map((option) => {
              const active = mode === option.key;
              return (
                <button
                  type="button"
                  key={option.key}
                  onClick={() => setMode(option.key as CreationMode)}
                  className={`text-left rounded-lg border p-3.5 outline-none transition focus-visible:ring-2 focus-visible:ring-blue-500/35 focus-visible:ring-offset-2 ${active ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-slate-200 bg-slate-50/40 hover:border-slate-300'}`}
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
            <button type="button" onClick={() => setStep(2)} className="ui-btn-primary h-9 px-4">
              Next
            </button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="ui-surface mx-auto w-full max-w-[1600px] space-y-5 p-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">Step 2</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">Source details</h2>
            <p className="mt-1 text-sm text-slate-600">Upload or paste based on the start type you chose.</p>
          </div>

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
                  className={`ui-dashed-card p-5 ${takeoffDragOver ? 'ring-2 ring-blue-500/25' : ''}`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Upload className="w-4 h-4 text-slate-500" />
                    <p className="text-sm font-medium text-slate-800">Upload Takeoff File</p>
                  </div>
                  <p className="text-xs text-slate-500 mb-2">Upload PDF, Excel, or CSV.</p>
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full bg-slate-100 px-2 py-1 font-medium text-slate-700">Preferred</span>
                    <a className="font-semibold text-blue-700 underline-offset-2 hover:underline" href="/api/v1/intake/templates/preferred-import.xlsx">
                      Download our import template (XLSX)
                    </a>
                    <span className="text-slate-500">— files matching this format import with exact column mapping (no guessing).</span>
                  </div>
                  <p className="text-xs text-slate-500 mb-3">Drag and drop, or browse.</p>
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
                    <p
                      className={`mt-3 text-xs ${takeoffUploadState === 'error' ? 'text-red-700' : takeoffUploadState === 'ready' ? 'text-[var(--success)]' : 'text-[var(--warn)]'}`}
                    >
                      {takeoffUploadState === 'processing' ? `Processing file: ${takeoffFileName}` : takeoffUploadState === 'error' ? `File needs attention: ${takeoffFileName}` : `Source file loaded: ${takeoffFileName}`}
                    </p>
                  )}
                  {takeoffUploadMessage ? <p className="text-xs text-slate-500 mt-1">{takeoffUploadMessage}</p> : null}
                  {takeoffStructuredKind && (
                    <p className="text-xs text-slate-600 mt-1">Detected structure: {takeoffStructuredKind.replace(/-/g, ' ')}</p>
                  )}
                  {intakeWarnings.length > 0 && (
                    <div className="ui-callout-warn mt-3">
                      <p className="text-xs font-semibold">Extraction warnings</p>
                      <ul className="mt-1 space-y-1">
                        {intakeWarnings.map((warning, index) => (
                          <li key={`${warning}-${index}`} className="text-xs">
                            - {warning}
                          </li>
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
                <div className="ui-callout-warn">
                  <p className="text-xs font-semibold">Extraction warnings</p>
                  <ul className="mt-1 space-y-1">
                    {intakeWarnings.map((warning, index) => (
                      <li key={`${warning}-${index}`} className="text-xs">
                        - {warning}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {mode === 'blank' && (
            <div className="space-y-4">
              <div className="ui-panel-muted space-y-3 p-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Rooms / Areas</p>
                  <h3 className="text-sm font-semibold text-slate-900 mt-1">Choose how to organize this project.</h3>
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
                      className="ui-textarea mt-1"
                    />
                    <span className="block text-[11px] text-slate-500">One room per line. Leave blank to auto-create one room.</span>
                  </label>
                ) : (
                  <p className="text-xs text-slate-500">Project starts with one project-wide scope bucket.</p>
                )}
              </div>

              <div className="ui-panel space-y-3 p-4">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Quick add items</p>
                    <h3 className="text-sm font-semibold text-slate-900 mt-1">Paste or drag/drop SKUs</h3>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Fast path for blank projects. Each line can be <span className="font-medium text-slate-700">SKU qty</span> (or <span className="font-medium text-slate-700">qty x SKU</span>), or <span className="font-medium text-slate-700">Room, SKU, qty</span>.
                      Room is optional. SKUs are matched against your catalog first.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="ui-btn-secondary h-9 px-3 text-xs font-semibold disabled:opacity-50"
                    onClick={applyBlankQuickAdd}
                    disabled={!blankQuickAddText.trim()}
                  >
                    Add to draft
                  </button>
                </div>

                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setBlankQuickAddDragOver(true);
                  }}
                  onDragLeave={() => setBlankQuickAddDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setBlankQuickAddDragOver(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) {
                      const name = file.name.toLowerCase();
                      if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
                        void parsePreferredXlsxTemplate(file).then(({ rows, metadata }) => {
                          if (rows.length === 0) {
                            void file.text().then((t) => setBlankQuickAddText((prev) => (prev ? `${prev}\n${t}` : t)));
                            return;
                          }
                          applyBlankQuickAddRows({ rows, metadata });
                        });
                        return;
                      }
                      void file.text().then((t) => setBlankQuickAddText((prev) => (prev ? `${prev}\n${t}` : t)));
                      return;
                    }
                    const text = e.dataTransfer.getData('text/plain');
                    if (text) setBlankQuickAddText((prev) => (prev ? `${prev}\n${text}` : text));
                  }}
                  className={`ui-dashed-card p-3 ${blankQuickAddDragOver ? 'ring-2 ring-blue-500/25' : ''}`}
                >
                  <textarea
                    rows={5}
                    value={blankQuickAddText}
                    onChange={(e) => setBlankQuickAddText(e.target.value)}
                    placeholder={'PT-HDPE-36 2\n1 x GRAB-36\nRestroom A, MIRROR-1836, 1'}
                    className="ui-textarea w-full resize-y"
                  />
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                    <span>Tip: you can drop a `.txt` or `.csv` file here.</span>
                    <span>{blankQuickAddText.trim() ? `${blankQuickAddText.trim().split(/\r?\n/).filter(Boolean).length} line(s)` : '0 lines'}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {mode === 'template' && (
            <p className="text-sm text-slate-600">No source file needed for this start type. Continue to review.</p>
          )}

          <div className="flex justify-between pt-1">
            <button type="button" onClick={() => setStep(1)} className="h-9 px-4 rounded-md border border-slate-300 text-sm font-medium hover:bg-slate-50">Back</button>
            <button type="button" onClick={() => void proceedToBasics()} disabled={takeoffUploadState === 'processing'} className="ui-btn-primary h-9 px-4 disabled:opacity-50">{takeoffUploadState === 'processing' ? 'Processing Upload...' : 'Continue to Basics'}</button>
          </div>
        </section>
      )}

      {(step === 3 || step === 4 || step === 5) && (
        <section className="mx-auto w-full max-w-[1600px] space-y-5">
          {(step === 3 || step === 4) && (
            <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm space-y-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">{step === 3 ? 'Step 3' : 'Step 4'}</p>
                <h2 className="mt-1 text-lg font-semibold text-slate-900">{step === 3 ? 'Project basics' : 'Estimate setup'}</h2>
                <p className="mt-1 text-sm text-slate-600">
                  {step === 3
                    ? 'Identity, schedule, and site address — required before estimate setup.'
                    : 'Aligns with Project Setup: core inputs first, light job-condition toggles, pricing defaults collapsed unless you need them.'}
                </p>
              </div>
              {peerIntakeHint?.sourceProjectId ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-sky-200 bg-sky-50/90 px-3 py-2.5 text-sm text-slate-800">
                  <p className="min-w-0 flex-1">
                    <span className="font-semibold">Similar project in your library</span>
                    <span className="text-slate-600">
                      {' '}
                      — apply scope categories, pricing mode, tax, and job conditions from a recent job for this{' '}
                      {peerIntakeHint.matchedBy === 'client' ? 'client' : 'general contractor'}.
                    </span>
                  </p>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button type="button" className="ui-btn-primary h-8 px-3 text-xs" onClick={applyPeerIntakeHint}>
                      Apply defaults
                    </button>
                    <button type="button" className="ui-btn-secondary h-8 px-3 text-xs" onClick={dismissPeerIntakeHint}>
                      Dismiss
                    </button>
                  </div>
                </div>
              ) : null}
              <div
                className={
                  step === 4
                    ? 'grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(240px,280px)]'
                    : 'grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.9fr)]'
                }
              >
                <div className="space-y-4">
                  {step === 3 ? (
                <div className="rounded-2xl border border-slate-200/70 bg-slate-50/50 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">Job basics</p>
                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label className="text-xs text-slate-600">Project Name<input className="ui-input mt-1" value={projectDraft.projectName || ''} onChange={(e) => patchProjectDraft({ projectName: e.target.value })} /></label>
                    <label className="text-xs text-slate-600">Bid Package / Job #<input className="ui-input mt-1" value={projectDraft.projectNumber || ''} onChange={(e) => {
                        const v = e.target.value;
                        patchProjectDraft({
                          projectNumber: v,
                          projectNumberSource: isBlankOrPlaceholderBidNumber(v) ? 'auto' : 'manual',
                        });
                      }} /></label>
                    <label className="text-xs text-slate-600">Client<input className="ui-input mt-1" value={projectDraft.clientName || ''} onChange={(e) => patchProjectDraft({ clientName: e.target.value })} /></label>
                    <label className="text-xs text-slate-600">Estimator<input className="ui-input mt-1" value={projectDraft.estimator || ''} onChange={(e) => patchProjectDraft({ estimator: e.target.value })} /></label>
                    <label className="text-xs text-slate-600 md:col-span-2">Project Type
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
                      <span className="mt-1 block text-[11px] font-normal text-slate-500">
                        Type a few characters — pick a suggestion to fill the full address, or keep typing manually.
                      </span>
                      <SiteAddressAutocomplete
                        className="mt-1"
                        value={projectDraft.address || ''}
                        onChange={(v) => {
                          patchProjectDraft({ address: v });
                          setDistanceError(null);
                          setDistanceMessage('Address updated. Calculating travel distance...');
                          patchDraftJobConditions({ travelDistanceMiles: null });
                        }}
                      />
                    </label>
                  </div>
                </div>
                  ) : null}

                  {step === 4 ? (
                    <>
                      <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm space-y-6">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">Section 1</p>
                          <h3 className="mt-1 text-lg font-semibold text-slate-900">Project inputs</h3>
                          <p className="mt-2 text-sm text-slate-600">Price mode, scope, floors, substrate, and delivery — optional site and sizing fields stay collapsed unless you need them.</p>
                          <IntakeFieldLegend />
                        </div>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                          <label className="text-[11px] font-medium text-slate-800">
                            <span className="inline-flex items-center">
                              Price mode
                              <IntakeFieldBadge kind="required" />
                            </span>
                            <select
                              className="ui-input mt-1.5 h-10"
                              value={(projectDraft.pricingMode as PricingMode) || 'labor_and_material'}
                              onChange={(e) => patchProjectDraft({ pricingMode: e.target.value as PricingMode })}
                            >
                              <option value="material_only">Material only</option>
                              <option value="labor_only">Install only</option>
                              <option value="labor_and_material">Material + install</option>
                              <option value="material_with_optional_install_quote">Material + install (quoted separately)</option>
                            </select>
                            <span className="mt-1 block text-[10px] text-slate-500">Controls material vs labor in the bid.</span>
                          </label>

                          <label className="text-[11px] font-medium text-slate-800">
                            <span className="inline-flex items-center">
                              Floor level
                              <IntakeFieldBadge kind="optional" />
                            </span>
                            <select className="ui-input mt-1.5 h-10" value={projectDraft.floorLevel || 'Ground'} onChange={(e) => patchProjectDraft({ floorLevel: e.target.value })}>
                              <option value="Ground">Ground</option>
                              <option value="2-3">2–3</option>
                              <option value="4+">4+</option>
                            </select>
                          </label>

                          <label className="text-[11px] font-medium text-slate-800">
                            <span className="inline-flex items-center">
                              Floors (building)
                              <IntakeFieldBadge kind="optional" />
                            </span>
                            <input type="number" min={1} className="ui-input mt-1.5 h-10" value={draftJob.floors} onChange={(e) => patchDraftJobConditions({ floors: Number(e.target.value) || 1 })} />
                          </label>

                          <label className="text-[11px] font-medium text-slate-800">
                            <span className="inline-flex items-center">
                              Wall substrate
                              <IntakeFieldBadge kind="optional" />
                            </span>
                            <select className="ui-input mt-1.5 h-10" value={projectDraft.wallSubstrate || 'Drywall'} onChange={(e) => patchProjectDraft({ wallSubstrate: e.target.value })}>
                              <option value="Drywall">Drywall</option>
                              <option value="CMU">CMU</option>
                              <option value="Concrete">Concrete</option>
                              <option value="Tile">Tile</option>
                            </select>
                          </label>

                        </div>

                        <details className="group rounded-xl border border-slate-200/90 bg-slate-50/50 shadow-sm">
                          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-[11px] font-semibold text-slate-800 [&::-webkit-details-marker]:hidden">
                            <span>Optional job size &amp; region</span>
                            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500 transition group-open:rotate-180" aria-hidden />
                          </summary>
                          <div className="space-y-3 border-t border-slate-200/80 px-3 pb-3 pt-2">
                            <label className="block text-[11px] font-medium text-slate-800">
                              <span className="inline-flex items-center">
                                Project size
                                <IntakeFieldBadge kind="optional" />
                              </span>
                              <select
                                className="ui-input mt-1.5 h-10"
                                value={normalizeProjectSizeSelectValue(projectDraft.projectSize)}
                                onChange={(e) => patchProjectDraft({ projectSize: e.target.value })}
                              >
                                {PROJECT_JOB_SIZE_OPTIONS.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                              <span className="mt-1 block text-[10px] text-slate-500">Typical crew-duration / bid size tier.</span>
                            </label>
                            <label className="block text-[11px] font-medium text-slate-800">
                              <span className="inline-flex items-center">
                                Location / region note
                                <IntakeFieldBadge kind="optional" />
                              </span>
                              <input
                                className="ui-input mt-1.5 h-10"
                                value={draftJob.locationLabel || ''}
                                onChange={(e) => patchDraftJobConditions({ locationLabel: e.target.value })}
                                placeholder="e.g. Austin metro"
                              />
                            </label>
                          </div>
                        </details>

                        <details className="group rounded-xl border border-slate-200/90 bg-slate-50/50 shadow-sm">
                          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-[11px] font-semibold text-slate-800 [&::-webkit-details-marker]:hidden">
                            <span>Optional site context (access, lifts, handling)</span>
                            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500 transition group-open:rotate-180" aria-hidden />
                          </summary>
                          <div className="border-t border-slate-200/80 px-3 pb-3 pt-2">
                            <p className="text-xs text-slate-500">Helps metadata and assumptions; leave closed if this job matches a normal site.</p>
                            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                              <label className="text-[11px] font-medium text-slate-700">
                                Access difficulty
                                <select className="ui-input mt-1 h-9" value={projectDraft.accessDifficulty || 'Easy'} onChange={(e) => patchProjectDraft({ accessDifficulty: e.target.value })}>
                                  <option value="Easy">Easy</option>
                                  <option value="Moderate">Moderate</option>
                                  <option value="Difficult">Difficult</option>
                                </select>
                              </label>
                              <label className="text-[11px] font-medium text-slate-700">
                                Install height
                                <select className="ui-input mt-1 h-9" value={projectDraft.installHeight || 'Standard'} onChange={(e) => patchProjectDraft({ installHeight: e.target.value })}>
                                  <option value="Standard">Standard</option>
                                  <option value="Ladder">Ladder</option>
                                  <option value="Lift">Lift</option>
                                  <option value="Scaffold">Scaffold</option>
                                </select>
                              </label>
                              <label className="text-[11px] font-medium text-slate-700">
                                Material handling
                                <select className="ui-input mt-1 h-9" value={projectDraft.materialHandling || 'Standard'} onChange={(e) => patchProjectDraft({ materialHandling: e.target.value })}>
                                  <option value="Standard">Standard</option>
                                  <option value="Manual">Manual</option>
                                  <option value="Multiple Moves">Multiple moves</option>
                                </select>
                              </label>
                            </div>
                          </div>
                        </details>

                        <div>
                          <p className="text-[11px] font-semibold text-slate-800">
                            <span className="inline-flex items-center">
                              Scope categories
                              <IntakeFieldBadge kind="required" />
                            </span>
                          </p>
                          <p className="mt-1 text-xs text-slate-500">Which catalog trades are in play for this bid.</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {scopeCategoryOptions.map((category) => {
                              const active = (projectDraft.selectedScopeCategories || []).includes(category);
                              return (
                                <button
                                  key={category}
                                  type="button"
                                  onClick={() =>
                                    patchProjectDraft({
                                      selectedScopeCategories: active
                                        ? (projectDraft.selectedScopeCategories || []).filter((entry) => entry !== category)
                                        : [...(projectDraft.selectedScopeCategories || []), category].sort(),
                                    })
                                  }
                                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                                    active ? 'border-blue-400 bg-blue-50 text-blue-900 shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                                  }`}
                                >
                                  {category}
                                </button>
                              );
                            })}
                            {scopeCategoryOptions.length === 0 ? <p className="text-xs text-slate-500">Categories load after catalog sync.</p> : null}
                          </div>
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                          <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-800">
                            <input
                              type="checkbox"
                              className="mt-1 h-4 w-4 rounded border-slate-300"
                              checked={draftJob.deliveryRequired}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  const miles = draftJob.travelDistanceMiles;
                                  if (miles !== null && miles !== undefined && Number.isFinite(miles)) {
                                    patchDraftJobConditions({
                                      ...recommendDeliveryPlan(miles, draftJob.deliveryDifficulty),
                                      deliveryRequired: true,
                                      deliveryAutoCalculated: true,
                                    });
                                  } else {
                                    patchDraftJobConditions({ deliveryRequired: true, deliveryAutoCalculated: false });
                                  }
                                } else {
                                  patchDraftJobConditions({
                                    deliveryRequired: false,
                                    deliveryQuotedSeparately: false,
                                    deliveryAutoCalculated: false,
                                  });
                                }
                              }}
                            />
                            <span>
                              <span className="font-semibold">Delivery required / included in this estimate</span>
                              <span className="mt-0.5 block text-xs font-normal text-slate-600">Turn on to price freight or jobsite delivery. Details stay hidden until this is on.</span>
                            </span>
                          </label>
                          {draftJob.deliveryRequired ? (
                            <div className="mt-4 grid grid-cols-1 gap-3 border-t border-slate-200/80 pt-4 sm:grid-cols-3">
                              <label className="text-[11px] font-medium text-slate-700">
                                Delivery mode
                                <select
                                  className="ui-input mt-1 h-9"
                                  value={draftJob.deliveryPricingMode}
                                  onChange={(e) => patchDraftJobConditions({ deliveryPricingMode: e.target.value as ProjectJobConditions['deliveryPricingMode'], deliveryAutoCalculated: false })}
                                >
                                  <option value="included">Included / no charge</option>
                                  <option value="flat">Flat amount</option>
                                  <option value="percent">Percent of base</option>
                                </select>
                              </label>
                              <label className="text-[11px] font-medium text-slate-700">
                                Delivery $ or %
                                <input type="number" step="0.01" className="ui-input mt-1 h-9" value={draftJob.deliveryValue} onChange={(e) => patchDraftJobConditions({ deliveryValue: Number(e.target.value) || 0, deliveryAutoCalculated: false })} />
                              </label>
                              <label className="text-[11px] font-medium text-slate-700">
                                Lead time (days)
                                <input type="number" min={0} className="ui-input mt-1 h-9" value={draftJob.deliveryLeadDays} onChange={(e) => patchDraftJobConditions({ deliveryLeadDays: Number(e.target.value) || 0 })} />
                              </label>
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">Section 2</p>
                        <h3 className="mt-1 text-lg font-semibold text-slate-900">Job conditions</h3>
                        <p className="mt-2 text-sm text-slate-600">Toggle what applies. Delivery is set under project inputs.</p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {(
                            [
                              ['occupiedBuilding', 'Occupied building', draftJob.occupiedBuilding],
                              ['restrictedAccess', 'Restricted access', draftJob.restrictedAccess],
                              ['nightWork', 'Night work', draftJob.nightWork],
                              ['phasedWork', 'Phased work', draftJob.phasedWork],
                              ['remoteTravel', 'Remote travel', draftJob.remoteTravel],
                              ['scheduleCompression', 'Schedule compression', draftJob.scheduleCompression],
                              ['smallJobFactor', 'Small job factor', draftJob.smallJobFactor],
                            ] as const
                          ).map(([key, label, on]) => (
                            <button
                              key={key}
                              type="button"
                              role="switch"
                              aria-checked={on}
                              onClick={() => {
                                if (key === 'phasedWork') {
                                  promptForPhasedWorkDraft(!on);
                                  return;
                                }
                                patchDraftJobConditions({ [key]: !on } as Partial<ProjectJobConditions>);
                              }}
                              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                                on ? 'border-slate-800 bg-slate-900 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        <p className="mt-4 flex items-start gap-2 text-[11px] text-slate-500">
                          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                          Markups, crew, and field allowances live under <strong className="font-medium text-slate-700">Advanced pricing &amp; field conditions</strong> on the right.
                        </p>
                        {draftJob.phasedWork ? (
                          <div className="mt-4 grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2">
                            <label className="text-[11px] font-medium text-slate-700">
                              Phase count
                              <input
                                type="number"
                                min={2}
                                className="ui-input mt-1 h-9"
                                value={draftJob.phasedWorkPhases}
                                onChange={(e) => {
                                  const phaseCount = Math.max(2, Number(e.target.value) || 2);
                                  patchDraftJobConditions({ phasedWorkPhases: phaseCount, phasedWorkMultiplier: recommendedPhasedWorkMultiplier(phaseCount) });
                                }}
                              />
                            </label>
                            <label className="text-[11px] font-medium text-slate-700">
                              Phased labor multiplier
                              <input type="number" step="0.01" className="ui-input mt-1 h-9" value={draftJob.phasedWorkMultiplier} onChange={(e) => patchDraftJobConditions({ phasedWorkMultiplier: Number(e.target.value) || 0 })} />
                            </label>
                          </div>
                        ) : null}
                      </div>
                    </>
                  ) : null}
                </div>

                <div className="space-y-4">
                  {step === 3 ? (
                    <>
                      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">Required Before Pricing</p>
                        <div className="mt-3 space-y-2">
                          {['Project name', 'Client', 'Site address', 'Project type', 'Bid due date'].map((label) => {
                            const missing = basicsChecklist.includes(label);
                            return (
                              <div key={label} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm">
                                <span className="text-slate-700">{label}</span>
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${missing ? 'ui-status-warn' : 'ui-status-ok'}`}
                                >
                                  {missing ? 'Required' : 'Ready'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">Source Summary</p>
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
                      <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">Travel</p>
                            <p className="mt-1 text-xs text-slate-500">Office: {OFFICE_ADDRESS}</p>
                          </div>
                          {distanceCalculating ? <span className="text-[11px] font-semibold text-blue-700">Calculating…</span> : null}
                        </div>
                        <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/80 p-3 text-sm text-slate-700">
                          <p className="font-medium text-slate-900">
                            {draftJob.travelDistanceMiles !== null
                              ? `${formatNumberSafe(draftJob.travelDistanceMiles, 1)} miles from office.`
                              : distanceMessage}
                          </p>
                          {distanceError ? <p className="mt-1 text-xs text-red-600">{distanceError}</p> : null}
                        </div>
                        {draftJob.deliveryRequired ? (
                          <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-[11px] text-slate-600">
                            <p className="font-medium text-slate-800">Delivery summary</p>
                            <p className="mt-1 text-slate-500">
                              Under 50 mi — typically no fee; 50–100 mi — $100 flat; over 100 mi — often priced separately. Adjust under project inputs if needed.
                            </p>
                            <p className="mt-1 text-slate-700">
                              {!draftJob.deliveryQuotedSeparately
                                ? `${formatNumberSafe(draftJob.travelDistanceMiles || 0, 1)} mi · ${draftJob.deliveryLeadDays} day lead · ${draftJob.deliveryPricingMode === 'flat' ? `${formatCurrencySafe(draftJob.deliveryValue)} flat` : draftJob.deliveryPricingMode === 'percent' ? `${formatNumberSafe(draftJob.deliveryValue, 2)}%` : 'included'}`
                                : `${formatNumberSafe(draftJob.travelDistanceMiles || 0, 1)} mi — quoted separately (not in estimate total).`}
                            </p>
                          </div>
                        ) : null}
                      </div>

                      <details className="group rounded-2xl border border-slate-300/80 bg-slate-50/50 shadow-sm open:bg-white">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">Section 3</p>
                            <p className="text-sm font-semibold text-slate-900">Advanced pricing &amp; field conditions</p>
                            <p className="mt-0.5 text-xs text-slate-500">Only open if this bid differs from normal company assumptions.</p>
                          </div>
                          <ChevronDown className="h-4 w-4 shrink-0 text-slate-500 transition group-open:rotate-180" aria-hidden />
                        </summary>
                        <div className="space-y-4 border-t border-slate-200 px-4 pb-4 pt-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs text-slate-600">Open when this bid differs from office norms.</p>
                            <button
                              type="button"
                              onClick={resetIntakeAdvancedPricingToOfficeDefaults}
                              disabled={!settingsDefaults}
                              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50"
                            >
                              Reset to office defaults
                            </button>
                          </div>
                          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            <label className="text-[11px] font-medium text-slate-700">
                              Labor burden % (sub)
                              {matchesIntakeOffice('burden') ? <IntakeFieldBadge kind="office" /> : <IntakeFieldBadge kind="optional" />}
                              <input type="number" step="0.01" className="ui-input mt-1 h-9" value={projectDraft.laborBurdenPercent ?? ''} onChange={(e) => patchProjectDraft({ laborBurdenPercent: Number(e.target.value) || 0 })} />
                              <span className="mt-1 block max-w-xl text-[10px] font-normal leading-snug text-slate-500">
                                Use 0 when your $/hr already includes burden.
                              </span>
                            </label>
                            <label className="text-[11px] font-medium text-slate-700 md:col-span-2">
                              Material O&amp;P % (after tax on material)
                              {matchesIntakeOffice('materialOandP') ? <IntakeFieldBadge kind="office" /> : <IntakeFieldBadge kind="optional" />}
                              <input
                                type="number"
                                step="0.01"
                                className="ui-input mt-1 h-9 max-w-[8rem]"
                                value={projectDraft.overheadPercent ?? ''}
                                onChange={(e) =>
                                  patchProjectDraft({ overheadPercent: Number(e.target.value) || 0, profitPercent: 0 })
                                }
                              />
                              <span className="mt-1 block max-w-xl text-[10px] font-normal leading-snug text-slate-500">
                                Single sell-side markup on material. Hourly install rate is already loaded with typical labor margin.
                              </span>
                            </label>
                            {(projectDraft.pricingMode as PricingMode) !== 'labor_only' ? (
                              <label className="text-[11px] font-medium text-slate-700">
                                Material tax %
                                {matchesIntakeOffice('tax') ? <IntakeFieldBadge kind="office" /> : <IntakeFieldBadge kind="optional" />}
                                <input type="number" step="0.01" className="ui-input mt-1 h-9" value={projectDraft.taxPercent ?? ''} onChange={(e) => patchProjectDraft({ taxPercent: Number(e.target.value) || 0 })} />
                              </label>
                            ) : null}
                            <label className="text-[11px] font-medium text-slate-700">
                              Location tax override %
                              <IntakeFieldBadge kind="optional" />
                              <input
                                type="number"
                                step="0.01"
                                className="ui-input mt-1 h-9"
                                value={draftJob.locationTaxPercent ?? ''}
                                onChange={(e) => patchDraftJobConditions({ locationTaxPercent: e.target.value === '' ? null : Number(e.target.value) })}
                                placeholder="Blank = use material tax"
                              />
                            </label>
                            <label className="text-[11px] font-medium text-slate-700">
                              Labor factor
                              <IntakeFieldBadge kind="optional" />
                              <input type="number" step="0.01" className="ui-input mt-1 h-9" value={draftJob.laborRateMultiplier} onChange={(e) => patchDraftJobConditions({ laborRateMultiplier: Number(e.target.value) || 1 })} />
                            </label>
                            <label className="text-[11px] font-medium text-slate-700">
                              Crew size
                              <IntakeFieldBadge kind="optional" />
                              <input type="number" min={1} className="ui-input mt-1 h-9" value={draftJob.installerCount} onChange={(e) => patchDraftJobConditions({ installerCount: Number(e.target.value) || 1 })} />
                            </label>
                            <details className="group rounded-xl border border-slate-200 bg-white/90 px-3 py-2 md:col-span-2">
                              <summary className="cursor-pointer list-none text-[11px] font-semibold text-slate-800 [&::-webkit-details-marker]:hidden">
                                Advanced: stacked material profit, sub labor markup (usually 0%)
                              </summary>
                              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                                <label className="text-[11px] font-medium text-slate-700">
                                  Material profit % (after material O&amp;P)
                                  {matchesIntakeOffice('profit') ? <IntakeFieldBadge kind="office" /> : <IntakeFieldBadge kind="optional" />}
                                  <input
                                    type="number"
                                    step="0.01"
                                    className="ui-input mt-1 h-9"
                                    value={projectDraft.profitPercent ?? ''}
                                    onChange={(e) => patchProjectDraft({ profitPercent: Number(e.target.value) || 0 })}
                                  />
                                </label>
                                <label className="text-[11px] font-medium text-slate-700">
                                  Labor overhead % (sub)
                                  {matchesIntakeOffice('laborOverhead') ? <IntakeFieldBadge kind="office" /> : <IntakeFieldBadge kind="optional" />}
                                  <input
                                    type="number"
                                    step="0.01"
                                    className="ui-input mt-1 h-9"
                                    value={projectDraft.laborOverheadPercent ?? ''}
                                    onChange={(e) => patchProjectDraft({ laborOverheadPercent: Number(e.target.value) || 0 })}
                                  />
                                </label>
                                <label className="text-[11px] font-medium text-slate-700">
                                  Labor profit % (sub)
                                  {matchesIntakeOffice('laborProfit') ? <IntakeFieldBadge kind="office" /> : <IntakeFieldBadge kind="optional" />}
                                  <input
                                    type="number"
                                    step="0.01"
                                    className="ui-input mt-1 h-9"
                                    value={projectDraft.laborProfitPercent ?? ''}
                                    onChange={(e) => patchProjectDraft({ laborProfitPercent: Number(e.target.value) || 0 })}
                                  />
                                </label>
                              </div>
                            </details>
                            <div className="sm:col-span-2 rounded-lg border border-amber-200/80 bg-amber-50/50 p-3">
                              <p className="text-[12px] font-semibold text-slate-900">Performance / surety bond</p>
                              <p className="mt-1 text-[11px] text-slate-600">
                                If the job requires bonding, include an allowance as a percent of the base bid (before job-wide tax and markups).
                              </p>
                              <label className="mt-2 flex items-center gap-2 text-[11px] font-medium text-slate-700">
                                <input
                                  type="checkbox"
                                  checked={draftJob.performanceBondRequired}
                                  onChange={(e) => patchDraftJobConditions({ performanceBondRequired: e.target.checked })}
                                />
                                Bond required on this project
                              </label>
                              <label className="mt-2 block text-[11px] font-medium text-slate-700">
                                Bond allowance % of base bid
                                <input
                                  type="number"
                                  step="0.01"
                                  min={0}
                                  className="ui-input mt-1 h-9 max-w-[8rem]"
                                  value={draftJob.performanceBondPercent}
                                  onChange={(e) => patchDraftJobConditions({ performanceBondPercent: Number(e.target.value) || 0 })}
                                  disabled={!draftJob.performanceBondRequired}
                                />
                              </label>
                            </div>
                            <label className="text-[11px] font-medium text-slate-700">
                              Project adder %
                              <input type="number" step="0.01" className="ui-input mt-1 h-9" value={draftJob.estimateAdderPercent} onChange={(e) => patchDraftJobConditions({ estimateAdderPercent: Number(e.target.value) || 0 })} />
                            </label>
                            <label className="text-[11px] font-medium text-slate-700">
                              Project adder $
                              <input type="number" step="0.01" className="ui-input mt-1 h-9" value={draftJob.estimateAdderAmount} onChange={(e) => patchDraftJobConditions({ estimateAdderAmount: Number(e.target.value) || 0 })} />
                            </label>
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-white p-3">
                            <p className="text-xs font-semibold text-slate-900">Sub labor management fee</p>
                            <label className="mt-2 flex items-center gap-2 text-[11px] text-slate-700">
                              <input type="checkbox" checked={Boolean(projectDraft.subLaborManagementFeeEnabled)} onChange={(e) => patchProjectDraft({ subLaborManagementFeeEnabled: e.target.checked })} />
                              Enable on loaded subcontractor labor
                            </label>
                            <label className="mt-2 block text-[11px] font-medium text-slate-700">
                              Fee %
                              <input type="number" step="0.01" className="ui-input mt-1 h-9 max-w-[200px]" value={projectDraft.subLaborManagementFeePercent ?? 5} onChange={(e) => patchProjectDraft({ subLaborManagementFeePercent: Number(e.target.value) || 0 })} />
                            </label>
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                            <p className="text-xs font-semibold text-slate-900">Delivery logistics (for auto rules)</p>
                            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                              <label className="text-[11px] font-medium text-slate-700">
                                Delivery difficulty
                                <select className="ui-input mt-1 h-9" value={draftJob.deliveryDifficulty} onChange={(e) => patchDraftJobConditions({ deliveryDifficulty: e.target.value as ProjectJobConditions['deliveryDifficulty'] })}>
                                  <option value="standard">Standard</option>
                                  <option value="constrained">Constrained</option>
                                  <option value="difficult">Difficult</option>
                                </select>
                              </label>
                              <label className="text-[11px] font-medium text-slate-700">
                                Floor labor add / floor
                                <input type="number" step="0.01" className="ui-input mt-1 h-9" value={draftJob.floorMultiplierPerFloor} onChange={(e) => patchDraftJobConditions({ floorMultiplierPerFloor: Number(e.target.value) || 0 })} />
                              </label>
                              <label className="text-[11px] font-medium text-slate-700">
                                Mobilization
                                <select className="ui-input mt-1 h-9" value={draftJob.mobilizationComplexity} onChange={(e) => patchDraftJobConditions({ mobilizationComplexity: e.target.value as ProjectJobConditions['mobilizationComplexity'] })}>
                                  <option value="low">Low</option>
                                  <option value="medium">Medium</option>
                                  <option value="high">High</option>
                                </select>
                              </label>
                              <label className="flex items-center gap-2 text-[11px] text-slate-700 md:col-span-2">
                                <input type="checkbox" checked={draftJob.elevatorAvailable} onChange={(e) => patchDraftJobConditions({ elevatorAvailable: e.target.checked })} />
                                Elevator available
                              </label>
                            </div>
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-white p-3">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">Notes</p>
                            <h3 className="mt-1 text-sm font-semibold text-slate-900">Proposal &amp; internal</h3>
                            <div className="mt-3 space-y-3">
                              <label className="text-[11px] font-medium text-slate-700">
                                Proposal notes
                                <textarea rows={4} className="ui-input mt-1 min-h-[100px] py-2" value={projectDraft.specialNotes || ''} onChange={(e) => patchProjectDraft({ specialNotes: e.target.value })} />
                              </label>
                              <label className="text-[11px] font-medium text-slate-700">
                                Internal notes
                                <textarea rows={4} className="ui-input mt-1 min-h-[100px] py-2" value={projectDraft.notes || ''} onChange={(e) => patchProjectDraft({ notes: e.target.value })} />
                              </label>
                            </div>
                          </div>
                        </div>
                      </details>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-2">
                <button type="button" onClick={() => setStep(step === 3 ? 2 : 3)} className="ui-btn-secondary">Back</button>
                <button type="button" onClick={() => (step === 3 ? proceedToPricingSetup() : proceedToReviewItems())} className="ui-btn-primary h-9 px-4">
                  {step === 3 ? 'Continue to estimate setup' : 'Continue to review'}
                </button>
              </div>
            </div>
          )}

          {step === 5 && (
            <>
          {parserReviewSummary && parserReviewDisplayConfidence ? (
            <div
              className={`rounded-xl border p-4 shadow-sm ${
                parserReviewSummary.recommendedAction === 'manual-template'
                  ? 'border-red-200 bg-red-50/80'
                  : parserReviewSummary.validationErrors.length === 0 && parserReviewDisplayConfidence.overall >= 0.82
                    ? 'border-blue-200/70 bg-[var(--brand-soft)]/70'
                    : parserReviewSummary.recommendedAction === 'auto-import'
                      ? 'border-blue-200/70 bg-[var(--brand-soft)]/70'
                      : 'border-slate-200 bg-slate-50/90'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-600">Parser review</p>
                  <h3 className="mt-0.5 text-base font-semibold text-slate-950">
                    {formatRecommendedAction(parserReviewSummary.recommendedAction)}
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-700">
                    <span className="font-medium text-slate-800">{formatParserStrategy(parserReviewSummary.parserStrategy)}</span>
                    <span className="text-slate-400"> · </span>
                    <span className="uppercase">{parserReviewSummary.fileType || 'unknown'}</span>
                    <span className="text-slate-400"> · </span>
                    <span className="font-semibold text-slate-900">{formatConfidencePercent(parserReviewDisplayConfidence.overall)}</span>
                    {parserReviewDisplayConfidence.adjustedFromReview ? (
                      <span className="ml-1 font-normal text-[var(--brand-strong)]">after catalog picks</span>
                    ) : null}
                    <span className="text-slate-400"> · </span>
                    Qty <span className="font-medium">{formatNumberSafe(parsedQuantityTotal)}</span>
                    <span className="text-slate-400"> · </span>
                    <span className={parserReviewSummary.validationErrors.length ? 'font-medium text-red-700' : ''}>
                      {parserReviewSummary.validationErrors.length} err
                    </span>
                    <span className="text-slate-400"> · </span>
                    {parserReviewSummary.validationWarnings.length +
                      parserReviewSummary.parseWarnings.length +
                      intakeWarnings.length}{' '}
                    warn
                  </p>
                  <p
                    className="mt-0.5 truncate text-[11px] text-slate-500"
                    title={[
                      parserReviewSummary.sourceSummary?.fileName || takeoffFileName || uploadedFileName || 'Current upload',
                      parserReviewSummary.sourceSummary?.sheetsProcessed?.length
                        ? `Sheets: ${parserReviewSummary.sourceSummary.sheetsProcessed.join(', ')}`
                        : '',
                      parserReviewSummary.sourceSummary?.pagesProcessed?.length
                        ? `Pages: ${parserReviewSummary.sourceSummary.pagesProcessed.join(', ')}`
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  >
                    {parserReviewSummary.sourceSummary?.fileName || takeoffFileName || uploadedFileName || 'Current upload'}
                    {parserReviewSummary.sourceSummary?.sheetsProcessed?.length
                      ? ` · Sheets: ${parserReviewSummary.sourceSummary.sheetsProcessed.join(', ')}`
                      : ''}
                    {parserReviewSummary.sourceSummary?.pagesProcessed?.length
                      ? ` · Pages: ${parserReviewSummary.sourceSummary.pagesProcessed.join(', ')}`
                      : ''}
                  </p>
                </div>
                {parserReviewSummary.recommendedAction === 'manual-template' ? (
                  <button
                    type="button"
                    onClick={applyManualTemplateFallback}
                    className="inline-flex h-9 shrink-0 items-center rounded-full bg-red-600 px-3 text-[11px] font-semibold text-white outline-none hover:bg-red-700 focus-visible:ring-2 focus-visible:ring-red-400/50"
                  >
                    Use Manual Template
                  </button>
                ) : null}
              </div>

              {parserReviewSummary.aiSuggestions ? (
                <details className="group mt-3 rounded-lg border border-indigo-200/70 bg-indigo-50/40 open:bg-white/90">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-left [&::-webkit-details-marker]:hidden">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-indigo-800">AI decision hints</p>
                      <p className="text-[11px] text-indigo-950/90">
                        Document type, pricing role, and project hints from the model — <span className="font-medium">review only</span>; nothing here is auto-applied to
                        catalog or job conditions yet.
                      </p>
                    </div>
                    <ChevronDown className="h-4 w-4 shrink-0 text-indigo-600 transition group-open:rotate-180" aria-hidden />
                  </summary>
                  <div className="space-y-3 border-t border-indigo-100/80 px-3 pb-3 pt-2 text-xs text-slate-800">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Document type</p>
                        <p className="mt-0.5 font-medium capitalize text-slate-900">
                          {parserReviewSummary.aiSuggestions.documentType.replace(/_/g, ' ') || '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Suggested pricing mode</p>
                        <p className="mt-0.5 font-medium text-slate-900">
                          {parserReviewSummary.aiSuggestions.pricingModeSuggested
                            ? parserReviewSummary.aiSuggestions.pricingModeSuggested.replace(/_/g, ' ')
                            : '—'}
                        </p>
                      </div>
                      {parserReviewSummary.aiSuggestions.documentConfidence > 0 ? (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Document confidence</p>
                          <p className="mt-0.5 font-medium tabular-nums text-slate-900">
                            {formatConfidencePercent(parserReviewSummary.aiSuggestions.documentConfidence)}
                          </p>
                        </div>
                      ) : null}
                    </div>
                    {parserReviewSummary.aiSuggestions.documentRationale ? (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Why (document)</p>
                        <p className="mt-0.5 leading-snug text-slate-800">{parserReviewSummary.aiSuggestions.documentRationale}</p>
                      </div>
                    ) : null}
                    {parserReviewSummary.aiSuggestions.documentEvidence ? (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Evidence</p>
                        <p className="mt-0.5 max-h-24 overflow-y-auto rounded border border-slate-100 bg-slate-50/90 p-2 font-mono text-[11px] leading-snug text-slate-700">
                          {parserReviewSummary.aiSuggestions.documentEvidence}
                        </p>
                      </div>
                    ) : null}
                    {parserReviewSummary.aiSuggestions.suggestedProjectModifierHints.length > 0 ? (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Suggested project-level conditions (phrases)</p>
                        <ul className="mt-1 space-y-2">
                          {parserReviewSummary.aiSuggestions.suggestedProjectModifierHints.map((hint, idx) => (
                            <li key={`${hint.phrase}-${idx}`} className="rounded-md border border-slate-200/80 bg-white p-2">
                              <p className="font-semibold text-slate-900">{hint.phrase}</p>
                              {hint.rationale ? <p className="mt-0.5 text-[11px] text-slate-600">{hint.rationale}</p> : null}
                              {hint.evidenceText ? (
                                <p className="mt-1 text-[10px] text-slate-500">&ldquo;{hint.evidenceText}&rdquo;</p>
                              ) : null}
                              <p className="mt-1 text-[10px] text-slate-400">Confidence {formatConfidencePercent(hint.confidence)}</p>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {parserReviewSummary.aiSuggestions.requiresGrounding.length > 0 ? (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-800">Flagged for external grounding</p>
                        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-amber-950/90">
                          {parserReviewSummary.aiSuggestions.requiresGrounding.map((r) => (
                            <li key={r}>{r}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {parserReviewSummary.aiSuggestions.lineClassifications.length > 0 ? (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          Line ontology ({parserReviewSummary.aiSuggestions.lineClassifications.length} rows)
                        </p>
                        <div className="mt-1 max-h-48 overflow-y-auto rounded border border-slate-200/80 bg-white">
                          <table className="w-full text-left text-[11px]">
                            <thead className="sticky top-0 bg-slate-100/95 text-[10px] uppercase tracking-wide text-slate-600">
                              <tr>
                                <th className="px-2 py-1.5">#</th>
                                <th className="px-2 py-1.5">Preview</th>
                                <th className="px-2 py-1.5">Kind</th>
                                <th className="px-2 py-1.5">Pricing role</th>
                                <th className="px-2 py-1.5">Conf.</th>
                              </tr>
                            </thead>
                            <tbody>
                              {parserReviewSummary.aiSuggestions.lineClassifications.map((row) => (
                                <tr key={row.lineIndex} className="border-t border-slate-100 align-top">
                                  <td className="px-2 py-1.5 tabular-nums text-slate-500">{row.lineIndex + 1}</td>
                                  <td className="px-2 py-1.5 text-slate-800">{row.descriptionPreview}</td>
                                  <td className="px-2 py-1.5 capitalize text-slate-700">{row.documentLineKind.replace(/_/g, ' ') || '—'}</td>
                                  <td className="px-2 py-1.5 capitalize text-slate-700">{row.pricingRole.replace(/_/g, ' ') || '—'}</td>
                                  <td className="px-2 py-1.5 tabular-nums text-slate-600">{formatConfidencePercent(row.lineConfidence)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <p className="mt-1 text-[10px] text-slate-500">Expand rows in a future pass to show rationale and evidence per line.</p>
                      </div>
                    ) : null}
                  </div>
                </details>
              ) : null}

              {parserReviewSummary.validationErrors.length > 0 ? (
                <ul className="mt-3 space-y-1 border-t border-slate-200/60 pt-3 text-xs text-red-700">
                  {parserReviewSummary.validationErrors.map((entry) => (
                    <li key={entry}>• {entry}</li>
                  ))}
                </ul>
              ) : null}

              {groupedWarningSummaries.length > 0 ? (
                <div className="mt-3 border-t border-slate-200/60 pt-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-slate-500">
                    Warnings · {groupedWarningSummaries.length} group{groupedWarningSummaries.length === 1 ? '' : 's'}
                  </p>
                  <div className="mt-2 space-y-2">
                    {groupedWarningSummaries.map((group) => {
                      const toneClass =
                        group.tone === 'danger'
                          ? 'border-red-200 bg-red-50/60 text-red-900'
                          : group.tone === 'warning'
                            ? 'border border-[rgba(234,179,8,0.35)] bg-[var(--warn-soft)] text-[var(--warn)]'
                            : 'border-slate-200 bg-slate-50/80 text-slate-800';
                      const toneLabel = group.tone === 'danger' ? 'Error' : group.tone === 'warning' ? 'Warning' : 'Info';
                      return (
                        <div key={group.key} className={`rounded-lg border px-3 py-2 ${toneClass}`}>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-semibold">{group.label}</p>
                            <span className="shrink-0 rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                              {toneLabel} · {group.count}×
                            </span>
                          </div>
                          <ul className="mt-1.5 space-y-0.5 text-[11px] opacity-90">
                            {group.examples.map((example) => (
                              <li key={example}>• {example}</li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : parserReviewSummary.validationWarnings.length +
                  parserReviewSummary.parseWarnings.length +
                  intakeWarnings.length >
                0 ? (
                <ul className="mt-3 space-y-1 border-t border-slate-200/60 pt-3 text-xs text-slate-700">
                  {[...parserReviewSummary.validationWarnings, ...parserReviewSummary.parseWarnings, ...intakeWarnings].map((entry) => (
                    <li key={entry}>• {entry}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          {lastIntakeParse?.estimateDraft ? (
            <div className="mx-auto w-full max-w-[1600px]">
              <IntakeEstimateReviewPanel
                draft={lastIntakeParse.estimateDraft}
                reviewLines={lastIntakeParse.reviewLines}
                catalog={catalog}
                aiSuggestions={lastIntakeParse.aiSuggestions ?? null}
                modifiers={intakeModifiers}
                lineByFingerprint={estimateReviewLines}
                onAcceptLine={handleAcceptEstimateLine}
                onReplaceLineWithCatalogId={handleReplaceEstimateLineWithCatalogId}
                onIgnoreLine={handleIgnoreEstimateLine}
                onBulkAcceptHighConfidence={bulkAcceptHighConfidenceEstimateRows}
                onBulkAcceptTierAStrongB={bulkAcceptTierAStrongBEstimateRows}
                onBulkIgnoreLowConfidence={bulkIgnoreLowConfidenceEstimateRows}
                onBulkAcceptAllSuggestedProjectModifiers={bulkAcceptAllSuggestedProjectModifiers}
                onOpenCatalogPicker={(fingerprint) => setCatalogPickerTarget({ kind: 'fingerprint', fingerprint })}
                jobConditionById={estimateReviewJobConditions}
                onSetJobConditionStatus={setJobConditionReviewStatus}
                onApplyAllSuggestedJobConditions={applyAllSuggestedJobConditionsToDraft}
                projectModifierById={estimateReviewProjectMods}
                onSetProjectModifierStatus={(modifierId, status) =>
                  setEstimateReviewProjectMods((prev) => ({ ...prev, [modifierId]: status }))
                }
                pricingModeDraft={String(projectDraft.pricingMode || '')}
                onApplySuggestedPricingMode={applySuggestedPricingModeFromAi}
                div10ProposalClauseHints={lastIntakeParse.div10ProposalClauseHints ?? null}
              />
            </div>
          ) : null}
          <div className="mx-auto grid w-full max-w-[1600px] grid-cols-1 gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
            <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">Step 5</p>
              <h3 className="mt-1 text-sm font-semibold text-slate-900">Rooms / areas</h3>
              <div className="mt-3 space-y-2 max-h-[55vh] overflow-y-auto pr-1">
                {roomSuggestions.map((room) => (
                  <div key={room.id} className="flex items-center gap-2">
                    <input type="checkbox" checked={room.include} onChange={(e) => setRoomSuggestions((prev) => prev.map((item) => item.id === room.id ? { ...item, include: e.target.checked } : item))} />
                    <input className="ui-input h-8 flex-1" value={room.roomName} onChange={(e) => setRoomSuggestions((prev) => prev.map((item) => item.id === room.id ? { ...item, roomName: e.target.value } : item))} />
                  </div>
                ))}
                {roomSuggestions.length === 0 && <p className="text-xs text-slate-500">No rooms were detected. A General room will be created.</p>}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Matched items</h3>
                <p className="text-xs text-slate-500 mb-3">These items were auto-linked to your catalog first. Suggested matches are prefilled but labeled for quick review.</p>
                <div className="space-y-2 max-h-[36vh] overflow-y-auto pr-1">
                  {matchedSuggestions.map((line) => (
                    <div key={line.id} className="rounded-md border border-blue-200/50 bg-[var(--brand-soft)]/35 p-2">
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
                              <CatalogCategorySelect
                                value={line.category}
                                options={scopeCategoryOptions}
                                onChange={(v) => patchLineSuggestion(line.id, { category: v })}
                              />
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
                              <input
                                type="number"
                                className="ui-input mt-1 h-8"
                                value={numericInputValue(line.qty)}
                                onChange={(e) => patchLineSuggestion(line.id, { qty: parseNumericInput(e.target.value) })}
                                onBlur={() =>
                                  setLineSuggestions((prev) =>
                                    prev.map((entry) => (entry.id === line.id ? { ...entry, qty: entry.qty ?? 0 } : entry))
                                  )
                                }
                              />
                            </label>
                            <label className="text-[11px] text-slate-600">Unit
                              <input className="ui-input mt-1 h-8" value={line.unit} onChange={(e) => patchLineSuggestion(line.id, { unit: e.target.value })} />
                            </label>
                            <label className="text-[11px] text-slate-600 md:col-span-2">Notes
                              <input className="ui-input mt-1 h-8" value={line.notes || ''} onChange={(e) => patchLineSuggestion(line.id, { notes: e.target.value })} />
                            </label>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-[11px]">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${line.matchConfidence === 'possible' ? 'ui-status-warn' : 'ui-status-ok'}`}
                            >
                              {line.matchConfidence === 'possible' ? 'Suggested Match' : 'Matched'}
                            </span>
                            {line.matchReason ? <span className="text-slate-500">{line.matchReason}</span> : null}
                            {line.catalogAttributeSnapshot && line.catalogAttributeSnapshot.length > 0 ? (
                              <span className="text-slate-500">
                                Inferred options: {line.catalogAttributeSnapshot.map((a) => `${a.attributeType}:${a.attributeValue}`).join(', ')}
                              </span>
                            ) : null}
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
                    <div key={line.id} className="rounded-md border border-slate-200 bg-slate-50/90 p-2.5">
                      <div className="text-xs text-slate-700 mb-2 space-y-2">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          <label className="text-[11px] text-slate-600">Room / Area
                            <input className="ui-input mt-1 h-8" value={line.roomName || ''} onChange={(e) => patchLineSuggestion(line.id, { roomName: e.target.value })} />
                          </label>
                          <label className="text-[11px] text-slate-600">Category
                            <CatalogCategorySelect
                              value={line.category}
                              options={scopeCategoryOptions}
                              onChange={(v) => patchLineSuggestion(line.id, { category: v })}
                            />
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
                            <input
                              type="number"
                              className="ui-input mt-1 h-8"
                              value={numericInputValue(line.qty)}
                              onChange={(e) => patchLineSuggestion(line.id, { qty: parseNumericInput(e.target.value) })}
                              onBlur={() =>
                                setLineSuggestions((prev) =>
                                  prev.map((entry) => (entry.id === line.id ? { ...entry, qty: entry.qty ?? 0 } : entry))
                                )
                              }
                            />
                          </label>
                          <label className="text-[11px] text-slate-600">Unit
                            <input className="ui-input mt-1 h-8" value={line.unit} onChange={(e) => patchLineSuggestion(line.id, { unit: e.target.value })} />
                          </label>
                          <label className="text-[11px] text-slate-600 md:col-span-2">Notes
                            <input className="ui-input mt-1 h-8" value={line.notes || ''} onChange={(e) => patchLineSuggestion(line.id, { notes: e.target.value })} />
                          </label>
                        </div>
                        {!line.include && <p className="font-semibold text-[var(--warn)]">Ignored</p>}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] text-slate-500 mr-auto">Source {line.sourceReference || 'unknown'}</span>
                        <button
                          type="button"
                          onClick={() => setCatalogPickerTarget({ kind: 'line', lineId: line.id })}
                          className="ui-btn-secondary h-7 px-2 text-xs"
                        >
                          Match
                        </button>
                        <button
                          type="button"
                          onClick={() => openNewCatalogFromLine(line.id)}
                          className="ui-btn-secondary h-7 px-2 text-xs"
                        >
                          Add to Catalog
                        </button>
                        {line.include ? (
                          <button
                            type="button"
                            onClick={() => ignoreLine(line.id)}
                            className="h-7 px-2 rounded border border-red-200 text-red-700 bg-white text-xs hover:bg-red-50"
                          >
                            Ignore
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => reincludeLine(line.id)}
                            className="h-7 rounded border border-blue-200 bg-white px-2 text-xs text-[var(--brand-strong)] hover:bg-[var(--brand-soft)]"
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

          <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-3 rounded-2xl border border-slate-200/70 bg-white p-4 shadow-md sticky bottom-3 z-10">
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
              <button type="button" onClick={() => setStep(4)} className="ui-btn-secondary">Back</button>
              <button type="button" onClick={() => void handleCreateProject()} disabled={creating} className="ui-btn-primary h-9 px-4 disabled:opacity-50 inline-flex items-center gap-2">
                <Save className="w-4 h-4" />
                {creating ? 'Creating...' : 'Create Project'}
              </button>
            </div>
          </div>
            </>
          )}
        </section>
      )}

      {catalogPickerTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 p-6 flex items-center justify-center">
          <div className="bg-white w-full max-w-4xl rounded-lg border border-slate-200 overflow-hidden">
            <div className="h-11 px-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">
                {catalogPickerTarget.kind === 'fingerprint' ? 'Match item (estimate review)' : 'Match Item'}
              </h3>
              <button type="button" onClick={() => setCatalogPickerTarget(null)} className="h-7 px-2 rounded border border-slate-300 text-xs hover:bg-slate-50">Close</button>
            </div>
            <div className="p-3 border-b border-slate-200">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  placeholder="Search SKU, description, category, family, manufacturer, model, tags…"
                  className="w-full h-9 pl-10 pr-2 rounded border border-slate-300 text-sm"
                />
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                Showing {filteredCatalog.length} of {catalog.length} catalog {catalog.length === 1 ? 'item' : 'items'}
                {catalogSearch.trim() ? ' (filtered)' : ''}.
              </p>
            </div>
            <div className="p-3 max-h-[60vh] overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-2">
              {filteredCatalog.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => applyCatalogPickerSelection(item)}
                  className="text-left rounded border border-slate-200 p-2 outline-none hover:border-blue-400 hover:bg-blue-50/50 focus-visible:ring-2 focus-visible:ring-blue-400/40"
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
              <button type="button" onClick={() => { setNewCatalogLineId(null); setNewCatalogDraft(null); }} className="h-7 px-2 rounded border border-slate-300 text-xs hover:bg-slate-50">Close</button>
            </div>
            {newCatalogPeerSuggestion ? (
              <div className="border-b border-blue-100 bg-blue-50/90 px-4 py-3 text-xs text-slate-700">
                <p className="leading-relaxed">
                  <span className="font-semibold text-slate-900">Catalog hint:</span>{' '}
                  Other items matching &ldquo;{newCatalogPeerSuggestion.keywordsLabel}&rdquo; in this category —{' '}
                  {newCatalogPeerSuggestion.peerCount === 1 ? '1 item' : `${newCatalogPeerSuggestion.peerCount} items`}
                  {newCatalogPeerSuggestion.narrowedByUom ? ` (same unit: ${newCatalogDraft.unit})` : ''} average{' '}
                  <span className="font-medium tabular-nums">{formatCurrencySafe(newCatalogPeerSuggestion.avgMaterialCost)}</span> material and{' '}
                  <span className="font-medium tabular-nums">{formatNumberSafe(newCatalogPeerSuggestion.avgLaborMinutes, 1)}</span> min labor.
                </p>
                <button
                  type="button"
                  className="mt-2 rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-blue-800 shadow-sm hover:bg-blue-50"
                  onClick={() =>
                    setNewCatalogDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            materialCost: newCatalogPeerSuggestion.avgMaterialCost,
                            laborMinutes: newCatalogPeerSuggestion.avgLaborMinutes,
                          }
                        : prev
                    )
                  }
                >
                  Use average material and labor
                </button>
              </div>
            ) : null}
            <div className="p-4 grid grid-cols-2 gap-2">
              <label className="text-xs text-slate-600 col-span-2">Description
                <input className="mt-1 h-8 w-full rounded border border-slate-300 px-2 text-sm" value={newCatalogDraft.description} onChange={(e) => setNewCatalogDraft({ ...newCatalogDraft, description: e.target.value })} />
              </label>
              <label className="text-xs text-slate-600">SKU
                <input className="mt-1 h-8 w-full rounded border border-slate-300 px-2 text-sm" value={newCatalogDraft.sku} onChange={(e) => setNewCatalogDraft({ ...newCatalogDraft, sku: e.target.value })} />
              </label>
              <label className="text-xs text-slate-600">Category
                <CatalogCategorySelect
                  className="mt-1 h-8 w-full rounded border border-slate-300 px-2 text-sm"
                  value={newCatalogDraft.category}
                  options={scopeCategoryOptions}
                  onChange={(v) => setNewCatalogDraft({ ...newCatalogDraft, category: v || '' })}
                />
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
                <input
                  type="number"
                  className="mt-1 h-8 w-full rounded border border-slate-300 px-2 text-sm"
                  value={numericInputValue(newCatalogDraft.materialCost)}
                  onChange={(e) => setNewCatalogDraft({ ...newCatalogDraft, materialCost: parseNumericInput(e.target.value) })}
                  onBlur={() =>
                    setNewCatalogDraft((d) => (d ? { ...d, materialCost: d.materialCost ?? 0 } : d))
                  }
                />
              </label>
              <label className="text-xs text-slate-600">Labor Minutes
                <input
                  type="number"
                  className="mt-1 h-8 w-full rounded border border-slate-300 px-2 text-sm"
                  value={numericInputValue(newCatalogDraft.laborMinutes)}
                  onChange={(e) => setNewCatalogDraft({ ...newCatalogDraft, laborMinutes: parseNumericInput(e.target.value) })}
                  onBlur={() =>
                    setNewCatalogDraft((d) => (d ? { ...d, laborMinutes: d.laborMinutes ?? 0 } : d))
                  }
                />
              </label>
            </div>
            <div className="p-3 border-t border-slate-200 flex justify-end gap-2">
              <button type="button" onClick={() => { setNewCatalogLineId(null); setNewCatalogDraft(null); }} className="h-8 px-3 rounded border border-slate-300 text-xs hover:bg-slate-50">Cancel</button>
              <button type="button" onClick={() => void createCatalogItemFromLine()} className="h-8 px-3 rounded bg-blue-700 text-white text-xs hover:bg-blue-800">Add & Match</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
