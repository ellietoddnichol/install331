import { randomUUID } from 'crypto';
import type { SourceQuoteLineRecord, SourceQuoteRecord, TakeoffLineRecord } from '../../shared/types/estimator.ts';
import {
  SHEETS_TABS,
  bulkUpsertRows,
  isGoogleSheetsConfigured,
  readRows,
  updateRowById,
  upsertRowById,
  type SheetsRow,
} from '../integrations/googleSheets.ts';
import { assertSheetsWorkbookId, getCatalogSpreadsheetId, getProjectsSpreadsheetId } from './dataBackend.ts';
import { listEstimateLinesFromSheets, upsertEstimateLinesToSheets } from './sheetsEstimateRepo.ts';
import { listCatalogItemsFromSheets } from './sheetsCatalogRepo.ts';
import { getProjectFromSheets } from './sheetsProjectsRepo.ts';
import { getSettingsFromSheets } from './sheetsSettingsRepo.ts';
import { normalizeProjectJobConditions } from '../../shared/utils/jobConditions.ts';
import { resolveQuoteLineForEstimate } from '../services/quoteImportResolutionService.ts';

const NON_CATALOG_ROW_TYPES = new Set(['freight', 'installation', 'service', 'note', 'ignore']);

function boolCell(value: boolean): 'TRUE' | 'FALSE' {
  return value ? 'TRUE' : 'FALSE';
}

function normalizeDate(value: string | null | undefined): string {
  return String(value || '').trim();
}

function toBool(value: string | undefined): boolean {
  const v = String(value || '').trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes' || v === 'y';
}

function toNumber(value: string | undefined, defaultValue = 0): number {
  const n = Number(String(value || '').trim());
  return Number.isFinite(n) ? n : defaultValue;
}

function projectsWorkbookId(): string {
  return assertSheetsWorkbookId(getProjectsSpreadsheetId(), 'GOOGLE_PROJECTS_SPREADSHEET_ID');
}

function catalogWorkbookId(): string {
  return assertSheetsWorkbookId(getCatalogSpreadsheetId(), 'GOOGLE_CATALOG_SPREADSHEET_ID');
}

function mapSourceQuoteRowFromSheet(row: Record<string, string>): SourceQuoteRecord {
  const now = new Date().toISOString();
  return {
    id: String(row.SourceQuoteID || '').trim(),
    projectId: String(row.ProjectID || '').trim(),
    vendorName: String(row.Vendor || '').trim() || 'Vendor',
    quoteNumber: String(row.QuoteNumber || '').trim() || null,
    quoteDate: String(row.QuoteDate || '').trim() || null,
    deliveryDate: String(row.DeliveryDate || '').trim() || null,
    shipTo: String(row.ShipTo || '').trim() || null,
    sourceFileId: String(row.FileLink || '').trim() || null,
    notes: String(row.Notes || '').trim() || null,
    importStatus: (String(row.ImportStatus || 'manual_review').trim() || 'manual_review') as SourceQuoteRecord['importStatus'],
    createdAt: String(row.CreatedAt || '').trim() || now,
    updatedAt: String(row.UpdatedAt || row.CreatedAt || '').trim() || now,
  };
}

function mapSourceQuoteLineFromSheet(row: Record<string, string>): SourceQuoteLineRecord {
  const now = new Date().toISOString();
  return {
    id: String(row.SourceQuoteLineID || '').trim(),
    sourceQuoteId: String(row.SourceQuoteID || '').trim(),
    lineNumber: String(row.LineNumber || '').trim() || null,
    rawDescription: String(row.RawDescription || '').trim(),
    normalizedDescription: String(row.NormalizedDescription || '').trim() || null,
    manufacturer: String(row.Vendor || '').trim() || null,
    skuModel: String(row.VendorSKU || '').trim() || null,
    qty: toNumber(row.Qty, 1) || 1,
    unit: String(row.Unit || 'EA').trim() || 'EA',
    unitCost: row.UnitCost == null || row.UnitCost === '' ? null : toNumber(row.UnitCost, 0),
    totalCost: row.TotalCost == null || row.TotalCost === '' ? null : toNumber(row.TotalCost, 0),
    materialCost: toNumber(row.UnitCost, 0) || toNumber(row.TotalCost, 0),
    rowType: (String(row.RowType || 'material').trim() || 'material') as SourceQuoteLineRecord['rowType'],
    notes: String(row.Notes || '').trim() || null,
    sortOrder: toNumber(row.SortOrder, 0),
    importSelected: toBool(row.ImportSelected),
    createdAt: String(row.CreatedAt || '').trim() || now,
    updatedAt: String(row.UpdatedAt || row.CreatedAt || '').trim() || now,
  };
}

