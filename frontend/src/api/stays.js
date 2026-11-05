import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';

export function useStay(stayId, options = {}) {
  return useQuery({ queryKey: ['stay', stayId], queryFn: () => api.get(`/stays/${stayId}`), enabled: !!stayId, ...options });
}

export function useStayBill(stayId) {
  return useQuery({ queryKey: ['stay-bill', stayId], queryFn: () => api.get(`/stays/${stayId}/bill`), enabled: !!stayId });
}

export function useDoneStays(range = {}) {
  const params = new URLSearchParams(range).toString();
  return useQuery({ queryKey: ['stays-done', range], queryFn: () => api.get(`/stays${params ? `?${params}` : ''}`) });
}

function invalidateStayStuff(qc, stayId) {
  qc.invalidateQueries({ queryKey: ['rooms'] });
  qc.invalidateQueries({ queryKey: ['stay', stayId] });
  qc.invalidateQueries({ queryKey: ['stay-bill', stayId] });
  qc.invalidateQueries({ queryKey: ['stays-done'] });
  qc.invalidateQueries({ queryKey: ['reservations'] });
}

export function useDirectCheckIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.post('/stays', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rooms'] }),
  });
}

export function useAddExtra() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ stayId, ...payload }) => api.post(`/stays/${stayId}/extras`, payload),
    onSuccess: (_data, { stayId }) => invalidateStayStuff(qc, stayId),
  });
}

export function useRemoveExtra() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ stayId, chargeId }) => api.delete(`/stays/${stayId}/extras/${chargeId}`),
    onSuccess: (_data, { stayId }) => invalidateStayStuff(qc, stayId),
  });
}

export function useExtendStay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (stayId) => api.post(`/stays/${stayId}/extend`),
    onSuccess: (_data, stayId) => invalidateStayStuff(qc, stayId),
  });
}

export function useCheckout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ stayId, ...payload }) => api.post(`/stays/${stayId}/checkout`, payload),
    onSuccess: (_data, { stayId }) => invalidateStayStuff(qc, stayId),
  });
}
