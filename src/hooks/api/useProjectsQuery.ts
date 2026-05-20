import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/api.ts';
import { queryKeys } from '../../lib/queryKeys.ts';

function shouldRetryProjectsQuery(failureCount: number, err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('API_NOT_READY') || /API initializing|still running/i.test(msg)) {
    return failureCount < 12;
  }
  if (msg.includes('SHEETS_RATE_LIMIT') || /rate-limiting read requests/i.test(msg)) {
    return failureCount < 4;
  }
  return failureCount < 2;
}

export function useProjectsQuery() {
  return useQuery({
    queryKey: queryKeys.projects.list,
    queryFn: () => api.getV1Projects(),
    retry: shouldRetryProjectsQuery,
    retryDelay: (attempt) => Math.min(500 + attempt * 400, 4000),
  });
}
