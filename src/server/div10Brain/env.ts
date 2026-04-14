/**
 * Div 10 Brain — Supabase + OpenAI. Server-side only; never expose service role to the client.
 */
export type Div10BrainEnv = {
  appEnv: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  supabaseAnonKey: string | undefined;
  openaiApiKey: string;
  openaiModelClassify: string;
  openaiModelDraft: string;
  openaiEmbeddingModel: string;
  /** Required header value for admin / ingestion HTTP routes (Bearer or raw secret). */
  div10BrainAdminSecret: string;
};

export function readDiv10BrainEnv(): Div10BrainEnv | null {
  const supabaseUrl = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const supabaseServiceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const openaiApiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!supabaseUrl || !supabaseServiceRoleKey || !openaiApiKey) return null;
  return {
    appEnv: String(process.env.APP_ENV || process.env.NODE_ENV || 'development'),
    supabaseUrl,
    supabaseServiceRoleKey,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY?.trim() || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || undefined,
    openaiApiKey,
    openaiModelClassify: process.env.OPENAI_MODEL_CLASSIFY?.trim() || 'gpt-4o-mini',
    openaiModelDraft: process.env.OPENAI_MODEL_DRAFT?.trim() || 'gpt-4o-mini',
    openaiEmbeddingModel: process.env.OPENAI_EMBEDDING_MODEL?.trim() || 'text-embedding-3-small',
    div10BrainAdminSecret: String(process.env.DIV10_BRAIN_ADMIN_SECRET || '').trim(),
  };
}
