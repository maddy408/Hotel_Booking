import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';

export function useGuests(q) {
  return useQuery({ queryKey: ['guests', q], queryFn: () => api.get(`/guests?q=${encodeURIComponent(q || '')}`) });
}

export function useGuest(id) {
  return useQuery({ queryKey: ['guest', id], queryFn: () => api.get(`/guests/${id}`), enabled: !!id });
}

export function useGuestReferrals(id) {
  return useQuery({ queryKey: ['guest-referrals', id], queryFn: () => api.get(`/guests/${id}/referrals`), enabled: !!id });
}

export function useAllReferrals(filters) {
  const queryStr = filters ? new URLSearchParams(
    Object.entries(filters).filter(([_, v]) => v !== undefined && v !== null && v !== '')
  ).toString() : '';
  const url = queryStr ? `/guests/referrals?${queryStr}` : '/guests/referrals';
  return useQuery({
    queryKey: ['all-referrals', filters],
    queryFn: () => api.get(url),
    refetchInterval: 30000,
  });
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
      qc.invalidateQueries({ queryKey: ['all-referrals'] });
    },
  });
}

export function useDeleteGuest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (guestId) => api.delete(`/guests/${guestId}`),
    onSuccess: (_, guestId) => {
      qc.invalidateQueries({ queryKey: ['guests'] });
      if (guestId) {
        qc.removeQueries({ queryKey: ['guest', guestId] });
        qc.removeQueries({ queryKey: ['guest', Number(guestId)] });
        qc.removeQueries({ queryKey: ['guest', String(guestId)] });
      }
      qc.invalidateQueries({ queryKey: ['all-referrals'] });
      qc.invalidateQueries({ queryKey: ['rooms'] });
    },
  });
}
