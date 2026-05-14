export type DataBackendMode = 'db' | 'sheets';

export function getDataBackendMode(): DataBackendMode {
  const raw = String(process.env.DATA_BACKEND || '').trim().toLowerCase();
  return raw === 'sheets' ? 'sheets' : 'db';
}

export function isSheetsDataBackend(): boolean {
  return getDataBackendMode() === 'sheets';
}

export function getCatalogSpreadsheetId(): string {
  return String(
    process.env.GOOGLE_CATALOG_SPREADSHEET_ID || process.env.GOOGLE_SHEETS_SPREADSHEET_ID || process.env.GOOGLE_SHEETS_ID || ''
  ).trim();
}

export function getProjectsSpreadsheetId(): string {
  return String(process.env.GOOGLE_PROJECTS_SPREADSHEET_ID || '').trim();
}

export function getSettingsSpreadsheetId(): string {
  return String(process.env.GOOGLE_SETTINGS_SPREADSHEET_ID || '').trim();
}

export function assertSheetsWorkbookId(id: string, label: string): string {
  const value = String(id || '').trim();
  if (!value) {
    throw new Error(`Missing ${label}. Configure the spreadsheet id env var for Sheets mode.`);
  }
  return value;
}
