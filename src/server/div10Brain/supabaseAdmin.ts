import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Div10BrainEnv } from './env.ts';

export function getSupabaseAdmin(env: Div10BrainEnv): SupabaseClient {
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
