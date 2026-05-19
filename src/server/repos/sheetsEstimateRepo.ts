import { randomUUID } from 'crypto';
import type { TakeoffLineRecord } from '../../shared/types/estimator.ts';
import { bulkUpsertRows, readRowsWithLegacyTab, upsertRowById, SHEETS_TABS, type SheetsRow } from '../integrations/googleSheets.ts';
import { projectSetupTabEstimateLines } from '../config/div10SheetsWorkbooks.ts';
import { assertSheetsWorkbookId, getProjectsSpreadsheetId } from './dataBackend.ts';

function estimateLinesTab(): string {
  return projectSetupTabEstimateLines();
}

function projectsWorkbookId(): string {
  return assertSheetsWorkbookId(getProjectsSpreadsheetId(), 'PROJECT_SETUP_ESTIMATE_PROPOSAL_SPREADSHEET_ID');
}

function toNumber(value: string | undefined, fallback = 0): number {
  const n = Number(String(value || '').trim());
  return Number.isFinite(n) ? n : fallback;
}

function mapLineToSheetRow(line: TakeoffLineRecord): SheetsRow {
  return {
    EstimateLineID: line.id,
    ProjectID: line.projectId,
    RoomID: line.roomId || 'general',
    SourceType: line.sourceType,
    SourceRef: line.sourceRef || '',
    Description: line.description,
    SKU: line.sku || '',
    Category: line.category || '',
    Subcategory: line.subcategory || '',
    Qty: line.qty,
    Unit: line.unit,
    Taxable: line.taxable ? 'TRUE' : 'FALSE',
    MaterialCost: line.materialCost,
    BaseMaterialCost: line.baseMaterialCost,
    LaborMinutes: line.laborMinutes,
    LaborCost: line.laborCost,
    BaseLaborCost: line.baseLaborCost,
    PricingSource: line.pricingSource,
    UnitSell: line.unitSell,
    LineTotal: line.lineTotal,
    Notes: line.notes || '',
    BundleID: line.bundleId || '',
    CatalogItemID: line.catalogItemId || '',
    VariantID: line.variantId || '',
    ProposalVisibility: line.proposalVisibility || 'customer_visible',
    SourceLineType: line.sourceLineType || 'source_line',
    SourceManufacturer: line.sourceManufacturer || '',
    SourceBidBucket: line.sourceBidBucket || '',
    SourceSectionHeader: line.sourceSectionHeader || '',
    IsInstallableScope: line.isInstallableScope == null ? '' : line.isInstallableScope ? 'TRUE' : 'FALSE',
    InstallScopeType: line.installScopeType || '',
    InstallLaborFamily: line.installLaborFamily || '',
    SourceMaterialCost: line.sourceMaterialCost == null ? '' : line.sourceMaterialCost,
    GeneratedLaborMinutes: line.generatedLaborMinutes == null ? '' : line.generatedLaborMinutes,
    LaborOrigin: line.laborOrigin || '',
    CreatedAt: line.createdAt,
    UpdatedAt: line.updatedAt,
  };
}

