/**
 * Google Sheets → Postgres catalog workbook push is **opt-in**.
 * Supabase-first deployments leave this unset; the live catalog is edited in Postgres.
 */
export function isCatalogSheetsWorkbookPushEnabled(): boolean {
  const v = String(process.env.CATALOG_SHEETS_SYNC_ENABLED ?? '').trim().toLowerCase();
  if (!v || v === '0' || v === 'false' || v === 'off' || v === 'no') return false;
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}
