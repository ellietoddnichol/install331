import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClientLoose, isSupabaseViteConfigured } from '../lib/supabase.ts';

export function getSupabaseBrowserClient(): SupabaseClient | null {
  return getSupabaseClientLoose();
}

export function isSupabaseBrowserConfigured(): boolean {
  return isSupabaseViteConfigured();
}
