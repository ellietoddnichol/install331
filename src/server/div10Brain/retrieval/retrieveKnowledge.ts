import OpenAI from 'openai';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Div10BrainEnv } from '../env.ts';
import type { RetrievedContextBlock } from '../../../shared/schemas/div10Brain/aiOutputs.ts';

export type RetrievalFilters = {
  doc_type?: string;
  category?: string;
  brand?: string;
  active?: boolean;
};

/** PostgREST `or` filter: comma-separated predicates; quote values that contain `%` or spaces. */
export function buildIlikeOrFilter(columns: string[], rawQuery: string): string {
  const safe = rawQuery.replace(/%/g, '').replace(/,/g, ' ').replace(/"/g, '').trim().slice(0, 160);
  if (!safe) return `${columns[0]}.eq.__div10_brain_empty_query__`;
  const pattern = `%${safe}%`;
  const escaped = pattern.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return columns.map((c) => `${c}.ilike."${escaped}"`).join(',');
}

function normalizeRow(
  id: string,
  text: string,
  source_label: string,
  metadata: Record<string, unknown>,
  score: number
): RetrievedContextBlock {
  return { id, text, source_label, metadata, score };
}

export async function retrieveKnowledge(
  supabase: SupabaseClient,
  env: Div10BrainEnv,
  query: string,
  filters: RetrievalFilters,
  topK: number
): Promise<RetrievedContextBlock[]> {
  const client = new OpenAI({ apiKey: env.openaiApiKey });
  const emb = await client.embeddings.create({
    model: env.openaiEmbeddingModel,
    input: query.slice(0, 8000),
  });
  const vector = emb.data[0]?.embedding;
  if (!vector) return [];

  const { data, error } = await supabase.rpc('match_knowledge_chunks', {
    query_embedding: vector,
    match_count: topK,
    filter_doc_type: filters.doc_type ?? null,
    filter_category: filters.category ?? null,
    filter_brand: filters.brand ?? null,
    filter_active: filters.active ?? true,
  });
  if (error) throw error;
  const rows = (data || []) as Array<{
    chunk_id: string;
    document_id: string;
    chunk_text: string;
    chunk_title: string | null;
    metadata: Record<string, unknown>;
    similarity: number;
  }>;
  return rows.map((r) =>
    normalizeRow(
      r.chunk_id,
      r.chunk_text,
      `knowledge_chunk:${r.document_id}:${r.chunk_title || 'untitled'}`,
      { ...r.metadata, document_id: r.document_id, chunk_title: r.chunk_title },
      Number(r.similarity) || 0
    )
  );
}

export async function retrieveCatalogExamples(
  supabase: SupabaseClient,
  query: string,
  filters: { category?: string; brand?: string; active?: boolean },
  topK: number
): Promise<RetrievedContextBlock[]> {
  let q = supabase.from('catalog_items').select('id, sku, brand, category, description, normalized_name').limit(topK);
  if (filters.active !== false) q = q.eq('active', true);
  if (filters.category) q = q.eq('category', filters.category);
  if (filters.brand) q = q.eq('brand', filters.brand);
  const needle = `%${query.replace(/%/g, '').slice(0, 80)}%`;
  q = q.or(`description.ilike.${needle},sku.ilike.${needle},normalized_name.ilike.${needle}`);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map((row: Record<string, unknown>, i: number) =>
    normalizeRow(
      String(row.id),
      `${row.sku} · ${row.description || row.normalized_name}`,
      `catalog_item:${row.sku}`,
      row as Record<string, unknown>,
      1 - i * 0.01
    )
  );
}

export async function retrieveProposalClauses(
  supabase: SupabaseClient,
  query: string,
  filters: { clause_type?: string; active?: boolean },
  topK: number
): Promise<RetrievedContextBlock[]> {
  let q = supabase.from('proposal_clauses').select('id, clause_type, title, body, applicable_categories').limit(topK);
  if (filters.active !== false) q = q.eq('active', true);
  if (filters.clause_type) q = q.eq('clause_type', filters.clause_type);
  q = q.or(buildIlikeOrFilter(['body', 'title'], query));
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map((row: Record<string, unknown>, i: number) =>
    normalizeRow(String(row.id), String(row.body || ''), `proposal_clause:${row.clause_type}`, row as Record<string, unknown>, 1 - i * 0.01)
  );
}

export async function retrieveEstimateExamples(
  supabase: SupabaseClient,
  query: string,
  _filters: Record<string, unknown>,
  topK: number
): Promise<RetrievedContextBlock[]> {
  const { data, error } = await supabase
    .from('estimate_examples')
    .select('id, raw_line_text, normalized_line_text, review_outcome, chosen_catalog_item_id')
    .or(buildIlikeOrFilter(['raw_line_text', 'normalized_line_text'], query))
    .limit(topK);
  if (error) throw error;
  return (data || []).map((row: Record<string, unknown>, i: number) =>
    normalizeRow(
      String(row.id),
      String(row.raw_line_text || ''),
      `estimate_example:${row.review_outcome || 'unknown'}`,
      row as Record<string, unknown>,
      1 - i * 0.01
    )
  );
}
