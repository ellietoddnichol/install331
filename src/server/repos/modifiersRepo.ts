import { randomUUID } from 'crypto';
import { getCatalogModifiersReadTableName } from '../db/catalogTable.ts';
import { isPgCatalogBackend } from '../db/catalogBackend.ts';
import { getEstimatorDb } from '../db/connection.ts';
import { isPgDriver } from '../db/driver.ts';
import { dbAll, dbCatalogAll, dbCatalogGet, dbRun } from '../db/query.ts';
import { LineModifierRecord, ModifierRecord } from '../../shared/types/estimator.ts';
import { getConfiguredLaborRatePerHour, getTakeoffLineCore, resolveUnitLaborCostFromMinutes, updateTakeoffLine } from './takeoffRepo.ts';

function mapModifier(row: any): ModifierRecord {
  return {
    id: row.id,
    name: row.name,
    modifierKey: row.modifier_key,
    description: row.description != null ? String(row.description) : '',
    appliesToCategories: JSON.parse(row.applies_to_categories || '[]'),
    addLaborMinutes: row.add_labor_minutes,
    addMaterialCost: row.add_material_cost,
    percentLabor: row.percent_labor,
    percentMaterial: row.percent_material,
    active: !!row.active,
    updatedAt: row.updated_at
  };
}

function mapLineModifier(row: any): LineModifierRecord {
  return {
    id: row.id,
    lineId: row.line_id,
    modifierId: row.modifier_id,
    name: row.name,
    addMaterialCost: row.add_material_cost,
    addLaborMinutes: row.add_labor_minutes,
    percentMaterial: row.percent_material,
    percentLabor: row.percent_labor,
    createdAt: row.created_at
  };
}

function modifiersActiveSql(): string {
  return isPgDriver() ? '(active IS TRUE OR active = 1)' : 'active = 1';
}

export async function listModifiers(): Promise<ModifierRecord[]> {
  const rel = getCatalogModifiersReadTableName();
  const act = modifiersActiveSql();
  if (isPgDriver()) {
    const rows = await dbCatalogAll(`SELECT * FROM ${rel} WHERE ${act} ORDER BY name`);
    return rows.map(mapModifier);
  }
  const rows = getEstimatorDb().prepare(`SELECT * FROM ${rel} WHERE ${act} ORDER BY name`).all();
  return rows.map(mapModifier);
}

export async function listLineModifiers(lineId: string): Promise<LineModifierRecord[]> {
  const rows = isPgDriver()
    ? await dbAll('SELECT * FROM line_modifiers_v1 WHERE line_id = ? ORDER BY created_at', [lineId])
    : getEstimatorDb().prepare('SELECT * FROM line_modifiers_v1 WHERE line_id = ? ORDER BY created_at').all(lineId);
  return rows.map(mapLineModifier);
}

export async function recalculateLineFromModifiers(lineId: string) {
  const line = await getTakeoffLineCore(lineId);
  if (!line) return null;

  const lineModifiers = await listLineModifiers(lineId);
  const laborRatePerHour = await getConfiguredLaborRatePerHour();

  let materialCost = line.baseMaterialCost;
  const baseLaborCost =
    line.laborMinutes > 0
      ? resolveUnitLaborCostFromMinutes(line.laborMinutes || 0, laborRatePerHour)
      : line.baseLaborCost || 0;
  let laborCost = baseLaborCost;

  lineModifiers.forEach((modifier) => {
    materialCost += modifier.addMaterialCost + line.baseMaterialCost * (modifier.percentMaterial / 100);
    laborCost +=
      resolveUnitLaborCostFromMinutes(modifier.addLaborMinutes || 0, laborRatePerHour) +
      baseLaborCost * (modifier.percentLabor / 100);
  });

  return await updateTakeoffLine(lineId, {
    materialCost: Number(materialCost.toFixed(2)),
    laborCost: Number(laborCost.toFixed(2)),
    baseMaterialCost: line.baseMaterialCost,
    baseLaborCost: Number(baseLaborCost.toFixed(2)),
  });
}