function mapSourceQuoteToSheetRow(quote: SourceQuoteRecord): SheetsRow {
  return {
    SourceQuoteID: quote.id,
    ProjectID: quote.projectId,
    Vendor: quote.vendorName,
    QuoteNumber: quote.quoteNumber || '',
    QuoteDate: normalizeDate(quote.quoteDate),
    DeliveryDate: normalizeDate(quote.deliveryDate),
    FileLink: quote.sourceFileId || '',
    ShipTo: quote.shipTo || '',
    Notes: quote.notes || '',
    ImportStatus: quote.importStatus,
    CreatedAt: quote.createdAt,
  };
}

function mapSourceQuoteLineToSheetRow(input: {
  quote: SourceQuoteRecord;
  line: SourceQuoteLineRecord;
  importedToEstimate: boolean;
  candidateForCatalog: boolean;
}): SheetsRow {
  const { quote, line, importedToEstimate, candidateForCatalog } = input;
  return {
    SourceQuoteLineID: line.id,
    SourceQuoteID: quote.id,
    ProjectID: quote.projectId,
    Vendor: quote.vendorName,
    LineNumber: line.lineNumber || '',
    VendorSKU: line.skuModel || '',
    RawDescription: line.rawDescription,
    NormalizedDescription: line.normalizedDescription || '',
    Qty: line.qty,
    Unit: line.unit,
    UnitCost: line.unitCost ?? '',
    TotalCost: line.totalCost ?? '',
    RowType: line.rowType,
    ImportSelected: boolCell(line.importSelected),
    ImportedToEstimate: boolCell(importedToEstimate),
    CandidateForCatalog: boolCell(candidateForCatalog),
    Notes: line.notes || '',
    CreatedAt: line.createdAt,
  };
}

function mapCatalogCandidateRow(input: {
  candidateId: string;
  quote: SourceQuoteRecord;
  line: SourceQuoteLineRecord;
  quotedUnitCost: number | null;
}): SheetsRow {
  const { candidateId, quote, line, quotedUnitCost } = input;
  const vendorDescription = line.rawDescription;
  const normalizedName = line.normalizedDescription || line.rawDescription;
  return {
    CandidateID: candidateId,
    SourceQuoteLineID: line.id,
    SourceQuoteID: quote.id,
    Vendor: quote.vendorName,
    VendorSKU: line.skuModel || '',
    VendorDescription: vendorDescription,
    NormalizedName: normalizedName,
    Manufacturer: line.manufacturer || '',
    Series: '',
    Model: line.skuModel || '',
    Category: '',
    Subcategory: '',
    Unit: line.unit,
    QuotedUnitCost: quotedUnitCost ?? '',
    CostSourceDate: normalizeDate(quote.quoteDate),
    Finish: '',
    Dimensions: '',
    LaborFamily: '',
    ReviewStatus: 'pending_review',
    ApprovedCatalogItemID: '',
    Notes: line.notes || '',
    CreatedAt: new Date().toISOString(),
  };
}

function parseBooleanCell(value: string | undefined): boolean {
  const v = String(value || '').trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes' || v === 'y';
}

export async function syncSourceQuoteToSheets(quote: SourceQuoteRecord): Promise<void> {
  if (!isGoogleSheetsConfigured()) return;
  await upsertRowById(SHEETS_TABS.SOURCE_QUOTES, 'SourceQuoteID', mapSourceQuoteToSheetRow(quote), projectsWorkbookId());
}

