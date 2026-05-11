import { isPgDriver } from './driver.ts';

/**
 * Physical takeoff line table for Postgres (`DB_DRIVER=pg`).
 * Default: `takeoff_lines_v1` (baseline table or compatibility VIEW — see
 * `scripts/supabase-bridge-native-to-install331-views.sql`). Do **not** point
 * this at native `takeoff_rows`: column layout differs from install331 lines.
 */
const WORKSPACE_TAKEOFF_LINES_ALLOWED = new Set([
  'takeoff_lines_v1',
  'public.takeoff_lines_v1',
]);

export function getTakeoffLinesTableName(): string {
  if (!isPgDriver()) return 'takeoff_lines_v1';
  const raw = String(process.env.WORKSPACE_TAKEOFF_LINES_TABLE || '').trim();
  if (raw && WORKSPACE_TAKEOFF_LINES_ALLOWED.has(raw)) return raw;
  return 'takeoff_lines_v1';
}
