import { Router, type Response } from 'express';
import { getSupabaseAdmin } from '../../div10Brain/supabaseAdmin.ts';
import type { Div10BrainLocals } from '../../div10Brain/auth/requireDiv10BrainAdmin.ts';
import type { Div10BrainEnv } from '../../div10Brain/env.ts';
import { registerKnowledgeDocument } from '../../div10Brain/ingestion/registerKnowledgeDocument.ts';
import { processKnowledgeDocument } from '../../div10Brain/ingestion/processKnowledgeDocument.ts';
import {
  retrieveKnowledge,
  retrieveCatalogExamples,
  retrieveProposalClauses,
  retrieveEstimateExamples,
} from '../../div10Brain/retrieval/retrieveKnowledge.ts';
import { classifyIntakeLine } from '../../div10Brain/ai/classifyIntakeLine.ts';
import { suggestCatalogMatch } from '../../div10Brain/ai/suggestCatalogMatch.ts';
import { suggestModifiers } from '../../div10Brain/ai/suggestModifiers.ts';
import { draftProposalText } from '../../div10Brain/ai/draftProposalText.ts';
import { getErrorMessage } from '../../../shared/utils/errorMessage.ts';

export const div10BrainRouter = Router();

function envFromRes(res: Response): Div10BrainEnv {
  const locals = res.locals as Div10BrainLocals;
  if (!locals.div10BrainEnv) throw new Error('div10BrainEnv missing on response locals');
  return locals.div10BrainEnv;
}

div10BrainRouter.get('/documents', async (_req, res) => {
  try {
    const env = envFromRes(res);
    const supabase = getSupabaseAdmin(env);
    const { data, error } = await supabase
      .from('knowledge_documents')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    const docs = data || [];
    const withCounts = await Promise.all(
      docs.map(async (d: { id: string }) => {
        const { count, error: cErr } = await supabase
          .from('knowledge_chunks')
          .select('*', { count: 'exact', head: true })
          .eq('knowledge_document_id', d.id);
        if (cErr) return { ...d, chunk_count: null as number | null };
        return { ...d, chunk_count: count ?? 0 };
      })
    );
    res.json({ data: withCounts });
  } catch (e: unknown) {
    res.status(500).json({ error: getErrorMessage(e, 'List documents failed.') });
  }
});

div10BrainRouter.get('/documents/:id', async (req, res) => {
  try {
    const env = envFromRes(res);
    const supabase = getSupabaseAdmin(env);
    const id = String(req.params.id || '');
    const { data: doc, error } = await supabase.from('knowledge_documents').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!doc) return res.status(404).json({ error: 'Not found' });
    const { count } = await supabase
      .from('knowledge_chunks')
      .select('*', { count: 'exact', head: true })
      .eq('knowledge_document_id', id);
    res.json({ data: { ...doc, chunk_count: count ?? 0 } });
  } catch (e: unknown) {
    res.status(500).json({ error: getErrorMessage(e, 'Get document failed.') });
  }
});

div10BrainRouter.post('/documents/register', async (req, res) => {
  try {
    const env = envFromRes(res);
    const supabase = getSupabaseAdmin(env);
    const body = req.body || {};
    const storage_bucket = String(body.storage_bucket || '').trim();
    const storage_path = String(body.storage_path || '').trim();
    if (!storage_bucket || !storage_path) {
      return res.status(400).json({ error: 'storage_bucket and storage_path are required.' });
    }
    const result = await registerKnowledgeDocument(supabase, {
      storage_bucket,
      storage_path,
      doc_type: String(body.doc_type || 'reference').trim() || 'reference',
      title: body.title ?? null,
      source_kind: body.source_kind ?? null,
      brand: body.brand ?? null,
      category: body.category ?? null,
      subcategory: body.subcategory ?? null,
      project_type: body.project_type ?? null,
      checksum: body.checksum != null ? String(body.checksum) : null,
    });
    res.json({ data: result });
  } catch (e: unknown) {
    res.status(500).json({ error: getErrorMessage(e, 'Register document failed.') });
  }
});