export async function syncSourceQuoteLinesToSheets(input: {
  quote: SourceQuoteRecord;
  lines: SourceQuoteLineRecord[];
}): Promise<void> {
  if (!isGoogleSheetsConfigured()) return;

  const importedSourceRefs = new Set<string>(
    (await listEstimateLinesFromSheets(input.quote.projectId))
      .filter((line) => line.sourceType === 'vendor_quote' && line.sourceRef)
      .map((line) => String(line.sourceRef))
  );

  const existingRows = await readRows(SHEETS_TABS.SOURCE_QUOTE_LINES, projectsWorkbookId());
  const candidateByLineId = new Map<string, boolean>();
  existingRows.forEach((row) => {
    const lineId = String(row.SourceQuoteLineID || '').trim();
    if (!lineId) return;
    candidateByLineId.set(lineId, parseBooleanCell(row.CandidateForCatalog));
  });

  const rows: SheetsRow[] = input.lines.map((line) =>
    mapSourceQuoteLineToSheetRow({
      quote: input.quote,
      line,
      importedToEstimate: importedSourceRefs.has(line.id),
      candidateForCatalog: candidateByLineId.get(line.id) === true,
    })
  );

  await bulkUpsertRows(SHEETS_TABS.SOURCE_QUOTE_LINES, 'SourceQuoteLineID', rows, projectsWorkbookId());
}

