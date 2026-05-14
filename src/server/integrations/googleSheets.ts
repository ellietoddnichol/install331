import { google } from 'googleapis';
import type { sheets_v4 } from 'googleapis';
import { buildGoogleServiceAccountJwt } from '../services/googleSheetsCatalogSync.ts';

export const SHEETS_TABS = {
  PROJECTS: 'PROJECTS',
  SOURCE_QUOTES: 'SOURCE_QUOTES',
  SOURCE_QUOTE_LINES: 'SOURCE_QUOTE_LINES',
  ESTIMATE_LINES: 'ESTIMATE_LINES',
  PROPOSAL_SETTINGS: 'PROPOSAL_SETTINGS',
  CATALOG_CANDIDATES: 'CATALOG_CANDIDATES',
  CATALOG_ITEMS: 'CATALOG_ITEMS',
  CATALOG_VENDOR_PRICES: 'CATALOG_VENDOR_PRICES',
  CATALOG_ALIASES: 'CATALOG_ALIASES',
  CATALOG_ATTRIBUTES: 'CATALOG_ATTRIBUTES',
  MODIFIERS: 'MODIFIERS',
  BUNDLES: 'BUNDLES',
  BUNDLE_ITEMS: 'BUNDLE_ITEMS',
  APP_SETTINGS: 'APP_SETTINGS',
  TAX_JURISDICTIONS: 'TAX_JURISDICTIONS',
  README: 'README',
} as const;

export type SheetsTabName = (typeof SHEETS_TABS)[keyof typeof SHEETS_TABS];

export type SheetsRow = Record<string, string | number | boolean | null | undefined>;

const SHEETS_SCOPE = ['https://www.googleapis.com/auth/spreadsheets'];

function toA1Column(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function normalizeCell(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value).trim();
}

function normalizeRowForWrite(row: SheetsRow, headers: string[]): string[] {
  return headers.map((header) => normalizeCell(row[header]));
}

export function getSheetsSpreadsheetId(): string {
  const spreadsheetId = String(
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID || process.env.GOOGLE_SHEETS_ID || ''
  ).trim();
  if (!spreadsheetId) {
    throw new Error('Missing Google Sheets spreadsheet id. Set GOOGLE_SHEETS_SPREADSHEET_ID.');
  }
  return spreadsheetId;
}

function resolveSpreadsheetId(spreadsheetId?: string): string {
  const id = String(spreadsheetId || '').trim();
  return id || getSheetsSpreadsheetId();
}

export function getSheetClient(): sheets_v4.Sheets {
  const auth = buildGoogleServiceAccountJwt([...SHEETS_SCOPE]);
  return google.sheets({ version: 'v4', auth });
}

export function getSheetsClient(): sheets_v4.Sheets {
  return getSheetClient();
}

export function isGoogleSheetsConfigured(): boolean {
  const spreadsheetId = String(
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID || process.env.GOOGLE_SHEETS_ID || ''
  ).trim();
  if (!spreadsheetId) return false;

  const hasInlineJson = Boolean(String(process.env.GOOGLE_SERVICE_ACCOUNT || '').trim());
  const hasInlineB64 = Boolean(String(process.env.GOOGLE_SERVICE_ACCOUNT_BASE64 || '').trim());
  const hasFile = Boolean(
    String(process.env.GOOGLE_SERVICE_ACCOUNT_FILE || process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim()
  );
  const hasSplit = Boolean(
    String(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_CLIENT_EMAIL || '').trim() &&
    String(process.env.GOOGLE_PRIVATE_KEY || '').trim()
  );

  return hasInlineJson || hasInlineB64 || hasFile || hasSplit;
}

async function readRawMatrix(tabName: string, spreadsheetId?: string): Promise<string[][]> {
  const sheets = getSheetClient();
  const resolvedSpreadsheetId = resolveSpreadsheetId(spreadsheetId);
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: resolvedSpreadsheetId,
    range: `${tabName}!A:ZZ`,
  });
  const values = response.data.values || [];
  return values.map((row) => row.map((cell) => normalizeCell(cell)));
}

async function getHeaders(tabName: string, spreadsheetId?: string): Promise<string[]> {
  const values = await readRawMatrix(tabName, spreadsheetId);
  const headerRow = values[0] || [];
  return headerRow.filter((header) => header.length > 0);
}

async function setHeaders(tabName: string, headers: string[], spreadsheetId?: string): Promise<void> {
  const sheets = getSheetClient();
  const resolvedSpreadsheetId = resolveSpreadsheetId(spreadsheetId);
  if (headers.length === 0) return;
  const endCol = toA1Column(headers.length - 1);
  await sheets.spreadsheets.values.update({
    spreadsheetId: resolvedSpreadsheetId,
    range: `${tabName}!A1:${endCol}1`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [headers],
    },
  });
}

async function ensureHeaders(tabName: string, incomingRows: SheetsRow[], spreadsheetId?: string): Promise<string[]> {
  const existing = await getHeaders(tabName, spreadsheetId);
  const keys = new Set(existing);
  incomingRows.forEach((row) => {
    Object.keys(row).forEach((key) => {
      if (key.trim()) keys.add(key.trim());
    });
  });

  const merged = [...existing, ...[...keys].filter((key) => !existing.includes(key))];
  if (existing.length === 0 && merged.length > 0) {
    await setHeaders(tabName, merged, spreadsheetId);
  } else if (merged.length !== existing.length) {
    await setHeaders(tabName, merged, spreadsheetId);
  }

  return merged;
}

