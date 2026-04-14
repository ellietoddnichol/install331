import { createServerClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/**
 * Cookie store shape matches `@supabase/ssr` + Next.js `cookies()` (getAll / setAll).
 * This repo is Vite + Express: use this from Express handlers by adapting `req`/`res` cookies,
 * or from a future SSR layer that can supply the same interface.
 */
export type CookieStoreLike = {
  getAll(): { name: string; value: string }[];
  setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]): void;
};

export function createClient(cookieStore: CookieStoreLike) {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  }
  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookieStore.setAll(cookiesToSet);
        } catch {
          // Called from a context where cookies cannot be written (e.g. read-only Server Component).
          // Safe to ignore if another layer (e.g. Express middleware) refreshes the session.
        }
      },
    },
  });
}
