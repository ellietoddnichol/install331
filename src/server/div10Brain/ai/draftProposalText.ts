import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DraftProposalTextOutputSchema,
  type DraftProposalTextOutput,
} from '../../../shared/schemas/div10Brain/aiOutputs.ts';
import type { Div10BrainEnv } from '../env.ts';
import { retrieveProposalClauses } from '../retrieval/retrieveKnowledge.ts';
import { runOpenAiJsonTask } from './openaiJson.ts';
import { logAiRun } from './logAiRun.ts';

export type ApprovedEstimateRow = {
  description: string;
  quantity?: number | string | null;
  unit?: string | null;
  notes?: string | null;
};

export type DraftProposalTextInput = {
  approved_rows: ApprovedEstimateRow[];
  project_metadata: Record<string, unknown>;
  pricing_mode: string;
  retrieval_query?: string;
};

export async function draftProposalText(
  supabase: SupabaseClient,
  env: Div10BrainEnv,
  input: DraftProposalTextInput
): Promise<{ output: DraftProposalTextOutput; retrieved: unknown }> {
  const t0 = Date.now();
  const q =
    input.retrieval_query ||
    `${String(input.project_metadata.projectName || '')} Division 10 scope exclusions assumptions`;
  const clauses = await retrieveProposalClauses(supabase, q, {}, 12);
  const retrieved = { proposal_clauses: clauses };

  const system = `You draft proposal language for Division 10 / specialty scope sections.
Rules:
- scope_text, clarifications, exclusions, assumptions must be grounded ONLY in approved_rows, project_metadata, pricing_mode, and retrieved proposal_clauses bodies.
- Do NOT invent brands, quantities, compliance claims, certifications, or dollar amounts not present in approved_rows or project_metadata.
- If a detail is unknown, say it is to be confirmed rather than guessing.
- Output is editable boilerplate; keep professional and concise.
Return strict JSON with keys: scope_text, clarifications, exclusions, assumptions.`;

  const user = JSON.stringify({
    approved_rows: input.approved_rows,
    project_metadata: input.project_metadata,
    pricing_mode: input.pricing_mode,
    retrieved_context: retrieved,
  });

  const output = await runOpenAiJsonTask({
    env,
    model: env.openaiModelDraft,
    system,
    user,
    parse: (raw) => {
      const r = DraftProposalTextOutputSchema.safeParse(raw);
      if (!r.success) return { success: false, error: r.error.message };
      return { success: true, data: r.data };
    },
  });

  await logAiRun(supabase, {
    task_type: 'draft_proposal_text',
    model: env.openaiModelDraft,
    input_payload: input,
    retrieved_context: retrieved,
    output_payload: output,
    final_decision: null,
    latency_ms: Date.now() - t0,
  });

  return { output, retrieved };
}
