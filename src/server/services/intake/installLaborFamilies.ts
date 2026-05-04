/**
 * Seeded registry of install labor families. Provides default install minutes and unit basis
 * when no exact catalog match exists (e.g. partition compartments, urinal screens, mirrors,
 * grab bars). These values are deliberately conservative order-of-magnitude estimates intended
 * for Div 10-style toilet partitions / accessories work; catalog-level labor values always win
 * when present.
 *
 * Keys are kept in sync with `InstallScopeType` in `./installabilityRules.ts` where possible, but
 * additional catalog-level overrides can use the same key on `catalog_items.install_labor_family`.
 */

export type InstallUnitBasis =
  | 'per_each'
  | 'per_compartment'
  | 'per_screen'
  | 'per_set'
  | 'per_pilaster'
  | 'per_hardware_kit'
  | 'per_linear_foot';

export interface InstallLaborFamily {
  key: string;
  label: string;
  defaultInstallMinutes: number;
  unitBasis: InstallUnitBasis;
  canInstallWithoutExactSku: boolean;
  /** Human-readable summary shown in review/transparency tooltips. */
  description: string;
}

const REGISTRY: Record<string, InstallLaborFamily> = {
  partition_compartment: {
    key: 'partition_compartment',
    label: 'Toilet partition compartment',
    defaultInstallMinutes: 90,
    unitBasis: 'per_compartment',
    canInstallWithoutExactSku: true,
    description: 'Assembly-level install for an HDPE / phenolic / stainless toilet partition compartment (door, panel, pilaster).',
  },
  toilet_partition_hdpe: {
    key: 'toilet_partition_hdpe',
    label: 'Toilet partitions — HDPE / solid plastic',
    defaultInstallMinutes: 95,
    unitBasis: 'per_compartment',
    canInstallWithoutExactSku: true,
    description: 'Compartment-level install for HDPE/solid plastic toilet partitions.',
  },
  toilet_partition_phenolic: {
    key: 'toilet_partition_phenolic',
    label: 'Toilet partitions — Phenolic',
    defaultInstallMinutes: 105,
    unitBasis: 'per_compartment',
    canInstallWithoutExactSku: true,
    description: 'Compartment-level install for phenolic toilet partitions.',
  },
  toilet_partition_powder_coated_steel: {
    key: 'toilet_partition_powder_coated_steel',
    label: 'Toilet partitions — Powder coated steel',
    defaultInstallMinutes: 90,
    unitBasis: 'per_compartment',
    canInstallWithoutExactSku: true,
    description: 'Compartment-level install for powder coated steel toilet partitions.',
  },
  toilet_partition_hpl: {
    key: 'toilet_partition_hpl',
    label: 'Toilet partitions — Plastic laminate (HPL)',
    defaultInstallMinutes: 95,
    unitBasis: 'per_compartment',
    canInstallWithoutExactSku: true,
    description: 'Compartment-level install for plastic laminate (HPL) toilet partitions.',
  },
  toilet_partition_stainless: {
    key: 'toilet_partition_stainless',
    label: 'Toilet partitions — Stainless steel',
    defaultInstallMinutes: 110,
    unitBasis: 'per_compartment',
    canInstallWithoutExactSku: true,
    description: 'Compartment-level install for stainless steel toilet partitions.',
  },
  urinal_screen: {
    key: 'urinal_screen',
    label: 'Urinal screen',
    defaultInstallMinutes: 35,
    unitBasis: 'per_screen',
    canInstallWithoutExactSku: true,
    description: 'Floor or wall mounted urinal screen install.',
  },
  urinal_screen_hdpe: {
    key: 'urinal_screen_hdpe',
    label: 'Urinal screen — HDPE / solid plastic',
    defaultInstallMinutes: 35,
    unitBasis: 'per_screen',
    canInstallWithoutExactSku: true,
    description: 'Floor or wall mounted HDPE/solid plastic urinal screen install.',
  },
  urinal_screen_steel: {
    key: 'urinal_screen_steel',
    label: 'Urinal screen — Steel',
    defaultInstallMinutes: 35,
    unitBasis: 'per_screen',
    canInstallWithoutExactSku: true,
    description: 'Floor or wall mounted steel urinal screen install.',
  },
  pilaster: {
    key: 'pilaster',
    label: 'Pilaster',
    defaultInstallMinutes: 30,
    unitBasis: 'per_pilaster',
    canInstallWithoutExactSku: true,
    description: 'Pilaster / support post install.',
  },
  partition_hardware: {
    key: 'partition_hardware',
    label: 'Partition hardware kit',
    defaultInstallMinutes: 20,
    unitBasis: 'per_hardware_kit',
    canInstallWithoutExactSku: true,
    description: 'Hardware kit install (hinges, latches, strikes) priced per compartment/set.',
  },
  mirror: {
    key: 'mirror',
    label: 'Mirror',
    defaultInstallMinutes: 25,
    unitBasis: 'per_each',
    canInstallWithoutExactSku: true,
    description: 'Framed or frameless mirror install (through-bolt or clip mount).',
  },
  grab_bar: {
    key: 'grab_bar',
    label: 'Grab bar',
    defaultInstallMinutes: 25,
    unitBasis: 'per_each',
    canInstallWithoutExactSku: true,
    description: 'Generic grab bar install.',
  },
  grab_bar_18: {
    key: 'grab_bar_18',
    label: 'Grab bar 18"',
    defaultInstallMinutes: 22,
    unitBasis: 'per_each',
    canInstallWithoutExactSku: true,
    description: '18" grab bar install.',
  },
  grab_bar_24: {
    key: 'grab_bar_24',
    label: 'Grab bar 24"',
    defaultInstallMinutes: 24,
    unitBasis: 'per_each',
    canInstallWithoutExactSku: true,
    description: '24" grab bar install.',
  },
  grab_bar_30: {
    key: 'grab_bar_30',
    label: 'Grab bar 30"',
    defaultInstallMinutes: 26,
    unitBasis: 'per_each',
    canInstallWithoutExactSku: true,
    description: '30" grab bar install.',
  },
  grab_bar_36: {
    key: 'grab_bar_36',
    label: 'Grab bar 36"',
    defaultInstallMinutes: 28,
    unitBasis: 'per_each',
    canInstallWithoutExactSku: true,
    description: '36" grab bar install.',
  },
  grab_bar_42: {
    key: 'grab_bar_42',
    label: 'Grab bar 42"',
    defaultInstallMinutes: 30,
    unitBasis: 'per_each',
    canInstallWithoutExactSku: true,
    description: '42" grab bar install.',
  },
  sanitary_napkin_disposal: {
    key: 'sanitary_napkin_disposal',
    label: 'Sanitary napkin disposal',
    defaultInstallMinutes: 18,
    unitBasis: 'per_each',
    canInstallWithoutExactSku: true,
    description: 'Wall-mounted sanitary napkin disposal install.',
  },
  soap_dispenser: {
    key: 'soap_dispenser',
    label: 'Soap dispenser',
    defaultInstallMinutes: 15,
    unitBasis: 'per_each',
    canInstallWithoutExactSku: true,
    description: 'Wall-mounted soap dispenser install.',
  },
  paper_towel_dispenser: {
    key: 'paper_towel_dispenser',
    label: 'Paper towel dispenser',
    defaultInstallMinutes: 18,
    unitBasis: 'per_each',
    canInstallWithoutExactSku: true,
    description: 'Wall-mounted paper towel dispenser install.',
  },
  hand_dryer: {
    key: 'hand_dryer',
    label: 'Hand dryer',
    defaultInstallMinutes: 45,
    unitBasis: 'per_each',
    canInstallWithoutExactSku: true,
    description: 'Hand dryer install; electrical rough-in excluded.',
  },
  toilet_tissue_dispenser: {
    key: 'toilet_tissue_dispenser',
    label: 'Toilet tissue dispenser',
    defaultInstallMinutes: 15,
    unitBasis: 'per_each',
    canInstallWithoutExactSku: true,
    description: 'Toilet tissue / toilet paper dispenser install.',
  },
  fire_extinguisher_cabinet: {
    key: 'fire_extinguisher_cabinet',
    label: 'Fire extinguisher cabinet',
    defaultInstallMinutes: 35,
    unitBasis: 'per_each',
    canInstallWithoutExactSku: true,
    description: 'Semi-recessed / surface FE cabinet install.',
  },
  aed_cabinet: {
    key: 'aed_cabinet',
    label: 'AED cabinet',
    defaultInstallMinutes: 30,
    unitBasis: 'per_each',
    canInstallWithoutExactSku: true,
    description: 'AED cabinet install (surface or recessed).',
  },
  visual_display_board: {
    key: 'visual_display_board',
    label: 'Visual display board',
    defaultInstallMinutes: 60,
    unitBasis: 'per_each',
    canInstallWithoutExactSku: true,
    description: 'Markerboard/tackboard installation (blocking/patch/paint excluded).',
  },
  wall_protection: {
    key: 'wall_protection',
    label: 'Wall / corner protection',
    defaultInstallMinutes: 8,
    unitBasis: 'per_linear_foot',
    canInstallWithoutExactSku: true,
    description: 'Corner guards, chair rails, crash rails (install labor per LF; substrate/patch/paint excluded).',
  },
  postal_specialty: {
    key: 'postal_specialty',
    label: 'Postal specialty (mailboxes)',
    defaultInstallMinutes: 180,
    unitBasis: 'per_each',
    canInstallWithoutExactSku: true,
    description: '4C mailboxes / CBU units / parcel lockers (site conditions and pedestal anchoring can materially change labor).',
  },
  locker: {
    key: 'locker',
    label: 'Locker',
    defaultInstallMinutes: 20,
    unitBasis: 'per_each',
    canInstallWithoutExactSku: true,
    description: 'Per-locker install (per opening); excludes bench or end panels.',
  },
  bench: {
    key: 'bench',
    label: 'Locker-room bench',
    defaultInstallMinutes: 40,
    unitBasis: 'per_each',
    canInstallWithoutExactSku: true,
    description: 'Locker-room bench install per unit.',
  },
  access_door: {
    key: 'access_door',
    label: 'Access door / panel',
    defaultInstallMinutes: 30,
    unitBasis: 'per_each',
    canInstallWithoutExactSku: true,
    description: 'Access door / panel install.',
  },
  signage: {
    key: 'signage',
    label: 'Signage',
    defaultInstallMinutes: 10,
    unitBasis: 'per_each',
    canInstallWithoutExactSku: true,
    description: 'Room / wayfinding sign install.',
  },
  accessory_generic: {
    key: 'accessory_generic',
    label: 'Toilet accessory (generic)',
    defaultInstallMinutes: 20,
    unitBasis: 'per_each',
    canInstallWithoutExactSku: true,
    description: 'Fallback install minutes for a generic wall-mounted toilet accessory.',
  },
};

export function getInstallLaborFamily(key: string | null | undefined): InstallLaborFamily | null {
  if (!key) return null;
  return REGISTRY[key] ?? null;
}

export function listInstallLaborFamilies(): InstallLaborFamily[] {
  return Object.values(REGISTRY);
}

export const INSTALL_LABOR_FAMILIES = REGISTRY;
