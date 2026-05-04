/**
 * Toilet partition layout → takeoff line plan.
 *
 * Estimating context (why this exists):
 * - Commercial restroom “stalls” are usually quoted and installed as **compartments** (door + panels + pilasters)
 *   for each WC. Labor and some material packages are tracked **per compartment** or per **opening**.
 * - **ADA compartments** are physically larger (clearances, door swing, grab bar layout). They still count as
 *   one compartment each for field install time, but pricing may use wider modules; splitting standard vs ADA
 *   rows makes it easier to load different catalog SKUs or multipliers.
 * - **Hardware** (hinges, latches, strikes) is often a separate PO line; we optionally add one row per hardware
 *   “set” aligned to total openings, or call out **continuous hinge** for manufacturer packages that differ.
 * - **Pilasters** can be heuristics from **layout shape** (linear / L / U) for order-of-magnitude takeoff; verify on shop drawings.
 * - **Overhead bracing / headrail** is highly **layout-dependent** (continuous runs, splices). We do not guess
 *   linear feet; we can add a placeholder reminder line for field verification.
 *
 * Minutes align with `src/server/services/intake/installLaborFamilies.ts` (source of truth on the server).
 */

import { estimatePilasterCount, type PartitionHardwareMode, type PartitionLayoutShape } from './partitionLayoutGeometry';

export type { PartitionHardwareMode, PartitionLayoutShape } from './partitionLayoutGeometry';

export type PartitionMaterialSystemKey =
  | 'partition_compartment'
  | 'toilet_partition_hdpe'
  | 'toilet_partition_phenolic'
  | 'toilet_partition_powder_coated_steel'
  | 'toilet_partition_hpl'
  | 'toilet_partition_stainless';

export const PARTITION_MATERIAL_SYSTEMS: ReadonlyArray<{
  key: PartitionMaterialSystemKey;
  label: string;
  /** Default install minutes per compartment (server registry). */
  defaultMinutesPerCompartment: number;
}> = [
  { key: 'partition_compartment', label: 'Generic / mixed (use catalog to refine)', defaultMinutesPerCompartment: 90 },
  { key: 'toilet_partition_hdpe', label: 'HDPE / solid plastic', defaultMinutesPerCompartment: 95 },
  { key: 'toilet_partition_phenolic', label: 'Phenolic', defaultMinutesPerCompartment: 105 },
  { key: 'toilet_partition_powder_coated_steel', label: 'Powder-coated steel', defaultMinutesPerCompartment: 90 },
  { key: 'toilet_partition_hpl', label: 'Plastic laminate (HPL)', defaultMinutesPerCompartment: 95 },
  { key: 'toilet_partition_stainless', label: 'Stainless steel', defaultMinutesPerCompartment: 110 },
] as const;

const PILASTER_MINUTES = 30;
const HARDWARE_MINUTES = 20;
const HARDWARE_FAMILY = 'partition_hardware';
const GRAB_36_MINUTES = 28;
const GRAB_42_MINUTES = 30;
const DISPENSER_MINUTES = 15;

export interface PartitionLayoutBuilderInput {
  standardStalls: number;
  adaStalls: number;
  materialSystem: PartitionMaterialSystemKey;
  /** Add a separate row for hinge/latch/strike (or continuous-hinge) style labor. */
  includeHardwareKits: boolean;
  /** per_door: one hardware set per door opening. continuous_hinge: same qty basis with notes to verify manufacturer / LF. */
  hardwareMode: PartitionHardwareMode;
  /** Add a non-priced reminder line for continuous headrail / bracing (site-verify LF). */
  includeHeadrailPlaceholder: boolean;
  /** For pilaster heuristics (linear, L, U). */
  layoutShape: PartitionLayoutShape;
  lLegA: number;
  lLegB: number;
  uLegA: number;
  uLegB: number;
  uLegC: number;
  /** Add pilaster / vertical line using `pilaster` install family when geometry yields a count &gt; 0. */
  includePilasterLine: boolean;
  /** Suggest common ADA-relevant accessory install lines (grab bars, tissue, soap) from ADA stall count. */
  includeAdaAccessoryPackage: boolean;
  adaPackageGrabBars: boolean;
  adaPackageToiletTissue: boolean;
  adaPackageSoap: boolean;
}

export interface PartitionLayoutGeneratedLine {
  key: string;
  description: string;
  qty: number;
  unit: string;
  category: string;
  installLaborFamily: string | null;
  installScopeType: string | null;
  isInstallableScope: boolean;
  laborMinutes: number;
  laborOrigin: 'install_family' | null;
  generatedLaborMinutes: number | null;
  notes: string;
  /** Set when the client auto-links to catalog (best-effort). */
  catalogItemId?: string | null;
  sku?: string | null;
  /** For preview / copy: how hardware is interpreted. */
  hardwareMode?: PartitionHardwareMode;
}

