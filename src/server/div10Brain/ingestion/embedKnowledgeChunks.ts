import OpenAI from 'openai';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Div10BrainEnv } from '../env.ts';

/**
 * Embeds chunks with null embeddings only (idempotent / resumable).
 */
export async function embedKnowledgeChunks(
  supabase: SupabaseClient,
  env: Div10BrainEnv,
  knowledge_document_id: string
): Promise<{ embedded: number }> {
  const client = new OpenAI({ apiKey: env.openaiApiKey });
  const { data: chunks, error } = await supabase
    .from('knowledge_chunks')
    .select('id, chunk_text')
    .eq('knowledge_document_id', knowledge_document_id)
    .is('embedding', null);
  if (error) throw error;
  if (!chunks?.length) return { embedded: 0 };

  let embedded = 0;
  const batchSize = 16;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const inputs = batch.map((c) => String(c.chunk_text || '').slice(0, 8000));
    const res = await client.embeddings.create({
      model: env.openaiEmbeddingModel,
      input: inputs,
    });
    for (let j = 0; j < batch.length; j++) {
      const vec = res.data[j]?.embedding;
      if (!vec) continue;
      const embeddingLiteral = `[${vec.join(',')}]`;
      const { error: upErr } = await supabase
        .from('knowledge_chunks')
        .update({ embedding: embeddingLiteral as unknown as number[] })
        .eq('id', batch[j].id as string);
      if (!upErr) embedded += 1;
    }
  }

  await supabase
    .from('knowledge_documents')
    .update({ ingestion_status: 'ready', ingestion_error: null, updated_at: new Date().toISOString() })
    .eq('id', knowledge_document_id);

  return { embedded };
}
