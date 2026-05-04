import type { SupabaseClient } from '@supabase/supabase-js';
import type { Div10BrainEnv } from '../env.ts';
import { extractDocumentText } from './extractDocumentText.ts';
import { chunkKnowledgeDocument } from './chunkKnowledgeDocument.ts';
import { embedKnowledgeChunks } from './embedKnowledgeChunks.ts';

function guessMime(storagePath: string): string {
  const lower = storagePath.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (lower.endsWith('.xls')) return 'application/vnd.ms-excel';
  if (lower.endsWith('.csv')) return 'text/csv';
  if (lower.endsWith('.txt')) return 'text/plain';
  return 'application/octet-stream';
}

/**
 * Idempotent embedding (embedKnowledgeChunks only fills null vectors).
 * Chunking replaces all chunks for the document (re-run = full re-chunk + re-embed nulls).
 */
export async function processKnowledgeDocument(
  supabase: SupabaseClient,
  env: Div10BrainEnv,
  knowledge_document_id: string,
  options?: { extractedTextOverride?: string; mimeTypeOverride?: string }
): Promise<{ chunkCount: number; embedded: number }> {
  const { data: doc, error } = await supabase
    .from('knowledge_documents')
    .select(
      'id, storage_bucket, storage_path, doc_type, title, brand, category, subcategory, project_type, source_kind'
    )
    .eq('id', knowledge_document_id)
    .single();
  if (error || !doc) throw new Error(error?.message || 'knowledge document not found');

  const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

  await supabase
    .from('knowledge_documents')
    .update({
      ingestion_status: 'processing',
      ingestion_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', knowledge_document_id);

  try {
    let rawText: string;
    if (options?.extractedTextOverride != null) {
      rawText = options.extractedTextOverride;
    } else {
      const { data: file, error: dlErr } = await supabase.storage
        .from(String(doc.storage_bucket))
        .download(String(doc.storage_path));
      if (dlErr || !file) throw new Error(dlErr?.message || 'storage download failed');
      const buffer = Buffer.from(await file.arrayBuffer());
      const mime = options?.mimeTypeOverride || guessMime(String(doc.storage_path));
      const extracted = await extractDocumentText(buffer, mime);
      rawText = extracted.rawText;
    }

    const { chunkCount } = await chunkKnowledgeDocument(supabase, {
      knowledge_document_id,
      extractedText: rawText,
      meta: {
        storage_bucket: String(doc.storage_bucket),
        storage_path: String(doc.storage_path),
        doc_type: String(doc.doc_type),
        title: doc.title as string | null,
        brand: doc.brand as string | null,
        category: doc.category as string | null,
        subcategory: doc.subcategory as string | null,
        project_type: doc.project_type as string | null,
        page_start: null,
        page_end: null,
      },
    });

    const { embedded } = await embedKnowledgeChunks(supabase, env, knowledge_document_id);
    return { chunkCount, embedded };
  } catch (e: unknown) {
    await supabase
      .from('knowledge_documents')
      .update({
        ingestion_status: 'failed',
        ingestion_error: errMsg(e),
        updated_at: new Date().toISOString(),
      })
      .eq('id', knowledge_document_id);
    throw e;
  }
}
