/** Loose row from `public.v_match_review_queue` / `v_best_match_actions` (DB is source of truth). */
export type MatchReviewQueueRow = Record<string, unknown>;

export type TakeoffUploadListRow = {
  id: string;
  project_id: string;
  file_name: string;
  status: string;
  created_at: string;
};

export type EstimateListRow = {
  id: string;
  project_id: string;
  name: string;
  estimate_class?: string | null;
  confidence_notes?: string | null;
  created_at: string;
};

export type EstimateReadinessRow = Record<string, unknown>;
export type EstimateSummaryRow = Record<string, unknown>;
export type EstimateLineDetailedRow = Record<string, unknown>;
