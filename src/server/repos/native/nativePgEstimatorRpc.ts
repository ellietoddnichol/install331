import { getPgPool } from '../../db/pgPool.ts';

/**
 * Thin wrappers around Supabase `public.*` RPCs. Keep SQL here so call
 * signatures stay obvious when the DB contract changes.
 */
export async function rpcProcessTakeoffUploadMatches(takeoffUploadId: string): Promise<void> {
  await getPgPool().query('SELECT public.process_takeoff_upload_matches($1::uuid)', [takeoffUploadId]);
}

export async function rpcAppAcceptMatch(
  takeoffRowId: string,
  catalogItemId: string,
  isReplace: boolean,
  confidence: number
): Promise<void> {
  await getPgPool().query('SELECT public.app_accept_match($1::uuid, $2::text, $3::boolean, $4::double precision)', [
    takeoffRowId,
    catalogItemId,
    isReplace,
    confidence,
  ]);
}

export async function rpcAppRejectMatch(takeoffRowId: string, catalogItemId: string, reasonCode: string): Promise<void> {
  await getPgPool().query('SELECT public.app_reject_match($1::uuid, $2::text, $3::text)', [takeoffRowId, catalogItemId, reasonCode]);
}

export async function rpcAppClearMatch(takeoffRowId: string): Promise<void> {
  await getPgPool().query('SELECT public.app_clear_match($1::uuid)', [takeoffRowId]);
}

export async function rpcBuildEstimateFromTakeoffUpload(
  estimateId: string,
  takeoffUploadId: string,
  laborRate: number,
  locationCode: string,
  overwriteExisting: boolean
): Promise<void> {
  await getPgPool().query(
    'SELECT public.build_estimate_from_takeoff_upload($1::uuid, $2::uuid, $3::double precision, $4::text, $5::boolean)',
    [estimateId, takeoffUploadId, laborRate, locationCode, overwriteExisting]
  );
}

export async function rpcRefreshEstimateVarianceGroups(estimateId: string): Promise<void> {
  await getPgPool().query('SELECT public.refresh_estimate_variance_groups($1::uuid)', [estimateId]);
}

export async function rpcSeedProposalSectionsForEstimate(estimateId: string): Promise<void> {
  await getPgPool().query('SELECT public.seed_proposal_sections_for_estimate($1::uuid)', [estimateId]);
}
