import { createServerClient } from '@supabase/ssr';
import type { NextFunction, Request, Response } from 'express';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

function parseCookieHeader(header: string | undefined): { name: string; value: string }[] {
  if (!header) return [];
  const out: { name: string; value: string }[] = [];
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    if (!name) continue;
    let value = part.slice(eq + 1).trim();
    try {
      value = decodeURIComponent(value);
    } catch {
      // keep raw
    }
    out.push({ name, value });
  }
  return out;
}

/**
 * Express equivalent of Supabase’s Next.js middleware: refreshes the auth session on each request.
 * Optional: `app.use(createSupabaseSessionMiddleware())` early in `server.ts` (after `express.json` is fine).
 * Uses `NEXT_PUBLIC_*` keys from `.env` / `.env.local` (same as the Supabase Vite + Next quickstarts).
 */
export function createSupabaseSessionMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!supabaseUrl || !supabaseKey) {
      next();
      return;
    }

    const run = async () => {
      const supabase = createServerClient(supabaseUrl, supabaseKey, {
        cookies: {
          getAll() {
            return parseCookieHeader(req.headers.cookie);
          },
          setAll(cookiesToSet) {
            for (const { name, value, options } of cookiesToSet) {
              res.cookie(name, value, options as never);
            }
          },
        },
      });
      await supabase.auth.getUser();
    };

    void run()
      .then(() => next())
      .catch(next);
  };
}