export const DEFAULT_PARTITION_LAYOUT_BUILDER_INPUT: Readonly<PartitionLayoutBuilderInput> = {
  standardStalls: 0,
  adaStalls: 0,
  materialSystem: 'partition_compartment',
  includeHardwareKits: false,
  hardwareMode: 'per_door',
  includeHeadrailPlaceholder: false,
  layoutShape: 'unspecified',
  lLegA: 0,
  lLegB: 0,
  uLegA: 0,
  uLegB: 0,
  uLegC: 0,
  includePilasterLine: false,
  includeAdaAccessoryPackage: false,
  adaPackageGrabBars: true,
  adaPackageToiletTissue: true,
  adaPackageSoap: true,
} as const;

export const PARTITION_ESTIMATING_HELP = {
  lead:
    'Each **stall** (WC compartment) is one **partition compartment** for install labor. Standard vs ADA rows are split so you can use different catalog packages or mark-ups: ADA cells need wider module sizes and more hardware weight — verify the bid documents.',
  materials:
    'Material system (HDPE, phenolic, steel, etc.) changes shop drawings and field fit time; minutes follow the app’s install-family defaults until you link real catalog items.',
  hardware:
    '**Per door** = one hardware set per opening. **Continuous hinge** still uses the same **opening count** as a default; some manufacturers price by LF — field-verify against submittals.',
  headrail:
    'Overhead bracing and headrails are **run-length** work: measure the floor plan, add splices, and buy labor by LF or as an allowance — do not rely on stall count alone.',
  pilaster:
    'Pilaster counts are **heuristic** from layout (linear / L / U). Always verify against the partition elevation; use this row as a planning placeholder until shop drawings are available.',
  adaPackage:
    'Common ADA **toilet** accessory pattern: 36" side + 42" back grab bars, tissue, and soap (one each per accessible WC). Adjust to your documents and local code.',
} as const;

