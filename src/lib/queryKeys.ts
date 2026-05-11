/** Centralized React Query keys for invalidation and loaders. */
export const queryKeys = {
  projects: {
    list: ['v1', 'projects'] as const,
  },
  catalog: {
    /** Modifiers, bundles, sync status, inventory counts, facet metadata (no item rows). */
    meta: ['catalog', 'meta'] as const,
    /** Paged catalog items for the Catalog admin UI. */
    itemsPage: (filters: Record<string, string | number | boolean>) => ['catalog', 'items', filters] as const,
  },
} as const;
