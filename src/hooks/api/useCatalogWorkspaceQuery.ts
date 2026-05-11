import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/api.ts';
import { queryKeys } from '../../lib/queryKeys.ts';
import type { BundleRecord, CatalogSyncStatusRecord, ModifierRecord } from '../../shared/types/estimator.ts';
export interface CatalogMetaData {
  modifiers: ModifierRecord[];
  bundles: BundleRecord[];
  syncStatus: CatalogSyncStatusRecord;
  inventory: { total: number; active: number; inactive: number };
  facets: {
    categories: string[];
    itemTypes: string[];
    sourceTabs: string[];
    hasUntaggedSource: boolean;
  };
}

async function fetchCatalogMeta(): Promise<CatalogMetaData> {
  const [modifierData, bundleData, syncData, inv, facets] = await Promise.all([
    api.getCatalogModifiers(),
    api.getCatalogBundles(),
    api.getCatalogSyncStatus(),
    api.getV1CatalogInventory(),
    api.getV1CatalogFacets(),
  ]);
  return {
    modifiers: modifierData,
    bundles: bundleData,
    syncStatus: syncData,
    inventory: inv,
    facets,
  };
}

export function useCatalogMetaQuery() {
  return useQuery({
    queryKey: queryKeys.catalog.meta,
    queryFn: fetchCatalogMeta,
  });
}

export type CatalogItemsPageQueryInput = {
  offset: number;
  limit: number;
  activeFilter: 'all' | 'active' | 'inactive';
  categoryFilter: string;
  search: string;
  typeFilter: string;
  sourceTabFilter: string;
  sortBy: string;
  imageSprintOnly: boolean;
};

function itemsPageKey(p: CatalogItemsPageQueryInput) {
  return queryKeys.catalog.itemsPage({
    o: p.offset,
    l: p.limit,
    a: p.activeFilter,
    c: p.categoryFilter,
    q: p.search.trim(),
    t: p.typeFilter,
    s: p.sourceTabFilter,
    sort: p.sortBy,
    img: p.imageSprintOnly ? 1 : 0,
  });
}

export function useCatalogItemsPageQuery(params: CatalogItemsPageQueryInput) {
  return useQuery({
    queryKey: itemsPageKey(params),
    queryFn: () =>
      api.getV1CatalogItemsPage({
        offset: params.offset,
        limit: params.limit,
        activeFilter: params.activeFilter,
        category: params.categoryFilter,
        q: params.search.trim() || undefined,
        typeFilter: params.typeFilter,
        sourceTabFilter: params.sourceTabFilter,
        imageSprintOnly: params.imageSprintOnly,
        sortBy: params.sortBy,
      }),
  });
}

