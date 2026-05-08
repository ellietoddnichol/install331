import fs from 'fs';
import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import type { RequestHandler } from 'express';
import { syncCatalogFromGoogleSheets } from './src/server/services/googleSheetsCatalogSync.ts';
import { v1Router } from './src/server/routes/v1/index.ts';
import { legacyRouter } from './src/server/routes/legacyRouter.ts';
import { expressErrorHandler } from './src/server/http/jsonErrors.ts';
import { prepareEstimatorDbForServer } from './src/server/db/connection.ts';
import { logCatalogRuntimeHints } from './src/server/db/catalogRuntimeHints.ts';

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

/** Pull labor catalog from Sheets once after boot in production by default; opt out with AUTO_SYNC_CATALOG_ON_START=0. Local dev: set AUTO_SYNC_CATALOG_ON_START=1 to enable. */
function shouldAutoSyncCatalogOnStart(): boolean {
  const raw = String(process.env.AUTO_SYNC_CATALOG_ON_START ?? '').trim().toLowerCase();
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') return false;
  if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on') return true;
  const prodRuntime =
    process.env.NODE_ENV === 'production' || Boolean(process.env.K_SERVICE || process.env.K_REVISION);
  return prodRuntime;
}

/**
 * SPA fallback: skip `/api` so REST routes registered later still run.
 * (Registered before listen; API is mounted after `prepareEstimatorDbForServer`.)
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

  // Always available — use for Cloud Run startup probe / Docker HEALTHCHECK (no DB required).
  app.get('/healthz', (_req, res) => {
    res.status(200).type('text/plain').send('ok');
  });

  // Dev: create Vite server up front so HMR is ready, but DO NOT mount its middleware
  // until AFTER the Express API routes — otherwise `appType: 'spa'` SPA fallback
  // swallows `/api/*` and returns index.html for every API call.
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

  await new Promise<void>((resolve, reject) => {
    try {
      app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server listening on port ${PORT} (API mounts after database ready)`);
        resolve();
      });
    } catch (e) {
      reject(e);
    }
  });

  await prepareEstimatorDbForServer();
  logCatalogRuntimeHints();

  app.use(express.json({ limit: '12mb' }));

  /**
   * Mount order matters: v1 API is primary, legacy API is fallback.
   * Legacy /api/catalog/* routes are still required because v1 API does not yet implement
   * catalog CRUD (POST/PUT/DELETE for items/modifiers/bundles). Frontend (Catalog.tsx,
   * ProjectWorkspace.tsx) makes ~137 calls to legacy catalog endpoints.
   * See docs/stabilization-audit.md for removal roadmap.
   */
  app.use('/api/v1', v1Router);
  app.use('/api', legacyRouter);

  app.use('/api/*', (req, res) => {
    res.status(404).json({ error: `API route not found: ${req.originalUrl}` });
  });

  // Mount Vite/static + SPA fallback AFTER API routes so /api never reaches the SPA.
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
        const html = await viteTransformIndexHtml!(req.originalUrl, rawHtml);
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
        res.status(200).type('text/html').send(html);
      } catch (err) {
        next(err);
      }
    });
  } else {
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

  app.use(expressErrorHandler);

  console.log('API routes ready');

  if (shouldAutoSyncCatalogOnStart()) {
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
