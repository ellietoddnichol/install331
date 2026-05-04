/**
 * Search query hints for auto-linking partition builder lines to catalog items.
 * Results are best-effort; estimators should confirm SKU after match.
 */
import type { PartitionMaterialSystemKey } from './partitionLayoutBuilder';

export interface CatalogSearchHint {
  query: string;
  /** Prefer this category when results are noisy. */
  category?: string;
}

const TOILET = 'Toilet Partitions';
const ACC = 'Toilet Accessories';

export function catalogSearchHintForPartitionMaterial(key: PartitionMaterialSystemKey): CatalogSearchHint {
  const map: Record<PartitionMaterialSystemKey, CatalogSearchHint> = {
    partition_compartment: { query: 'toilet partition compartment', category: TOILET },
    toilet_partition_hdpe: { query: 'HDPE solid plastic toilet partition', category: TOILET },
    toilet_partition_phenolic: { query: 'phenolic toilet partition', category: TOILET },
    toilet_partition_powder_coated_steel: { query: 'powder coated steel toilet partition', category: TOILET },
    toilet_partition_hpl: { query: 'HPL plastic laminate toilet partition', category: TOILET },
    toilet_partition_stainless: { query: 'stainless steel toilet partition', category: TOILET },
  };
  return map[key] ?? map.partition_compartment;
}

export const CATALOG_HINT_PILASTER: CatalogSearchHint = { query: 'partition pilaster post', category: TOILET };
export const CATALOG_HINT_HARDWARE: CatalogSearchHint = { query: 'partition door hardware hinge latch', category: TOILET };
export const CATALOG_HINT_GRAB_36: CatalogSearchHint = { query: 'grab bar 36 inch', category: ACC };
export const CATALOG_HINT_GRAB_42: CatalogSearchHint = { query: 'grab bar 42 inch', category: ACC };
export const CATALOG_HINT_TT: CatalogSearchHint = { query: 'toilet tissue dispenser', category: ACC };
export const CATALOG_HINT_SOAP: CatalogSearchHint = { query: 'soap dispenser', category: ACC };
