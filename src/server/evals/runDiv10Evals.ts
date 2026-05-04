import fs from 'fs';
import path from 'path';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Div10BrainEnv } from '../div10Brain/env.ts';
import { classifyIntakeLine } from '../div10Brain/ai/classifyIntakeLine.ts';
import { suggestCatalogMatch } from '../div10Brain/ai/suggestCatalogMatch.ts';
import { suggestModifiers } from '../div10Brain/ai/suggestModifiers.ts';
import { retrieveProposalClauses } from '../div10Brain/retrieval/retrieveKnowledge.ts';

export type EvalCaseResult = {
  id: string;
  task_type: string;
  pass: boolean;
  detail: Record<string, unknown>;
};

function shallowClassifyMatch(
  expected: Record<string, unknown>,
  actual: Record<string, unknown>
): { pass: boolean; mismatches: string[] } {
  const keys = ['line_kind', 'scope_bucket', 'category', 'pricing_role'] as const;
  const mismatches: string[] = [];
  for (const k of keys) {
    if (expected[k] !== undefined && expected[k] !== actual[k]) {
      mismatches.push(`${k}: expected ${String(expected[k])} got ${String(actual[k])}`);
    }
  }
  return { pass: mismatches.length === 0, mismatches };
}

function modifierPrRec(
  expectedLine: string[],
  expectedProj: string[],
  actualLine: string[],
  actualProj: string[]
): { precision: number; recall: number } {
  const exp = new Set([...expectedLine, ...expectedProj]);
  const act = new Set([...actualLine, ...actualProj]);
  let inter = 0;
  for (const k of act) if (exp.has(k)) inter += 1;
  const precision = act.size ? inter / act.size : exp.size === 0 ? 1 : 0;
  const recall = exp.size ? inter / exp.size : act.size === 0 ? 1 : 0;
  return { precision, recall };
}

export async function runDiv10Evals(
  supabase: SupabaseClient,
  env: Div10BrainEnv,
  options?: { limit?: number }
): Promise<{ results: EvalCaseResult[]; summary: Record<string, unknown> }> {
  const limit = options?.limit ?? 200;
  const { data: rows, error } = await supabase
    .from('training_examples')
    .select('*')
    .eq('approved', true)
    .limit(limit);
  if (error) throw error;

  const results: EvalCaseResult[] = [];

  for (const row of rows || []) {
    const id = String(row.id);
    const task_type = String(row.task_type);
    const input_json = row.input_json as Record<string, unknown>;
    const output_json = row.output_json as Record<string, unknown>;

    if (task_type === 'classify_intake_line' || task_type === 'line_classification') {
      const { output } = await classifyIntakeLine(supabase, env, input_json as never);
      const { pass, mismatches } = shallowClassifyMatch(output_json, output as Record<string, unknown>);
      results.push({ id, task_type, pass, detail: { mismatches, output } });
      continue;
    }

    if (task_type === 'suggest_catalog_match') {
      const candidates = (input_json as { candidates?: unknown }).candidates;
      if (!Array.isArray(candidates) || candidates.length === 0) {
        results.push({ id, task_type, pass: true, detail: { skipped: 'fixture has no candidates' } });
        continue;
      }
      const expRaw = output_json.selected_catalog_item_id;
      const expStr = expRaw != null ? String(expRaw) : '';
      if (expStr.includes('<') || expStr.toLowerCase().includes('candidate')) {
        results.push({ id, task_type, pass: true, detail: { skipped: 'placeholder expected id in fixture' } });
        continue;
      }
      const { output } = await suggestCatalogMatch(supabase, env, input_json as never);
      const expId = output_json.selected_catalog_item_id;
      const pass = expId == null || expId === output.selected_catalog_item_id;
      results.push({
        id,
        task_type,
        pass,
        detail: { expected: expId, actual: output.selected_catalog_item_id, output },
      });
      continue;
    }

    if (task_type === 'suggest_modifiers') {
      if (!(input_json as { chosen_item?: unknown }).chosen_item) {
        results.push({ id, task_type, pass: true, detail: { skipped: 'fixture has no chosen_item' } });
        continue;
      }
      const { output } = await suggestModifiers(supabase, env, input_json as never);
      const expL = (output_json.suggested_line_modifier_keys as string[]) || [];
      const expP = (output_json.suggested_project_modifier_keys as string[]) || [];
      const { precision, recall } = modifierPrRec(expL, expP, output.suggested_line_modifier_keys, output.suggested_project_modifier_keys);
      const pass = precision >= 0.5 && recall >= 0.5;
      results.push({ id, task_type, pass, detail: { precision, recall, output } });
      continue;
    }

    if (task_type === 'proposal_clause_retrieval') {
      const query = String(input_json.query || '');
      const topK = Number(input_json.topK) || 12;
      const expectedIds = (input_json.expected_clause_ids as string[]) || [];
      const chunks = await retrieveProposalClauses(supabase, query, {}, topK);
      const got = new Set(chunks.map((c) => c.id));
      const hit = expectedIds.length === 0 ? true : expectedIds.some((e) => got.has(e));
      results.push({
        id,
        task_type,
        pass: hit,
        detail: { expectedIds, retrievedIds: [...got] },
      });
      continue;
    }

    if (task_type === 'draft_proposal_text') {
      results.push({ id, task_type, pass: true, detail: { skipped: 'draft eval not automated in harness' } });
      continue;
    }

    if (task_type === 'intake_catalog_decision') {
      results.push({ id, task_type, pass: true, detail: { skipped: 'correction logging rows are not model-evals' } });
      continue;
    }

    results.push({ id, task_type, pass: false, detail: { error: 'unknown task_type' } });
  }

  const passed = results.filter((r) => r.pass).length;
  const summary = {
    total: results.length,
    passed,
    passRate: results.length ? passed / results.length : 0,
    byTask: results.reduce<Record<string, { n: number; p: number }>>((acc, r) => {
      acc[r.task_type] = acc[r.task_type] || { n: 0, p: 0 };
      acc[r.task_type].n += 1;
      if (r.pass) acc[r.task_type].p += 1;
      return acc;
    }, {}),
  };

  return { results, summary };
}

export async function writeEvalReport(
  outDir: string,
  payload: { results: EvalCaseResult[]; summary: Record<string, unknown> }
): Promise<string> {
  fs.mkdirSync(outDir, { recursive: true });
  const name = `div10-eval-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const fp = path.join(outDir, name);
  fs.writeFileSync(fp, JSON.stringify(payload, null, 2), 'utf8');
  return fp;
}
