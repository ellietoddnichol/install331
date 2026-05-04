/** Centralized React Query keys for invalidation and loaders. */
export const queryKeys = {
  projects: {
    list: ['v1', 'projects'] as const,
  },
  catalog: {
    workspace: ['catalog', 'workspace'] as const,
  },
} as const;
