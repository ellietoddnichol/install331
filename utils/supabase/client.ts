import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = import.meta.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** Browser Supabase client (Vite). Env must be exposed via `envPrefix` in `vite.config.ts`. */
export function createClient() {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  }
  return createBrowserClient(supabaseUrl, supabaseKey);
}
