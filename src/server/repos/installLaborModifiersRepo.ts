import { getEstimatorDb } from '../db/connection.ts';

export type InstallLaborDeltaMode = 'add_minutes' | 'multiplier';

export interface InstallLaborModifierRecord {
  id: string;
  modifierKey: string;
  appliesToInstallLaborFamily: string;
  description: string;
  laborMinutesAdder: number | null;
  laborMultiplier: number | null;
  materialAdder: number | null;
  active: boolean;
}

export function listInstallLaborModifiersForFamily(familyKey: string): InstallLaborModifierRecord[] {
  const rows = getEstimatorDb()
    .prepare(
      `SELECT *
       FROM install_labor_modifiers_v1
       WHERE applies_to_install_labor_family = ?
         AND active = 1
       ORDER BY modifier_key ASC`
    )
    .all(familyKey) as any[];
  return rows.map((r) => ({
    id: r.id,
    modifierKey: r.modifier_key,
    appliesToInstallLaborFamily: r.applies_to_install_labor_family,
    description: r.description || '',
    laborMinutesAdder: r.labor_minutes_adder == null ? null : Number(r.labor_minutes_adder),
    laborMultiplier: r.labor_multiplier == null ? null : Number(r.labor_multiplier),
    materialAdder: r.material_adder == null ? null : Number(r.material_adder),
    active: !!r.active,
  }));
}

