import { compactSheetHeaderToken, normalizeSheetHeaderLabel } from './headerGridIo.ts';

/** Mask spreadsheet id for logs/API: only the last 6 characters are visible. */
export function maskSpreadsheetId(spreadsheetId: string): string {
  const s = String(spreadsheetId || '').trim();
  if (!s) return '(unset)';
  const tail = s.slice(-6);
  return `${'*'.repeat(8)}${tail}`;
}

export function findMissingTabs(expectedTabNames: string[], actualSheetTitles: string[]): string[] {
  const actual = new Set(actualSheetTitles);
  return expectedTabNames.filter((t) => !actual.has(t));
}

export function collectMissingHeadersFromFirstRow(
  headerRow: string[],
  requiredHeaders: readonly string[]
): string[] {
  const nonEmpty = headerRow.map((c) => String(c ?? '').trim()).filter(Boolean);
  if (!nonEmpty.length) return [...requiredHeaders];
  const normalizedFound = new Set<string>();
  for (const h of nonEmpty) {
    normalizedFound.add(normalizeSheetHeaderLabel(h));
    normalizedFound.add(compactSheetHeaderToken(h));
  }
  const missing: string[] = [];
  for (const req of requiredHeaders) {
    const key = normalizeSheetHeaderLabel(req);
    const compact = compactSheetHeaderToken(req);
    if (!key) continue;
    if (!normalizedFound.has(key) && !normalizedFound.has(compact)) missing.push(req);
  }
  return missing;
}
