import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { fetchCatalogMeta } from '../hooks/api/useCatalogWorkspaceQuery.ts';
import { queryKeys } from '../lib/queryKeys.ts';

/**
 * Postgres-only deployments: warm the React Query cache for catalog meta as soon as the app shell mounts
 * (no Google Sheets sync). Reads go straight to Supabase via the Node API (`DB_DRIVER=pg`).
 */
export function CatalogAutoSync() {
  const queryClient = useQueryClient();
  useEffect(() => {
    void queryClient.prefetchQuery({
      queryKey: queryKeys.catalog.meta,
      queryFn: fetchCatalogMeta,
    });
  }, [queryClient]);
  return null;
}
