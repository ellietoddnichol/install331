import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { useState, type ReactNode } from 'react';

/**
 * Server-state foundation (caching, retries, stale-while-revalidate).
 * Prefer `useQuery` / `useMutation` on heavy pages over ad-hoc useEffect fetches.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
