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

function readBundledViteUrl(): string {
  return String(import.meta.env.VITE_SUPABASE_URL ?? import.meta.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
}

function readBundledViteAnonKey(): string {
  return String(
    import.meta.env.VITE_SUPABASE_ANON_KEY ??
      import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      ''
  ).trim();
}

function readViteUrl(): string {
  const viteUrl = readBundledViteUrl();
  if (viteUrl) return viteUrl;
  return String(readRuntimeConfig()?.supabaseUrl ?? '').trim();
}

function readViteAnonKey(): string {
  const viteAnonKey = readBundledViteAnonKey();
  if (viteAnonKey && viteAnonKey !== ANON_PLACEHOLDER) return viteAnonKey;
  return String(readRuntimeConfig()?.supabaseAnonKey ?? viteAnonKey).trim();
}

export async function loadSupabaseRuntimeConfig(): Promise<void> {
  if (typeof window === 'undefined') return;
  const bundledAnonKey = readBundledViteAnonKey();
  if (readBundledViteUrl() && bundledAnonKey && bundledAnonKey !== ANON_PLACEHOLDER) return;
  try {
    const res = await fetch('/api/v1/public-config', { credentials: 'same-origin' });
    if (!res.ok) return;
    const payload = (await res.json()) as {
      data?: RuntimePublicSupabaseConfig | null;
    };
    const config = payload?.data;
    if (!config) return;
    window.__INSTALL331_PUBLIC_CONFIG__ = {
      supabaseUrl: String(config.supabaseUrl ?? '').trim(),
      supabaseAnonKey: String(config.supabaseAnonKey ?? '').trim(),
    };
  } catch {
    /* ignore */
  }
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
      '[Div 10 Catalog Hub] Missing VITE_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL. Set one of those at build time, or expose SUPABASE_URL through /api/v1/public-config at runtime.'
    );
  }

  if (!anon || anon === ANON_PLACEHOLDER) {
    throw new Error(
      '[Div 10 Catalog Hub] Missing VITE_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Set one at build time, or expose SUPABASE_ANON_KEY via /api/v1/public-config at runtime. Never use service_role in browser-exposed variables.'
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
