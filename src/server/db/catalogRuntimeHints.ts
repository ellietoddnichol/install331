import { assertPgEnv } from './driver.ts';
import { isPgCatalogBackend } from './catalogBackend.ts';
import { getCatalogSourceMode } from './catalogTable.ts';

/** One-time startup hints so PG deployments do not silently look like hybrid SQLite/catalog setups. */
export function logCatalogRuntimeHints(): void {
  const src = getCatalogSourceMode();
  if (isPgCatalogBackend()) {
    try {
      assertPgEnv();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[catalog] ${msg}`);
    }
    if (src === 'sqlite') {
      console.warn(
        '[catalog] CATALOG_SOURCE=sqlite while catalog reads use Postgres — unusual intent flag only; catalog queries still hit DATABASE_URL.'
      );
    }
    return;
  }
  if (src === 'supabase') {
    console.warn(
      '[catalog] CATALOG_SOURCE=supabase but catalog reads use local SQLite — use DB_DRIVER=pg + DATABASE_URL + optional CATALOG_BACKEND=supabase for shared Supabase catalog.'
    );
  }
}
