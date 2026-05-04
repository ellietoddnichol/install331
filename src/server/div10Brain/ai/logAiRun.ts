import type { SupabaseClient } from '@supabase/supabase-js';

export async function logAiRun(
  supabase: SupabaseClient,
  row: {
    task_type: string;
    model: string;
    input_payload: unknown;
    retrieved_context: unknown | null;
    output_payload: unknown | null;
    final_decision: unknown | null;
    latency_ms: number;
  }
): Promise<void> {
  const { error } = await supabase.from('ai_run_logs').insert({
    task_type: row.task_type,
    model: row.model,
    input_payload: row.input_payload,
    retrieved_context: row.retrieved_context,
    output_payload: row.output_payload,
    final_decision: row.final_decision,
    latency_ms: row.latency_ms,
  });
  if (error) {
    console.warn('[div10-brain] ai_run_logs insert failed', error.message);
  }
}
