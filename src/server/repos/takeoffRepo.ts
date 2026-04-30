import { randomUUID } from 'crypto';
import { dbAll, dbGet, dbRun } from '../db/query.ts';
import type { IntakeMatchConfidence, IntakeScopeBucket } from '../../shared/types/intake.ts';
import { TakeoffLineModifierRollup, TakeoffLineRecord, TakeoffPricingSource } from '../../shared/types/estimator.ts';
import { recordIntakeCatalogMemoryFromAcceptedMatch } from './intakeCatalogMemoryRepo.ts';
import { getRoom } from './roomsRepo.ts';
import { getCatalogItemsTableName } from '../db/catalogTable.ts';

const DEFAULT_LABOR_RATE_PER_HOUR = Number(process.env.DEFAULT_LABOR_RATE_PER_HOUR || 100);

export async function getConfiguredLaborRatePerHour(): Promise<number> {
  const row = (await dbGet('SELECT default_labor_rate_per_hour FROM settings_v1 WHERE id = ?', [
    'global',
  ])) as { default_labor_rate_per_hour?: number } | undefined;
  const rate = Number(row?.default_labor_rate_per_hour);
  return Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_LABOR_RATE_PER_HOUR;
}

export function resolveUnitLaborCostFromMinutes(laborMinutes: number, laborRatePerHour = DEFAULT_LABOR_RATE_PER_HOUR): number {
  const minutes = Number.isFinite(Number(laborMinutes)) ? Number(laborMinutes) : 0;
  const rate = Number.isFinite(Number(laborRatePerHour)) ? Number(laborRatePerHour) : DEFAULT_LABOR_RATE_PER_HOUR;
  if (minutes <= 0 || rate <= 0) return 0;
  return Number(((minutes / 60) * rate).toFixed(2));
}

function resolveLaborCostFromInput(
  laborMinutes: number,
  laborCost: number | undefined,
  fallbackLaborCost: number | undefined,
  laborRatePerHour: number
): number {
  const derivedLaborCost = resolveUnitLaborCostFromMinutes(laborMinutes, laborRatePerHour);
  const providedLaborCost = laborCost ?? fallbackLaborCost;

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

const INTAKE_SCOPE_BUCKETS: IntakeScopeBucket[] = [
  'priced_base_scope',
  'line_condition',
  'project_condition',
  'deduction_alternate',
  'excluded_by_others',
  'allowance',
  'informational_only',
  'unknown',
];

function parseIntakeScopeBucket(raw: unknown): IntakeScopeBucket | null {
  const s = String(raw ?? '').trim();
  return INTAKE_SCOPE_BUCKETS.includes(s as IntakeScopeBucket) ? (s as IntakeScopeBucket) : null;
}

function parseIntakeMatchConfidence(raw: unknown): IntakeMatchConfidence | null {
  const s = String(raw ?? '').trim();
  if (s === 'strong' || s === 'possible' || s === 'none') return s;
  return null;
}

function parseLaborOrigin(raw: unknown): TakeoffLineRecord['laborOrigin'] {
  const s = String(raw ?? '').trim();
  if (s === 'source' || s === 'catalog' || s === 'install_family') return s;
  return null;
}

function normalizeNullableString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s ? s : null;
}

function normalizeNullableBool(value: unknown): boolean | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n > 0;
}

function normalizeNullableNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function shouldRecordCatalogMemoryForLineChange(previous: TakeoffLineRecord | null, next: TakeoffLineRecord): boolean {
  if (!next.catalogItemId) return false;
  if (!previous) return true;
  return (
    previous.catalogItemId !== next.catalogItemId ||
    previous.description !== next.description ||
    previous.sku !== next.sku
  );
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
    intakeScopeBucket: parseIntakeScopeBucket(row.intake_scope_bucket),
    intakeMatchConfidence: parseIntakeMatchConfidence(row.intake_match_confidence),
    sourceManufacturer: normalizeNullableString(row.source_manufacturer),
    sourceBidBucket: normalizeNullableString(row.source_bid_bucket),
    sourceSectionHeader: normalizeNullableString(row.source_section_header),
    isInstallableScope: normalizeNullableBool(row.is_installable_scope),
    installScopeType: normalizeNullableString(row.install_scope_type),
    installLaborFamily: normalizeNullableString(row.install_labor_family),
    sourceMaterialCost: normalizeNullableNumber(row.source_material_cost),
    generatedLaborMinutes: normalizeNullableNumber(row.generated_labor_minutes),
    laborOrigin: parseLaborOrigin(row.labor_origin),
    catalogAttributeSnapshot: (() => {
      const raw = row.catalog_attribute_snapshot_json;
      if (!raw) return null;
      try {
        const parsed = JSON.parse(String(raw));
        return Array.isArray(parsed) ? (parsed as TakeoffLineRecord['catalogAttributeSnapshot']) : null;
      } catch {
        return null;
      }
    })(),
    baseMaterialCostSnapshot: normalizeNullableNumber(row.base_material_cost_snapshot),
    baseLaborMinutesSnapshot: normalizeNullableNumber(row.base_labor_minutes_snapshot),
    attributeDeltaMaterialSnapshot: (() => {
      const raw = row.attribute_delta_material_snapshot_json;
      if (!raw) return null;
      try {
        const parsed = JSON.parse(String(raw));
        return Array.isArray(parsed) ? (parsed as TakeoffLineRecord['attributeDeltaMaterialSnapshot']) : null;
      } catch {
        return null;
      }
    })(),
    attributeDeltaLaborSnapshot: (() => {
      const raw = row.attribute_delta_labor_snapshot_json;
      if (!raw) return null;
      try {
        const parsed = JSON.parse(String(raw));
        return Array.isArray(parsed) ? (parsed as TakeoffLineRecord['attributeDeltaLaborSnapshot']) : null;
      } catch {
        return null;
      }
    })(),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Takeoff row from DB only (no line_modifiers). Use for pricing math and internal joins. */
export async function getTakeoffLineCore(lineId: string): Promise<TakeoffLineRecord | null> {
  const row = await dbGet('SELECT * FROM takeoff_lines_v1 WHERE id = ?', [lineId]);
  return row ? mapTakeoffRow(row) : null;
}

async function batchModifierNamesByLineIds(lineIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (lineIds.length === 0) return map;
  const placeholders = lineIds.map(() => '?').join(',');
  const rows = (await dbAll(
    `SELECT line_id, name FROM line_modifiers_v1 WHERE line_id IN (${placeholders}) ORDER BY created_at`,
    lineIds
  )) as Array<{ line_id: string; name: string }>;
  for (const row of rows) {
    const list = map.get(row.line_id) || [];
    const n = String(row.name || '').trim();
    if (n) list.push(n);
    map.set(row.line_id, list);
  }
  return map;
}

async function batchLineModifierRollups(lineIds: string[]): Promise<Map<string, TakeoffLineModifierRollup>> {
  const out = new Map<string, TakeoffLineModifierRollup>();
  if (lineIds.length === 0) return out;
  const placeholders = lineIds.map(() => '?').join(',');
  const rows = (await dbAll(
    `SELECT line_id,
        COUNT(*) AS modifier_count,
        COALESCE(SUM(add_material_cost), 0) AS sum_add_material,
        COALESCE(SUM(add_labor_minutes), 0) AS sum_add_labor_minutes,
        MAX(CASE WHEN COALESCE(percent_material, 0) > 0 OR COALESCE(percent_labor, 0) > 0 THEN 1 ELSE 0 END) AS has_percent
       FROM line_modifiers_v1 WHERE line_id IN (${placeholders}) GROUP BY line_id`,
    lineIds
  )) as Array<{
    line_id: string;
    modifier_count: number;
    sum_add_material: number;
    sum_add_labor_minutes: number;
    has_percent: number;
  }>;
  for (const row of rows) {
    out.set(row.line_id, {
      count: Number(row.modifier_count) || 0,
      addMaterialCost: Number(row.sum_add_material) || 0,
      addLaborMinutes: Number(row.sum_add_labor_minutes) || 0,
      hasPercentAdjustments: Number(row.has_percent) > 0,
    });
  }
  return out;
}

export async function enrichLineWithModifierNames(line: TakeoffLineRecord): Promise<TakeoffLineRecord> {
  const names = (await batchModifierNamesByLineIds([line.id])).get(line.id);
  const rollup = (await batchLineModifierRollups([line.id])).get(line.id);
  return {
    ...line,
    modifierNames: names && names.length > 0 ? names : undefined,
    lineModifierRollup: rollup && rollup.count > 0 ? rollup : undefined,
  };
}

export async function listTakeoffLines(projectId: string, roomId?: string): Promise<TakeoffLineRecord[]> {
  const rows = roomId
    ? await dbAll('SELECT * FROM takeoff_lines_v1 WHERE project_id = ? AND room_id = ? ORDER BY created_at', [
        projectId,
        roomId,
      ])
    : await dbAll('SELECT * FROM takeoff_lines_v1 WHERE project_id = ? ORDER BY created_at', [projectId]);
  const lines = rows.map(mapTakeoffRow);
  const ids = lines.map((l) => l.id);
  const byLine = await batchModifierNamesByLineIds(ids);
  const rollups = await batchLineModifierRollups(ids);
  return lines.map((line) => ({
    ...line,
    modifierNames: byLine.get(line.id)?.length ? byLine.get(line.id) : undefined,
    lineModifierRollup: rollups.get(line.id),
  }));
}

export async function getTakeoffLine(lineId: string): Promise<TakeoffLineRecord | null> {
  const line = await getTakeoffLineCore(lineId);
  return line ? await enrichLineWithModifierNames(line) : null;
}

function computeLineTotal(
  qty: number,
  materialCost: number,
  laborCost: number,
  unitSell: number | undefined,
  pricingSource: TakeoffPricingSource
): { unitSell: number; lineTotal: number } {
  const calculatedUnitSell = calculateUnitSell(materialCost, laborCost);
  const resolvedUnitSell =
    pricingSource === 'manual'
      ? Number.isFinite(Number(unitSell))
        ? Number(unitSell)
        : calculatedUnitSell
      : calculatedUnitSell;
  return {
    unitSell: Number(resolvedUnitSell.toFixed(2)),
    lineTotal: Number((resolvedUnitSell * qty).toFixed(2)),
  };
}

async function resolveCatalogDefaults(input: Partial<TakeoffLineRecord>): Promise<{
  baseMaterialCost?: number;
  baseLaborMinutes?: number;
  materialCost?: number;
  laborMinutes?: number;
  baseMaterialCostSnapshot?: number | null;
  baseLaborMinutesSnapshot?: number | null;
  attributeDeltaMaterialSnapshot?: TakeoffLineRecord['attributeDeltaMaterialSnapshot'] | null;
  attributeDeltaLaborSnapshot?: TakeoffLineRecord['attributeDeltaLaborSnapshot'] | null;
}> {
  const percentFactor = (value: number) => {
    if (!Number.isFinite(value)) return 0;
    return Math.abs(value) > 1 ? value / 100 : value;
  };

  const applyAttributeDeltas = async (baseMaterialCost: number, baseLaborMinutes: number) => {
    const catalogItemId = input.catalogItemId;
    const snapshot = input.catalogAttributeSnapshot;
    if (!catalogItemId || !snapshot || !Array.isArray(snapshot) || snapshot.length === 0) {
      return {
        materialCost: baseMaterialCost,
        laborMinutes: baseLaborMinutes,
        baseMaterialCostSnapshot: null,
        baseLaborMinutesSnapshot: null,
        attributeDeltaMaterialSnapshot: null,
        attributeDeltaLaborSnapshot: null,
      };
    }

    const selected = new Set(snapshot.map((a) => `${a.attributeType}:${a.attributeValue}`));
    const rows = (await dbAll(
      `SELECT attribute_type, attribute_value, material_delta_type, material_delta_value, labor_delta_type, labor_delta_value
         FROM catalog_item_attributes
         WHERE catalog_item_id = ? AND active = 1`,
      [catalogItemId]
    )) as Array<{
      attribute_type: string;
      attribute_value: string;
      material_delta_type: string | null;
      material_delta_value: number | null;
      labor_delta_type: string | null;
      labor_delta_value: number | null;
    }>;

    let materialCost = baseMaterialCost;
    let laborMinutes = baseLaborMinutes;
    const materialSnapshots: NonNullable<TakeoffLineRecord['attributeDeltaMaterialSnapshot']> = [];
    const laborSnapshots: NonNullable<TakeoffLineRecord['attributeDeltaLaborSnapshot']> = [];

    rows.forEach((row) => {
      const key = `${String(row.attribute_type)}:${String(row.attribute_value)}`;
      if (!selected.has(key)) return;

      const mType = row.material_delta_type ? String(row.material_delta_type) : null;
      const mVal = Number(row.material_delta_value ?? 0);
      if (mType === 'absolute') {
        materialCost += mVal;
        if (mVal !== 0) {
          materialSnapshots.push({
            attributeType: String(row.attribute_type) as any,
            attributeValue: String(row.attribute_value),
            deltaType: 'absolute',
            deltaValue: mVal,
            appliedAmount: mVal,
          });
        }
      }
      if (mType === 'percent') {
        const applied = baseMaterialCost * percentFactor(mVal);
        materialCost += applied;
        if (applied !== 0) {
          materialSnapshots.push({
            attributeType: String(row.attribute_type) as any,
            attributeValue: String(row.attribute_value),
            deltaType: 'percent',
            deltaValue: mVal,
            appliedAmount: Number(applied.toFixed(4)),
          });
        }
      }

      const lType = row.labor_delta_type ? String(row.labor_delta_type) : null;
      const lVal = Number(row.labor_delta_value ?? 0);
      if (lType === 'minutes' || lType === 'absolute') {
        laborMinutes += lVal;
        if (lVal !== 0) {
          laborSnapshots.push({
            attributeType: String(row.attribute_type) as any,
            attributeValue: String(row.attribute_value),
            deltaType: lType as any,
            deltaValue: lVal,
            appliedAmount: lVal,
          });
        }
      }
      if (lType === 'percent') {
        const applied = baseLaborMinutes * percentFactor(lVal);
        laborMinutes += applied;
        if (applied !== 0) {
          laborSnapshots.push({
            attributeType: String(row.attribute_type) as any,
            attributeValue: String(row.attribute_value),
            deltaType: 'percent',
            deltaValue: lVal,
            appliedAmount: Number(applied.toFixed(4)),
          });
        }
      }
    });

    return {
      materialCost: Number(materialCost.toFixed(4)),
      laborMinutes: Number(laborMinutes.toFixed(4)),
      baseMaterialCostSnapshot: baseMaterialCost,
      baseLaborMinutesSnapshot: baseLaborMinutes,
      attributeDeltaMaterialSnapshot: materialSnapshots.length ? materialSnapshots : null,
      attributeDeltaLaborSnapshot: laborSnapshots.length ? laborSnapshots : null,
    };
  };

  const table = getCatalogItemsTableName();
  if (input.catalogItemId) {
    const row = (await dbGet(`SELECT base_material_cost, base_labor_minutes FROM ${table} WHERE id = ? LIMIT 1`, [
      input.catalogItemId,
    ])) as { base_material_cost: number; base_labor_minutes: number } | undefined;
    if (row) {
      const baseMaterialCost = Number(row.base_material_cost || 0);
      const baseLaborMinutes = Number(row.base_labor_minutes || 0);
      const adjusted = await applyAttributeDeltas(baseMaterialCost, baseLaborMinutes);
      return {
        baseMaterialCost,
        baseLaborMinutes,
        materialCost: adjusted.materialCost,
        laborMinutes: adjusted.laborMinutes,
        baseMaterialCostSnapshot: adjusted.baseMaterialCostSnapshot,
        baseLaborMinutesSnapshot: adjusted.baseLaborMinutesSnapshot,
        attributeDeltaMaterialSnapshot: adjusted.attributeDeltaMaterialSnapshot,
        attributeDeltaLaborSnapshot: adjusted.attributeDeltaLaborSnapshot,
      };
    }
  }

  if (input.sku) {
    const row = (await dbGet(
      `SELECT base_material_cost, base_labor_minutes FROM ${table} WHERE lower(sku) = lower(?) LIMIT 1`,
      [input.sku]
    )) as { base_material_cost: number; base_labor_minutes: number } | undefined;
    if (row) {
      const baseMaterialCost = Number(row.base_material_cost || 0);
      const baseLaborMinutes = Number(row.base_labor_minutes || 0);
      return {
        baseMaterialCost,
        baseLaborMinutes,
        materialCost: baseMaterialCost,
        laborMinutes: baseLaborMinutes,
      };
    }
  }

  return {};
}

export async function createTakeoffLine(
  input: Partial<TakeoffLineRecord> & { projectId: string; roomId: string; description: string }
): Promise<TakeoffLineRecord> {
  const now = new Date().toISOString();
  const catalogDefaults = await resolveCatalogDefaults(input);
  const laborRatePerHour = await getConfiguredLaborRatePerHour();
  const qty = input.qty ?? 1;
  const sourceMaterialCost = normalizeNullableNumber(input.sourceMaterialCost);
  const materialCost = input.materialCost ?? catalogDefaults.materialCost ?? sourceMaterialCost ?? 0;
  const generatedLaborMinutes = normalizeNullableNumber(input.generatedLaborMinutes);
  const hasCatalogLabor = catalogDefaults.laborMinutes !== undefined && catalogDefaults.laborMinutes > 0;
  const laborMinutes =
    input.laborMinutes ??
    (hasCatalogLabor ? catalogDefaults.laborMinutes : undefined) ??
    generatedLaborMinutes ??
    0;
  const laborOrigin: TakeoffLineRecord['laborOrigin'] =
    input.laborOrigin !== undefined
      ? parseLaborOrigin(input.laborOrigin)
      : input.laborMinutes !== undefined && input.laborMinutes !== null
        ? 'source'
        : hasCatalogLabor
          ? 'catalog'
          : generatedLaborMinutes !== null && generatedLaborMinutes > 0
            ? 'install_family'
            : null;
  const baseMaterialCost =
    input.baseMaterialCost ?? (catalogDefaults.baseMaterialCost !== undefined ? catalogDefaults.baseMaterialCost : materialCost);
  const baseLaborCost =
    input.baseLaborCost !== undefined
      ? Number(input.baseLaborCost) || 0
      : resolveUnitLaborCostFromMinutes(laborMinutes, laborRatePerHour);
  const laborCost = resolveLaborCostFromInput(laborMinutes, input.laborCost, input.baseLaborCost ?? baseLaborCost, laborRatePerHour);
  const calculatedUnitSell = calculateUnitSell(materialCost, laborCost);
  const pricingSource = normalizePricingSource(
    input.pricingSource ?? (input.unitSell !== undefined && Number(input.unitSell) !== calculatedUnitSell ? 'manual' : 'auto')
  );
  const totals = computeLineTotal(qty, materialCost, laborCost, input.unitSell, pricingSource);

  const intakeScopeBucket =
    input.intakeScopeBucket !== undefined && input.intakeScopeBucket !== null
      ? parseIntakeScopeBucket(input.intakeScopeBucket)
      : null;
  const intakeMatchConfidence =
    input.intakeMatchConfidence !== undefined && input.intakeMatchConfidence !== null
      ? parseIntakeMatchConfidence(input.intakeMatchConfidence)
      : null;
  const sourceManufacturer = normalizeNullableString(input.sourceManufacturer);
  const sourceBidBucket = normalizeNullableString(input.sourceBidBucket);
  const sourceSectionHeader = normalizeNullableString(input.sourceSectionHeader);
  const isInstallableScope = normalizeNullableBool(input.isInstallableScope);
  const installScopeType = normalizeNullableString(input.installScopeType);
  const installLaborFamily = normalizeNullableString(input.installLaborFamily);
  const catalogAttributeSnapshotJson =
    input.catalogAttributeSnapshot && Array.isArray(input.catalogAttributeSnapshot) && input.catalogAttributeSnapshot.length > 0
      ? JSON.stringify(input.catalogAttributeSnapshot)
      : null;
  const baseMaterialCostSnapshot = catalogDefaults.baseMaterialCostSnapshot ?? null;
  const baseLaborMinutesSnapshot = catalogDefaults.baseLaborMinutesSnapshot ?? null;
  const attributeDeltaMaterialSnapshot = catalogDefaults.attributeDeltaMaterialSnapshot ?? null;
  const attributeDeltaLaborSnapshot = catalogDefaults.attributeDeltaLaborSnapshot ?? null;
  const attributeDeltaMaterialSnapshotJson =
    attributeDeltaMaterialSnapshot && Array.isArray(attributeDeltaMaterialSnapshot) && attributeDeltaMaterialSnapshot.length > 0
      ? JSON.stringify(attributeDeltaMaterialSnapshot)
      : null;
  const attributeDeltaLaborSnapshotJson =
    attributeDeltaLaborSnapshot && Array.isArray(attributeDeltaLaborSnapshot) && attributeDeltaLaborSnapshot.length > 0
      ? JSON.stringify(attributeDeltaLaborSnapshot)
      : null;

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
    intakeScopeBucket,
    intakeMatchConfidence,
    sourceManufacturer,
    sourceBidBucket,
    sourceSectionHeader,
    isInstallableScope,
    installScopeType,
    installLaborFamily,
    catalogAttributeSnapshot: input.catalogAttributeSnapshot ?? null,
    baseMaterialCostSnapshot,
    baseLaborMinutesSnapshot,
    attributeDeltaMaterialSnapshot,
    attributeDeltaLaborSnapshot,
    sourceMaterialCost,
    generatedLaborMinutes,
    laborOrigin,
    createdAt: now,
    updatedAt: now,
  };

  await dbRun(
    `
    INSERT INTO takeoff_lines_v1 (
      id, project_id, room_id, source_type, source_ref, description, sku, category, subcategory, base_type,
      qty, unit, material_cost, base_material_cost, labor_minutes, labor_cost, base_labor_cost, pricing_source, unit_sell, line_total, notes, bundle_id, catalog_item_id,
      variant_id, intake_scope_bucket, intake_match_confidence,
      source_manufacturer, source_bid_bucket, source_section_header,
      is_installable_scope, install_scope_type, install_labor_family, source_material_cost, generated_labor_minutes, labor_origin,
      catalog_attribute_snapshot_json,
      base_material_cost_snapshot, base_labor_minutes_snapshot,
      attribute_delta_material_snapshot_json, attribute_delta_labor_snapshot_json,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    [
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
      line.intakeScopeBucket,
      line.intakeMatchConfidence,
      line.sourceManufacturer,
      line.sourceBidBucket,
      line.sourceSectionHeader,
      line.isInstallableScope === null ? null : line.isInstallableScope ? 1 : 0,
      line.installScopeType,
      line.installLaborFamily,
      line.sourceMaterialCost,
      line.generatedLaborMinutes,
      line.laborOrigin,
      catalogAttributeSnapshotJson,
      line.baseMaterialCostSnapshot,
      line.baseLaborMinutesSnapshot,
      attributeDeltaMaterialSnapshotJson,
      attributeDeltaLaborSnapshotJson,
      line.createdAt,
      line.updatedAt,
    ]
  );

  if (shouldRecordCatalogMemoryForLineChange(null, line)) {
    await recordIntakeCatalogMemoryFromAcceptedMatch({
      sku: line.sku,
      description: line.description,
      catalogItemId: line.catalogItemId,
    });
  }

  return await enrichLineWithModifierNames(line);
}

export async function updateTakeoffLine(lineId: string, input: Partial<TakeoffLineRecord>): Promise<TakeoffLineRecord | null> {
  const existing = await getTakeoffLineCore(lineId);
  if (!existing) return null;

  if (input.roomId !== undefined && input.roomId !== existing.roomId) {
    const targetRoom = await getRoom(String(input.roomId));
    if (!targetRoom || targetRoom.projectId !== existing.projectId) {
      return null;
    }
  }

  const sanitizedInput = { ...input };
  delete (sanitizedInput as Partial<{ modifierNames?: unknown }>).modifierNames;
  delete (sanitizedInput as Partial<{ lineModifierRollup?: unknown }>).lineModifierRollup;

  const laborRatePerHour = await getConfiguredLaborRatePerHour();
  const qty = input.qty ?? existing.qty;
  const materialCost = input.materialCost ?? existing.materialCost;
  const laborMinutes = input.laborMinutes ?? existing.laborMinutes;
  const baseMaterialCost = input.baseMaterialCost ?? (input.materialCost !== undefined ? materialCost : existing.baseMaterialCost);
  const baseLaborCost =
    input.baseLaborCost !== undefined
      ? Number(input.baseLaborCost) || 0
      : input.laborMinutes !== undefined
        ? resolveUnitLaborCostFromMinutes(laborMinutes, laborRatePerHour)
        : existing.baseLaborCost;
  const laborCost = resolveLaborCostFromInput(
    laborMinutes,
    input.laborCost,
    input.baseLaborCost ?? (input.laborMinutes !== undefined ? baseLaborCost : existing.laborCost),
    laborRatePerHour
  );
  const pricingSource = normalizePricingSource(input.pricingSource ?? (input.unitSell !== undefined ? 'manual' : existing.pricingSource));
  const totals = computeLineTotal(
    qty,
    materialCost,
    laborCost,
    sanitizedInput.unitSell ?? (pricingSource === 'manual' ? existing.unitSell : undefined),
    pricingSource
  );

  const nextIntakeScope =
    input.intakeScopeBucket !== undefined
      ? input.intakeScopeBucket === null
        ? null
        : parseIntakeScopeBucket(input.intakeScopeBucket)
      : existing.intakeScopeBucket ?? null;
  const nextIntakeConf =
    input.intakeMatchConfidence !== undefined
      ? input.intakeMatchConfidence === null
        ? null
        : parseIntakeMatchConfidence(input.intakeMatchConfidence)
      : existing.intakeMatchConfidence ?? null;
  const nextSourceManufacturer =
    input.sourceManufacturer !== undefined ? normalizeNullableString(input.sourceManufacturer) : existing.sourceManufacturer ?? null;
  const nextSourceBidBucket =
    input.sourceBidBucket !== undefined ? normalizeNullableString(input.sourceBidBucket) : existing.sourceBidBucket ?? null;
  const nextSourceSectionHeader =
    input.sourceSectionHeader !== undefined ? normalizeNullableString(input.sourceSectionHeader) : existing.sourceSectionHeader ?? null;
  const nextIsInstallable =
    input.isInstallableScope !== undefined ? normalizeNullableBool(input.isInstallableScope) : existing.isInstallableScope ?? null;
  const nextInstallScopeType =
    input.installScopeType !== undefined ? normalizeNullableString(input.installScopeType) : existing.installScopeType ?? null;
  const nextInstallLaborFamily =
    input.installLaborFamily !== undefined ? normalizeNullableString(input.installLaborFamily) : existing.installLaborFamily ?? null;
  const nextSourceMaterialCost =
    input.sourceMaterialCost !== undefined ? normalizeNullableNumber(input.sourceMaterialCost) : existing.sourceMaterialCost ?? null;
  const nextGeneratedLaborMinutes =
    input.generatedLaborMinutes !== undefined ? normalizeNullableNumber(input.generatedLaborMinutes) : existing.generatedLaborMinutes ?? null;
  const nextLaborOrigin = input.laborOrigin !== undefined ? parseLaborOrigin(input.laborOrigin) : existing.laborOrigin ?? null;
  const nextCatalogAttributeSnapshot =
    input.catalogAttributeSnapshot !== undefined ? input.catalogAttributeSnapshot : existing.catalogAttributeSnapshot ?? null;
  const nextCatalogAttributeSnapshotJson =
    nextCatalogAttributeSnapshot && Array.isArray(nextCatalogAttributeSnapshot) && nextCatalogAttributeSnapshot.length > 0
      ? JSON.stringify(nextCatalogAttributeSnapshot)
      : null;
  const nextBaseMaterialCostSnapshot =
    input.baseMaterialCostSnapshot !== undefined
      ? normalizeNullableNumber(input.baseMaterialCostSnapshot)
      : existing.baseMaterialCostSnapshot ?? null;
  const nextBaseLaborMinutesSnapshot =
    input.baseLaborMinutesSnapshot !== undefined
      ? normalizeNullableNumber(input.baseLaborMinutesSnapshot)
      : existing.baseLaborMinutesSnapshot ?? null;
  const nextAttributeDeltaMaterialSnapshot =
    input.attributeDeltaMaterialSnapshot !== undefined ? input.attributeDeltaMaterialSnapshot : existing.attributeDeltaMaterialSnapshot ?? null;
  const nextAttributeDeltaLaborSnapshot =
    input.attributeDeltaLaborSnapshot !== undefined ? input.attributeDeltaLaborSnapshot : existing.attributeDeltaLaborSnapshot ?? null;
  const nextAttributeDeltaMaterialSnapshotJson =
    nextAttributeDeltaMaterialSnapshot && Array.isArray(nextAttributeDeltaMaterialSnapshot) && nextAttributeDeltaMaterialSnapshot.length > 0
      ? JSON.stringify(nextAttributeDeltaMaterialSnapshot)
      : null;
  const nextAttributeDeltaLaborSnapshotJson =
    nextAttributeDeltaLaborSnapshot && Array.isArray(nextAttributeDeltaLaborSnapshot) && nextAttributeDeltaLaborSnapshot.length > 0
      ? JSON.stringify(nextAttributeDeltaLaborSnapshot)
      : null;

  const next: TakeoffLineRecord = {
    ...existing,
    ...sanitizedInput,
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
    intakeScopeBucket: nextIntakeScope,
    intakeMatchConfidence: nextIntakeConf,
    sourceManufacturer: nextSourceManufacturer,
    sourceBidBucket: nextSourceBidBucket,
    sourceSectionHeader: nextSourceSectionHeader,
    isInstallableScope: nextIsInstallable,
    installScopeType: nextInstallScopeType,
    installLaborFamily: nextInstallLaborFamily,
    sourceMaterialCost: nextSourceMaterialCost,
    generatedLaborMinutes: nextGeneratedLaborMinutes,
    laborOrigin: nextLaborOrigin,
    catalogAttributeSnapshot: nextCatalogAttributeSnapshot ?? null,
    baseMaterialCostSnapshot: nextBaseMaterialCostSnapshot,
    baseLaborMinutesSnapshot: nextBaseLaborMinutesSnapshot,
    attributeDeltaMaterialSnapshot: nextAttributeDeltaMaterialSnapshot,
    attributeDeltaLaborSnapshot: nextAttributeDeltaLaborSnapshot,
    updatedAt: new Date().toISOString(),
  };

  await dbRun(
    `
    UPDATE takeoff_lines_v1 SET
      room_id = ?, source_type = ?, source_ref = ?, description = ?, sku = ?, category = ?, subcategory = ?, base_type = ?,
      qty = ?, unit = ?, material_cost = ?, base_material_cost = ?, labor_minutes = ?, labor_cost = ?, base_labor_cost = ?, pricing_source = ?, unit_sell = ?, line_total = ?, notes = ?,
      bundle_id = ?, catalog_item_id = ?, variant_id = ?, intake_scope_bucket = ?, intake_match_confidence = ?,
      source_manufacturer = ?, source_bid_bucket = ?, source_section_header = ?,
      is_installable_scope = ?, install_scope_type = ?, install_labor_family = ?, source_material_cost = ?, generated_labor_minutes = ?, labor_origin = ?,
      catalog_attribute_snapshot_json = ?,
      base_material_cost_snapshot = ?, base_labor_minutes_snapshot = ?,
      attribute_delta_material_snapshot_json = ?, attribute_delta_labor_snapshot_json = ?,
      updated_at = ?
    WHERE id = ?
  `,
    [
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
      next.intakeScopeBucket,
      next.intakeMatchConfidence,
      next.sourceManufacturer,
      next.sourceBidBucket,
      next.sourceSectionHeader,
      next.isInstallableScope === null ? null : next.isInstallableScope ? 1 : 0,
      next.installScopeType,
      next.installLaborFamily,
      next.sourceMaterialCost,
      next.generatedLaborMinutes,
      next.laborOrigin,
      nextCatalogAttributeSnapshotJson,
      next.baseMaterialCostSnapshot,
      next.baseLaborMinutesSnapshot,
      nextAttributeDeltaMaterialSnapshotJson,
      nextAttributeDeltaLaborSnapshotJson,
      next.updatedAt,
      lineId,
    ]
  );

  if (shouldRecordCatalogMemoryForLineChange(existing, next)) {
    await recordIntakeCatalogMemoryFromAcceptedMatch({
      sku: next.sku,
      description: next.description,
      catalogItemId: next.catalogItemId,
    });
  }

  return await enrichLineWithModifierNames(next);
}

export async function deleteTakeoffLine(lineId: string): Promise<boolean> {
  const result = await dbRun('DELETE FROM takeoff_lines_v1 WHERE id = ?', [lineId]);
  return result.changes > 0;
}

/** Move lines to a room in the same project. Validates all ids before updating any. */
export async function bulkMoveTakeoffLinesToRoom(
  lineIds: string[],
  targetRoomId: string
): Promise<{ lines: TakeoffLineRecord[] } | { error: string }> {
  const trimmedRoom = String(targetRoomId || '').trim();
  if (!trimmedRoom) return { error: 'roomId is required' };

  const room = await getRoom(trimmedRoom);
  if (!room) return { error: 'Room not found' };

  const uniqueIds = Array.from(new Set(lineIds.map((id) => String(id || '').trim()).filter(Boolean)));
  if (uniqueIds.length === 0) return { error: 'lineIds must include at least one line id' };

  for (const id of uniqueIds) {
    const core = await getTakeoffLineCore(id);
    if (!core) return { error: `Takeoff line not found: ${id}` };
    if (core.projectId !== room.projectId) {
      return { error: 'All lines must belong to the same project as the target room' };
    }
  }

  try {
    const out: TakeoffLineRecord[] = [];
    for (const id of uniqueIds) {
      const updated = await updateTakeoffLine(id, { roomId: trimmedRoom });
      if (!updated) return { error: 'Failed to move one or more lines' };
      out.push(updated);
    }
    return { lines: out };
  } catch {
    return { error: 'Failed to move one or more lines' };
  }
}

/**
 * Deep-clone a takeoff line into `targetRoomId` (must belong to the same project).
 * Copies stored pricing, catalog link, attribute/delta snapshots, and line_modifiers rows.
 * Does not write intake catalog memory (duplicate is not a new match event).
 */
export async function duplicateTakeoffLine(sourceLineId: string, targetRoomId: string): Promise<TakeoffLineRecord | null> {
  const source = await getTakeoffLineCore(sourceLineId);
  if (!source) return null;
  const room = await getRoom(targetRoomId);
  if (!room || room.projectId !== source.projectId) return null;

  const newId = randomUUID();
  const now = new Date().toISOString();

  const inserted = await dbRun(
    `
    INSERT INTO takeoff_lines_v1 (
      id, project_id, room_id, source_type, source_ref, description, sku, category, subcategory, base_type,
      qty, unit, material_cost, base_material_cost, labor_minutes, labor_cost, base_labor_cost, pricing_source, unit_sell, line_total, notes, bundle_id, catalog_item_id,
      variant_id, intake_scope_bucket, intake_match_confidence,
      source_manufacturer, source_bid_bucket, source_section_header,
      is_installable_scope, install_scope_type, install_labor_family, source_material_cost, generated_labor_minutes, labor_origin,
      catalog_attribute_snapshot_json,
      base_material_cost_snapshot, base_labor_minutes_snapshot,
      attribute_delta_material_snapshot_json, attribute_delta_labor_snapshot_json,
      created_at, updated_at
    )
    SELECT
      ?, project_id, ?, source_type, source_ref, description, sku, category, subcategory, base_type,
      qty, unit, material_cost, base_material_cost, labor_minutes, labor_cost, base_labor_cost, pricing_source, unit_sell, line_total, notes, bundle_id, catalog_item_id,
      variant_id, intake_scope_bucket, intake_match_confidence,
      source_manufacturer, source_bid_bucket, source_section_header,
      is_installable_scope, install_scope_type, install_labor_family, source_material_cost, generated_labor_minutes, labor_origin,
      catalog_attribute_snapshot_json,
      base_material_cost_snapshot, base_labor_minutes_snapshot,
      attribute_delta_material_snapshot_json, attribute_delta_labor_snapshot_json,
      ?, ?
    FROM takeoff_lines_v1 WHERE id = ?
  `,
    [newId, targetRoomId, now, now, sourceLineId]
  );

  if (!inserted.changes) return null;

  const modRows = (await dbAll(
    `SELECT modifier_id, name, add_material_cost, add_labor_minutes, percent_material, percent_labor, created_at
       FROM line_modifiers_v1 WHERE line_id = ? ORDER BY created_at`,
    [sourceLineId]
  )) as Array<{
    modifier_id: string;
    name: string;
    add_material_cost: number;
    add_labor_minutes: number;
    percent_material: number;
    percent_labor: number;
    created_at: string;
  }>;

  for (const m of modRows) {
    await dbRun(
      `INSERT INTO line_modifiers_v1 (id, line_id, modifier_id, name, add_material_cost, add_labor_minutes, percent_material, percent_labor, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        newId,
        m.modifier_id,
        m.name,
        m.add_material_cost,
        m.add_labor_minutes,
        m.percent_material,
        m.percent_labor,
        m.created_at,
      ]
    );
  }

  return await getTakeoffLine(newId);
}
