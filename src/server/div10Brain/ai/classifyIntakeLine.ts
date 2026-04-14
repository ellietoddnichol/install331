import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ClassifyIntakeLineOutputSchema,
  type ClassifyIntakeLineOutput,
} from '../../../shared/schemas/div10Brain/aiOutputs.ts';
import type { Div10BrainEnv } from '../env.ts';
import { retrieveEstimateExamples, retrieveKnowledge } from '../retrieval/retrieveKnowledge.ts';
import { runOpenAiJsonTask } from './openaiJson.ts';
import { logAiRun } from './logAiRun.ts';

export type ClassifyIntakeLineInput = {
  line_text: string;
  nearby_lines?: string[];
  section_header?: string | null;
  project_context?: Record<string, unknown>;
  topKKnowledge?: number;
};

export async function classifyIntakeLine(
  supabase: SupabaseClient,
  env: Div10BrainEnv,
  input: ClassifyIntakeLineInput
): Promise<{ output: ClassifyIntakeLineOutput; retrieved: unknown }> {
  const t0 = Date.now();
  const [knowledge, examples] = await Promise.all([
    retrieveKnowledge(supabase, env, input.line_text, {}, input.topKKnowledge ?? 8),
    retrieveEstimateExamples(supabase, input.line_text, {}, input.topKKnowledge ?? 6),
  ]);
  const retrieved = { knowledge, estimate_examples: examples };

  const system = `You classify construction / Division 10 specialty lines for estimating.
Return strict JSON only. Fields:
- line_kind: short label (e.g. hardware, toilet_partition, signage)
- scope_bucket: in_scope | alternate | allowance | clarification | unknown
- category, subcategory: Div10-oriented labels; use empty string if unknown
- pricing_role: material | labor | allowance | lump_sum | tbd
- likely_needs_catalog_match: boolean
- likely_modifier_keys: strings that might apply (best-effort; keys may be generic)
- needs_human_review: true if ambiguous or safety/compliance sensitive
- reasoning_summary: brief, cites retrieved context titles when useful
Do not output prices, labor minutes, or markups.`;

  const user = JSON.stringify({
    line_text: input.line_text,
    nearby_lines: input.nearby_lines ?? [],
    section_header: input.section_header ?? null,
    project_context: input.project_context ?? {},
    retrieved_context: retrieved,
  });

  const output = await runOpenAiJsonTask({
    env,
    model: env.openaiModelClassify,
    system,
    user,
    parse: (raw) => {
      const r = ClassifyIntakeLineOutputSchema.safeParse(raw);
      if (!r.success) return { success: false, error: r.error.message };
      return { success: true, data: r.data };
    },
  });

  await logAiRun(supabase, {
    task_type: 'classify_intake_line',
    model: env.openaiModelClassify,
    input_payload: input,
    retrieved_context: retrieved,
    output_payload: output,
    final_decision: null,
    latency_ms: Date.now() - t0,
  });

  return { output, retrieved };
}
