/**
 * Values safe to expose to the browser (Supabase anon key is public by design).
 * Mirrors the fallbacks used when SPA was built without VITE_* (Cloud Run often sets runtime env only).
 */
export function getPublicSupabaseClientConfig(): { supabaseUrl: string; supabaseAnonKey: string } | null {
  const url = String(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  ).trim();
  const anonKey = String(
    process.env.SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      '',
  ).trim();
  if (!url || !anonKey) return null;
  return { supabaseUrl: url, supabaseAnonKey: anonKey };
}