export function buildPartitionLayoutLines(input: PartitionLayoutBuilderInput): PartitionLayoutGeneratedLine[] {
  const i = { ...DEFAULT_PARTITION_LAYOUT_BUILDER_INPUT, ...input };
  const std = Math.max(0, Math.floor(Number(i.standardStalls) || 0));
  const ada = Math.max(0, Math.floor(Number(i.adaStalls) || 0));
  const material = PARTITION_MATERIAL_SYSTEMS.find((m) => m.key === i.materialSystem) ?? PARTITION_MATERIAL_SYSTEMS[0];
  const minPer = material?.defaultMinutesPerCompartment ?? 90;
  const totalOpenings = std + ada;
  const lines: PartitionLayoutGeneratedLine[] = [];

  if (std > 0) {
    lines.push({
      key: 'std-compartments',
      description: `Toilet partitions — ${labelForMaterial(i.materialSystem)}: standard WC compartments`,
      qty: std,
      unit: 'EA',
      category: 'Toilet Partitions',
      installLaborFamily: i.materialSystem,
      installScopeType: 'partition_compartment',
      isInstallableScope: true,
      laborMinutes: minPer,
      laborOrigin: 'install_family',
      generatedLaborMinutes: minPer,
      notes:
        'Standard stall compartments. Link catalog SKU for material; labor minutes = install-family default × qty until catalog overrides.',
    });
  }

  if (ada > 0) {
    lines.push({
      key: 'ada-compartments',
      description: `Toilet partitions — ${labelForMaterial(i.materialSystem)}: ADA (accessible) WC compartments`,
      qty: ada,
      unit: 'EA',
      category: 'Toilet Partitions',
      installLaborFamily: i.materialSystem,
      installScopeType: 'partition_compartment',
      isInstallableScope: true,
      laborMinutes: minPer,
      laborOrigin: 'install_family',
      generatedLaborMinutes: minPer,
      notes:
        'ADA compartments: verify 2010 ADA / local code for clearances, door type, and latch height. Wider module may affect panel SKUs. Grab bars, accessories, and signage are separate scope lines when enabled below.',
    });
  }

  if (i.includePilasterLine && totalOpenings > 0) {
    const p = estimatePilasterCount({
      shape: i.layoutShape,
      totalCompartments: totalOpenings,
      lLegA: i.lLegA,
      lLegB: i.lLegB,
      uLegA: i.uLegA,
      uLegB: i.uLegB,
      uLegC: i.uLegC,
    });
    if (p.count > 0) {
      lines.push({
        key: 'pilaster-estimate',
        description: `Partition pilasters / vertical supports — est. ${p.count} (layout-based)`,
        qty: p.count,
        unit: 'EA',
        category: 'Toilet Partitions',
        installLaborFamily: 'pilaster',
        installScopeType: 'pilaster',
        isInstallableScope: true,
        laborMinutes: PILASTER_MINUTES,
        laborOrigin: 'install_family',
        generatedLaborMinutes: PILASTER_MINUTES,
        notes: p.formula,
      });
    }
  }

  if (i.includeHardwareKits && totalOpenings > 0) {
    const isContinuous = i.hardwareMode === 'continuous_hinge';
    lines.push({
      key: 'partition-hardware',
      description: isContinuous
        ? 'Partition door hardware — continuous hinge / pivot (per door opening; verify LF vs package)'
        : 'Partition door hardware (hinge / latch / strike) — per opening',
      qty: totalOpenings,
      unit: 'EA',
      category: 'Toilet Partitions',
      installLaborFamily: HARDWARE_FAMILY,
      installScopeType: 'partition_hardware',
      isInstallableScope: true,
      laborMinutes: HARDWARE_MINUTES,
      laborOrigin: 'install_family',
      generatedLaborMinutes: HARDWARE_MINUTES,
      notes: isContinuous
        ? 'Default qty = one count per toilet compartment door. Some continuous-hinge systems are priced or installed by run length — adjust after submittal.'
        : 'Default = one hardware set per toilet compartment door. Change qty if your package differs.',
      hardwareMode: i.hardwareMode,
    });
  }

  if (i.includeAdaAccessoryPackage && ada > 0) {
    if (i.adaPackageGrabBars) {
      lines.push(
        {
          key: 'ada-grab-bar-36',
          description: 'Grab bar — 36" (typ. ADA / accessible WC side wall)',
          qty: ada,
          unit: 'EA',
          category: 'Toilet Accessories',
          installLaborFamily: 'grab_bar_36',
          installScopeType: 'grab_bar_36',
          isInstallableScope: true,
          laborMinutes: GRAB_36_MINUTES,
          laborOrigin: 'install_family',
          generatedLaborMinutes: GRAB_36_MINUTES,
          notes: 'Per accessible WC. Confirm layout and lengths per plans and 2010 ADA (or current) standards.',
        },
        {
          key: 'ada-grab-bar-42',
          description: 'Grab bar — 42" (typ. rear wall / back grab)',
          qty: ada,
          unit: 'EA',
          category: 'Toilet Accessories',
          installLaborFamily: 'grab_bar_42',
          installScopeType: 'grab_bar_42',
          isInstallableScope: true,
          laborMinutes: GRAB_42_MINUTES,
          laborOrigin: 'install_family',
          generatedLaborMinutes: GRAB_42_MINUTES,
          notes: 'Per accessible WC. Verify with fixture locations on elevation.',
        }
      );
    }
    if (i.adaPackageToiletTissue) {
      lines.push({
        key: 'ada-toilet-tissue-dispenser',
        description: 'Toilet tissue dispenser (accessible stall)',
        qty: ada,
        unit: 'EA',
        category: 'Toilet Accessories',
        installLaborFamily: 'toilet_tissue_dispenser',
        installScopeType: 'toilet_tissue_dispenser',
        isInstallableScope: true,
        laborMinutes: DISPENSER_MINUTES,
        laborOrigin: 'install_family',
        generatedLaborMinutes: DISPENSER_MINUTES,
        notes: 'One per accessible WC unless documents show otherwise.',
      });
    }
    if (i.adaPackageSoap) {
      lines.push({
        key: 'ada-soap-dispenser',
        description: 'Soap dispenser (reachable — accessible lavatory in same area)',
        qty: ada,
        unit: 'EA',
        category: 'Toilet Accessories',
        installLaborFamily: 'soap_dispenser',
        installScopeType: 'soap_dispenser',
        isInstallableScope: true,
        laborMinutes: DISPENSER_MINUTES,
        laborOrigin: 'install_family',
        generatedLaborMinutes: DISPENSER_MINUTES,
        notes: 'If lav count differs from accessible WC count, adjust qty. Placeholder for bath accessory load.',
      });
    }
  }

  if (i.includeHeadrailPlaceholder) {
    lines.push({
      key: 'headrail-placeholder',
      description: 'Overhead bracing / headrail — field-verify LF and splices (reminder / placeholder)',
      qty: 1,
      unit: 'LS',
      category: 'Toilet Partitions',
      installLaborFamily: null,
      installScopeType: null,
      isInstallableScope: false,
      laborMinutes: 0,
      laborOrigin: null,
      generatedLaborMinutes: null,
      notes: PARTITION_ESTIMATING_HELP.headrail,
    });
  }

  return lines;
}

function labelForMaterial(key: PartitionMaterialSystemKey): string {
  return PARTITION_MATERIAL_SYSTEMS.find((m) => m.key === key)?.label ?? 'partition';
}

export function countPartitionCompartments(input: Pick<PartitionLayoutBuilderInput, 'standardStalls' | 'adaStalls'>): number {
  return (
    Math.max(0, Math.floor(Number(input.standardStalls) || 0)) + Math.max(0, Math.floor(Number(input.adaStalls) || 0))
  );
}

/** Preview copy for the UI: pilaster estimate from current builder fields. */
export function previewPilasterCount(input: PartitionLayoutBuilderInput) {
  const i = { ...DEFAULT_PARTITION_LAYOUT_BUILDER_INPUT, ...input };
  const n = countPartitionCompartments(i);
  if (n === 0) return estimatePilasterCount({ shape: 'unspecified', totalCompartments: 0, lLegA: 0, lLegB: 0, uLegA: 0, uLegB: 0, uLegC: 0 });
  return estimatePilasterCount({
    shape: i.layoutShape,
    totalCompartments: n,
    lLegA: i.lLegA,
    lLegB: i.lLegB,
    uLegA: i.uLegA,
    uLegB: i.uLegB,
    uLegC: i.uLegC,
  });
}
