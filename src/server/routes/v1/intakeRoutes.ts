import { createHash } from 'crypto';
import { Router } from 'express';
import * as xlsx from 'xlsx';
import { extractIntakeFromGemini } from '../../services/geminiIntakeExtraction.ts';
import { parseUploadedIntake } from '../../services/parseRouterService.ts';
import { listCatalogItemsForApi } from '../../repos/catalogRepo.ts';
import { readDiv10BrainEnv } from '../../div10Brain/env.ts';
import { getSupabaseAdmin } from '../../div10Brain/supabaseAdmin.ts';
import { getErrorMessage } from '../../../shared/utils/errorMessage.ts';
import { upsertIntakeReviewOverride } from '../../repos/intakeReviewOverridesRepo.ts';

export const intakeRouter = Router();

intakeRouter.get('/templates/preferred-import.xlsx', (_req, res) => {
  const wb = xlsx.utils.book_new();

  // Single-project template: metadata block + item table.
  const importAoa: Array<Array<string | number>> = [
    ['Preferred Import Template (Single Project)'],
    [],
    ['Project Name', ''],
    ['Project Number', ''],
    ['Client', ''],
    ['Address', ''],
    ['Bid Date', ''],
    [],
    ['Items (minimum per row: Item Code + Quantity)'],
    [],
    // NOTE: Header text here is intentionally exact — the server parser detects this template by these headers.
    ['Item Code', 'Quantity', 'Room', 'Bid Bucket', 'Description (only if Item Code is blank)', 'Notes'],
    ['PT-HDPE-36', 2, 'Restroom A', 'Base Bid', '', 'Replace with your notes'],
    ['', 1, '', '', 'Manual item description (when SKU is unknown)', ''],
  ];

  const wsImport = xlsx.utils.aoa_to_sheet(importAoa);
  wsImport['!cols'] = [{ wch: 18 }, { wch: 10 }, { wch: 18 }, { wch: 14 }, { wch: 42 }, { wch: 28 }];
  xlsx.utils.book_append_sheet(wb, wsImport, 'Import');

  // Catalog helper sheet (active items) so users can copy/paste valid SKUs.
  const catalog = listCatalogItemsForApi(false);
  const catalogAoa: Array<Array<string | number>> = [
    ['Item Code', 'Description', 'Category', 'Manufacturer', 'Unit'],
    ...catalog.map((i) => [i.sku || '', i.description || '', i.category || '', i.manufacturer || '', i.uom || 'EA']),
  ];
  const wsCatalog = xlsx.utils.aoa_to_sheet(catalogAoa);
  wsCatalog['!cols'] = [{ wch: 18 }, { wch: 54 }, { wch: 22 }, { wch: 18 }, { wch: 8 }];
  xlsx.utils.book_append_sheet(wb, wsCatalog, 'Catalog');

  const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="preferred-intake-import-template.xlsx"');
  return res.send(buf);
});

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

/** Durable, local (SQLite) persistence for intake review decisions (e.g. ignored lines). */
intakeRouter.post('/review-override', (req, res) => {
  const body = req.body || {};
  const fingerprint = String(body.reviewLineFingerprint || '').trim();
  const contentKey = body.reviewLineContentKey != null ? String(body.reviewLineContentKey).trim() : '';
  const status = String(body.status || '').trim();
  if (!fingerprint || status !== 'ignored') {
    return res.status(400).json({ error: 'reviewLineFingerprint and status=ignored are required.' });
  }
  upsertIntakeReviewOverride({
    reviewLineFingerprint: fingerprint,
    status: 'ignored',
    reviewLineContentKey: contentKey || null,
  });
  return res.json({ data: { ok: true } });
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
