import { Router } from 'express';
import { getProject } from '../../repos/projectsRepo.ts';
import { getProjectFromSheets } from '../../repos/sheetsProjectsRepo.ts';
import {
  createSourceQuote,
  createSourceQuoteLine,
  createSourceQuoteLinesBulk,
  deleteSourceQuote,
  deleteSourceQuoteLine,
  getSourceQuote,
  importSelectedQuoteLinesToEstimate,
  listSourceQuoteLines,
  listSourceQuotes,
  updateSourceQuote,
  updateSourceQuoteLine,
} from '../../repos/sourceQuotesRepo.ts';
import {
  createSourceQuoteInSheets,
  createSourceQuoteLineInSheets,
  createSourceQuoteLinesBulkInSheets,
  deleteSourceQuoteInSheets,
  deleteSourceQuoteLineInSheets,
  getSourceQuoteFromSheets,
  importSelectedQuoteLinesToEstimateInSheets,
  listSourceQuoteLinesFromSheets,
  listSourceQuotesFromSheets,
  promoteSourceQuoteLinesToCatalogCandidates,
  updateSourceQuoteInSheets,
  updateSourceQuoteLineInSheets,
} from '../../repos/sheetsQuotesRepo.ts';
import { isSheetsDataBackend } from '../../repos/dataBackend.ts';
import { extractSourceQuoteFromAttachedFile } from '../../services/quoteSourceExtractionService.ts';

export const quotesRouter = Router();

quotesRouter.get('/', async (req, res) => {
  const projectId = String(req.query.projectId || '').trim();
  if (!projectId) {
    return res.status(400).json({ error: 'projectId is required' });
  }
  const data = isSheetsDataBackend()
    ? await listSourceQuotesFromSheets(projectId)
    : await listSourceQuotes(projectId);
  return res.json({ data });
});

quotesRouter.post('/', async (req, res) => {
  const projectId = String(req.body?.projectId || '').trim();
  const vendorName = String(req.body?.vendorName || '').trim();
  if (!projectId || !vendorName) {
    return res.status(400).json({ error: 'projectId and vendorName are required' });
  }
  const project = isSheetsDataBackend()
    ? await getProjectFromSheets(projectId)
    : await getProject(projectId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }
  const created = isSheetsDataBackend()
    ? await createSourceQuoteInSheets(req.body)
    : await createSourceQuote(req.body);
  return res.status(201).json({ data: created });
});

quotesRouter.put('/:quoteId', async (req, res) => {
  const updated = isSheetsDataBackend()
    ? await updateSourceQuoteInSheets(req.params.quoteId, req.body ?? {})
    : await updateSourceQuote(req.params.quoteId, req.body ?? {});
  if (!updated) {
    return res.status(404).json({ error: 'Quote not found' });
  }
  return res.json({ data: updated });
});

quotesRouter.delete('/:quoteId', async (req, res) => {
  const deleted = isSheetsDataBackend()
    ? await deleteSourceQuoteInSheets(req.params.quoteId)
    : await deleteSourceQuote(req.params.quoteId);
  if (!deleted) {
    return res.status(404).json({ error: 'Quote not found' });
  }
  return res.json({ data: { deleted: true } });
});

quotesRouter.get('/:quoteId/lines', async (req, res) => {
  const quote = isSheetsDataBackend()
    ? await getSourceQuoteFromSheets(req.params.quoteId)
    : await getSourceQuote(req.params.quoteId);
  if (!quote) {
    return res.status(404).json({ error: 'Quote not found' });
  }
  const rows = isSheetsDataBackend()
    ? await listSourceQuoteLinesFromSheets(req.params.quoteId)
    : await listSourceQuoteLines(req.params.quoteId);
  return res.json({ data: rows });
});

quotesRouter.post('/:quoteId/lines', async (req, res) => {
  const quote = isSheetsDataBackend()
    ? await getSourceQuoteFromSheets(req.params.quoteId)
    : await getSourceQuote(req.params.quoteId);
  if (!quote) {
    return res.status(404).json({ error: 'Quote not found' });
  }
  const rawDescription = String(req.body?.rawDescription || '').trim();
  if (!rawDescription) {
    return res.status(400).json({ error: 'rawDescription is required' });
  }
  const created = isSheetsDataBackend()
    ? await createSourceQuoteLineInSheets({ ...req.body, sourceQuoteId: req.params.quoteId })
    : await createSourceQuoteLine({ ...req.body, sourceQuoteId: req.params.quoteId });
  return res.status(201).json({ data: created });
});

quotesRouter.post('/:quoteId/lines/bulk', async (req, res) => {
  const quote = isSheetsDataBackend()
    ? await getSourceQuoteFromSheets(req.params.quoteId)
    : await getSourceQuote(req.params.quoteId);
  if (!quote) {
    return res.status(404).json({ error: 'Quote not found' });
  }
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (rows.length === 0) {
    return res.status(400).json({ error: 'rows array is required' });
  }
  const created = isSheetsDataBackend()
    ? await createSourceQuoteLinesBulkInSheets(req.params.quoteId, rows)
    : await createSourceQuoteLinesBulk(req.params.quoteId, rows);
  return res.status(201).json({ data: created });
});

