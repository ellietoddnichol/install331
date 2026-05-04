import { assertPgEnv } from './driver.ts';
import { isPgDriver } from './driver.ts';
import { getCatalogSourceMode } from './catalogTable.ts';

/** One-time startup hints so PG deployments do not silently look like hybrid SQLite/catalog setups. */
export function logCatalogRuntimeHints(): void {
  const src = getCatalogSourceMode();
  if (isPgDriver()) {
    try {
      assertPgEnv();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[catalog] ${msg}`);
    }
    if (src === 'sqlite') {
      console.warn(
        '[catalog] CATALOG_SOURCE=sqlite with DB_DRIVER=pg is unusual — Postgres is still the runtime DB; SQLite files are not used for catalog reads.'
      );
    }
    return;
  }
  if (src === 'supabase') {
    console.warn(
      '[catalog] CATALOG_SOURCE=supabase but DB_DRIVER=sqlite — you are on local SQLite; set DB_DRIVER=pg + DATABASE_URL for shared Supabase catalog.'
    );
  }
}