div10BrainRouter.post('/documents/:id/process', async (req, res) => {
  try {
    const env = envFromRes(res);
    const supabase = getSupabaseAdmin(env);
    const id = String(req.params.id || '');
    const body = req.body || {};
    const out = await processKnowledgeDocument(supabase, env, id, {
      extractedTextOverride: body.extractedText != null ? String(body.extractedText) : undefined,
      mimeTypeOverride: body.mimeType != null ? String(body.mimeType) : undefined,
    });
    res.json({ data: out });
  } catch (e: unknown) {
    res.status(500).json({ error: getErrorMessage(e, 'Process document failed.') });
  }
});

div10BrainRouter.post('/retrieve/knowledge', async (req, res) => {
  try {
    const env = envFromRes(res);
    const supabase = getSupabaseAdmin(env);
    const body = req.body || {};
    const query = String(body.query || '').trim();
    if (!query) return res.status(400).json({ error: 'query is required.' });
    const topK = Math.min(50, Math.max(1, Number(body.topK) || 12));
    const filters = (body.filters || {}) as Record<string, string | boolean | undefined>;
    const rows = await retrieveKnowledge(
      supabase,
      env,
      query,
      {
        doc_type: filters.doc_type as string | undefined,
        category: filters.category as string | undefined,
        brand: filters.brand as string | undefined,
        active: filters.active as boolean | undefined,
      },
      topK
    );
    res.json({ data: rows });
  } catch (e: unknown) {
    res.status(500).json({ error: getErrorMessage(e, 'Retrieve knowledge failed.') });
  }
});

div10BrainRouter.post('/retrieve/catalog-examples', async (req, res) => {
  try {
    const env = envFromRes(res);
    const supabase = getSupabaseAdmin(env);
    const body = req.body || {};
    const query = String(body.query || '').trim();
    const topK = Math.min(50, Math.max(1, Number(body.topK) || 12));
    const rows = await retrieveCatalogExamples(supabase, query, (body.filters || {}) as never, topK);
    res.json({ data: rows });
  } catch (e: unknown) {
    res.status(500).json({ error: getErrorMessage(e, 'Retrieve catalog examples failed.') });
  }
});

div10BrainRouter.post('/retrieve/proposal-clauses', async (req, res) => {
  try {
    const env = envFromRes(res);
    const supabase = getSupabaseAdmin(env);
    const body = req.body || {};
    const query = String(body.query || '').trim();
    const topK = Math.min(50, Math.max(1, Number(body.topK) || 12));
    const rows = await retrieveProposalClauses(supabase, query, (body.filters || {}) as never, topK);
    res.json({ data: rows });
  } catch (e: unknown) {
    res.status(500).json({ error: getErrorMessage(e, 'Retrieve proposal clauses failed.') });
  }
});

div10BrainRouter.post('/retrieve/estimate-examples', async (req, res) => {
  try {
    const env = envFromRes(res);
    const supabase = getSupabaseAdmin(env);
    const body = req.body || {};
    const query = String(body.query || '').trim();
    const topK = Math.min(50, Math.max(1, Number(body.topK) || 12));
    const rows = await retrieveEstimateExamples(supabase, query, (body.filters || {}) as never, topK);
    res.json({ data: rows });
  } catch (e: unknown) {
    res.status(500).json({ error: getErrorMessage(e, 'Retrieve estimate examples failed.') });
  }
});

div10BrainRouter.post('/ai/classify-intake-line', async (req, res) => {
  try {
    const env = envFromRes(res);
    const supabase = getSupabaseAdmin(env);
    const body = req.body || {};
    const line_text = String(body.line_text || '').trim();
    if (!line_text) return res.status(400).json({ error: 'line_text is required.' });
    const result = await classifyIntakeLine(supabase, env, {
      line_text,
      nearby_lines: Array.isArray(body.nearby_lines) ? body.nearby_lines.map(String) : undefined,
      section_header: body.section_header != null ? String(body.section_header) : undefined,
      project_context: typeof body.project_context === 'object' && body.project_context ? body.project_context : undefined,
      topKKnowledge: body.topK != null ? Number(body.topK) : undefined,
    });
    res.json({ data: result });
  } catch (e: unknown) {
    res.status(500).json({ error: getErrorMessage(e, 'classifyIntakeLine failed.') });
  }
});

