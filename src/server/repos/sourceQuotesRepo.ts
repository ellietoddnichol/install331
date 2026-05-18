import { randomUUID } from 'crypto';
import { getEstimatorDb } from '../db/connection.ts';
import { isPgDriver } from '../db/driver.ts';
import { dbAll, dbGet, dbRun, withPgTransaction, withSqliteTransaction } from '../db/query.ts';
import type { SourceQuoteImportStatus, SourceQuoteLineRecord, SourceQuoteRecord, TakeoffLineRecord } from '../../shared/types/estimator.ts';
import { normalizeProjectJobConditions } from '../../shared/utils/jobConditions.ts';
import { getProject } from './projectsRepo.ts';
import { createRoom, listRooms } from './roomsRepo.ts';
import { createTakeoffLine, deleteTakeoffLine, listTakeoffLines } from './takeoffRepo.ts';
import { listCatalogItemsForApi } from './catalogRepo.ts';
import { resolveQuoteLineForEstimate } from '../services/quoteImportResolutionService.ts';
import { warmInstallIntelligenceWorkbook } from '../services/div10InstallIntelligenceService.ts';

function mapSourceQuoteRow(row: any): SourceQuoteRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    vendorName: row.vendor_name,
    quoteNumber: row.quote_number ?? null,
    quoteDate: row.quote_date ?? null,
    deliveryDate: row.delivery_date ?? null,
    shipTo: row.ship_to ?? null,
    sourceFileId: row.source_file_id ?? null,
    notes: row.notes ?? null,
    importStatus: normalizeImportStatus(row.import_status),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSourceQuoteLineRow(row: any): SourceQuoteLineRecord {
  return {
    id: row.id,
    sourceQuoteId: row.source_quote_id,
    lineNumber: row.line_number ?? null,
    rawDescription: row.raw_description,
    normalizedDescription: row.normalized_description ?? null,
    manufacturer: row.manufacturer ?? null,
    skuModel: row.sku_model ?? null,
    qty: Number(row.qty || 0) || 1,
    unit: row.unit || 'EA',
    unitCost: row.unit_cost == null ? null : Number(row.unit_cost || 0),
    totalCost: row.total_cost == null ? null : Number(row.total_cost || 0),
    materialCost: Number(row.material_cost || 0) || 0,
    rowType: row.row_type || 'material',
    notes: row.notes ?? null,
    sortOrder: Number(row.sort_order || 0) || 0,
    importSelected: Number(row.import_selected || 0) > 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeImportStatus(value: unknown): SourceQuoteImportStatus {
  const raw = String(value || '').trim();
  if (raw === 'ready_to_import' || raw === 'partially_imported' || raw === 'imported') return raw;
  if (raw === 'draft') return 'manual_review';
  if (raw === 'staged') return 'ready_to_import';
  return 'manual_review';
}

export async function listSourceQuotes(projectId: string): Promise<SourceQuoteRecord[]> {
  const rows = isPgDriver()
    ? await dbAll('SELECT * FROM source_quotes_v1 WHERE project_id = ? ORDER BY created_at DESC', [projectId])
    : getEstimatorDb().prepare('SELECT * FROM source_quotes_v1 WHERE project_id = ? ORDER BY created_at DESC').all(projectId);
  return rows.map(mapSourceQuoteRow);
}

export async function getSourceQuote(quoteId: string): Promise<SourceQuoteRecord | null> {
  const row = isPgDriver()
    ? await dbGet('SELECT * FROM source_quotes_v1 WHERE id = ?', [quoteId])
    : getEstimatorDb().prepare('SELECT * FROM source_quotes_v1 WHERE id = ?').get(quoteId);
  return row ? mapSourceQuoteRow(row) : null;
}

export async function createSourceQuote(input: Partial<SourceQuoteRecord> & { projectId: string; vendorName: string }): Promise<SourceQuoteRecord> {
  const now = new Date().toISOString();
  const quote: SourceQuoteRecord = {
    id: input.id ?? randomUUID(),
    projectId: input.projectId,
    vendorName: String(input.vendorName || '').trim() || 'Untitled vendor quote',
    quoteNumber: input.quoteNumber ?? null,
    quoteDate: input.quoteDate ?? null,
    deliveryDate: input.deliveryDate ?? null,
    shipTo: input.shipTo ?? null,
    sourceFileId: input.sourceFileId ?? null,
    notes: input.notes ?? null,
    importStatus: normalizeImportStatus(input.importStatus),
    createdAt: now,
    updatedAt: now,
  };

  if (isPgDriver()) {
    await dbRun(
      `INSERT INTO source_quotes_v1 (id, project_id, vendor_name, quote_number, quote_date, delivery_date, ship_to, source_file_id, notes, import_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [quote.id, quote.projectId, quote.vendorName, quote.quoteNumber, quote.quoteDate, quote.deliveryDate, quote.shipTo, quote.sourceFileId, quote.notes, quote.importStatus, quote.createdAt, quote.updatedAt]
    );
  } else {
    getEstimatorDb()
      .prepare(
        `INSERT INTO source_quotes_v1 (id, project_id, vendor_name, quote_number, quote_date, delivery_date, ship_to, source_file_id, notes, import_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(quote.id, quote.projectId, quote.vendorName, quote.quoteNumber, quote.quoteDate, quote.deliveryDate, quote.shipTo, quote.sourceFileId, quote.notes, quote.importStatus, quote.createdAt, quote.updatedAt);
  }

  return quote;
}

export async function updateSourceQuote(quoteId: string, input: Partial<SourceQuoteRecord>): Promise<SourceQuoteRecord | null> {
  const existing = await getSourceQuote(quoteId);
  if (!existing) return null;
  const next: SourceQuoteRecord = {
    ...existing,
    ...input,
    id: quoteId,
    vendorName: String(input.vendorName ?? existing.vendorName).trim() || existing.vendorName,
    importStatus: normalizeImportStatus(input.importStatus ?? existing.importStatus),
    updatedAt: new Date().toISOString(),
  };

  if (isPgDriver()) {
    await dbRun(
      `UPDATE source_quotes_v1
       SET vendor_name = ?, quote_number = ?, quote_date = ?, delivery_date = ?, ship_to = ?, source_file_id = ?, notes = ?, import_status = ?, updated_at = ?
       WHERE id = ?`,
      [next.vendorName, next.quoteNumber, next.quoteDate, next.deliveryDate, next.shipTo, next.sourceFileId, next.notes, next.importStatus, next.updatedAt, quoteId]
    );
  } else {
    getEstimatorDb()
      .prepare(
        `UPDATE source_quotes_v1
         SET vendor_name = ?, quote_number = ?, quote_date = ?, delivery_date = ?, ship_to = ?, source_file_id = ?, notes = ?, import_status = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(next.vendorName, next.quoteNumber, next.quoteDate, next.deliveryDate, next.shipTo, next.sourceFileId, next.notes, next.importStatus, next.updatedAt, quoteId);
  }

  return next;
}

export async function deleteSourceQuote(quoteId: string): Promise<boolean> {
  const result = isPgDriver()
    ? await dbRun('DELETE FROM source_quotes_v1 WHERE id = ?', [quoteId])
    : getEstimatorDb().prepare('DELETE FROM source_quotes_v1 WHERE id = ?').run(quoteId);
  return result.changes > 0;
}

export async function listSourceQuoteLines(sourceQuoteId: string): Promise<SourceQuoteLineRecord[]> {
  const rows = isPgDriver()
    ? await dbAll('SELECT * FROM source_quote_lines_v1 WHERE source_quote_id = ? ORDER BY sort_order, created_at', [sourceQuoteId])
    : getEstimatorDb().prepare('SELECT * FROM source_quote_lines_v1 WHERE source_quote_id = ? ORDER BY sort_order, created_at').all(sourceQuoteId);
  return rows.map(mapSourceQuoteLineRow);
}

export async function createSourceQuoteLine(input: Partial<SourceQuoteLineRecord> & { sourceQuoteId: string; rawDescription: string }): Promise<SourceQuoteLineRecord> {
  const now = new Date().toISOString();
  const sortRow = isPgDriver()
    ? await dbGet<{ next_sort: number }>('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort FROM source_quote_lines_v1 WHERE source_quote_id = ?', [input.sourceQuoteId])
    : (getEstimatorDb()
        .prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort FROM source_quote_lines_v1 WHERE source_quote_id = ?')
        .get(input.sourceQuoteId) as { next_sort: number } | undefined);
  const line: SourceQuoteLineRecord = {
    id: input.id ?? randomUUID(),
    sourceQuoteId: input.sourceQuoteId,
    lineNumber: input.lineNumber ?? null,
    rawDescription: String(input.rawDescription || '').trim() || 'Quote line',
    normalizedDescription: input.normalizedDescription ?? null,
    manufacturer: input.manufacturer ?? null,
    skuModel: input.skuModel ?? null,
    qty: Number(input.qty || 0) > 0 ? Number(input.qty) : 1,
    unit: String(input.unit || 'EA').trim() || 'EA',
    unitCost: input.unitCost == null ? null : Number(input.unitCost || 0),
    totalCost: input.totalCost == null ? null : Number(input.totalCost || 0),
    materialCost: Number(input.materialCost || 0) || 0,
    rowType: input.rowType || 'material',
    notes: input.notes ?? null,
    sortOrder: input.sortOrder ?? sortRow?.next_sort ?? 0,
    importSelected: input.importSelected ?? true,
    createdAt: now,
    updatedAt: now,
  };

  if (isPgDriver()) {
    await dbRun(
      `INSERT INTO source_quote_lines_v1 (
        id, source_quote_id, line_number, raw_description, normalized_description, manufacturer, sku_model, qty, unit, unit_cost, total_cost, material_cost, row_type, notes, sort_order, import_selected, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        line.id,
        line.sourceQuoteId,
        line.lineNumber,
        line.rawDescription,
        line.normalizedDescription,
        line.manufacturer,
        line.skuModel,
        line.qty,
        line.unit,
        line.unitCost,
        line.totalCost,
        line.materialCost,
        line.rowType,
        line.notes,
        line.sortOrder,
        line.importSelected ? 1 : 0,
        line.createdAt,
        line.updatedAt,
      ]
    );
  } else {
    getEstimatorDb()
      .prepare(
        `INSERT INTO source_quote_lines_v1 (
          id, source_quote_id, line_number, raw_description, normalized_description, manufacturer, sku_model, qty, unit, unit_cost, total_cost, material_cost, row_type, notes, sort_order, import_selected, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        line.id,
        line.sourceQuoteId,
        line.lineNumber,
        line.rawDescription,
        line.normalizedDescription,
        line.manufacturer,
        line.skuModel,
        line.qty,
        line.unit,
        line.unitCost,
        line.totalCost,
        line.materialCost,
        line.rowType,
        line.notes,
        line.sortOrder,
        line.importSelected ? 1 : 0,
        line.createdAt,
        line.updatedAt,
      );
  }

  await syncSourceQuoteImportStatus(line.sourceQuoteId);
  return line;
}

export async function createSourceQuoteLinesBulk(sourceQuoteId: string, items: Array<Partial<SourceQuoteLineRecord> & { rawDescription: string }>): Promise<SourceQuoteLineRecord[]> {
  const now = new Date().toISOString();
  const cleanItems = items
    .map((item) => ({
      rawDescription: String(item.rawDescription || '').trim(),
      lineNumber: item.lineNumber ?? null,
      normalizedDescription: item.normalizedDescription ?? null,
      manufacturer: item.manufacturer ?? null,
      skuModel: item.skuModel ?? null,
      qty: Number(item.qty || 0) > 0 ? Number(item.qty) : 1,
      unit: String(item.unit || 'EA').trim() || 'EA',
      unitCost: item.unitCost == null ? null : Number(item.unitCost || 0),
      totalCost: item.totalCost == null ? null : Number(item.totalCost || 0),
      materialCost: Number(item.materialCost || 0) || 0,
      rowType: item.rowType || 'material',
      notes: item.notes ?? null,
      importSelected: item.importSelected ?? true,
    }))
    .filter((item) => item.rawDescription.length > 0);

  if (cleanItems.length === 0) return [];

  const created: SourceQuoteLineRecord[] = [];
  if (isPgDriver()) {
    await withPgTransaction(async (exec) => {
      const sortRow = await exec.get<{ next_sort: number }>(
        'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort FROM source_quote_lines_v1 WHERE source_quote_id = ?',
        [sourceQuoteId]
      );
      let nextSort = sortRow?.next_sort ?? 0;
      for (const item of cleanItems) {
        const line: SourceQuoteLineRecord = {
          id: randomUUID(),
          sourceQuoteId,
          lineNumber: item.lineNumber,
          rawDescription: item.rawDescription,
          normalizedDescription: item.normalizedDescription,
          manufacturer: item.manufacturer,
          skuModel: item.skuModel,
          qty: item.qty,
          unit: item.unit,
          unitCost: item.unitCost,
          totalCost: item.totalCost,
          materialCost: item.materialCost,
          rowType: item.rowType,
          notes: item.notes,
          sortOrder: nextSort++,
          importSelected: item.importSelected,
          createdAt: now,
          updatedAt: now,
        };
        await exec.run(
          `INSERT INTO source_quote_lines_v1 (
            id, source_quote_id, line_number, raw_description, normalized_description, manufacturer, sku_model, qty, unit, unit_cost, total_cost, material_cost, row_type, notes, sort_order, import_selected, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            line.id,
            line.sourceQuoteId,
            line.lineNumber,
            line.rawDescription,
            line.normalizedDescription,
            line.manufacturer,
            line.skuModel,
            line.qty,
            line.unit,
            line.unitCost,
            line.totalCost,
            line.materialCost,
            line.rowType,
            line.notes,
            line.sortOrder,
            line.importSelected ? 1 : 0,
            line.createdAt,
            line.updatedAt,
          ]
        );
        created.push(line);
      }
    });
  } else {
    const db = getEstimatorDb();
    const insert = db.prepare(
      `INSERT INTO source_quote_lines_v1 (
        id, source_quote_id, line_number, raw_description, normalized_description, manufacturer, sku_model, qty, unit, unit_cost, total_cost, material_cost, row_type, notes, sort_order, import_selected, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const getNextSort = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort FROM source_quote_lines_v1 WHERE source_quote_id = ?');
    withSqliteTransaction(() => {
      const sortRow = getNextSort.get(sourceQuoteId) as { next_sort?: number } | undefined;
      let nextSort = sortRow?.next_sort ?? 0;
      for (const item of cleanItems) {
        const line: SourceQuoteLineRecord = {
          id: randomUUID(),
          sourceQuoteId,
          lineNumber: item.lineNumber,
          rawDescription: item.rawDescription,
          normalizedDescription: item.normalizedDescription,
          manufacturer: item.manufacturer,
          skuModel: item.skuModel,
          qty: item.qty,
          unit: item.unit,
          unitCost: item.unitCost,
          totalCost: item.totalCost,
          materialCost: item.materialCost,
          rowType: item.rowType,
          notes: item.notes,
          sortOrder: nextSort++,
          importSelected: item.importSelected,
          createdAt: now,
          updatedAt: now,
        };
        insert.run(
          line.id,
          line.sourceQuoteId,
          line.lineNumber,
          line.rawDescription,
          line.normalizedDescription,
          line.manufacturer,
          line.skuModel,
          line.qty,
          line.unit,
          line.unitCost,
          line.totalCost,
          line.materialCost,
          line.rowType,
          line.notes,
          line.sortOrder,
          line.importSelected ? 1 : 0,
          line.createdAt,
          line.updatedAt
        );
        created.push(line);
      }
    });
  }

  await syncSourceQuoteImportStatus(sourceQuoteId);
  return created;
}

export async function updateSourceQuoteLine(lineId: string, input: Partial<SourceQuoteLineRecord>): Promise<SourceQuoteLineRecord | null> {
  const existingRow = isPgDriver()
    ? await dbGet('SELECT * FROM source_quote_lines_v1 WHERE id = ?', [lineId])
    : getEstimatorDb().prepare('SELECT * FROM source_quote_lines_v1 WHERE id = ?').get(lineId);
  if (!existingRow) return null;
  const existing = mapSourceQuoteLineRow(existingRow);
  const next: SourceQuoteLineRecord = {
    ...existing,
    ...input,
    id: lineId,
    rawDescription: String(input.rawDescription ?? existing.rawDescription).trim() || existing.rawDescription,
    unit: String(input.unit ?? existing.unit).trim() || existing.unit,
    qty: Number(input.qty ?? existing.qty) > 0 ? Number(input.qty ?? existing.qty) : existing.qty,
    unitCost: input.unitCost === undefined ? existing.unitCost : (input.unitCost == null ? null : Number(input.unitCost || 0)),
    totalCost: input.totalCost === undefined ? existing.totalCost : (input.totalCost == null ? null : Number(input.totalCost || 0)),
    materialCost: Number(input.materialCost ?? existing.materialCost) || 0,
    rowType: input.rowType ?? existing.rowType,
    importSelected: input.importSelected ?? existing.importSelected,
    updatedAt: new Date().toISOString(),
  };

  if (isPgDriver()) {
    await dbRun(
      `UPDATE source_quote_lines_v1
       SET line_number = ?, raw_description = ?, normalized_description = ?, manufacturer = ?, sku_model = ?, qty = ?, unit = ?, unit_cost = ?, total_cost = ?, material_cost = ?, row_type = ?, notes = ?, sort_order = ?, import_selected = ?, updated_at = ?
       WHERE id = ?`,
      [next.lineNumber, next.rawDescription, next.normalizedDescription, next.manufacturer, next.skuModel, next.qty, next.unit, next.unitCost, next.totalCost, next.materialCost, next.rowType, next.notes, next.sortOrder, next.importSelected ? 1 : 0, next.updatedAt, lineId]
    );
  } else {
    getEstimatorDb()
      .prepare(
        `UPDATE source_quote_lines_v1
         SET line_number = ?, raw_description = ?, normalized_description = ?, manufacturer = ?, sku_model = ?, qty = ?, unit = ?, unit_cost = ?, total_cost = ?, material_cost = ?, row_type = ?, notes = ?, sort_order = ?, import_selected = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(next.lineNumber, next.rawDescription, next.normalizedDescription, next.manufacturer, next.skuModel, next.qty, next.unit, next.unitCost, next.totalCost, next.materialCost, next.rowType, next.notes, next.sortOrder, next.importSelected ? 1 : 0, next.updatedAt, lineId);
  }

  await syncSourceQuoteImportStatus(next.sourceQuoteId);
  return next;
}

export async function deleteSourceQuoteLine(lineId: string): Promise<boolean> {
  const existingRow = isPgDriver()
    ? await dbGet<{ source_quote_id: string }>('SELECT source_quote_id FROM source_quote_lines_v1 WHERE id = ?', [lineId])
    : (getEstimatorDb().prepare('SELECT source_quote_id FROM source_quote_lines_v1 WHERE id = ?').get(lineId) as { source_quote_id: string } | undefined);
  const result = isPgDriver()
    ? await dbRun('DELETE FROM source_quote_lines_v1 WHERE id = ?', [lineId])
    : getEstimatorDb().prepare('DELETE FROM source_quote_lines_v1 WHERE id = ?').run(lineId);
  if (result.changes > 0 && existingRow?.source_quote_id) {
    await syncSourceQuoteImportStatus(existingRow.source_quote_id);
    return true;
  }
  return result.changes > 0;
}

export async function importSelectedQuoteLinesToEstimate(sourceQuoteId: string): Promise<TakeoffLineRecord[]> {
  const quote = await getSourceQuote(sourceQuoteId);
  if (!quote) return [];
  const project = await getProject(quote.projectId);
  if (!project) return [];
  const jobConditions = normalizeProjectJobConditions(project.jobConditions);
  let rooms = await listRooms(quote.projectId);
  if (rooms.length === 0) {
    await createRoom({ projectId: quote.projectId, roomName: 'General', sortOrder: 0, notes: 'Default estimate bucket.' });
    rooms = await listRooms(quote.projectId);
  }
  const targetRoomId = rooms[0]?.id;
  if (!targetRoomId) return [];

  const lines = await listSourceQuoteLines(sourceQuoteId);
  const selected = lines.filter((line) => line.importSelected && line.rowType !== 'note' && line.rowType !== 'ignore');
  const existingEstimateLines = await listTakeoffLines(quote.projectId);
  const existingSourceRefs = new Set(
    existingEstimateLines
      .filter((line) => line.sourceType === 'vendor_quote' && line.sourceRef)
      .map((line) => String(line.sourceRef))
  );
  const pending = selected.filter((line) => !existingSourceRefs.has(line.id));

  const catalogItems = await listCatalogItemsForApi(false);
  await warmInstallIntelligenceWorkbook();
  const created: TakeoffLineRecord[] = [];
  try {
    for (const line of pending) {
      const resolved = resolveQuoteLineForEstimate({
        quote,
        line,
        projectId: quote.projectId,
        roomId: targetRoomId,
        catalogItems,
        projectSetup: {
          defaultProposalVisibility: jobConditions.defaultProposalVisibility,
          suppressAutoLaborForInstallServiceRows: jobConditions.suppressAutoLaborForInstallServiceRows,
          wallSubstrate: project.wallSubstrate,
          structuredAssumptions: project.structuredAssumptions,
        },
      });
      const next = await createTakeoffLine(resolved.createInput);
      created.push(next);
    }
  } catch (error) {
    // Best-effort rollback for partial imports when one line insert fails.
    await Promise.allSettled(created.map((line) => deleteTakeoffLine(line.id)));
    throw error;
  }

  await syncSourceQuoteImportStatus(sourceQuoteId);
  return created;
}

export async function syncSourceQuoteImportStatus(sourceQuoteId: string): Promise<SourceQuoteRecord | null> {
  const quote = await getSourceQuote(sourceQuoteId);
  if (!quote) return null;
  const quoteLines = await listSourceQuoteLines(sourceQuoteId);
  const totalLines = quoteLines.length;
  const selectedCount = quoteLines.filter((line) => line.importSelected).length;
  const importedLines = await listTakeoffLines(quote.projectId);
  const importedSelectedCount = importedLines.filter((line) => line.sourceType === 'vendor_quote' && quoteLines.some((quoteLine) => quoteLine.id === line.sourceRef)).length;

  let importStatus: SourceQuoteImportStatus = 'manual_review';
  if (totalLines > 0 && selectedCount > 0) {
    importStatus = importedSelectedCount === 0
      ? 'ready_to_import'
      : importedSelectedCount >= selectedCount
        ? 'imported'
        : 'partially_imported';
  }

  return updateSourceQuote(sourceQuoteId, { importStatus });
}