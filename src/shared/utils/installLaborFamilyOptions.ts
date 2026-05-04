/**
 * Client-side mirror of the server install-labor-family registry.
 * Kept as a flat list so the Catalog editor can offer a dropdown without a
 * round-trip. Keys must match `src/server/services/intake/installLaborFamilies.ts`.
 *
 * When adding a new family:
 *   1. Update `src/server/services/intake/installLaborFamilies.ts` (source of truth).
 *   2. Mirror the key + label here.
 *   3. Update any tests that assert on family keys.
 */
export interface InstallLaborFamilyOption {
  key: string;
  label: string;
  defaultMinutes: number;
  unitBasis: string;
}

export const INSTALL_LABOR_FAMILY_OPTIONS: ReadonlyArray<InstallLaborFamilyOption> = [
  { key: 'partition_compartment', label: 'Toilet partition — compartment', defaultMinutes: 90, unitBasis: 'per_compartment' },
  { key: 'urinal_screen', label: 'Urinal screen', defaultMinutes: 35, unitBasis: 'per_screen' },
  { key: 'pilaster', label: 'Pilaster / support post', defaultMinutes: 30, unitBasis: 'per_pilaster' },
  { key: 'partition_hardware', label: 'Partition hardware kit', defaultMinutes: 20, unitBasis: 'per_hardware_kit' },
  { key: 'mirror', label: 'Mirror (framed or frameless)', defaultMinutes: 25, unitBasis: 'per_each' },
  { key: 'grab_bar', label: 'Grab bar (generic)', defaultMinutes: 25, unitBasis: 'per_each' },
  { key: 'grab_bar_18', label: 'Grab bar 18"', defaultMinutes: 22, unitBasis: 'per_each' },
  { key: 'grab_bar_24', label: 'Grab bar 24"', defaultMinutes: 24, unitBasis: 'per_each' },
  { key: 'grab_bar_30', label: 'Grab bar 30"', defaultMinutes: 26, unitBasis: 'per_each' },
  { key: 'grab_bar_36', label: 'Grab bar 36"', defaultMinutes: 28, unitBasis: 'per_each' },
  { key: 'grab_bar_42', label: 'Grab bar 42"', defaultMinutes: 30, unitBasis: 'per_each' },
  { key: 'sanitary_napkin_disposal', label: 'Sanitary napkin disposal', defaultMinutes: 18, unitBasis: 'per_each' },
  { key: 'soap_dispenser', label: 'Soap dispenser', defaultMinutes: 15, unitBasis: 'per_each' },
  { key: 'paper_towel_dispenser', label: 'Paper towel dispenser', defaultMinutes: 18, unitBasis: 'per_each' },
  { key: 'hand_dryer', label: 'Hand dryer (excl. electrical rough-in)', defaultMinutes: 45, unitBasis: 'per_each' },
  { key: 'toilet_tissue_dispenser', label: 'Toilet tissue dispenser', defaultMinutes: 15, unitBasis: 'per_each' },
  { key: 'fire_extinguisher_cabinet', label: 'Fire extinguisher cabinet', defaultMinutes: 35, unitBasis: 'per_each' },
  { key: 'locker', label: 'Locker (per opening)', defaultMinutes: 20, unitBasis: 'per_each' },
  { key: 'bench', label: 'Locker-room bench', defaultMinutes: 40, unitBasis: 'per_each' },
  { key: 'access_door', label: 'Access door / panel', defaultMinutes: 30, unitBasis: 'per_each' },
  { key: 'signage', label: 'Signage / wayfinding', defaultMinutes: 10, unitBasis: 'per_each' },
  { key: 'accessory_generic', label: 'Generic wall-mounted accessory', defaultMinutes: 20, unitBasis: 'per_each' },
];

export function findInstallLaborFamilyOption(key: string | null | undefined): InstallLaborFamilyOption | null {
  if (!key) return null;
  return INSTALL_LABOR_FAMILY_OPTIONS.find((o) => o.key === key) ?? null;
}
