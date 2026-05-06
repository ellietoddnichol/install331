import { Router } from 'express';
import { resolveCatalogBackendSetting } from '../../db/catalogBackend.ts';
import { isPgDriver } from '../../db/driver.ts';
import { getPgPool } from '../../db/pgPool.ts';

export const catalogHealthRouter = Router();

/**
 * Supabase catalog surface health (approved clean views). Requires `DB_DRIVER=pg` + `DATABASE_URL`.
 * Does not use SQLite or `getEstimatorDb()`.
 */
catalogHealthRouter.get('/catalog-health', async (_req, res) => {
  const DB_DRIVER = String(process.env.DB_DRIVER || '').trim() || 'sqlite';
  const catalogBackendEnv = String(process.env.CATALOG_BACKEND || '').trim();
  const CATALOG_BACKEND = catalogBackendEnv || resolveCatalogBackendSetting();

  if (!isPgDriver()) {
    return res.status(503).json({
      error: 'catalog-health requires DB_DRIVER=pg and DATABASE_URL (Supabase Postgres).',
      DB_DRIVER,
      CATALOG_BACKEND,
    });
  }

  try {
    const pool = getPgPool();

    let catalogHealthRows: unknown[] = [];
    try {
      const r = await pool.query('SELECT * FROM public.catalog_health');
      catalogHealthRows = r.rows;
    } catch {
      catalogHealthRows = [];
    }

    async function countFrom(rel: string): Promise<number | null> {
      try {
        const r = await pool.query<{ n: string }>(`SELECT count(*)::bigint AS n FROM ${rel}`);
        return Number(r.rows[0]?.n ?? 0);
      } catch {
        return null;
      }
    }

    const counts = {
      catalog_items_clean: await countFrom('public.catalog_items_clean'),
      catalog_aliases_clean: await countFrom('public.catalog_aliases_clean'),
      catalog_attributes_clean: await countFrom('public.catalog_attributes_clean'),
      catalog_labor_rules_clean: await countFrom('public.catalog_labor_rules_clean'),
      catalog_modifier_rules_clean: await countFrom('public.catalog_modifier_rules_clean'),
    };

    return res.json({
      DB_DRIVER,
      CATALOG_BACKEND,
      catalogHealthRows,
      counts,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({
      error: 'catalog-health query failed',
      detail: message,
      DB_DRIVER,
      CATALOG_BACKEND,
    });
  }
});
