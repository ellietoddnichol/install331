import { randomUUID } from 'crypto';
import { estimatorDb } from '../db/connection.ts';
import { TakeoffLineRecord, TakeoffPricingSource } from '../../shared/types/estimator.ts';

const DEFAULT_LABOR_RATE_PER_HOUR = Number(process.env.DEFAULT_LABOR_RATE_PER_HOUR || 85);

export function getConfiguredLaborRatePerHour(): number {
  const row = estimatorDb.prepare('SELECT default_labor_rate_per_hour FROM settings_v1 WHERE id = ?').get('global') as { default_labor_rate_per_hour?: number } | undefined;
  const rate = Number(row?.default_labor_rate_per_hour);
  return Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_LABOR_RATE_PER_HOUR;
}

export function resolveUnitLaborCostFromMinutes(laborMinutes: number, laborRatePerHour = DEFAULT_LABOR_RATE_PER_HOUR): number {
  const minutes = Number.isFinite(Number(laborMinutes)) ? Number(laborMinutes) : 0;
  const rate = Number.isFinite(Number(laborRatePerHour)) ? Number(laborRatePerHour) : DEFAULT_LABOR_RATE_PER_HOUR;
  if (minutes <= 0 || rate <= 0) return 0;
  return Number(((minutes / 60) * rate).toFixed(2));
}

function resolveLaborCostFromInput(laborMinutes: number, laborCost: number | undefined, fallbackLaborCost: number | undefined, laborRatePerHour: number): number {
  const derivedLaborCost = resolveUnitLaborCostFromMinutes(laborMinutes, laborRatePerHour);
  const providedLaborCost = laborCost ?? fallbackLaborCost;

  // Treat zero/negative provided values as unset when labor minutes indicate real labor.
  if (laborMinutes > 0 && (!Number.isFinite(Number(providedLaborCost)) || Number(providedLaborCost) <= 0)) {
    return derivedLaborCost;
  }

  return Number.isFinite(Number(providedLaborCost)) ? Number(providedLaborCost) : 0;
}

function normalizePricingSource(value: unknown): TakeoffPricingSource {
  return value === 'manual' ? 'manual' : 'auto';
}

function calculateUnitSell(materialCost: number, laborCost: number): number {
  return Number((materialCost + laborCost).toFixed(2));
}

function mapTakeoffRow(row: any): TakeoffLineRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    roomId: row.room_id,
    sourceType: row.source_type,
    sourceRef: row.source_ref,
    description: row.description,
    sku: row.sku,
    category: row.category,
    subcategory: row.subcategory,
    baseType: row.base_type,
    qty: row.qty,
    unit: row.unit,
    materialCost: row.material_cost,
    baseMaterialCost: row.base_material_cost,
    laborMinutes: row.labor_minutes,
    laborCost: row.labor_cost,
    baseLaborCost: row.base_labor_cost,
    pricingSource: normalizePricingSource(row.pricing_source),
    unitSell: row.unit_sell,
    lineTotal: row.line_total,
    notes: row.notes,
    bundleId: row.bundle_id,
    catalogItemId: row.catalog_item_id,
    variantId: row.variant_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function listTakeoffLines(projectId: string, roomId?: string): TakeoffLineRecord[] {
  const rows = roomId
    ? estimatorDb.prepare('SELECT * FROM takeoff_lines_v1 WHERE project_id = ? AND room_id = ? ORDER BY created_at').all(projectId, roomId)
    : estimatorDb.prepare('SELECT * FROM takeoff_lines_v1 WHERE project_id = ? ORDER BY created_at').all(projectId);
  return rows.map(mapTakeoffRow);
}

export function getTakeoffLine(lineId: string): TakeoffLineRecord | null {
  const row = estimatorDb.prepare('SELECT * FROM takeoff_lines_v1 WHERE id = ?').get(lineId);
  return row ? mapTakeoffRow(row) : null;
}

