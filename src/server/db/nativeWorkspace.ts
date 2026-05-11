import { isPgDriver } from './driver.ts';

/**
 * When `DB_DRIVER=pg`, the app can read/write either:
 * - Legacy install331 tables/views (`projects_v1`, bridge `takeoff_lines_v1`, …), or
 * - Native Supabase estimator tables (`projects`, `takeoff_rows`, RPC match/estimate pipeline).
 *
 * Native mode is the default on Postgres so the live Supabase schema is the contract.
 * Set `WORKSPACE_USE_LEGACY_V1=1` to keep querying `*_v1` / bridge views instead.
 */
export function useNativeSupabaseWorkspace(): boolean {
  if (!isPgDriver()) return false;
  const legacy = String(process.env.WORKSPACE_USE_LEGACY_V1 || '').trim().toLowerCase();
  return legacy !== '1' && legacy !== 'true' && legacy !== 'yes';
}
