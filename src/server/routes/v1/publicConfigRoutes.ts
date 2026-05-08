import { Router } from 'express';
import { getPublicSupabaseClientConfig } from '../../publicSupabaseConfig.ts';

export const publicConfigRouter = Router();

publicConfigRouter.get('/public-config.js', (_req, res) => {
  const config = getPublicSupabaseClientConfig();
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  return res.send(
    `window.__INSTALL331_PUBLIC_CONFIG__ = ${JSON.stringify({
      supabaseUrl: config?.supabaseUrl ?? '',
      supabaseAnonKey: config?.supabaseAnonKey ?? '',
    })};`
  );
});
