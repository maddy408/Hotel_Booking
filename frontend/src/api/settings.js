import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';

export function useSettings() {
  return useQuery({ queryKey: ['settings'], queryFn: () => api.get('/settings') });
}

export function useUpdateHotel() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (payload) => api.put('/settings/hotel', payload), onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }) });
}

export function useUpdateGst() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (payload) => api.put('/settings/gst', payload), onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }) });
}
