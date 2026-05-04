import { isPgDriver } from './driver.ts';

export type ResolvedCatalogBackendMode = 'auto' | 'local' | 'supabase';

/**
 * Operator-facing catalog persistence selection (orthogonal to where Google Sheets sync pulls from).
 *
 * - **auto** (default): Postgres catalog surfaces only when `DB_DRIVER=pg`; otherwise local SQLite tables.
 * - **sheet** / **local** / **sqlite**: Workbook-first catalog in local SQLite (`catalog_items`, …); incompatible with `DB_DRIVER=pg`.
 * - **supabase** / **pg**: Postgres-backed catalog reads/writes when `DB_DRIVER=pg`; incompatible with SQLite-only driver.
 */
export function resolveCatalogBackendSetting(): ResolvedCatalogBackendMode {
  const raw = String(process.env.CATALOG_BACKEND || '').trim().toLowerCase();
  if (raw === 'sheet' || raw === 'local' || raw === 'sqlite') return 'local';
  if (raw === 'supabase' || raw === 'pg') return 'supabase';
  return 'auto';
}

/** True when catalog reads/writes should use Postgres (`pg` pool), including sheet sync transactions. */
export function isPgCatalogBackend(): boolean {
  const mode = resolveCatalogBackendSetting();
  if (mode === 'local') return false;
  if (mode === 'supabase') return isPgDriver();
  return isPgDriver();
}

export function assertCatalogBackendMatchesDriver(): void {
  const mode = resolveCatalogBackendSetting();
  if (mode === 'local' && isPgDriver()) {
    throw new Error(
      'CATALOG_BACKEND=sheet|local|sqlite cannot be used with DB_DRIVER=pg. Use DB_DRIVER=sqlite for Google Sheet–first catalog, or remove CATALOG_BACKEND and use DB_DRIVER=pg + DATABASE_URL for Supabase Postgres catalog.'
    );
  }
  if (mode === 'supabase' && !isPgDriver()) {
    throw new Error(
      'CATALOG_BACKEND=supabase|pg requires DB_DRIVER=pg and DATABASE_URL for Postgres-backed catalog.'
    );
  }
}
