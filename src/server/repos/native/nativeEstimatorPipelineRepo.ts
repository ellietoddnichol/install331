import { tryOptionalPgRelation } from '../../db/pgOptionalRelation.ts';
import { dbAll, dbGet } from '../../db/query.ts';
import * as rpc from './nativePgEstimatorRpc.ts';

export type JsonObject = Record<string, unknown>;

export async function listTakeoffUploadsForProject(projectId: string): Promise<JsonObject[]> {
  return dbAll(
    `SELECT
         tu.id::text AS id,
         tu.project_id::text AS project_id,
         COALESCE(tu.file_name, tu.filename, tu.original_file_name, tu.name, '') AS file_name,
         tu.status::text AS status,
         to_char(tu.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at
       FROM public.takeoff_uploads tu
       WHERE tu.project_id::text = ?
       ORDER BY tu.created_at DESC`,
    [projectId]
  );
}

export async function listEstimatesForProject(projectId: string): Promise<JsonObject[]> {
  return dbAll(
    `SELECT
         e.id::text AS id,
         e.project_id::text AS project_id,
         COALESCE(e.name::text, 'Estimate') AS name,
         e.estimate_class::text AS estimate_class,
         e.confidence_notes::text AS confidence_notes,
         to_char(e.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at
       FROM public.estimates e
       WHERE e.project_id::text = ?
       ORDER BY e.created_at DESC`,
    [projectId]
  );
}

/** `public.v_match_review_queue` — column set is DB-owned; treat rows as loose records. */
export async function listMatchReviewQueue(takeoffUploadId: string): Promise<JsonObject[]> {
  return tryOptionalPgRelation(
    'pipeline public.v_match_review_queue',
    async () => {
      const rows = await dbAll(`SELECT * FROM public.v_match_review_queue WHERE takeoff_upload_id::text = ?`, [
        takeoffUploadId,
      ]);
      const filtered = rows.filter((r) => String((r as { match_band?: string }).match_band || '').toLowerCase() !== 'auto_accept');
      return sortReviewQueueRows(filtered);
    },
    []
  );
}

export async function listBestMatchActions(takeoffUploadId: string): Promise<JsonObject[]> {
  return tryOptionalPgRelation(
    'pipeline public.v_best_match_actions',
    () => dbAll(`SELECT * FROM public.v_best_match_actions WHERE takeoff_upload_id::text = ?`, [takeoffUploadId]),
    []
  );
}

export async function listRecentlyAutoMatched(takeoffUploadId: string): Promise<JsonObject[]> {
  return tryOptionalPgRelation(
    'pipeline public.v_best_match_actions (auto_accept filter)',
    async () => {
      const actions = await dbAll(`SELECT * FROM public.v_best_match_actions WHERE takeoff_upload_id::text = ?`, [
        takeoffUploadId,
      ]);
      return actions.filter((r) => String((r as { match_band?: string }).match_band || '').toLowerCase() === 'auto_accept');
    },
    []
  );
}

function sortReviewQueueRows(rows: JsonObject[]): JsonObject[] {
  const bandRank = (b: string) => {
    const x = b.toLowerCase();
    if (x === 'weak' || x === 'unmatched' || x === 'none') return 0;
    if (x === 'review') return 1;
    if (x === 'auto_accept') return 3;
    return 2;
  };
  return [...rows].sort((a, b) => {
    const ba = String((a as { match_band?: string }).match_band || 'review');
    const bb = String((b as { match_band?: string }).match_band || 'review');
    const br = bandRank(ba) - bandRank(bb);
    if (br !== 0) return br;
    const qtyA = Number((a as { qty?: unknown }).qty) || 0;
    const qtyB = Number((b as { qty?: unknown }).qty) || 0;
    const lineA = Number((a as { line_total?: unknown }).line_total) || Number((a as { extended_total?: unknown }).extended_total) || 0;
    const lineB = Number((b as { line_total?: unknown }).line_total) || Number((b as { extended_total?: unknown }).extended_total) || 0;
    const impact = qtyB * lineB - qtyA * lineA;
    if (impact !== 0) return impact;
    const scA = Number((a as { final_score?: unknown }).final_score ?? (a as { match_confidence_score?: unknown }).match_confidence_score) || 0;
    const scB = Number((b as { final_score?: unknown }).final_score ?? (b as { match_confidence_score?: unknown }).match_confidence_score) || 0;
    return scB - scA;
  });
}

export async function queryEstimateLinesDetailed(estimateId: string): Promise<JsonObject[]> {
  return tryOptionalPgRelation(
    'pipeline public.v_estimate_lines_detailed',
    () =>
      dbAll(
        `SELECT * FROM public.v_estimate_lines_detailed WHERE estimate_id::text = ? ORDER BY sort_order NULLS LAST, line_no NULLS LAST, id`,
        [estimateId]
      ),
    []
  );
}

export async function queryEstimateSummary(estimateId: string): Promise<JsonObject | null> {
  return tryOptionalPgRelation(
    'pipeline public.v_estimate_summary',
    async () =>
      (await dbGet(`SELECT * FROM public.v_estimate_summary WHERE estimate_id::text = ? LIMIT 1`, [estimateId])) ?? null,
    null
  );
}

export async function queryEstimateCategoryTotals(estimateId: string): Promise<JsonObject[]> {
  return tryOptionalPgRelation(
    'pipeline public.v_estimate_category_totals',
    () => dbAll(`SELECT * FROM public.v_estimate_category_totals WHERE estimate_id::text = ?`, [estimateId]),
    []
  );
}

export async function queryEstimateLineRollups(estimateId: string): Promise<JsonObject[]> {
  return tryOptionalPgRelation(
    'pipeline public.v_estimate_line_rollups',
    () => dbAll(`SELECT * FROM public.v_estimate_line_rollups WHERE estimate_id::text = ?`, [estimateId]),
    []
  );
}

export async function queryEstimateReadiness(estimateId: string): Promise<JsonObject | null> {
  return tryOptionalPgRelation(
    'pipeline public.v_estimate_readiness',
    async () =>
      (await dbGet(`SELECT * FROM public.v_estimate_readiness WHERE estimate_id::text = ? LIMIT 1`, [estimateId])) ?? null,
    null
  );
}

export async function queryEstimateLinesCustomer(estimateId: string): Promise<JsonObject[]> {
  return tryOptionalPgRelation(
    'pipeline public.v_estimate_lines_customer',
    () => dbAll(`SELECT * FROM public.v_estimate_lines_customer WHERE estimate_id::text = ?`, [estimateId]),
    []
  );
}