div10BrainRouter.post('/ai/suggest-catalog-match', async (req, res) => {
  try {
    const env = envFromRes(res);
    const supabase = getSupabaseAdmin(env);
    const body = req.body || {};
    const line_text = String(body.line_text || '').trim();
    const candidates = Array.isArray(body.candidates) ? body.candidates : [];
    if (!line_text) return res.status(400).json({ error: 'line_text is required.' });
    const result = await suggestCatalogMatch(supabase, env, {
      line_text,
      candidates,
      project_context: typeof body.project_context === 'object' && body.project_context ? body.project_context : undefined,
    });
    res.json({ data: result });
  } catch (e: unknown) {
    res.status(500).json({ error: getErrorMessage(e, 'suggestCatalogMatch failed.') });
  }
});

div10BrainRouter.post('/ai/suggest-modifiers', async (req, res) => {
  try {
    const env = envFromRes(res);
    const supabase = getSupabaseAdmin(env);
    const body = req.body || {};
    const line_text = String(body.line_text || '').trim();
    const chosen_item = body.chosen_item;
    if (!line_text || !chosen_item || typeof chosen_item !== 'object') {
      return res.status(400).json({ error: 'line_text and chosen_item are required.' });
    }
    const result = await suggestModifiers(supabase, env, {
      line_text,
      chosen_item: chosen_item as never,
      project_conditions:
        typeof body.project_conditions === 'object' && body.project_conditions ? body.project_conditions : undefined,
    });
    res.json({ data: result });
  } catch (e: unknown) {
    res.status(500).json({ error: getErrorMessage(e, 'suggestModifiers failed.') });
  }
});

div10BrainRouter.post('/ai/draft-proposal', async (req, res) => {
  try {
    const env = envFromRes(res);
    const supabase = getSupabaseAdmin(env);
    const body = req.body || {};
    const approved_rows = Array.isArray(body.approved_rows) ? body.approved_rows : [];
    const project_metadata =
      typeof body.project_metadata === 'object' && body.project_metadata ? body.project_metadata : {};
    const pricing_mode = String(body.pricing_mode || 'standard').trim() || 'standard';
    const result = await draftProposalText(supabase, env, {
      approved_rows,
      project_metadata,
      pricing_mode,
      retrieval_query: body.retrieval_query != null ? String(body.retrieval_query) : undefined,
    });
    res.json({ data: result });
  } catch (e: unknown) {
    res.status(500).json({ error: getErrorMessage(e, 'draftProposalText failed.') });
  }
});

div10BrainRouter.get('/ai/logs', async (req, res) => {
  try {
    const env = envFromRes(res);
    const supabase = getSupabaseAdmin(env);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const { data, error } = await supabase
      .from('ai_run_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    res.json({ data: data || [] });
  } catch (e: unknown) {
    res.status(500).json({ error: getErrorMessage(e, 'List ai_run_logs failed.') });
  }
});

div10BrainRouter.get('/training/examples', async (req, res) => {
  try {
    const env = envFromRes(res);
    const supabase = getSupabaseAdmin(env);
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
    const approvedOnly = String(req.query.approved || '').toLowerCase() === '1' || String(req.query.approved || '').toLowerCase() === 'true';
    let q = supabase.from('training_examples').select('*').order('created_at', { ascending: false }).limit(limit);
    if (approvedOnly) q = q.eq('approved', true);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ data: data || [] });
  } catch (e: unknown) {
    res.status(500).json({ error: getErrorMessage(e, 'List training_examples failed.') });
  }
});

div10BrainRouter.patch('/training/examples/:id', async (req, res) => {
  try {
    const env = envFromRes(res);
    const supabase = getSupabaseAdmin(env);
    const id = String(req.params.id || '');
    const approved = req.body?.approved;
    if (typeof approved !== 'boolean') {
      return res.status(400).json({ error: 'approved boolean is required.' });
    }
    const { data, error } = await supabase
      .from('training_examples')
      .update({ approved, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, approved')
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Not found' });
    res.json({ data });
  } catch (e: unknown) {
    res.status(500).json({ error: getErrorMessage(e, 'Update training example failed.') });
  }
});

div10BrainRouter.get('/training/export.jsonl', async (_req, res) => {
  try {
    const env = envFromRes(res);
    const supabase = getSupabaseAdmin(env);
    const { data, error } = await supabase.from('training_examples').select('*').eq('approved', true);
    if (error) throw error;
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="training-approved.jsonl"');
    for (const row of data || []) {
      res.write(`${JSON.stringify(row)}\n`);
    }
    res.end();
  } catch (e: unknown) {
    res.status(500).json({ error: getErrorMessage(e, 'Export training failed.') });
  }
});
