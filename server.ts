/**
 * Cloud Run / production boot model (see also `docs/SUPABASE_CLOUD_RUN.md`):
 *
 * 1. **Startup probe** — `GET /healthz` returns `200` as soon as the process listens. No database required.
 * 2. **Readiness / full stack** — `GET /api/v1/health` returns `200` only after `prepareEstimatorDbForServer()` finishes
 *    and `apiDependenciesReady` is set. While DB prep runs, `/api/*` returns **503** with `{ code: "API_NOT_READY" }`
 *    so clients can retry instead of treating HTML or empty bodies as success.
 * 3. **Production SPA shell** — In production, static assets + SPA fallback are registered **before** `listen()`
 *    so the browser can load `index.html` and JS while SQLite restore / PG pool init still runs. `/api` is never
 *    sent to the SPA (see `spaFallbackHandler`).
 *
 * Env hints (set in Cloud Run):
 * - `DB_DRIVER` — `sqlite` (default dev) or `pg` for Supabase Postgres catalog + workspace.
 * - `DATABASE_URL` — required when `DB_DRIVER=pg`.
 * - `AUTO_SYNC_CATALOG_ON_START` — keep `0` in production unless an operator intentionally enables Sheets pull.
 * - `CATALOG_ITEMS_TABLE` / `CATALOG_BACKEND` — see `src/server/db/catalogTable.ts` and `catalogBackend.ts`.
 */
import fs from 'fs';
import dotenv from 'dotenv';
import express, { Router } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import type { RequestHandler } from 'express';
import { syncCatalogFromGoogleSheets } from './src/server/services/googleSheetsCatalogSync.ts';
import { isCatalogSheetsWorkbookPushEnabled } from './src/server/services/catalogSheetsSyncPolicy.ts';
import { v1Router } from './src/server/routes/v1/index.ts';
import { legacyRouter } from './src/server/routes/legacyRouter.ts';
import { expressErrorHandler } from './src/server/http/jsonErrors.ts';
import { prepareEstimatorDbForServer } from './src/server/db/connection.ts';
import { logCatalogRuntimeHints } from './src/server/db/catalogRuntimeHints.ts';
import { warmPostgresCatalogOnStartup } from './src/server/services/catalogStartupWarm.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load base then local overrides (`.env.local` wins on duplicate keys).
const envFiles: ReadonlyArray<[string, boolean]> = [
  ['.env', false],
  ['.env.local', true],
];
for (const [fileName, override] of envFiles) {
  const fullPath = path.join(__dirname, fileName);
  if (fs.existsSync(fullPath)) {
    dotenv.config({ path: fullPath, override });
  }
}

