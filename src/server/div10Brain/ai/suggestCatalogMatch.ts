import type { SupabaseClient } from '@supabase/supabase-js';
import {
  SuggestCatalogMatchOutputSchema,
  type SuggestCatalogMatchOutput,
} from '../../../shared/schemas/div10Brain/aiOutputs.ts';
import type { Div10BrainEnv } from '../env.ts';
import { retrieveEstimateExamples, retrieveKnowledge } from '../retrieval/retrieveKnowledge.ts';
import { runOpenAiJsonTask } from './openaiJson.ts';
import { logAiRun } from './logAiRun.ts';

export type CatalogCandidate = {
  id: string;
  sku: string;
  brand?: string | null;
  category?: string | null;
  normalized_name?: string | null;
  description?: string | null;
};

export type SuggestCatalogMatchInput = {
  line_text: string;
  candidates: CatalogCandidate[];
  project_context?: Record<string, unknown>;
};

function enforceCandidateRules(
  raw: SuggestCatalogMatchOutput,
  allowedIds: Set<string>
): SuggestCatalogMatchOutput {
  const rawSel = raw.selected_catalog_item_id?.trim() || null;
  const selected = rawSel && allowedIds.has(rawSel) ? rawSel : null;
  const alternates = raw.alternate_catalog_item_ids.map((id) => id.trim()).filter((id) => id && allowedIds.has(id));
  let needs_human_review = raw.needs_human_review;
  if (selected === null && rawSel && allowedIds.size > 0) needs_human_review = true;
  if (raw.confidence === 'high' && !selected) needs_human_review = true;
  return {
    ...raw,
    selected_catalog_item_id: selected,
    alternate_catalog_item_ids: alternates,
    needs_human_review,
  };
}

export async function suggestCatalogMatch(
  supabase: SupabaseClient,
  env: Div10BrainEnv,
  input: SuggestCatalogMatchInput
): Promise<{ output: SuggestCatalogMatchOutput; retrieved: unknown }> {
  const t0 = Date.now();
  const allowedIds = new Set(input.candidates.map((c) => c.id));
  if (allowedIds.size === 0) {
    const empty: SuggestCatalogMatchOutput = {
      selected_catalog_item_id: null,
      confidence: 'none',
      alternate_catalog_item_ids: [],
      rationale: 'No candidates supplied.',
      needs_human_review: true,
    };
    await logAiRun(supabase, {
      task_type: 'suggest_catalog_match',
      model: env.openaiModelClassify,
      input_payload: input,
      retrieved_context: null,
      output_payload: empty,
      final_decision: null,
      latency_ms: Date.now() - t0,
    });
    return { output: empty, retrieved: null };
  }

  const [knowledge, examples] = await Promise.all([
    retrieveKnowledge(supabase, env, input.line_text, {}, 6),
    retrieveEstimateExamples(supabase, input.line_text, {}, 6),
  ]);
  const retrieved = { knowledge, estimate_examples: examples };

  const system = `You map a takeoff line to exactly one catalog SKU from a fixed candidate list.
Rules:
- selected_catalog_item_id MUST be one of the provided candidate ids, or null if unsure.
- alternate_catalog_item_ids must only contain ids from the candidate list.
- Never invent UUIDs or SKUs outside the list.
- If uncertain, set needs_human_review true and confidence low or none.
Return strict JSON only.`;

  const user = JSON.stringify({
    line_text: input.line_text,
    project_context: input.project_context ?? {},
    candidates: input.candidates,
    retrieved_context: retrieved,
  });

  const parsed = await runOpenAiJsonTask({
    env,
    model: env.openaiModelClassify,
    system,
    user,
    parse: (raw) => {
      const r = SuggestCatalogMatchOutputSchema.safeParse(raw);
      if (!r.success) return { success: false, error: r.error.message };
      return { success: true, data: r.data };
    },
  });

  const output = enforceCandidateRules(parsed, allowedIds);

  await logAiRun(supabase, {
    task_type: 'suggest_catalog_match',
    model: env.openaiModelClassify,
    input_payload: input,
    retrieved_context: retrieved,
    output_payload: output,
    final_decision: null,
    latency_ms: Date.now() - t0,
  });

  return { output, retrieved };
}