function computeLineTotal(
  qty: number,
  materialCost: number,
  laborCost: number,
  unitSell: number | undefined,
  pricingSource: TakeoffPricingSource
): { unitSell: number; lineTotal: number } {
  const calculatedUnitSell = calculateUnitSell(materialCost, laborCost);
  const resolvedUnitSell = pricingSource === 'manual'
    ? (Number.isFinite(Number(unitSell)) ? Number(unitSell) : calculatedUnitSell)
    : calculatedUnitSell;
  return {
    unitSell: Number(resolvedUnitSell.toFixed(2)),
    lineTotal: Number((resolvedUnitSell * qty).toFixed(2))
  };
}

function resolveCatalogDefaults(input: Partial<TakeoffLineRecord>): {
  materialCost?: number;
  laborMinutes?: number;
} {
  if (input.catalogItemId) {
    const row = estimatorDb.prepare('SELECT base_material_cost, base_labor_minutes FROM catalog_items WHERE id = ? LIMIT 1').get(input.catalogItemId) as
      | { base_material_cost: number; base_labor_minutes: number }
      | undefined;
    if (row) {
      return {
        materialCost: Number(row.base_material_cost || 0),
        laborMinutes: Number(row.base_labor_minutes || 0),
      };
    }
  }

  if (input.sku) {
    const row = estimatorDb.prepare('SELECT base_material_cost, base_labor_minutes FROM catalog_items WHERE lower(sku) = lower(?) LIMIT 1').get(input.sku) as
      | { base_material_cost: number; base_labor_minutes: number }
      | undefined;
    if (row) {
      return {
        materialCost: Number(row.base_material_cost || 0),
        laborMinutes: Number(row.base_labor_minutes || 0),
      };
    }
  }

  return {};
}

