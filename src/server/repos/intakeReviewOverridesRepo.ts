import { getEstimatorDb } from '../db/connection.ts';

export type IntakeReviewOverrideStatus = 'ignored';

export function upsertIntakeReviewOverride(input: {
  reviewLineFingerprint: string;
  status: IntakeReviewOverrideStatus;
  reviewLineContentKey?: string | null;
}): void {
  const fp = String(input.reviewLineFingerprint || '').trim();
  const status = String(input.status || '').trim();
  if (!fp) return;
  if (status !== 'ignored') return;
  const rawCk = input.reviewLineContentKey;
  const contentKey = rawCk != null && String(rawCk).trim() ? String(rawCk).trim() : null;
  getEstimatorDb()
    .prepare(
      `INSERT INTO intake_review_overrides_v1 (review_line_fingerprint, status, updated_at, content_ignore_key)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(review_line_fingerprint)
       DO UPDATE SET
         status = excluded.status,
         updated_at = excluded.updated_at,
         content_ignore_key = COALESCE(excluded.content_ignore_key, intake_review_overrides_v1.content_ignore_key)`
    )
    .run(fp, status, new Date().toISOString(), contentKey);
}

/** Match by current fingerprint, or by content key when a prior pass stored the same line under a different fingerprint. */
export function getIntakeReviewOverridesForMatcherLines(
  lines: Array<{ reviewLineFingerprint: string; reviewLineContentKey: string }>
): Map<string, { status: IntakeReviewOverrideStatus; updatedAt: string }> {
  const fps = (lines || [])
    .map((l) => String(l.reviewLineFingerprint || '').trim())
    .filter(Boolean);
  const cks = (lines || [])
    .map((l) => String(l.reviewLineContentKey || '').trim())
    .filter(Boolean);
  if (fps.length === 0 && cks.length === 0) return new Map();

  const orParts: string[] = [];
  const params: string[] = [];
  if (fps.length) {
    orParts.push(`review_line_fingerprint IN (${fps.map(() => '?').join(', ')})`);
    params.push(...fps);
  }
  if (cks.length) {
    orParts.push(`(content_ignore_key IS NOT NULL AND content_ignore_key IN (${cks.map(() => '?').join(', ')}))`);
    params.push(...cks);
  }
  const rows = getEstimatorDb()
    .prepare(
      `SELECT review_line_fingerprint, status, updated_at, content_ignore_key
       FROM intake_review_overrides_v1
       WHERE status = 'ignored' AND (${orParts.join(' OR ')})`
    )
    .all(...params) as Array<{
    review_line_fingerprint: string;
    status: string;
    updated_at: string;
    content_ignore_key: string | null;
  }>;
  const out = new Map<string, { status: IntakeReviewOverrideStatus; updatedAt: string }>();
  for (const line of lines) {
    const fp = String(line.reviewLineFingerprint || '').trim();
    if (!fp) continue;
    const direct = rows.find((r) => r.review_line_fingerprint === fp && r.status === 'ignored');
    if (direct) {
      out.set(fp, { status: 'ignored', updatedAt: direct.updated_at });
      continue;
    }
    const ck = String(line.reviewLineContentKey || '').trim();
    if (ck) {
      const via = rows.find((r) => r.content_ignore_key === ck && r.status === 'ignored');
      if (via) {
        out.set(fp, { status: 'ignored', updatedAt: via.updated_at });
      }
    }
  }
  return out;
}

export function getIntakeReviewOverridesByFingerprints(fingerprints: string[]): Map<string, { status: IntakeReviewOverrideStatus; updatedAt: string }> {
  return getIntakeReviewOverridesForMatcherLines(
    (fingerprints || []).map((reviewLineFingerprint) => ({ reviewLineFingerprint, reviewLineContentKey: '' }))
  );
}

