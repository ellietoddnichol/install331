import fs from 'fs';
import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { syncCatalogFromGoogleSheets } from './src/server/services/googleSheetsCatalogSync.ts';
import { v1Router } from './src/server/routes/v1/index.ts';
import { legacyRouter } from './src/server/routes/legacyRouter.ts';
import { expressErrorHandler } from './src/server/http/jsonErrors.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

['.env', '.env.local'].forEach((fileName) => {
  const fullPath = path.join(__dirname, fileName);
  if (fs.existsSync(fullPath)) {
    dotenv.config({ path: fullPath, override: false });
  }
});

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

  app.use(express.json({ limit: '12mb' }));

  app.use('/api/v1', v1Router);
  app.use('/api', legacyRouter);

  app.use('/api/*', (req, res) => {
    res.status(404).json({ error: `API route not found: ${req.originalUrl}` });
  });

  app.use(expressErrorHandler);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist/index.html')));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);

    const autoStart = String(process.env.AUTO_SYNC_CATALOG_ON_START || '')
      .trim()
      .toLowerCase();
    if (autoStart === '1' || autoStart === 'true' || autoStart === 'yes') {
      setTimeout(() => {
        syncCatalogFromGoogleSheets().catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          console.warn(`[catalog] startup sync failed: ${message}`);
        });
      }, 2500);
    }
  });
}

startServer().catch((err: unknown) => {
  console.error('Server failed to start:', err);
  process.exit(1);
});
