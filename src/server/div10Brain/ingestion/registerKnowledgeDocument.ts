import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export type RegisterKnowledgeDocumentInput = {
  storage_bucket: string;
  storage_path: string;
  doc_type: string;
  title?: string | null;
  source_kind?: string | null;
  brand?: string | null;
  category?: string | null;
  subcategory?: string | null;
  project_type?: string | null;
  /** Optional checksum of remote file; if omitted, derived from bucket+path+title for idempotency stub */
  checksum?: string | null;
};

export async function registerKnowledgeDocument(
  supabase: SupabaseClient,
  input: RegisterKnowledgeDocumentInput
): Promise<{ id: string; skippedDuplicate: boolean }> {
  const checksum =
    input.checksum?.trim() ||
    createHash('sha256').update(`${input.storage_bucket}\n${input.storage_path}\n${input.title || ''}`).digest('hex');

  const { data: existing, error: selErr } = await supabase
    .from('knowledge_documents')
    .select('id, checksum, ingestion_status')
    .eq('storage_bucket', input.storage_bucket)
    .eq('storage_path', input.storage_path)
    .maybeSingle();
  if (selErr) throw selErr;
  if (existing && existing.checksum === checksum) {
    return { id: existing.id as string, skippedDuplicate: true };
  }

  const row = {
    storage_bucket: input.storage_bucket,
    storage_path: input.storage_path,
    doc_type: input.doc_type,
    title: input.title ?? null,
    source_kind: input.source_kind ?? null,
    brand: input.brand ?? null,
    category: input.category ?? null,
    subcategory: input.subcategory ?? null,
    project_type: input.project_type ?? null,
    checksum,
    ingestion_status: 'pending',
    ingestion_error: null as string | null,
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    const { data, error } = await supabase
      .from('knowledge_documents')
      .update({ ...row, ingestion_status: 'pending' })
      .eq('id', existing.id)
      .select('id')
      .single();
    if (error) throw error;
    return { id: data.id as string, skippedDuplicate: false };
  }

  const { data, error } = await supabase.from('knowledge_documents').insert(row).select('id').single();
  if (error) throw error;
  return { id: data.id as string, skippedDuplicate: false };
}
