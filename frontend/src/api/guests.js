import { useQuery } from '@tanstack/react-query';
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
    enabled: /^\d{10}$/.test(phone || ''),
    staleTime: 60000,
  });
}
