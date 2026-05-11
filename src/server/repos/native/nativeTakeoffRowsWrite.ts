/**
 * Writes to `public.takeoff_rows` when `useNativeSupabaseWorkspace()` is true.
 * install331 historically INSERTed into `takeoff_lines_v1`; on native Supabase that name is
 * usually a read-only VIEW, so rows must go to the physical `takeoff_rows` table instead.
 *
 * Column names vary by migration — we read `information_schema.columns` once per process
 * and map known logical fields to the first matching physical column.
 */
import { getPgPool } from '../../db/pgPool.ts';
import { dbAll } from '../../db/query.ts';
import type { TakeoffLineRecord } from '../../../shared/types/estimator.ts';

let cachedTakeoffRowColumns: string[] | null = null;

export async function getTakeoffRowsColumnNames(): Promise<string[]> {
  if (cachedTakeoffRowColumns) return cachedTakeoffRowColumns;
  const rows = await dbAll<{ column_name: string }>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'takeoff_rows'
     ORDER BY ordinal_position`
  );
  cachedTakeoffRowColumns = rows.map((r) => String(r.column_name || ''));
  return cachedTakeoffRowColumns;
}

function firstExisting(cols: string[], candidates: string[]): string | undefined {
  for (const cand of candidates) {
    const hit = cols.find((c) => c.toLowerCase() === cand.toLowerCase());
    if (hit) return hit;
  }
  return undefined;
}

/** Map install331-style line into native `takeoff_rows` columns present in this database. */
export async function insertTakeoffRowNativeFromLine(line: TakeoffLineRecord): Promise<void> {
  const cols = await getTakeoffRowsColumnNames();
  if (cols.length === 0) {
    throw new Error(
      '[takeoff] public.takeoff_rows not found (empty information_schema). Native workspace requires takeoff_rows + pricing view.'
    );
  }

  const assignments: Record<string, unknown> = {};
  const setVal = (candidates: string[], value: unknown) => {
    const col = firstExisting(cols, candidates);
    if (!col || value === undefined) return;
    assignments[col] = value;
  };

  setVal(['id'], line.id);
  setVal(['project_id'], line.projectId);
  setVal(['area_id', 'project_area_id', 'room_id'], line.roomId);
  setVal(['raw_description', 'description', 'line_description', 'parsed_description'], line.description);
  setVal(['normalized_description'], line.description);
  setVal(['qty', 'quantity'], line.qty);
  setVal(['takeoff_unit', 'unit', 'uom'], line.unit || 'EA');
  setVal(['sku', 'item_code'], line.sku);
  setVal(['category'], line.category);
  setVal(['subcategory'], line.subcategory);
  setVal(['catalog_item_id', 'resolved_catalog_item_id'], line.catalogItemId);
  setVal(['takeoff_notes', 'notes', 'line_notes'], line.notes);
  setVal(['scope_bucket', 'intake_scope_bucket'], line.intakeScopeBucket);
  setVal(['manufacturer', 'source_manufacturer'], line.sourceManufacturer);

  const idCol = firstExisting(cols, ['id']);
  const projCol = firstExisting(cols, ['project_id']);
  const descCol = firstExisting(cols, ['raw_description', 'description', 'line_description', 'parsed_description']);
  if (!idCol || !assignments[idCol] || !projCol || !assignments[projCol] || !descCol || assignments[descCol] == null) {
    throw new Error(
      `[takeoff] takeoff_rows insert: could not map id, project_id, and description. Columns: ${cols.join(', ')}`
    );
  }

  const insertCols = Object.keys(assignments);
  const placeholders = insertCols.map((_, i) => `$${i + 1}`);
  const params = insertCols.map((c) => assignments[c]);

  const pool = getPgPool();
  const sql = `INSERT INTO public.takeoff_rows (${insertCols.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders.join(', ')})`;
  await pool.query(sql, params as unknown[]);
}

export async function deleteTakeoffRowNative(lineId: string): Promise<boolean> {
  const pool = getPgPool();
  const r = await pool.query(`DELETE FROM public.takeoff_rows WHERE id::text = $1`, [lineId]);
  return (r.rowCount ?? 0) > 0;
}

export async function updateTakeoffRowAreaNative(lineId: string, areaId: string): Promise<void> {
  const cols = await getTakeoffRowsColumnNames();
  const areaCol = firstExisting(cols, ['area_id', 'project_area_id', 'room_id']);
  if (!areaCol) throw new Error('[takeoff] takeoff_rows has no area_id-like column for bulk move.');
  const pool = getPgPool();
  await pool.query(`UPDATE public.takeoff_rows SET "${areaCol}" = $1::uuid WHERE id::text = $2`, [areaId, lineId]);
}

export async function updateTakeoffRowNativePatch(lineId: string, patch: Partial<TakeoffLineRecord>): Promise<void> {
  const cols = await getTakeoffRowsColumnNames();
  const parts: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  const add = (candidates: string[], value: unknown) => {
    if (value === undefined) return;
    const col = firstExisting(cols, candidates);
    if (!col) return;
    parts.push(`"${col}" = $${i++}`);
    params.push(value);
  };

  add(['raw_description', 'description', 'line_description', 'parsed_description'], patch.description);
  add(['normalized_description'], patch.description);
  add(['qty', 'quantity'], patch.qty);
  add(['takeoff_unit', 'unit', 'uom'], patch.unit);
  add(['sku', 'item_code'], patch.sku);
  add(['category'], patch.category);
  add(['subcategory'], patch.subcategory);
  add(['catalog_item_id', 'resolved_catalog_item_id'], patch.catalogItemId);
  add(['takeoff_notes', 'notes', 'line_notes'], patch.notes);
  add(['area_id', 'project_area_id', 'room_id'], patch.roomId);

  if (parts.length === 0) return;
  params.push(lineId);
  const pool = getPgPool();
  await pool.query(`UPDATE public.takeoff_rows SET ${parts.join(', ')} WHERE id::text = $${i}`, params);
}
