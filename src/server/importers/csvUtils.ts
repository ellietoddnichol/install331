import { parse as parseCsv } from 'csv-parse/sync';
import fs from 'fs';

export function readCsvRecords(filePath: string): Record<string, string>[] {
  const raw = fs.readFileSync(filePath, 'utf8');
  const rows = parseCsv(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as Record<string, string>[];
  return rows;
}

export function requireColumns(row: Record<string, string>, cols: string[], rowIndex: number): void {
  for (const c of cols) {
    const v = row[c];
    if (v === undefined || String(v).trim() === '') {
      throw new Error(`Row ${rowIndex + 2}: missing required column "${c}"`);
    }
  }
}

export function splitPipeList(s: string | undefined): string[] {
  if (!s || !String(s).trim()) return [];
  return String(s)
    .split('|')
    .map((x) => x.trim())
    .filter(Boolean);
}

export function parseBool(s: string | undefined, defaultVal = true): boolean {
  if (s === undefined || s === '') return defaultVal;
  const t = String(s).trim().toLowerCase();
  if (['0', 'false', 'no', 'n'].includes(t)) return false;
  if (['1', 'true', 'yes', 'y'].includes(t)) return true;
  return defaultVal;
}
