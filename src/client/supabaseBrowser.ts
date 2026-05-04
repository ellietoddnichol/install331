import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient | null {
  const url = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
  const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
  if (!url || !anonKey) return null;
  if (!cached) {
    cached = createBrowserClient(url, anonKey);
  }
  return cached;
}

export function isSupabaseBrowserConfigured(): boolean {
  return Boolean(String(import.meta.env.VITE_SUPABASE_URL || '').trim() && String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim());
}
