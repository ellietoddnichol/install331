import { google } from 'googleapis';
import type { sheets_v4 } from 'googleapis';
import { buildGoogleServiceAccountJwt } from '../googleSheetsCatalogSync.ts';

/** Normalize header for fuzzy column resolution (never use raw column index as the API contract). */
export function normalizeSheetHeaderLabel(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** `catalog_item_id` and `CatalogItemID` both become `catalogitemid`. */
export function compactSheetHeaderToken(s: string): string {
  return normalizeSheetHeaderLabel(s).replace(/\s+/g, '');
}

export function buildHeaderIndex(headerRow: string[]): Map<string, number> {
  const m = new Map<string, number>();
  headerRow.forEach((h, i) => {
    const k = normalizeSheetHeaderLabel(h);
    if (k && !m.has(k)) m.set(k, i);
  });
  return m;
}

/** Convert A1 column index (0-based) to column letters. */
export function columnIndexToA1Letter(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

export function escapeSheetTabForRange(tabName: string): string {
  const t = String(tabName || '').trim();
  if (!t) return "''";
  return `'${t.replace(/'/g, "''")}'`;
}

export function a1RangeBlock(tabName: string, row1: number, col0: number, row2: number, col1: number): string {
  const esc = escapeSheetTabForRange(tabName);
  const c0 = columnIndexToA1Letter(col0);
  const c1 = columnIndexToA1Letter(col1);
  return `${esc}!${c0}${row1}:${c1}${row2}`;
}

/**
 * Div 10 workbooks often use rows 1–3 for tab title + description; real headers start on row 4+.
 * Returns the 0-based index of the first row that looks like a header row.
 */
function headerRowCompactLabels(values: string[][], rowIndex: number): Set<string> {
  return new Set(
    (values[rowIndex] || [])
      .map((c) => compactSheetHeaderToken(String(c ?? '')))
      .filter(Boolean)
  );
}

export function findHeaderRowIndex(values: string[][]): number {
  const limit = Math.min(values.length, 25);
  for (let i = 0; i < limit; i++) {
    const labels = headerRowCompactLabels(values, i);
    if (labels.has('catalogitemid')) return i;
    if (labels.has('sku') && labels.has('category')) return i;
    if (labels.has('projectid')) return i;
    if (labels.has('sourcequoteid')) return i;
    if (labels.has('stagedquoterowid')) return i;
    if (labels.has('estimatelineid')) return i;
    if (labels.has('modifierid') && labels.has('name')) return i;
    if (labels.has('bundleid') && (labels.has('bundlename') || labels.has('name'))) return i;
    if (labels.has('key') && labels.has('value')) return i;
    if (labels.has('aliasid') && labels.has('aliasvalue')) return i;
    if (labels.has('familyid') && labels.has('familykey')) return i;
    if (labels.has('ruleid') && labels.has('pattern')) return i;
    if (labels.has('settingkey') && labels.has('settingvalue')) return i;
    if (labels.has('laborfamilykey') && labels.has('laborfamilyname')) return i;
    if (labels.has('ruleid') && labels.has('keywordpattern')) return i;
    if (labels.has('listname') && labels.has('optionvalue')) return i;
  }
  return 0;
}

export function gridToObjects(values: string[][]): { headers: string[]; rows: Record<string, string>[] } {
  if (!values.length) return { headers: [], rows: [] };
  const headerIndex = findHeaderRowIndex(values);
  const body = values.slice(headerIndex);
  if (!body.length) return { headers: [], rows: [] };
  const headers = body[0].map((c) => String(c ?? '').trim());
  const rows: Record<string, string>[] = [];
  for (let r = 1; r < body.length; r++) {
    const cells = body[r] || [];
    const o: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c];
      if (!key) continue;
      o[key] = String(cells[c] ?? '').trim();
    }
    rows.push(o);
  }
  return { headers, rows };
}

export function objectToRow(headers: string[], obj: Record<string, string | number | boolean | null | undefined>): string[] {
  return headers.map((h) => {
    const v = obj[h];
    if (v === undefined || v === null) return '';
    if (typeof v === 'boolean') return v ? '1' : '0';
    return String(v);
  });
}

let cachedSheets: sheets_v4.Sheets | null = null;

export async function getSheetsClient(): Promise<sheets_v4.Sheets> {
  if (cachedSheets) return cachedSheets;
  const auth = buildGoogleServiceAccountJwt();
  cachedSheets = google.sheets({ version: 'v4', auth });
  return cachedSheets;
}

export async function fetchTabValues(spreadsheetId: string, tabName: string): Promise<string[][]> {
  const sheets = await getSheetsClient();
  const range = `${escapeSheetTabForRange(tabName)}!A:ZZ`;
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  return (res.data.values as string[][]) || [];
}

export async function appendRowsToTab(spreadsheetId: string, tabName: string, rows: string[][]): Promise<void> {
  if (!rows.length) return;
  const sheets = await getSheetsClient();
  const range = `${escapeSheetTabForRange(tabName)}!A:A`;
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

export async function updateRange(spreadsheetId: string, a1Range: string, values: string[][]): Promise<void> {
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: a1Range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  });
}

/** If the tab is empty or row 1 has no headers, write the header row. */
export async function ensureHeaderRow(spreadsheetId: string, tabName: string, headers: string[]): Promise<void> {
  const existing = await fetchTabValues(spreadsheetId, tabName);
  const first = existing[0];
  const hasHeader = first && first.some((c) => String(c || '').trim() !== '');
  if (!hasHeader) {
    await updateRange(spreadsheetId, a1RangeBlock(tabName, 1, 0, 1, headers.length - 1), [headers]);
  }
}
