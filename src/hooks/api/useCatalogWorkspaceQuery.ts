import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/api.ts';
import { queryKeys } from '../../lib/queryKeys.ts';
import type { BundleRecord, CatalogSyncStatusRecord, ModifierRecord } from '../../shared/types/estimator.ts';
import type { CatalogItem } from '../../types.ts';

export interface CatalogWorkspaceData {
  items: CatalogItem[];
  modifiers: ModifierRecord[];
  bundles: BundleRecord[];
  syncStatus: CatalogSyncStatusRecord;
  inventory: { total: number; active: number; inactive: number };
}

async function fetchCatalogWorkspace(): Promise<CatalogWorkspaceData> {
  const [itemData, modifierData, bundleData, syncData, inv] = await Promise.all([
    api.getCatalog({ includeInactive: true }),
    api.getCatalogModifiers(),
    api.getCatalogBundles(),
    api.getCatalogSyncStatus(),
    api.getV1CatalogInventory(),
  ]);
  return {
    items: itemData,
    modifiers: modifierData,
    bundles: bundleData,
    syncStatus: syncData,
    inventory: inv,
  };
}

export function useCatalogWorkspaceQuery() {
  return useQuery({
    queryKey: queryKeys.catalog.workspace,
    queryFn: fetchCatalogWorkspace,
  });
}