function mapLineFromSheet(row: Record<string, string>): TakeoffLineRecord {
  const now = new Date().toISOString();
  const qty = toNumber(row.Qty, 1) || 1;
  const taxableCell = String(row.Taxable || '').trim().toLowerCase();
  const taxable = taxableCell === '' ? true : (taxableCell === 'true' || taxableCell === '1' || taxableCell === 'yes' || taxableCell === 'y');
  const materialCost = toNumber(row.MaterialCost, 0);
  const unitSell = row.UnitSell != null && row.UnitSell !== '' ? toNumber(row.UnitSell, materialCost) : materialCost;
  return {
    id: String(row.EstimateLineID || '').trim(),
    projectId: String(row.ProjectID || '').trim(),
    roomId: String(row.RoomID || 'general').trim() || 'general',
    sourceType: String(row.SourceType || 'manual').trim() || 'manual',
    sourceRef: String(row.SourceRef || '').trim() || null,
    description: String(row.Description || '').trim(),
    sku: String(row.SKU || '').trim() || null,
    category: String(row.Category || '').trim() || null,
    subcategory: String(row.Subcategory || '').trim() || null,
    baseType: null,
    qty,
    unit: String(row.Unit || 'EA').trim() || 'EA',
    taxable,
    materialCost,
    baseMaterialCost: row.BaseMaterialCost != null && row.BaseMaterialCost !== '' ? toNumber(row.BaseMaterialCost, materialCost) : materialCost,
    laborMinutes: toNumber(row.LaborMinutes, 0),
    laborCost: toNumber(row.LaborCost, 0),
    baseLaborCost: row.BaseLaborCost != null && row.BaseLaborCost !== '' ? toNumber(row.BaseLaborCost, 0) : toNumber(row.LaborCost, 0),
    pricingSource: (String(row.PricingSource || 'manual').trim() || 'manual') as TakeoffLineRecord['pricingSource'],
    unitSell,
    lineTotal: row.LineTotal != null && row.LineTotal !== '' ? toNumber(row.LineTotal, unitSell * qty) : unitSell * qty,
    notes: String(row.Notes || '').trim() || null,
    bundleId: String(row.BundleID || '').trim() || null,
    catalogItemId: String(row.CatalogItemID || '').trim() || null,
    variantId: String(row.VariantID || '').trim() || null,
    proposalVisibility: (String(row.ProposalVisibility || 'customer_visible').trim() || 'customer_visible') as TakeoffLineRecord['proposalVisibility'],
    sourceLineType: (String(row.SourceLineType || 'source_line').trim() || 'source_line') as TakeoffLineRecord['sourceLineType'],
    sourceManufacturer: String(row.SourceManufacturer || '').trim() || null,
    sourceBidBucket: String(row.SourceBidBucket || '').trim() || null,
    sourceSectionHeader: String(row.SourceSectionHeader || '').trim() || null,
    isInstallableScope: row.IsInstallableScope === '' ? null : String(row.IsInstallableScope || '').trim().toLowerCase() === 'true',
    installScopeType: String(row.InstallScopeType || '').trim() || null,
    installLaborFamily: String(row.InstallLaborFamily || '').trim() || null,
    sourceMaterialCost: row.SourceMaterialCost == null || row.SourceMaterialCost === '' ? null : toNumber(row.SourceMaterialCost, 0),
    generatedLaborMinutes: row.GeneratedLaborMinutes == null || row.GeneratedLaborMinutes === '' ? null : toNumber(row.GeneratedLaborMinutes, 0),
    laborOrigin: (String(row.LaborOrigin || '').trim() || null) as TakeoffLineRecord['laborOrigin'],
    modifierNames: [],
    createdAt: String(row.CreatedAt || '').trim() || now,
    updatedAt: String(row.UpdatedAt || row.CreatedAt || '').trim() || now,
  };
}

export async function getEstimateLineFromSheets(lineId: string): Promise<TakeoffLineRecord | null> {
  const rows = await readRowsWithLegacyTab(estimateLinesTab(), SHEETS_TABS.ESTIMATE_LINES, projectsWorkbookId());
  const row = rows.find((r) => String(r.EstimateLineID || '').trim() === lineId);
  return row ? mapLineFromSheet(row) : null;
}

export async function listEstimateLinesFromSheets(projectId: string, roomId?: string): Promise<TakeoffLineRecord[]> {
  const rows = await readRowsWithLegacyTab(estimateLinesTab(), SHEETS_TABS.ESTIMATE_LINES, projectsWorkbookId());
  return rows
    .map(mapLineFromSheet)
    .filter((line) => line.projectId === projectId)
    .filter((line) => (!roomId ? true : line.roomId === roomId));
}

