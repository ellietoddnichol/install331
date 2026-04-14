import type { SupabaseClient } from '@supabase/supabase-js';

const MAX_CHARS = 1200;
const OVERLAP = 150;

export type ChunkKnowledgeMeta = {
  storage_bucket: string;
  storage_path: string;
  doc_type: string;
  title?: string | null;
  brand?: string | null;
  category?: string | null;
  subcategory?: string | null;
  project_type?: string | null;
  page_start?: number | null;
  page_end?: number | null;
};

function splitParagraphs(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];
  return normalized.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
}

function windowChunks(text: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    const end = Math.min(text.length, i + MAX_CHARS);
    out.push(text.slice(i, end).trim());
    if (end >= text.length) break;
    i = Math.max(end - OVERLAP, i + 1);
  }
  return out.filter(Boolean);
}

/**
 * Idempotent: deletes existing chunks for the document then inserts new rows (no embeddings yet).
 */
export async function chunkKnowledgeDocument(
  supabase: SupabaseClient,
  input: {
    knowledge_document_id: string;
    extractedText: string;
    meta: ChunkKnowledgeMeta;
  }
): Promise<{ chunkCount: number }> {
  const headings = splitParagraphs(input.extractedText);
  const pieces: { title: string | null; body: string }[] = [];
  if (headings.length > 1) {
    for (const h of headings) {
      const lines = h.split('\n');
      const maybeTitle = lines[0].length < 120 ? lines[0] : null;
      const body = maybeTitle ? lines.slice(1).join('\n').trim() || h : h;
      pieces.push({ title: maybeTitle, body: body.length > MAX_CHARS ? body.slice(0, MAX_CHARS) + '…' : body });
    }
  } else {
    for (const w of windowChunks(input.extractedText)) {
      pieces.push({ title: null, body: w });
    }
  }

  await supabase.from('knowledge_chunks').delete().eq('knowledge_document_id', input.knowledge_document_id);

  const rows = pieces.map((p, chunk_index) => ({
    knowledge_document_id: input.knowledge_document_id,
    chunk_index,
    chunk_text: p.body,
    chunk_title: p.title,
    metadata: {
      document_id: input.knowledge_document_id,
      doc_type: input.meta.doc_type,
      title: input.meta.title,
      brand: input.meta.brand,
      category: input.meta.category,
      subcategory: input.meta.subcategory,
      project_type: input.meta.project_type,
      storage_bucket: input.meta.storage_bucket,
      storage_path: input.meta.storage_path,
      active: true,
      page_start: input.meta.page_start,
      page_end: input.meta.page_end,
    },
  }));

  if (rows.length) {
    const { error } = await supabase.from('knowledge_chunks').insert(rows);
    if (error) throw error;
  }

  await supabase
    .from('knowledge_documents')
    .update({ updated_at: new Date().toISOString(), ingestion_status: 'chunked' })
    .eq('id', input.knowledge_document_id);

  return { chunkCount: rows.length };
}
