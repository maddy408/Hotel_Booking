import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';

export function useGuests(q) {
  return useQuery({ queryKey: ['guests', q], queryFn: () => api.get(`/guests?q=${encodeURIComponent(q || '')}`) });
}

export function useGuest(id) {
  return useQuery({ queryKey: ['guest', id], queryFn: () => api.get(`/guests/${id}`), enabled: !!id });
}

export function useGuestLookup(phone) {
  return useQuery({
    queryKey: ['guest-lookup', phone],
    queryFn: () => api.get(`/guests/lookup?phone=${encodeURIComponent(phone)}`),
    enabled: /^[6-9]\d{9}$/.test(phone || ''),
    staleTime: 60000,
  });
}

export function useUpdateGuest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }) => api.put(`/guests/${id}`, payload),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['guests'] });
      qc.invalidateQueries({ queryKey: ['guest', vars.id] });
      qc.invalidateQueries({ queryKey: ['reservations'] });
      qc.invalidateQueries({ queryKey: ['rooms'] });
    },
  });
}
