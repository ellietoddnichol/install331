/**
 * Database backend selection for Phase 5 (Supabase Postgres vs local SQLite).
 * Default remains sqlite so `npm test` / local dev work without Docker Postgres.
 */
export function isPgDriver(): boolean {
  return String(process.env.DB_DRIVER || 'sqlite').trim().toLowerCase() === 'pg';
}

export function assertPgEnv(): void {
  if (!isPgDriver()) return;
  const url = String(process.env.DATABASE_URL || '').trim();
  if (!url) {
    throw new Error('DB_DRIVER=pg requires DATABASE_URL (Supabase pooler or local Postgres).');
  }
}
