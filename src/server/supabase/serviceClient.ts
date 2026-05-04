import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

/** Service-role Supabase client (server only). */
export function getServiceSupabase(): SupabaseClient {
  if (!cached) {
    const url = String(process.env.SUPABASE_URL || '').trim();
    const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    if (!url || !key) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for Supabase storage operations.');
    }
    cached = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}

export function isSupabaseStorageConfigured(): boolean {
  return Boolean(
    String(process.env.SUPABASE_URL || '').trim() &&
      String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim() &&
      String(process.env.SUPABASE_STORAGE_BUCKET || 'project-files').trim()
  );
}

export function getProjectFilesBucket(): string {
  return String(process.env.SUPABASE_STORAGE_BUCKET || 'project-files').trim() || 'project-files';
}