export async function listSourceQuotesFromSheets(projectId: string): Promise<SourceQuoteRecord[]> {
  const rows = await readRows(SHEETS_TABS.SOURCE_QUOTES, projectsWorkbookId());
  return rows
    .map(mapSourceQuoteRowFromSheet)
    .filter((row) => row.projectId === projectId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function getSourceQuoteFromSheets(quoteId: string): Promise<SourceQuoteRecord | null> {
  const rows = await readRows(SHEETS_TABS.SOURCE_QUOTES, projectsWorkbookId());
  const found = rows.map(mapSourceQuoteRowFromSheet).find((row) => row.id === quoteId);
  return found || null;
}

export async function createSourceQuoteInSheets(
  input: Partial<SourceQuoteRecord> & { projectId: string; vendorName: string }
): Promise<SourceQuoteRecord> {
  const now = new Date().toISOString();
  const quote: SourceQuoteRecord = {
    id: input.id || randomUUID(),
    projectId: input.projectId,
    vendorName: String(input.vendorName || '').trim() || 'Vendor',
    quoteNumber: input.quoteNumber ?? null,
    quoteDate: input.quoteDate ?? null,
    deliveryDate: input.deliveryDate ?? null,
    shipTo: input.shipTo ?? null,
    sourceFileId: input.sourceFileId ?? null,
    notes: input.notes ?? null,
    importStatus: input.importStatus || 'manual_review',
    createdAt: now,
    updatedAt: now,
  };
  await upsertRowById(SHEETS_TABS.SOURCE_QUOTES, 'SourceQuoteID', mapSourceQuoteToSheetRow(quote), projectsWorkbookId());
  return quote;
}

export async function updateSourceQuoteInSheets(
  quoteId: string,
  input: Partial<SourceQuoteRecord>
): Promise<SourceQuoteRecord | null> {
  const existing = await getSourceQuoteFromSheets(quoteId);
  if (!existing) return null;
  const next: SourceQuoteRecord = {
    ...existing,
    ...input,
    id: quoteId,
    updatedAt: new Date().toISOString(),
  };
  await upsertRowById(SHEETS_TABS.SOURCE_QUOTES, 'SourceQuoteID', mapSourceQuoteToSheetRow(next), projectsWorkbookId());
  return next;
}

export async function deleteSourceQuoteInSheets(quoteId: string): Promise<boolean> {
  const existing = await getSourceQuoteFromSheets(quoteId);
  if (!existing) return false;
  await updateRowById(
    SHEETS_TABS.SOURCE_QUOTES,
    'SourceQuoteID',
    quoteId,
    { ImportStatus: 'deleted', UpdatedAt: new Date().toISOString() },
    projectsWorkbookId()
  );
  return true;
}

export async function listSourceQuoteLinesFromSheets(sourceQuoteId: string): Promise<SourceQuoteLineRecord[]> {
  const rows = await readRows(SHEETS_TABS.SOURCE_QUOTE_LINES, projectsWorkbookId());
  return rows
    .map(mapSourceQuoteLineFromSheet)
    .filter((row) => row.sourceQuoteId === sourceQuoteId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function createSourceQuoteLineInSheets(
  input: Partial<SourceQuoteLineRecord> & { sourceQuoteId: string; rawDescription: string }
): Promise<SourceQuoteLineRecord> {
  const now = new Date().toISOString();
  const existing = await listSourceQuoteLinesFromSheets(input.sourceQuoteId);
  const line: SourceQuoteLineRecord = {
    id: input.id || randomUUID(),
    sourceQuoteId: input.sourceQuoteId,
    lineNumber: input.lineNumber ?? null,
    rawDescription: String(input.rawDescription || '').trim(),
    normalizedDescription: input.normalizedDescription ?? null,
    manufacturer: input.manufacturer ?? null,
    skuModel: input.skuModel ?? null,
    qty: Number(input.qty || 0) > 0 ? Number(input.qty) : 1,
    unit: String(input.unit || 'EA').trim() || 'EA',
    unitCost: input.unitCost == null ? null : Number(input.unitCost || 0),
    totalCost: input.totalCost == null ? null : Number(input.totalCost || 0),
    materialCost: Number(input.materialCost || input.unitCost || 0) || 0,
    rowType: input.rowType || 'material',
    notes: input.notes ?? null,
    sortOrder: input.sortOrder ?? existing.length,
    importSelected: input.importSelected ?? true,
    createdAt: now,
    updatedAt: now,
  };

  const quote = await getSourceQuoteFromSheets(line.sourceQuoteId);
  if (!quote) {
    throw new Error('Quote not found for line creation.');
  }

  await upsertRowById(
    SHEETS_TABS.SOURCE_QUOTE_LINES,
    'SourceQuoteLineID',
    mapSourceQuoteLineToSheetRow({
      quote,
      line,
      importedToEstimate: false,
      candidateForCatalog: false,
    }),
    projectsWorkbookId()
  );
  return line;
}

export async function createSourceQuoteLinesBulkInSheets(
  sourceQuoteId: string,
  items: Array<Partial<SourceQuoteLineRecord> & { rawDescription: string }>
): Promise<SourceQuoteLineRecord[]> {
  const created: SourceQuoteLineRecord[] = [];
  for (const item of items) {
    created.push(await createSourceQuoteLineInSheets({ ...item, sourceQuoteId }));
  }
  return created;
}

export async function updateSourceQuoteLineInSheets(
  lineId: string,
  input: Partial<SourceQuoteLineRecord>
): Promise<SourceQuoteLineRecord | null> {
  const rows = await readRows(SHEETS_TABS.SOURCE_QUOTE_LINES, projectsWorkbookId());
  const row = rows.find((r) => String(r.SourceQuoteLineID || '').trim() === lineId);
  if (!row) return null;

  const current = mapSourceQuoteLineFromSheet(row);
  const quote = await getSourceQuoteFromSheets(current.sourceQuoteId);
  if (!quote) return null;
  const next: SourceQuoteLineRecord = {
    ...current,
    ...input,
    id: lineId,
    updatedAt: new Date().toISOString(),
  };

  await upsertRowById(
    SHEETS_TABS.SOURCE_QUOTE_LINES,
    'SourceQuoteLineID',
    mapSourceQuoteLineToSheetRow({
      quote,
      line: next,
      importedToEstimate: toBool(row.ImportedToEstimate),
      candidateForCatalog: toBool(row.CandidateForCatalog),
    }),
    projectsWorkbookId()
  );
  return next;
}

export async function deleteSourceQuoteLineInSheets(lineId: string): Promise<boolean> {
  return updateRowById(
    SHEETS_TABS.SOURCE_QUOTE_LINES,
    'SourceQuoteLineID',
    lineId,
    { ImportSelected: 'FALSE', RowType: 'ignore', Notes: 'Deleted in app' },
    projectsWorkbookId()
  );
}

export async function importSelectedQuoteLinesToEstimateInSheets(sourceQuoteId: string): Promise<TakeoffLineRecord[]> {
  const quote = await getSourceQuoteFromSheets(sourceQuoteId);
  if (!quote) return [];
  const project = await getProjectFromSheets(quote.projectId);
  if (!project) return [];
  const settings = await getSettingsFromSheets();
  const jobConditions = normalizeProjectJobConditions(project.jobConditions);

  const quoteRowsRaw = await readRows(SHEETS_TABS.SOURCE_QUOTE_LINES, projectsWorkbookId());
  const quoteRows = quoteRowsRaw
    .filter((row) => String(row.SourceQuoteID || '').trim() === sourceQuoteId)
    .filter((row) => toBool(row.ImportSelected))
    .filter((row) => {
      const rowType = String(row.RowType || '').trim().toLowerCase();
      return rowType !== 'note' && rowType !== 'ignore';
    });

  const existing = await listEstimateLinesFromSheets(quote.projectId);
  const existingRefs = new Set(
    existing
      .filter((line) => line.sourceType === 'vendor_quote' && line.sourceRef)
      .map((line) => String(line.sourceRef))
  );

  const catalogItems = await listCatalogItemsFromSheets();
  const created: TakeoffLineRecord[] = [];
  for (const row of quoteRows) {
    const sourceLineId = String(row.SourceQuoteLineID || '').trim();
    if (!sourceLineId || existingRefs.has(sourceLineId)) continue;

    const quoteLine: SourceQuoteLineRecord = {
      id: sourceLineId,
      sourceQuoteId,
      lineNumber: String(row.LineNumber || '').trim() || null,
      rawDescription: String(row.RawDescription || '').trim(),
      normalizedDescription: String(row.NormalizedDescription || '').trim() || null,
      manufacturer: String(row.Vendor || '').trim() || null,
      skuModel: String(row.VendorSKU || '').trim() || null,
      qty: toNumber(row.Qty, 1) || 1,
      unit: String(row.Unit || 'EA').trim() || 'EA',
      unitCost: row.UnitCost ? toNumber(row.UnitCost, 0) : null,
      totalCost: row.TotalCost ? toNumber(row.TotalCost, 0) : null,
      materialCost: toNumber(row.UnitCost, 0) || toNumber(row.TotalCost, 0) || 0,
      rowType: (String(row.RowType || 'material').trim() || 'material') as SourceQuoteLineRecord['rowType'],
      notes: String(row.Notes || '').trim() || null,
      sortOrder: toNumber(row.SortOrder, 0),
      importSelected: toBool(row.ImportSelected),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const resolved = resolveQuoteLineForEstimate({
      quote,
      line: quoteLine,
      projectId: quote.projectId,
      roomId: 'general',
      catalogItems,
      projectSetup: {
        defaultProposalVisibility: jobConditions.defaultProposalVisibility,
        suppressAutoLaborForInstallServiceRows: jobConditions.suppressAutoLaborForInstallServiceRows,
      },
    });

    const qty = Number(resolved.createInput.qty || 1);
    const materialCost = Number(resolved.createInput.materialCost || 0);
    const laborMinutes = Number(resolved.createInput.laborMinutes || 0);
    const laborRatePerHour = Number((Number(settings.defaultLaborRatePerHour || 100) * Number(jobConditions.laborRateMultiplier || 1)).toFixed(2));
    const laborCost = Number(((laborMinutes / 60) * laborRatePerHour).toFixed(2));
    const unitSell = Number((materialCost + laborCost).toFixed(2));
    const lineTotal = Number((unitSell * qty).toFixed(2));

    const line: TakeoffLineRecord = {
      id: randomUUID(),
      projectId: quote.projectId,
      roomId: 'general',
      sourceType: 'vendor_quote',
      sourceRef: sourceLineId,
      sourceLineType: resolved.createInput.sourceLineType || 'source_line',
      proposalVisibility: resolved.createInput.proposalVisibility || 'customer_visible',
      description: String(resolved.createInput.description || quoteLine.normalizedDescription || quoteLine.rawDescription).trim(),
      sku: resolved.createInput.sku || null,
      category: resolved.createInput.category || null,
      subcategory: resolved.createInput.subcategory || null,
      baseType: null,
      qty,
      unit: String(resolved.createInput.unit || quoteLine.unit || 'EA').trim() || 'EA',
      materialCost,
      baseMaterialCost: materialCost,
      sourceMaterialCost: resolved.createInput.sourceMaterialCost ?? null,
      laborMinutes,
      laborCost,
      baseLaborCost: laborCost,
      generatedLaborMinutes: resolved.createInput.generatedLaborMinutes ?? null,
      laborOrigin: resolved.createInput.laborOrigin ?? null,
      installScopeType: resolved.createInput.installScopeType ?? null,
      isInstallableScope: resolved.createInput.isInstallableScope ?? null,
      installLaborFamily: resolved.createInput.installLaborFamily ?? null,
      pricingSource: 'manual',
      unitSell,
      lineTotal,
      notes: resolved.createInput.notes || `Imported from ${quote.vendorName}`,
      bundleId: null,
      catalogItemId: resolved.createInput.catalogItemId ?? null,
      variantId: null,
      modifierNames: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    created.push(line);
  }

  if (created.length > 0) {
    await upsertEstimateLinesToSheets(quote.projectId, created);
  }

  await Promise.all(
    quoteRows.map((row) =>
      updateRowById(
        SHEETS_TABS.SOURCE_QUOTE_LINES,
        'SourceQuoteLineID',
        String(row.SourceQuoteLineID || '').trim(),
        { ImportedToEstimate: 'TRUE' },
        projectsWorkbookId()
      )
    )
  );

  return created;
}

export async function promoteSourceQuoteLinesToCatalogCandidates(input: {
  quote: SourceQuoteRecord;
  lines: SourceQuoteLineRecord[];
  selectedLineIds: string[];
  includeNonCatalogTypes?: boolean;
}): Promise<{ promotedCount: number; skippedCount: number }> {
  if (!isGoogleSheetsConfigured()) {
    throw new Error('Google Sheets is not configured in this environment.');
  }

  const selectedSet = new Set(input.selectedLineIds.map((id) => id.trim()).filter(Boolean));
  const candidates = input.lines.filter((line) => selectedSet.has(line.id));

  const filtered = input.includeNonCatalogTypes
    ? candidates
    : candidates.filter((line) => !NON_CATALOG_ROW_TYPES.has(line.rowType));

  const skippedCount = candidates.length - filtered.length;
  if (filtered.length === 0) {
    return { promotedCount: 0, skippedCount };
  }

  const rowsToUpsert: SheetsRow[] = filtered.map((line) => {
    const qty = Number(line.qty || 0);
    const total = line.totalCost == null ? null : Number(line.totalCost);
    const unitCost =
      line.unitCost != null
        ? Number(line.unitCost)
        : total != null && qty > 0
          ? Number((total / qty).toFixed(4))
          : null;
    return mapCatalogCandidateRow({
      candidateId: `cand-${line.id}`,
      quote: input.quote,
      line,
      quotedUnitCost: Number.isFinite(unitCost as number) ? unitCost : null,
    });
  });

  await bulkUpsertRows(SHEETS_TABS.CATALOG_CANDIDATES, 'CandidateID', rowsToUpsert, catalogWorkbookId());

  const existingSourceRows = await readRows(SHEETS_TABS.SOURCE_QUOTE_LINES, projectsWorkbookId());
  const importedByLineId = new Map<string, boolean>();
  existingSourceRows.forEach((row) => {
    const lineId = String(row.SourceQuoteLineID || '').trim();
    if (!lineId) return;
    importedByLineId.set(lineId, parseBooleanCell(row.ImportedToEstimate));
  });

  await Promise.all(
    filtered.map((line) =>
      upsertRowById(
        SHEETS_TABS.SOURCE_QUOTE_LINES,
        'SourceQuoteLineID',
        mapSourceQuoteLineToSheetRow({
          quote: input.quote,
          line,
          importedToEstimate: importedByLineId.get(line.id) === true,
          candidateForCatalog: true,
        }),
        projectsWorkbookId()
      )
    )
  );

  return {
    promotedCount: filtered.length,
    skippedCount,
  };
}
