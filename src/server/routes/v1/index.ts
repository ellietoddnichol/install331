import { Router } from 'express';
import { getEstimatorDb } from '../../db/connection.ts';
import { isPgDriver } from '../../db/driver.ts';
import { getPgPool } from '../../db/pgPool.ts';
import { projectsRouter } from './projectsRoutes.ts';
import { roomsRouter } from './roomsRoutes.ts';
import { takeoffRouter } from './takeoffRoutes.ts';
import { settingsRouter } from './settingsRoutes.ts';
import { modifiersRouter } from './modifiersRoutes.ts';
import { bundlesRouter } from './bundlesRoutes.ts';
import { intakeRouter } from './intakeRoutes.ts';
import { requireDiv10BrainAdmin } from '../../div10Brain/auth/requireDiv10BrainAdmin.ts';
import { div10BrainRouter } from './div10BrainRoutes.ts';
import { readSessionHandler, requireSession } from '../../auth/requireSession.ts';
import { authRouter } from './authRoutes.ts';
import { catalogHealthRouter } from './catalogHealthRoutes.ts';
import { catalogRouter } from './catalogRoutes.ts';
import { pipelineRouter } from './pipelineRoutes.ts';

export const v1Router = Router();

/**
 * Readiness: confirms API router is mounted **and** the configured database driver can execute a trivial query.
 * Cloud Run / operators should use `GET /healthz` for startup (process up) and this route after boot for DB path.
 */
v1Router.get('/health', async (_req, res) => {
  const base = { version: 'v1' as const };
  try {
    if (isPgDriver()) {
      const pool = getPgPool();
      await pool.query('SELECT 1 AS ok');
      return res.json({ status: 'ok', ...base, database: 'pg', dbOk: true });
    }
    getEstimatorDb().prepare('SELECT 1 AS ok').get();
    return res.json({ status: 'ok', ...base, database: 'sqlite', dbOk: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[health] /api/v1/health database check failed:', message);
    return res.status(503).json({
      status: 'degraded',
      ...base,
      database: isPgDriver() ? 'pg' : 'sqlite',
      dbOk: false,
      error: message,
    });
  }
});

v1Router.use(catalogHealthRouter);

v1Router.get('/session', (req, res, next) => {
  void readSessionHandler(req, res).catch(next);
});

v1Router.use('/auth', authRouter);

v1Router.use(requireSession);

v1Router.use('/catalog', catalogRouter);
v1Router.use('/pipeline', pipelineRouter);
v1Router.use('/projects', projectsRouter);
v1Router.use('/rooms', roomsRouter);
v1Router.use('/takeoff', takeoffRouter);
v1Router.use('/settings', settingsRouter);
v1Router.use('/modifiers', modifiersRouter);
v1Router.use('/bundles', bundlesRouter);
v1Router.use('/intake', intakeRouter);
v1Router.use('/div10-brain', requireDiv10BrainAdmin, div10BrainRouter);
