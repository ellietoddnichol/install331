import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/api.ts';
import { queryKeys } from '../../lib/queryKeys.ts';

export function useProjectsQuery() {
  return useQuery({
    queryKey: queryKeys.projects.list,
    queryFn: () => api.getV1Projects(),
  });
}
