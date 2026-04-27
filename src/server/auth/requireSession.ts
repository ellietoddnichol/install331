import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import type { NextFunction, Request, Response } from 'express';
import type { Session, User } from '@supabase/supabase-js';

export type AuthedRequest = Request & { authUser?: User; authSession?: Session | null };

function authRequired(): boolean {
  const v = String(process.env.AUTH_REQUIRED || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function parseCookieHeader(cookieHeader: string | undefined): { name: string; value: string }[] {
  if (!cookieHeader) return [];
  return cookieHeader.split(';').map((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return { name: part.trim(), value: '' };
    const name = part.slice(0, idx).trim();
    let value = part.slice(idx + 1).trim();
    try {
      value = decodeURIComponent(value);
    } catch {
      /* keep raw */
    }
    return { name, value };
  });
}

/**
 * Resolves the current Supabase user from `Authorization: Bearer <access_token>` or
 * Supabase auth cookies (same-origin), using the anon key for verification.
 */
export async function getSupabaseSessionForRequest(req: Request, _res: Response): Promise<Session | null> {
  const url = String(process.env.SUPABASE_URL || '').trim();
  const anonKey = String(process.env.SUPABASE_ANON_KEY || '').trim();
  if (!url || !anonKey) return null;

  const authHeader = String(req.headers.authorization || '');
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (bearer) {
    const supabase = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.auth.getUser(bearer);
    if (error || !data.user) return null;
    return {
      access_token: bearer,
      refresh_token: '',
      expires_in: 0,
      expires_at: undefined,
      token_type: 'bearer',
      user: data.user,
    } as Session;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return parseCookieHeader(req.headers.cookie);
      },
      setAll() {
        /* Read-only for API middleware; refresh handled by Supabase client in browser. */
      },
    },
  });
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) return null;
  return data.session;
}

export async function readSessionHandler(req: Request, res: Response): Promise<void> {
  const session = await getSupabaseSessionForRequest(req, res);
  res.json({
    data: {
      user: session?.user ?? null,
    },
  });
}

export async function requireSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!authRequired()) {
    next();
    return;
  }

  const url = String(process.env.SUPABASE_URL || '').trim();
  const anonKey = String(process.env.SUPABASE_ANON_KEY || '').trim();
  if (!url || !anonKey) {
    res.status(503).json({ error: 'Server auth is required but SUPABASE_URL / SUPABASE_ANON_KEY are not configured.' });
    return;
  }

  const session = await getSupabaseSessionForRequest(req, res);
  if (!session?.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  (req as AuthedRequest).authUser = session.user;
  (req as AuthedRequest).authSession = session;
  next();
}
