import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/apiClient';

export function useTodayCheckouts() {
  return useQuery({
    queryKey: ['today-checkouts'],
    queryFn: () => api.get('/today-checkouts'),
  });
}

export const useDailyOps = useTodayCheckouts;


