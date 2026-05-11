/**
 * Helpers for Postgres reads where a relation may legitimately be absent
 * (e.g. install331 bridge tables not yet applied on native Supabase).
 *
 * Only `42P01` (undefined_table) is treated as optional-missing; all other errors propagate.
 */

/** PostgreSQL `undefined_table` — relation does not exist. */
export function isPgUndefinedRelation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '42P01';
}

const warnedOptionalMissing = new Set<string>();

/** Clears dedupe keys for `[pg-optional-relation]` logs (use between tests). */
export function resetPgOptionalRelationWarningDedupe(): void {
  warnedOptionalMissing.clear();
}

/**
 * One-line diagnostic when an optional relation is missing. Deduped per `purpose` per process
 * to avoid log storms from polled settings routes.
 */
export function logPgOptionalRelationMissing(purpose: string, err: unknown, opts?: { dedupe?: boolean }): void {
  const dedupe = opts?.dedupe !== false;
  if (dedupe && warnedOptionalMissing.has(purpose)) return;
  if (dedupe) warnedOptionalMissing.add(purpose);
  const detail = err instanceof Error ? err.message : String(err);
  console.warn(`[pg-optional-relation] ${purpose} — relation missing (42P01); using empty/default. ${detail}`);
}

/** Run an async PG read; on `42P01` only, log (optional dedupe) and return `fallback`. */
export async function tryOptionalPgRelation<T>(purpose: string, read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read();
  } catch (e: unknown) {
    if (!isPgUndefinedRelation(e)) throw e;
    logPgOptionalRelationMissing(purpose, e);
    return fallback;
  }
}