export function createTakeoffLine(input: Partial<TakeoffLineRecord> & { projectId: string; roomId: string; description: string }): TakeoffLineRecord {
  const now = new Date().toISOString();
  const catalogDefaults = resolveCatalogDefaults(input);
  const laborRatePerHour = getConfiguredLaborRatePerHour();
  const qty = input.qty ?? 1;
  const materialCost = input.materialCost ?? catalogDefaults.materialCost ?? 0;
  const laborMinutes = input.laborMinutes ?? catalogDefaults.laborMinutes ?? 0;
  const baseMaterialCost = input.baseMaterialCost ?? materialCost;
  const baseLaborCost = input.baseLaborCost !== undefined
    ? Number(input.baseLaborCost) || 0
    : resolveUnitLaborCostFromMinutes(laborMinutes, laborRatePerHour);
  const laborCost = resolveLaborCostFromInput(laborMinutes, input.laborCost, input.baseLaborCost ?? baseLaborCost, laborRatePerHour);
  const calculatedUnitSell = calculateUnitSell(materialCost, laborCost);
  const pricingSource = normalizePricingSource(
    input.pricingSource ?? (input.unitSell !== undefined && Number(input.unitSell) !== calculatedUnitSell ? 'manual' : 'auto')
  );
  const totals = computeLineTotal(qty, materialCost, laborCost, input.unitSell, pricingSource);

  const line: TakeoffLineRecord = {
    id: input.id ?? randomUUID(),
    projectId: input.projectId,
    roomId: input.roomId,
    sourceType: input.sourceType ?? 'manual',
    sourceRef: input.sourceRef ?? null,
    description: input.description,
    sku: input.sku ?? null,
    category: input.category ?? null,
    subcategory: input.subcategory ?? null,
    baseType: input.baseType ?? null,
    qty,
    unit: input.unit ?? 'EA',
    materialCost,
    baseMaterialCost,
    laborMinutes,
    laborCost,
    baseLaborCost,
    pricingSource,
    unitSell: totals.unitSell,
    lineTotal: totals.lineTotal,
    notes: input.notes ?? null,
    bundleId: input.bundleId ?? null,
    catalogItemId: input.catalogItemId ?? null,
    variantId: input.variantId ?? null,
    createdAt: now,
    updatedAt: now
  };

  estimatorDb.prepare(`
    INSERT INTO takeoff_lines_v1 (
      id, project_id, room_id, source_type, source_ref, description, sku, category, subcategory, base_type,
      qty, unit, material_cost, base_material_cost, labor_minutes, labor_cost, base_labor_cost, pricing_source, unit_sell, line_total, notes, bundle_id, catalog_item_id,
      variant_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    line.id,
    line.projectId,
    line.roomId,
    line.sourceType,
    line.sourceRef,
    line.description,
    line.sku,
    line.category,
    line.subcategory,
    line.baseType,
    line.qty,
    line.unit,
    line.materialCost,
    line.baseMaterialCost,
    line.laborMinutes,
    line.laborCost,
    line.baseLaborCost,
    line.pricingSource,
    line.unitSell,
    line.lineTotal,
    line.notes,
    line.bundleId,
    line.catalogItemId,
    line.variantId,
    line.createdAt,
    line.updatedAt
  );

  return line;
}

export function updateTakeoffLine(lineId: string, input: Partial<TakeoffLineRecord>): TakeoffLineRecord | null {
  const existing = getTakeoffLine(lineId);
  if (!existing) return null;

  const laborRatePerHour = getConfiguredLaborRatePerHour();
  const qty = input.qty ?? existing.qty;
  const materialCost = input.materialCost ?? existing.materialCost;
  const laborMinutes = input.laborMinutes ?? existing.laborMinutes;
  const baseMaterialCost = input.baseMaterialCost ?? (input.materialCost !== undefined ? materialCost : existing.baseMaterialCost);
  const baseLaborCost = input.baseLaborCost !== undefined
    ? Number(input.baseLaborCost) || 0
    : input.laborMinutes !== undefined
      ? resolveUnitLaborCostFromMinutes(laborMinutes, laborRatePerHour)
      : existing.baseLaborCost;
  const laborCost = resolveLaborCostFromInput(laborMinutes, input.laborCost, input.baseLaborCost ?? (input.laborMinutes !== undefined ? baseLaborCost : existing.laborCost), laborRatePerHour);
  const pricingSource = normalizePricingSource(input.pricingSource ?? (input.unitSell !== undefined ? 'manual' : existing.pricingSource));
  const totals = computeLineTotal(
    qty,
    materialCost,
    laborCost,
    input.unitSell ?? (pricingSource === 'manual' ? existing.unitSell : undefined),
    pricingSource
  );

  const next: TakeoffLineRecord = {
    ...existing,
    ...input,
    id: lineId,
    qty,
    laborMinutes,
    materialCost,
    baseMaterialCost,
    laborCost,
    baseLaborCost,
    pricingSource,
    unitSell: totals.unitSell,
    lineTotal: totals.lineTotal,
    updatedAt: new Date().toISOString()
  };

  estimatorDb.prepare(`
    UPDATE takeoff_lines_v1 SET
      room_id = ?, source_type = ?, source_ref = ?, description = ?, sku = ?, category = ?, subcategory = ?, base_type = ?,
      qty = ?, unit = ?, material_cost = ?, base_material_cost = ?, labor_minutes = ?, labor_cost = ?, base_labor_cost = ?, pricing_source = ?, unit_sell = ?, line_total = ?, notes = ?,
      bundle_id = ?, catalog_item_id = ?, variant_id = ?, updated_at = ?
    WHERE id = ?
  `).run(
    next.roomId,
    next.sourceType,
    next.sourceRef,
    next.description,
    next.sku,
    next.category,
    next.subcategory,
    next.baseType,
    next.qty,
    next.unit,
    next.materialCost,
    next.baseMaterialCost,
    next.laborMinutes,
    next.laborCost,
    next.baseLaborCost,
    next.pricingSource,
    next.unitSell,
    next.lineTotal,
    next.notes,
    next.bundleId,
    next.catalogItemId,
    next.variantId,
    next.updatedAt,
    lineId
  );

  return next;
}

export function deleteTakeoffLine(lineId: string): boolean {
  const result = estimatorDb.prepare('DELETE FROM takeoff_lines_v1 WHERE id = ?').run(lineId);
  return result.changes > 0;
}
