import type { SupabaseClient } from '@supabase/supabase-js';
import {
  SuggestModifiersOutputSchema,
  type SuggestModifiersOutput,
} from '../../../shared/schemas/div10Brain/aiOutputs.ts';
import type { Div10BrainEnv } from '../env.ts';
import { retrieveKnowledge } from '../retrieval/retrieveKnowledge.ts';
import { runOpenAiJsonTask } from './openaiJson.ts';
import { logAiRun } from './logAiRun.ts';

export type ChosenCatalogItemSummary = {
  id: string;
  sku: string;
  brand?: string | null;
  category?: string | null;
  normalized_name?: string | null;
};

export type SuggestModifiersInput = {
  line_text: string;
  chosen_item: ChosenCatalogItemSummary;
  project_conditions?: Record<string, unknown>;
};

async function loadActiveModifierKeys(supabase: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await supabase.from('modifier_rules').select('modifier_key').eq('active', true);
  if (error) throw error;
  return new Set((data || []).map((r: { modifier_key: string }) => r.modifier_key));
}

function filterToKnownKeys(keys: string[], allowed: Set<string>): string[] {
  return keys.filter((k) => allowed.has(k));
}

export async function suggestModifiers(
  supabase: SupabaseClient,
  env: Div10BrainEnv,
  input: SuggestModifiersInput
): Promise<{ output: SuggestModifiersOutput; retrieved: unknown }> {
  const t0 = Date.now();
  const allowedKeys = await loadActiveModifierKeys(supabase);
  const keyList = [...allowedKeys].sort();

  const query = `${input.line_text}\n${input.chosen_item.sku} ${input.chosen_item.normalized_name || ''}`;
  const knowledge = await retrieveKnowledge(supabase, env, query, {}, 8);
  const retrieved = { knowledge, allowed_modifier_keys: keyList };

  const system = `You suggest estimating modifier keys for a catalog line.
Rules:
- suggested_line_modifier_keys and suggested_project_modifier_keys MUST only use keys from allowed_modifier_keys in the user JSON.
- If nothing fits, return empty arrays and needs_human_review true.
- Do not invent keys. Return strict JSON only.`;

  const user = JSON.stringify({
    line_text: input.line_text,
    chosen_item: input.chosen_item,
    project_conditions: input.project_conditions ?? {},
    allowed_modifier_keys: keyList,
    retrieved_context: knowledge,
  });

  const parsed = await runOpenAiJsonTask({
    env,
    model: env.openaiModelClassify,
    system,
    user,
    parse: (raw) => {
      const r = SuggestModifiersOutputSchema.safeParse(raw);
      if (!r.success) return { success: false, error: r.error.message };
      return { success: true, data: r.data };
    },
  });

  const lineKeys = filterToKnownKeys(parsed.suggested_line_modifier_keys, allowedKeys);
  const projKeys = filterToKnownKeys(parsed.suggested_project_modifier_keys, allowedKeys);
  const stripped =
    lineKeys.length !== parsed.suggested_line_modifier_keys.length ||
    projKeys.length !== parsed.suggested_project_modifier_keys.length;

  const output: SuggestModifiersOutput = {
    suggested_line_modifier_keys: lineKeys,
    suggested_project_modifier_keys: projKeys,
    confidence_notes: stripped
      ? `${parsed.confidence_notes} (unknown keys removed.)`.trim()
      : parsed.confidence_notes,
    needs_human_review: parsed.needs_human_review || stripped,
  };

  await logAiRun(supabase, {
    task_type: 'suggest_modifiers',
    model: env.openaiModelClassify,
    input_payload: input,
    retrieved_context: retrieved,
    output_payload: output,
    final_decision: null,
    latency_ms: Date.now() - t0,
  });

  return { output, retrieved };
}