quotesRouter.put('/:quoteId/lines/:lineId', async (req, res) => {
  const updated = isSheetsDataBackend()
    ? await updateSourceQuoteLineInSheets(req.params.lineId, req.body ?? {})
    : await updateSourceQuoteLine(req.params.lineId, req.body ?? {});
  if (!updated) {
    return res.status(404).json({ error: 'Quote line not found' });
  }
  return res.json({ data: updated });
});

quotesRouter.delete('/:quoteId/lines/:lineId', async (req, res) => {
  const deleted = isSheetsDataBackend()
    ? await deleteSourceQuoteLineInSheets(req.params.lineId)
    : await deleteSourceQuoteLine(req.params.lineId);
  if (!deleted) {
    return res.status(404).json({ error: 'Quote line not found' });
  }
  return res.json({ data: { deleted: true } });
});

quotesRouter.post('/:quoteId/import-selected', async (req, res) => {
  const quote = isSheetsDataBackend()
    ? await getSourceQuoteFromSheets(req.params.quoteId)
    : await getSourceQuote(req.params.quoteId);
  if (!quote) {
    return res.status(404).json({ error: 'Quote not found' });
  }
  const created = isSheetsDataBackend()
    ? await importSelectedQuoteLinesToEstimateInSheets(req.params.quoteId)
    : await importSelectedQuoteLinesToEstimate(req.params.quoteId);
  return res.status(201).json({ data: created });
});

quotesRouter.post('/:quoteId/promote-candidates', async (req, res) => {
  const quote = isSheetsDataBackend()
    ? await getSourceQuoteFromSheets(req.params.quoteId)
    : await getSourceQuote(req.params.quoteId);
  if (!quote) {
    return res.status(404).json({ error: 'Quote not found' });
  }

  const selectedLineIds = Array.isArray(req.body?.selectedLineIds)
    ? req.body.selectedLineIds.map((id: unknown) => String(id || '').trim()).filter(Boolean)
    : [];
  if (selectedLineIds.length === 0) {
    return res.status(400).json({ error: 'selectedLineIds is required' });
  }

  const lines = isSheetsDataBackend()
    ? await listSourceQuoteLinesFromSheets(quote.id)
    : await listSourceQuoteLines(quote.id);

  const result = await promoteSourceQuoteLinesToCatalogCandidates({
    quote,
    lines,
    selectedLineIds,
    includeNonCatalogTypes: Boolean(req.body?.includeNonCatalogTypes),
  });

  return res.status(201).json({ data: result });
});

quotesRouter.post('/:quoteId/extract-source', async (req, res) => {
  const quote = isSheetsDataBackend()
    ? await getSourceQuoteFromSheets(req.params.quoteId)
    : await getSourceQuote(req.params.quoteId);
  if (!quote) {
    return res.status(404).json({ error: 'Quote not found' });
  }

  const replaceExisting = Boolean(req.body?.replaceExisting);
  const parsed = await extractSourceQuoteFromAttachedFile({ quote });

  if (replaceExisting) {
    const existing = isSheetsDataBackend()
      ? await listSourceQuoteLinesFromSheets(quote.id)
      : await listSourceQuoteLines(quote.id);
    await Promise.all(
      existing.map((line) =>
        isSheetsDataBackend()
          ? deleteSourceQuoteLineInSheets(line.id)
          : deleteSourceQuoteLine(line.id)
      )
    );
  }

  const mappedRows = parsed.rows.map((row) => ({
      lineNumber: row.lineNumber ?? null,
      rawDescription: row.rawDescription,
      normalizedDescription: row.normalizedDescription ?? row.rawDescription,
      manufacturer: row.manufacturer ?? null,
      skuModel: row.skuModel ?? null,
      qty: row.qty ?? 1,
      unit: row.unit || 'EA',
      unitCost: row.unitCost ?? null,
      totalCost: row.totalCost ?? null,
      materialCost: row.materialCost ?? (row.unitCost ?? 0),
      rowType: row.rowType,
      notes: row.notes ?? null,
      importSelected: row.importSelected ?? true,
    }));
  const created = isSheetsDataBackend()
    ? await createSourceQuoteLinesBulkInSheets(quote.id, mappedRows)
    : await createSourceQuoteLinesBulk(quote.id, mappedRows);

  const nextQuote = isSheetsDataBackend()
    ? await updateSourceQuoteInSheets(quote.id, {
      vendorName: parsed.header.vendorName || quote.vendorName,
      quoteNumber: parsed.header.quoteNumber || quote.quoteNumber,
      quoteDate: parsed.header.quoteDate || quote.quoteDate,
      deliveryDate: parsed.header.deliveryDate || quote.deliveryDate,
      shipTo: parsed.header.shipTo || quote.shipTo,
    })
    : await updateSourceQuote(quote.id, {
    vendorName: parsed.header.vendorName || quote.vendorName,
    quoteNumber: parsed.header.quoteNumber || quote.quoteNumber,
    quoteDate: parsed.header.quoteDate || quote.quoteDate,
    deliveryDate: parsed.header.deliveryDate || quote.deliveryDate,
    shipTo: parsed.header.shipTo || quote.shipTo,
  });

  return res.status(201).json({
    data: {
      quote: nextQuote,
      rowsCreated: created.length,
      warnings: parsed.warnings,
    },
  });
});