export async function upsertEstimateLinesToSheets(projectId: string, lines: TakeoffLineRecord[]): Promise<void> {
  const rows = lines
    .filter((line) => line.projectId === projectId)
    .map((line) => mapLineToSheetRow(line));
  if (rows.length === 0) return;
  await bulkUpsertRows(estimateLinesTab(), 'EstimateLineID', rows, projectsWorkbookId());
}

export async function createEstimateLineInSheets(input: Partial<TakeoffLineRecord> & { projectId: string; roomId: string; description: string }): Promise<TakeoffLineRecord> {
  const now = new Date().toISOString();
  const qty = Number(input.qty || 0) > 0 ? Number(input.qty) : 1;
  const materialCost = Number(input.materialCost || 0) || 0;
  const unitSell = input.unitSell == null ? materialCost : Number(input.unitSell || 0);
  const line: TakeoffLineRecord = {
    id: input.id || randomUUID(),
    projectId: input.projectId,
    roomId: input.roomId || 'general',
    sourceType: input.sourceType || 'manual',
    sourceRef: input.sourceRef ?? null,
    description: String(input.description || '').trim(),
    sku: input.sku ?? null,
    category: input.category ?? null,
    subcategory: input.subcategory ?? null,
    baseType: input.baseType ?? null,
    qty,
    unit: String(input.unit || 'EA').trim() || 'EA',
    taxable: input.taxable ?? true,
    materialCost,
    baseMaterialCost: input.baseMaterialCost == null ? materialCost : Number(input.baseMaterialCost || 0),
    laborMinutes: Number(input.laborMinutes || 0) || 0,
    laborCost: Number(input.laborCost || 0) || 0,
    baseLaborCost: input.baseLaborCost == null ? Number(input.laborCost || 0) || 0 : Number(input.baseLaborCost || 0),
    pricingSource: (input.pricingSource || 'manual') as TakeoffLineRecord['pricingSource'],
    unitSell,
    lineTotal: input.lineTotal == null ? unitSell * qty : Number(input.lineTotal || 0),
    notes: input.notes ?? null,
    bundleId: input.bundleId ?? null,
    catalogItemId: input.catalogItemId ?? null,
    variantId: input.variantId ?? null,
    modifierNames: [],
    createdAt: now,
    updatedAt: now,
  };
  await upsertRowById(estimateLinesTab(), 'EstimateLineID', mapLineToSheetRow(line), projectsWorkbookId());
  return line;
}

export async function updateEstimateLineInSheets(lineId: string, input: Partial<TakeoffLineRecord>): Promise<TakeoffLineRecord | null> {
  const rows = await readRowsWithLegacyTab(estimateLinesTab(), SHEETS_TABS.ESTIMATE_LINES, projectsWorkbookId());
  const row = rows.find((r) => String(r.EstimateLineID || '').trim() === lineId);
  if (!row) return null;
  const current = mapLineFromSheet(row);
  const next: TakeoffLineRecord = {
    ...current,
    ...input,
    id: lineId,
    updatedAt: new Date().toISOString(),
  };
  await upsertRowById(estimateLinesTab(), 'EstimateLineID', mapLineToSheetRow(next), projectsWorkbookId());
  return next;
}

export async function deleteEstimateLineInSheets(lineId: string): Promise<boolean> {
  const updated = await updateRowSoftDelete(lineId);
  return updated;
}

async function updateRowSoftDelete(lineId: string): Promise<boolean> {
  const rows = await readRowsWithLegacyTab(estimateLinesTab(), SHEETS_TABS.ESTIMATE_LINES, projectsWorkbookId());
  const row = rows.find((r) => String(r.EstimateLineID || '').trim() === lineId);
  if (!row) return false;
  await upsertRowById(
    estimateLinesTab(),
    'EstimateLineID',
    {
      ...row,
      Qty: 0,
      LineTotal: 0,
      Notes: `${String(row.Notes || '').trim()} [deleted]`.trim(),
      UpdatedAt: new Date().toISOString(),
    },
    projectsWorkbookId()
  );
  return true;
}
