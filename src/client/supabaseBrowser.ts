import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;
let fetchedFromServer: { url: string; anonKey: string } | null = null;
let fetchPromise: Promise<void> | null = null;

function trimEnv(name: keyof ImportMetaEnv): string {
  return String((import.meta.env[name] as string | undefined) || '').trim();
}

function credentialsFromVite(): { url: string; anonKey: string } | null {
  const url = trimEnv('VITE_SUPABASE_URL');
  const anonKey = trimEnv('VITE_SUPABASE_ANON_KEY');
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

function resolvedCredentials(): { url: string; anonKey: string } | null {
  const fromVite = credentialsFromVite();
  if (fromVite) return fromVite;
  if (fetchedFromServer) return fetchedFromServer;
  return null;
}

/**
 * Call once before React mounts in production so `getSupabaseBrowserClient()` sees Cloud Run–injected env
 * via GET /api/bootstrap/client-config (same-origin, no auth).
 */
export async function initSupabaseBrowserConfig(): Promise<void> {
  if (credentialsFromVite()) return;
  if (fetchedFromServer) return;
  if (fetchPromise) {
    await fetchPromise;
    return;
  }
  fetchPromise = (async () => {
    try {
      const res = await fetch('/api/bootstrap/client-config', { credentials: 'same-origin' });
      if (!res.ok) return;
      const body = (await res.json()) as {
        data?: { supabaseUrl?: string | null; supabaseAnonKey?: string | null };
      };
      const url = String(body.data?.supabaseUrl ?? '').trim();
      const anonKey = String(body.data?.supabaseAnonKey ?? '').trim();
      if (url && anonKey) {
        fetchedFromServer = { url, anonKey };
      }
    } catch {
      /* offline or bad JSON — leave unconfigured */
    }
  })();
  await fetchPromise;
}

export function getSupabaseBrowserClient(): SupabaseClient | null {
  const creds = resolvedCredentials();
  if (!creds) return null;
  if (!cached) {
    cached = createBrowserClient(creds.url, creds.anonKey);
  }
  return cached;
}

export function isSupabaseBrowserConfigured(): boolean {
  return resolvedCredentials() !== null;
}
