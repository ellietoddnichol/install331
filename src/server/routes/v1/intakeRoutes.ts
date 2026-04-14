import { createHash } from 'crypto';
import { Router } from 'express';
import { extractIntakeFromGemini } from '../../services/geminiIntakeExtraction.ts';
import { parseUploadedIntake } from '../../services/parseRouterService.ts';
import { readDiv10BrainEnv } from '../../div10Brain/env.ts';
import { getSupabaseAdmin } from '../../div10Brain/supabaseAdmin.ts';
import { getErrorMessage } from '../../../shared/utils/errorMessage.ts';

export const intakeRouter = Router();

intakeRouter.post('/parse', async (req, res) => {
  try {
    const fileName = String(req.body?.fileName || '').trim();
    const mimeType = String(req.body?.mimeType || 'application/octet-stream').trim() || 'application/octet-stream';
    const sourceType = req.body?.sourceType ? String(req.body.sourceType).trim() as 'pdf' | 'document' | 'spreadsheet' : undefined;
    const dataBase64 = req.body?.dataBase64 ? String(req.body.dataBase64) : undefined;
    const extractedText = req.body?.extractedText ? String(req.body.extractedText) : undefined;
    const matchCatalog = req.body?.matchCatalog !== false;

    if (!fileName) {
      return res.status(400).json({ error: 'fileName is required.' });
    }

    const result = await parseUploadedIntake({
      fileName,
      mimeType,
      sourceType,
      dataBase64,
      extractedText,
      matchCatalog,
    });

    return res.json({ data: result });
  } catch (error: unknown) {
    return res.status(500).json({ error: getErrorMessage(error, 'Intake parsing failed.') });
  }
});

/**
 * Records estimator decisions against Div 10 Brain suggestions for future training (optional Supabase).
 * Idempotent per (fingerprint, action, finalCatalogId) within a short window via content hash in source_ref.
 */
intakeRouter.post('/div10-training-capture', async (req, res) => {
  try {
    const env = readDiv10BrainEnv();
    if (!env) {
      return res.status(503).json({ error: 'Div 10 Brain is not configured.' });
    }
    const body = req.body || {};
    const fingerprint = String(body.reviewLineFingerprint || '').trim();
    const action = String(body.action || '').trim() as 'accepted' | 'replaced' | 'ignored';
    if (!fingerprint || !['accepted', 'replaced', 'ignored'].includes(action)) {
      return res.status(400).json({ error: 'reviewLineFingerprint and action (accepted|replaced|ignored) are required.' });
    }
    const finalCatalogItemId = body.finalCatalogItemId != null ? String(body.finalCatalogItemId) : null;
    const div10Payload = body.div10BrainSnapshot ?? null;
    const lineText = String(body.lineText || '').trim();
    const input_json = {
      reviewLineFingerprint: fingerprint,
      line_text: lineText,
      div10BrainSnapshot: div10Payload,
      deterministicSuggestedId: body.deterministicSuggestedId != null ? String(body.deterministicSuggestedId) : null,
    };
    const output_json = {
      action,
      finalCatalogItemId,
    };
    const hash = createHash('sha256')
      .update(`${fingerprint}|${action}|${finalCatalogItemId || ''}|${lineText.slice(0, 120)}`)
      .digest('hex')
      .slice(0, 24);
    const source_ref = `intake_correction:${hash}`;
    const supabase = getSupabaseAdmin(env);
    const { data: existing } = await supabase.from('training_examples').select('id').eq('source_ref', source_ref).maybeSingle();
    if (existing?.id) {
      return res.json({ data: { ok: true, deduped: true } });
    }
    const { error } = await supabase.from('training_examples').insert({
      task_type: 'intake_catalog_decision',
      input_json,
      output_json,
      approved: false,
      source_ref,
    });
    if (error) throw error;
    return res.json({ data: { ok: true, deduped: false } });
  } catch (error: unknown) {
    return res.status(500).json({ error: getErrorMessage(error, 'Training capture failed.') });
  }
});

intakeRouter.post('/extract', async (req, res) => {
  try {
    const fileName = String(req.body?.fileName || '').trim();
    const mimeType = String(req.body?.mimeType || 'application/octet-stream').trim() || 'application/octet-stream';
    const sourceType = String(req.body?.sourceType || '').trim() as 'pdf' | 'document' | 'spreadsheet';
    const dataBase64 = req.body?.dataBase64 ? String(req.body.dataBase64) : undefined;
    const extractedText = req.body?.extractedText ? String(req.body.extractedText) : undefined;
    const normalizedRows = Array.isArray(req.body?.normalizedRows) ? req.body.normalizedRows : undefined;

    if (!fileName || !sourceType) {
      return res.status(400).json({ error: 'fileName and sourceType are required.' });
    }

    if (!['pdf', 'document', 'spreadsheet'].includes(sourceType)) {
      return res.status(400).json({ error: 'sourceType must be pdf, document, or spreadsheet.' });
    }

    if (sourceType === 'pdf' && !dataBase64) {
      return res.status(400).json({ error: 'dataBase64 is required for PDF extraction.' });
    }

    const result = await extractIntakeFromGemini({
      fileName,
      mimeType,
      sourceType,
      dataBase64,
      extractedText,
      normalizedRows,
    });

    return res.json({ data: result });
  } catch (error: unknown) {
    return res.status(500).json({ error: getErrorMessage(error, 'Gemini extraction failed.') });
  }
});
