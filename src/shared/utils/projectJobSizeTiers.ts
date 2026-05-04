/** Stored in `projects_v1.project_size` (TEXT). Legacy: Small | Medium | Large. */

export const PROJECT_JOB_SIZE_VALUES = [
  'T1_spot',
  'T2_small',
  'T3_standard',
  'T4_large',
  'T5_major',
] as const;

export type ProjectJobSizeCode = (typeof PROJECT_JOB_SIZE_VALUES)[number];

export const PROJECT_JOB_SIZE_OPTIONS: {
  value: ProjectJobSizeCode;
  label: string;
  durationGuide: string;
  bidGuide: string;
}[] = [
  {
    value: 'T1_spot',
    label: 'Tier 1 — Spot / service',
    durationGuide: 'Under ~1 crew-day',
    bidGuide: 'Typically under ~$25k',
  },
  {
    value: 'T2_small',
    label: 'Tier 2 — Small job',
    durationGuide: '~1–3 crew-days',
    bidGuide: 'Roughly $25k–$75k',
  },
  {
    value: 'T3_standard',
    label: 'Tier 3 — Standard',
    durationGuide: '~3–10 crew-days',
    bidGuide: 'Roughly $75k–$250k',
  },
  {
    value: 'T4_large',
    label: 'Tier 4 — Large',
    durationGuide: '~10–25 crew-days',
    bidGuide: 'Roughly $250k–$750k',
  },
  {
    value: 'T5_major',
    label: 'Tier 5 — Major / program',
    durationGuide: '25+ crew-days or multi-phase',
    bidGuide: 'Typically $750k+',
  },
];

const LEGACY_MAP: Record<string, ProjectJobSizeCode> = {
  Small: 'T2_small',
  Medium: 'T3_standard',
  Large: 'T4_large',
};

export function normalizeProjectSizeSelectValue(raw: string | null | undefined): ProjectJobSizeCode {
  const v = String(raw || '').trim();
  if (!v) return 'T3_standard';
  if ((PROJECT_JOB_SIZE_VALUES as readonly string[]).includes(v)) return v as ProjectJobSizeCode;
  return LEGACY_MAP[v] || 'T3_standard';
}

/**
 * Suggest a tier from rolled-up duration (8 hr × installers × days) and loaded bid total.
 * Heuristic only — estimator should confirm.
 */
export function suggestProjectJobSizeTier(durationDays: number, baseBidTotal: number): ProjectJobSizeCode {
  const days = Number.isFinite(durationDays) && durationDays > 0 ? durationDays : 0;
  const bid = Number.isFinite(baseBidTotal) && baseBidTotal > 0 ? baseBidTotal : 0;

  if (days > 0 && bid > 0) {
    if (days < 0.35 && bid < 30_000) return 'T1_spot';
    if (days < 1.25 && bid < 85_000) return 'T2_small';
    if (days < 4 && bid < 280_000) return 'T3_standard';
    if (days < 12 && bid < 900_000) return 'T4_large';
    return 'T5_major';
  }
  if (days > 0) {
    if (days < 0.35) return 'T1_spot';
    if (days < 1.25) return 'T2_small';
    if (days < 4) return 'T3_standard';
    if (days < 12) return 'T4_large';
    return 'T5_major';
  }
  if (bid > 0) {
    if (bid < 30_000) return 'T1_spot';
    if (bid < 85_000) return 'T2_small';
    if (bid < 280_000) return 'T3_standard';
    if (bid < 900_000) return 'T4_large';
    return 'T5_major';
  }
  return 'T3_standard';
}
