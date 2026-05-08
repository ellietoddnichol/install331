/**
 * Catalog auto-sync (Google Sheets → DB) is disabled.
 *
 * Background: Install331 reads the catalog directly from Supabase Postgres,
 * so there's no need to pull from a Google Sheet on every shell mount. Auto-firing
 * the sync was hammering `/v1/settings/sync-catalog` every page load, persisting a
 * `failed` row on `catalog_sync_status_v1` (when Google credentials aren't configured),
 * and surfacing a red "Sync error" banner on the Catalog page.
 *
 * Re-enable by restoring the `useEffect` + `api.syncV1Catalog()` call once Google
 * service-account credentials are wired up.
 */
export function CatalogAutoSync() {
  return null;
}