/** Google Sheets → DB sync on boot — requires `CATALOG_SHEETS_SYNC_ENABLED=1` and `AUTO_SYNC_CATALOG_ON_START=1`. Default Supabase deploys read Postgres only. */
function shouldAutoSyncCatalogOnStart(): boolean {
  const raw = String(process.env.AUTO_SYNC_CATALOG_ON_START ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

let apiDependenciesReady = false;

/**
 * SPA fallback: skip `/api` so REST routes registered on `/api` still run.
 */
const spaFallbackHandler: RequestHandler = (req, res, next) => {
  if (req.path.startsWith('/api')) {
    next();
    return;
  }
  const distDir = path.join(__dirname, 'dist');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.sendFile(path.join(distDir, 'index.html'));
};

async function startServer() {
  const app = express();
  const rawPort = process.env.PORT?.trim();
  const PORT = rawPort
    ? Number(rawPort)
    : process.env.NODE_ENV === 'production'
      ? 8080
      : 3000;
  if (!Number.isFinite(PORT) || PORT <= 0) {
    throw new Error(`Invalid PORT: ${process.env.PORT}`);
  }

  const runningOnCloudRun = Boolean(process.env.K_SERVICE || process.env.K_REVISION);
  const isProdRuntime = runningOnCloudRun || process.env.NODE_ENV === 'production';

  console.log(
    `[boot] NODE_ENV=${process.env.NODE_ENV || ''} K_SERVICE=${process.env.K_SERVICE || ''} prodRuntime=${isProdRuntime}`
  );

  // Always available — use for Cloud Run startup probe / Docker HEALTHCHECK (no DB required).
  app.get('/healthz', (_req, res) => {
    res.status(200).type('text/plain').send('ok');
  });

  app.use(express.json({ limit: '12mb' }));

  const gatedApi = Router();
  gatedApi.use((_req, res, next) => {
    if (!apiDependenciesReady) {
      res.setHeader('Retry-After', '2');
      return res.status(503).json({
        error: 'API initializing',
        code: 'API_NOT_READY',
        message:
          'Database preparation is still running. For Cloud Run: use GET /healthz for startup probes; retry /api/v1/health or catalog calls after a short wait.',
      });
    }
    next();
  });
  gatedApi.use('/v1', v1Router);
  gatedApi.use(legacyRouter);
  gatedApi.use((req, res) => {
    res.status(404).json({ error: `API route not found: ${req.originalUrl}` });
  });
  app.use('/api', gatedApi);

  // Dev: create Vite server up front so HMR is ready; middleware is mounted after DB prep (see below).
  let viteDevMiddleware: import('express').RequestHandler | null = null;
  let viteTransformIndexHtml: ((url: string, html: string) => Promise<string>) | null = null;
  if (!isProdRuntime) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });
    viteDevMiddleware = vite.middlewares as unknown as import('express').RequestHandler;
    viteTransformIndexHtml = (url, html) => vite.transformIndexHtml(url, html);
  }

  // Production: ship the SPA shell immediately so Cloud Run can serve assets while DB prep runs.
  if (isProdRuntime) {
    const distDir = path.join(__dirname, 'dist');
    app.use(
      express.static(distDir, {
        setHeaders(res, filePath) {
          const normalized = filePath.replace(/\\/g, '/');
          if (normalized.endsWith('/index.html')) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
            return;
          }
          if (normalized.includes('/assets/')) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            return;
          }
          res.setHeader('Cache-Control', 'no-cache');
        },
      })
    );
    app.get('*', spaFallbackHandler);
  }

  await new Promise<void>((resolve, reject) => {
    try {
      app.listen(PORT, '0.0.0.0', () => {
        console.log(`[boot] listening on ${PORT} — /healthz live; /api returns 503 until DB prep completes`);
        resolve();
      });
    } catch (e) {
      reject(e);
    }
  });

  console.log('[boot] phase: prepareEstimatorDbForServer');
  await prepareEstimatorDbForServer();
  logCatalogRuntimeHints();
  console.log('[boot] phase: warmPostgresCatalogOnStartup');
  await warmPostgresCatalogOnStartup();

  apiDependenciesReady = true;
  console.log('[boot] API dependencies ready — /api/v1/* and legacy /api/* routes are live');

  if (!isProdRuntime && viteDevMiddleware && viteTransformIndexHtml) {
    app.use(viteDevMiddleware);
    app.use(async (req, res, next) => {
      if (req.path.startsWith('/api')) {
        next();
        return;
      }
      try {
        const indexHtmlPath = path.join(__dirname, 'index.html');
        const rawHtml = fs.readFileSync(indexHtmlPath, 'utf-8');
        const html = await viteTransformIndexHtml(req.originalUrl, rawHtml);
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
        res.status(200).type('text/html').send(html);
      } catch (err) {
        next(err);
      }
    });
  }

  app.use(expressErrorHandler);

  if (shouldAutoSyncCatalogOnStart() && isCatalogSheetsWorkbookPushEnabled()) {
    setTimeout(() => {
      syncCatalogFromGoogleSheets().catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[catalog] startup sync failed: ${message}`);
      });
    }, 2500);
  }
}

startServer().catch((err: unknown) => {
  console.error('Server failed to start:', err);
  process.exit(1);
});
