import { Router } from 'express';
import { extractIntakeFromGemini } from '../../services/geminiIntakeExtraction.ts';
import { parseUploadedIntake } from '../../services/parseRouterService.ts';

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
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Intake parsing failed.' });
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
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Gemini extraction failed.' });
  }
});