export async function recalculateProjectLinePricing(projectId: string) {
  const rows = isPgDriver()
    ? await dbAll('SELECT id FROM takeoff_lines_v1 WHERE project_id = ? ORDER BY created_at', [projectId])
    : getEstimatorDb().prepare('SELECT id FROM takeoff_lines_v1 WHERE project_id = ? ORDER BY created_at').all(projectId);
  const typed = rows as Array<{ id: string }>;
  const results = await Promise.all(typed.map((row) => recalculateLineFromModifiers(row.id)));
  return results.filter(Boolean);
}

export async function recalculateAllLinePricing() {
  const rows = isPgDriver()
    ? await dbAll('SELECT id FROM takeoff_lines_v1 ORDER BY created_at')
    : getEstimatorDb().prepare('SELECT id FROM takeoff_lines_v1 ORDER BY created_at').all();
  const typed = rows as Array<{ id: string }>;
  const results = await Promise.all(typed.map((row) => recalculateLineFromModifiers(row.id)));
  return results.filter(Boolean);
}

export async function applyModifierToLine(
  lineId: string,
  modifierId: string
): Promise<{ line: any; modifier: LineModifierRecord } | null> {
  const line = await getTakeoffLineCore(lineId);
  if (!line) return null;

  const rel = getCatalogModifiersReadTableName();
  const act = modifiersActiveSql();
  const modifierRow = isPgCatalogBackend()
    ? await dbCatalogGet(`SELECT * FROM ${rel} WHERE id = ? AND ${act}`, [modifierId])
    : getEstimatorDb().prepare(`SELECT * FROM ${rel} WHERE id = ? AND active = 1`).get(modifierId);
  if (!modifierRow) return null;

  const modifier = mapModifier(modifierRow);

  const savedLineModifier: LineModifierRecord = {
    id: randomUUID(),
    lineId,
    modifierId: modifier.id,
    name: modifier.name,
    addMaterialCost: modifier.addMaterialCost,
    addLaborMinutes: modifier.addLaborMinutes,
    percentMaterial: modifier.percentMaterial,
    percentLabor: modifier.percentLabor,
    createdAt: new Date().toISOString(),
  };

  const insParams = [
    savedLineModifier.id,
    savedLineModifier.lineId,
    savedLineModifier.modifierId,
    savedLineModifier.name,
    savedLineModifier.addMaterialCost,
    savedLineModifier.addLaborMinutes,
    savedLineModifier.percentMaterial,
    savedLineModifier.percentLabor,
    savedLineModifier.createdAt,
  ];
  if (isPgDriver()) {
    await dbRun(
      `
    INSERT INTO line_modifiers_v1 (
      id, line_id, modifier_id, name, add_material_cost, add_labor_minutes, percent_material, percent_labor, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
      insParams
    );
  } else {
    getEstimatorDb()
      .prepare(
        `
    INSERT INTO line_modifiers_v1 (
      id, line_id, modifier_id, name, add_material_cost, add_labor_minutes, percent_material, percent_labor, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
      )
      .run(...insParams);
  }

  const updatedLine = await recalculateLineFromModifiers(lineId);

  return { line: updatedLine, modifier: savedLineModifier };
}

export async function removeLineModifier(
  lineId: string,
  lineModifierId: string
): Promise<{ line: any; removed: boolean } | null> {
  const line = await getTakeoffLineCore(lineId);
  if (!line) return null;

  const result = isPgDriver()
    ? await dbRun('DELETE FROM line_modifiers_v1 WHERE id = ? AND line_id = ?', [lineModifierId, lineId])
    : getEstimatorDb().prepare('DELETE FROM line_modifiers_v1 WHERE id = ? AND line_id = ?').run(lineModifierId, lineId);
  if (result.changes === 0) {
    return null;
  }

  const updatedLine = await recalculateLineFromModifiers(lineId);
  return { line: updatedLine, removed: true };
}