export async function readRows(tabName: string, spreadsheetId?: string): Promise<Array<Record<string, string>>> {
  const values = await readRawMatrix(tabName, spreadsheetId);
  const headers = (values[0] || []).map((header) => header.trim());
  if (headers.length === 0) return [];

  return (values.slice(1) || [])
    .filter((row) => row.some((cell) => String(cell || '').trim().length > 0))
    .map((row) => {
      const out: Record<string, string> = {};
      headers.forEach((header, index) => {
        out[header] = normalizeCell(row[index]);
      });
      return out;
    });
}

export async function appendRows(tabName: string, rows: SheetsRow[], spreadsheetId?: string): Promise<number> {
  if (rows.length === 0) return 0;
  const headers = await ensureHeaders(tabName, rows, spreadsheetId);
  if (headers.length === 0) return 0;

  const values = rows.map((row) => normalizeRowForWrite(row, headers));
  const sheets = getSheetClient();
  const resolvedSpreadsheetId = resolveSpreadsheetId(spreadsheetId);

  await sheets.spreadsheets.values.append({
    spreadsheetId: resolvedSpreadsheetId,
    range: `${tabName}!A:ZZ`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values,
    },
  });

  return rows.length;
}

export async function updateRowById(
  tabName: string,
  idColumn: string,
  idValue: string,
  patch: SheetsRow,
  spreadsheetId?: string
): Promise<boolean> {
  const matrix = await readRawMatrix(tabName, spreadsheetId);
  const headers = (matrix[0] || []).map((h) => h.trim()).filter(Boolean);
  if (headers.length === 0) return false;

  const idIndex = headers.findIndex((header) => header === idColumn);
  if (idIndex < 0) return false;

  const bodyRows = matrix.slice(1);
  const rowIndex = bodyRows.findIndex((row) => normalizeCell(row[idIndex]) === idValue);
  if (rowIndex < 0) return false;

  const currentRow = bodyRows[rowIndex] || [];
  const merged: SheetsRow = {};
  headers.forEach((header, index) => {
    merged[header] = normalizeCell(currentRow[index]);
  });
  Object.keys(patch).forEach((key) => {
    merged[key] = patch[key];
  });

  const targetRowNumber = rowIndex + 2;
  const endCol = toA1Column(headers.length - 1);
  const values = [normalizeRowForWrite(merged, headers)];

  const sheets = getSheetClient();
  const resolvedSpreadsheetId = resolveSpreadsheetId(spreadsheetId);
  await sheets.spreadsheets.values.update({
    spreadsheetId: resolvedSpreadsheetId,
    range: `${tabName}!A${targetRowNumber}:${endCol}${targetRowNumber}`,
    valueInputOption: 'RAW',
    requestBody: {
      values,
    },
  });

  return true;
}

export async function upsertRowById(
  tabName: string,
  idColumn: string,
  row: SheetsRow,
  spreadsheetId?: string
): Promise<'inserted' | 'updated'> {
  const idValue = normalizeCell(row[idColumn]);
  if (!idValue) {
    throw new Error(`upsertRowById requires a non-empty ${idColumn} value.`);
  }

  const headers = await ensureHeaders(tabName, [row], spreadsheetId);
  const matrix = await readRawMatrix(tabName, spreadsheetId);
  const bodyRows = matrix.slice(1);
  const idIndex = headers.findIndex((header) => header === idColumn);
  if (idIndex < 0) {
    throw new Error(`Missing id column ${idColumn} on tab ${tabName}.`);
  }

  const rowIndex = bodyRows.findIndex((cells) => normalizeCell(cells[idIndex]) === idValue);
  if (rowIndex >= 0) {
    const targetRowNumber = rowIndex + 2;
    const endCol = toA1Column(headers.length - 1);
    const current = bodyRows[rowIndex] || [];
    const merged: SheetsRow = {};
    headers.forEach((header, idx) => {
      merged[header] = normalizeCell(current[idx]);
    });
    Object.keys(row).forEach((key) => {
      merged[key] = row[key];
    });

    const sheets = getSheetClient();
    const resolvedSpreadsheetId = resolveSpreadsheetId(spreadsheetId);
    await sheets.spreadsheets.values.update({
      spreadsheetId: resolvedSpreadsheetId,
      range: `${tabName}!A${targetRowNumber}:${endCol}${targetRowNumber}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [normalizeRowForWrite(merged, headers)],
      },
    });
    return 'updated';
  }

  await appendRows(tabName, [row], spreadsheetId);
  return 'inserted';
}

export async function bulkUpsertRows(
  tabName: string,
  idColumn: string,
  rows: SheetsRow[],
  spreadsheetId?: string
): Promise<{ inserted: number; updated: number }> {
  let inserted = 0;
  let updated = 0;

  for (const row of rows) {
    const result = await upsertRowById(tabName, idColumn, row, spreadsheetId);
    if (result === 'inserted') inserted += 1;
    if (result === 'updated') updated += 1;
  }

  return { inserted, updated };
}
