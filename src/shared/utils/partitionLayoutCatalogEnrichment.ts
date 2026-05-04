import type { CatalogItem } from '../../types';
import type { PartitionLayoutGeneratedLine, PartitionMaterialSystemKey } from './partitionLayoutBuilder';
import {
  CATALOG_HINT_GRAB_36,
  CATALOG_HINT_GRAB_42,
  CATALOG_HINT_HARDWARE,
  CATALOG_HINT_PILASTER,
  CATALOG_HINT_SOAP,
  CATALOG_HINT_TT,
  catalogSearchHintForPartitionMaterial,
} from './partitionCatalogSearch';

export type CatalogSearchFn = (query: string, category?: string) => Promise<CatalogItem[]>;

const SKIP_KEYS = new Set<string>(['headrail-placeholder']);

function hintForLine(
  key: string,
  material: PartitionMaterialSystemKey
):
  | ReturnType<typeof catalogSearchHintForPartitionMaterial>
  | typeof CATALOG_HINT_PILASTER
  | typeof CATALOG_HINT_HARDWARE
  | typeof CATALOG_HINT_GRAB_36
  | typeof CATALOG_HINT_GRAB_42
  | typeof CATALOG_HINT_TT
  | typeof CATALOG_HINT_SOAP
  | null {
  if (SKIP_KEYS.has(key)) return null;
  if (key === 'std-compartments' || key === 'ada-compartments') return catalogSearchHintForPartitionMaterial(material);
  if (key === 'partition-hardware') return CATALOG_HINT_HARDWARE;
  if (key === 'pilaster-estimate') return CATALOG_HINT_PILASTER;
  if (key === 'ada-grab-bar-36') return CATALOG_HINT_GRAB_36;
  if (key === 'ada-grab-bar-42') return CATALOG_HINT_GRAB_42;
  if (key === 'ada-toilet-tissue-dispenser') return CATALOG_HINT_TT;
  if (key === 'ada-soap-dispenser') return CATALOG_HINT_SOAP;
  return null;
}

/**
 * First search hit per line, best-effort. Lines without a mapped hint or with empty results are unchanged.
 */
export async function attachBestEffortCatalogMatches(
  lines: PartitionLayoutGeneratedLine[],
  materialSystem: PartitionMaterialSystemKey,
  search: CatalogSearchFn
): Promise<PartitionLayoutGeneratedLine[]> {
  const out: PartitionLayoutGeneratedLine[] = [];
  for (const line of lines) {
    const hint = hintForLine(line.key, materialSystem);
    if (!hint) {
      out.push(line);
      continue;
    }
    try {
      const items = await search(hint.query, hint.category);
      const first = items[0];
      if (first?.id) {
        out.push({
          ...line,
          catalogItemId: first.id,
          sku: first.sku ?? null,
        });
      } else {
        out.push(line);
      }
    } catch {
      out.push(line);
    }
  }
  return out;
}
