import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

const ANON_PLACEHOLDER = 'PASTE_SUPABASE_ANON_PUBLIC_KEY_HERE';

type RuntimePublicSupabaseConfig = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

let cachedClient: SupabaseClient | null = null;

function readRuntimeConfig(): RuntimePublicSupabaseConfig | null {
  if (typeof window === 'undefined') return null;
  return window.__INSTALL331_PUBLIC_CONFIG__ ?? null;
}

function readViteUrl(): string {
  return String(import.meta.env.VITE_SUPABASE_URL ?? readRuntimeConfig()?.supabaseUrl ?? '').trim();
}

function readViteAnonKey(): string {
  return String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? readRuntimeConfig()?.supabaseAnonKey ?? '').trim();
}

/** True when URL and anon key look configured (does not validate JWT with Supabase). */
export function isSupabaseViteConfigured(): boolean {
  const url = readViteUrl();
  const anon = readViteAnonKey();
  if (!url || !anon) return false;
  if (anon === ANON_PLACEHOLDER) return false;
  return true;
}

/**
 * Call once at startup. Throws a clear message if Vite Supabase env is missing or still a placeholder.
 */
export function assertSupabaseViteEnv(): void {
  const url = readViteUrl();
  const anon = readViteAnonKey();

  if (!url) {
    throw new Error(
      '[Div 10 Catalog Hub] Missing VITE_SUPABASE_URL. Copy `.env.example` to `.env.local` and set your Supabase project URL.'
    );
  }

  if (!anon || anon === ANON_PLACEHOLDER) {
    throw new Error(
      '[Div 10 Catalog Hub] Missing VITE_SUPABASE_ANON_KEY. Paste the anon (public) key from Supabase Dashboard → Project Settings → API. Do not use the service_role key in VITE_* variables.'
    );
  }
}

/**
 * Browser Supabase client (anon key only). Throws if env is invalid — use after `assertSupabaseViteEnv()`.
 */
export function getSupabaseClient(): SupabaseClient {
  assertSupabaseViteEnv();
  if (!cachedClient) {
    cachedClient = createBrowserClient(readViteUrl(), readViteAnonKey());
  }
  return cachedClient;
}

/**
 * Same client as `getSupabaseClient` but returns null when env is not ready (e.g. optional legacy paths).
 */
export function getSupabaseClientLoose(): SupabaseClient | null {
  if (!isSupabaseViteConfigured()) return null;
  if (!cachedClient) {
    cachedClient = createBrowserClient(readViteUrl(), readViteAnonKey());
  }
  return cachedClient;
}
