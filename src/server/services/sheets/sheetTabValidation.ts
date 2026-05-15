import { fetchTabValues, findHeaderRowIndex, normalizeSheetHeaderLabel } from './headerGridIo.ts';

/** Clear, operator-facing Sheets configuration failure. */
export class Div10SheetsSetupError extends Error {
  readonly workbookLabel: string;

  constructor(workbookLabel: string, message: string) {
    super(message);
    this.name = 'Div10SheetsSetupError';
    this.workbookLabel = workbookLabel;
  }
}

/**
 * Verifies the tab exists (readable), row 1 is non-empty, and every required header label is present
 * (match is normalized — spaces/punctuation insensitive).
 */
export async function assertSheetTabAndHeaders(params: {
  spreadsheetId: string;
  tabName: string;
  requiredHeaders: string[];
  workbookLabel: string;
}): Promise<void> {
  const { spreadsheetId, tabName, requiredHeaders, workbookLabel } = params;
  let values: string[][];
  try {
    values = await fetchTabValues(spreadsheetId, tabName);
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Div10SheetsSetupError(
      workbookLabel,
      `Cannot read tab "${tabName}". Create this sheet in the workbook or fix GOOGLE_SHEETS_TAB_* / tab name. Underlying error: ${detail}`
    );
  }

  if (!values.length) {
    throw new Div10SheetsSetupError(
      workbookLabel,
      `Tab "${tabName}" returned no rows. Add the sheet and set row 1 to headers: ${requiredHeaders.join(', ')}`
    );
  }

  const headerRow = (values[findHeaderRowIndex(values)] || []).map((c) => String(c ?? '').trim());
  const nonEmpty = headerRow.filter(Boolean);
  if (!nonEmpty.length) {
    throw new Div10SheetsSetupError(
      workbookLabel,
      `Tab "${tabName}" row 1 is empty. Required headers: ${requiredHeaders.join(', ')}`
    );
  }

  const normalizedFound = new Set(nonEmpty.map((h) => normalizeSheetHeaderLabel(h)));
  const missing: string[] = [];
  for (const req of requiredHeaders) {
    const key = normalizeSheetHeaderLabel(req);
    if (!key) continue;
    if (!normalizedFound.has(key)) missing.push(req);
  }

  if (missing.length) {
    throw new Div10SheetsSetupError(
      workbookLabel,
      `Tab "${tabName}" is missing required header column(s): ${missing.join(', ')}. Found: ${nonEmpty.join(' | ')}`
    );
  }
}
