import { randomUUID } from 'crypto';
import { estimatorDb } from '../db/connection.ts';
import { LineModifierRecord, ModifierRecord } from '../../shared/types/estimator.ts';
import { getTakeoffLine, resolveUnitLaborCostFromMinutes, updateTakeoffLine } from './takeoffRepo.ts';

function mapModifier(row: any): ModifierRecord {
  return {
    id: row.id,
    name: row.name,
    modifierKey: row.modifier_key,
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

export function listModifiers(): ModifierRecord[] {
  const rows = estimatorDb.prepare('SELECT * FROM modifiers_v1 WHERE active = 1 ORDER BY name').all();
  return rows.map(mapModifier);
}

export function listLineModifiers(lineId: string): LineModifierRecord[] {
  const rows = estimatorDb.prepare('SELECT * FROM line_modifiers_v1 WHERE line_id = ? ORDER BY created_at').all(lineId);
  return rows.map(mapLineModifier);
}

function recalculateLineFromModifiers(lineId: string) {
  const line = getTakeoffLine(lineId);
  if (!line) return null;

  const lineModifiers = listLineModifiers(lineId);

  let materialCost = line.baseMaterialCost;
  let laborCost = line.baseLaborCost || resolveUnitLaborCostFromMinutes(line.laborMinutes || 0);

  lineModifiers.forEach((modifier) => {
    materialCost += modifier.addMaterialCost + (line.baseMaterialCost * (modifier.percentMaterial / 100));
    laborCost += resolveUnitLaborCostFromMinutes(modifier.addLaborMinutes || 0) + ((line.baseLaborCost || 0) * (modifier.percentLabor / 100));
  });

  return updateTakeoffLine(lineId, {
    materialCost: Number(materialCost.toFixed(2)),
    laborCost: Number(laborCost.toFixed(2)),
    baseMaterialCost: line.baseMaterialCost,
    baseLaborCost: line.baseLaborCost,
    unitSell: Number((materialCost + laborCost).toFixed(2))
  });
}

export function applyModifierToLine(lineId: string, modifierId: string): { line: any; modifier: LineModifierRecord } | null {
  const line = getTakeoffLine(lineId);
  if (!line) return null;

  const modifierRow = estimatorDb.prepare('SELECT * FROM modifiers_v1 WHERE id = ? AND active = 1').get(modifierId);
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
    createdAt: new Date().toISOString()
  };

  estimatorDb.prepare(`
    INSERT INTO line_modifiers_v1 (
      id, line_id, modifier_id, name, add_material_cost, add_labor_minutes, percent_material, percent_labor, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    savedLineModifier.id,
    savedLineModifier.lineId,
    savedLineModifier.modifierId,
    savedLineModifier.name,
    savedLineModifier.addMaterialCost,
    savedLineModifier.addLaborMinutes,
    savedLineModifier.percentMaterial,
    savedLineModifier.percentLabor,
    savedLineModifier.createdAt
  );

  const updatedLine = recalculateLineFromModifiers(lineId);

  return { line: updatedLine, modifier: savedLineModifier };
}

export function removeLineModifier(lineId: string, lineModifierId: string): { line: any; removed: boolean } | null {
  const line = getTakeoffLine(lineId);
  if (!line) return null;

  const result = estimatorDb.prepare('DELETE FROM line_modifiers_v1 WHERE id = ? AND line_id = ?').run(lineModifierId, lineId);
  if (result.changes === 0) {
    return null;
  }

  const updatedLine = recalculateLineFromModifiers(lineId);
  return { line: updatedLine, removed: true };
}
