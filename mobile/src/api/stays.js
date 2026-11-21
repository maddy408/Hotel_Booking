import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';

export function normalizeStayId(stayId) {
  if (stayId == null) return null;
  if (typeof stayId === 'string' && stayId.startsWith('stay-')) {
    const num = parseInt(stayId.slice(5), 10);
    return !isNaN(num) && num > 0 ? num : null;
  }
  const num = Number(stayId);
  return !isNaN(num) && num > 0 ? num : null;
}

export function useStay(stayId, options = {}) {
  const validId = normalizeStayId(stayId);
  return useQuery({ queryKey: ['stay', validId], queryFn: () => api.get(`/stays/${validId}`), enabled: !!validId, ...options });
}

export function useStayBill(stayId) {
  const validId = normalizeStayId(stayId);
  return useQuery({ queryKey: ['stay-bill', validId], queryFn: () => api.get(`/stays/${validId}/bill`), enabled: !!validId });
}

export function useEarlyCheckoutPreview(stayId, { checkoutDate, discount, earlyCheckoutFee } = {}) {
  const query = new URLSearchParams();
  if (checkoutDate) query.set('checkoutDate', checkoutDate);
  if (discount !== undefined && discount !== null && discount !== '') query.set('discount', discount);
  if (earlyCheckoutFee !== undefined && earlyCheckoutFee !== null && earlyCheckoutFee !== '') query.set('earlyCheckoutFee', earlyCheckoutFee);
  const qStr = query.toString();
  return useQuery({
    queryKey: ['early-checkout-preview', stayId, checkoutDate, discount, earlyCheckoutFee],
    queryFn: () => api.get(`/stays/${stayId}/early-checkout-preview${qStr ? `?${qStr}` : ''}`),
    enabled: !!stayId,
  });
}

export function useStayRefundSummary(stayId) {
  return useQuery({
    queryKey: ['stay-refund-summary', stayId],
    queryFn: () => api.get(`/stays/${stayId}/refund-summary`),
    enabled: !!stayId,
  });
}

const EMPTY_RANGE = Object.freeze({});

export function useDoneStays(range = EMPTY_RANGE) {
  const params = new URLSearchParams(range).toString();
  return useQuery({ queryKey: ['stays-done', range], queryFn: () => api.get(`/stays${params ? `?${params}` : ''}`) });
}

function invalidateStayStuff(qc, stayId) {
  qc.invalidateQueries({ queryKey: ['rooms'] });
  qc.invalidateQueries({ queryKey: ['stay', stayId] });
  qc.invalidateQueries({ queryKey: ['stay-bill', stayId] });
  qc.invalidateQueries({ queryKey: ['stays-done'] });
  qc.invalidateQueries({ queryKey: ['reservations'] });
  qc.invalidateQueries({ queryKey: ['today-checkouts'] });
  qc.invalidateQueries({ queryKey: ['all-referrals'] });
}

export function useDirectCheckIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.post('/stays', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rooms'] });
      qc.invalidateQueries({ queryKey: ['reservations'] });
      qc.invalidateQueries({ queryKey: ['today-checkouts'] });
      qc.invalidateQueries({ queryKey: ['all-referrals'] });
      qc.invalidateQueries({ queryKey: ['stays-done'] });
      qc.invalidateQueries({ queryKey: ['guests'] });
      qc.invalidateQueries({ queryKey: ['guest'] });
      qc.invalidateQueries({ queryKey: ['guest-referrals'] });
    },
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

export function useApplyDiscount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ stayId, amount, reason }) => api.post(`/stays/${stayId}/discount`, { amount, reason }),
    onSuccess: (_data, { stayId }) => invalidateStayStuff(qc, stayId),
  });
}

export function useProcessStayRefund() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ stayId, ...payload }) => api.post(`/stays/${stayId}/refund`, payload),
    onSuccess: (_data, { stayId }) => {
      invalidateStayStuff(qc, stayId);
      qc.invalidateQueries({ queryKey: ['stay-refund-summary', stayId] });
      qc.invalidateQueries({ queryKey: ['early-checkout-preview', stayId] });
    },
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
