import type { RequestHandler } from 'express';
import { readDiv10BrainEnv, type Div10BrainEnv } from '../env.ts';

export type Div10BrainLocals = { div10BrainEnv: Div10BrainEnv };

export const requireDiv10BrainAdmin: RequestHandler = (_req, res, next) => {
  const env = readDiv10BrainEnv();
  if (!env) {
    res.status(503).json({ error: 'Div 10 Brain is not configured (Supabase + OpenAI env missing).' });
    return;
  }
  if (!env.div10BrainAdminSecret) {
    res.status(503).json({ error: 'DIV10_BRAIN_ADMIN_SECRET is not set.' });
    return;
  }
  const authHeader = String(_req.headers.authorization || '').trim();
  const bearer = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : authHeader;
  const headerSecret = String(_req.headers['x-div10-brain-admin-secret'] || '').trim();
  const ok = bearer === env.div10BrainAdminSecret || headerSecret === env.div10BrainAdminSecret;
  if (!ok) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  (res.locals as Div10BrainLocals).div10BrainEnv = env;
  next();
};
