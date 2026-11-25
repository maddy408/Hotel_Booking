import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';

export function useStay(stayId, options = {}) {
  return useQuery({ queryKey: ['stay', stayId], queryFn: () => api.get(`/stays/${stayId}`), enabled: !!stayId, ...options });
}

export function useStayBill(stayId) {
  return useQuery({ queryKey: ['stay-bill', stayId], queryFn: () => api.get(`/stays/${stayId}/bill`), enabled: !!stayId });
}

export function useEarlyCheckoutPreview(stayId, { checkoutDate, discount, earlyCheckoutFee } = {}, options = {}) {
  const query = new URLSearchParams();
  if (checkoutDate) query.set('checkoutDate', checkoutDate);
  if (discount !== undefined && discount !== null && discount !== '') query.set('discount', discount);
  if (earlyCheckoutFee !== undefined && earlyCheckoutFee !== null && earlyCheckoutFee !== '') query.set('earlyCheckoutFee', earlyCheckoutFee);
  const qStr = query.toString();
  return useQuery({
    queryKey: ['early-checkout-preview', stayId, checkoutDate, discount, earlyCheckoutFee],
    queryFn: () => api.get(`/stays/${stayId}/early-checkout-preview${qStr ? `?${qStr}` : ''}`),
    enabled: !!stayId && options.enabled !== false,
    ...options,
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
  if (stayId) {
    qc.invalidateQueries({ queryKey: ['stay', stayId] });
    qc.invalidateQueries({ queryKey: ['stay-bill', stayId] });
    qc.invalidateQueries({ queryKey: ['invoice-by-stay', stayId] });
    qc.invalidateQueries({ queryKey: ['stay-refund-summary', stayId] });
    qc.invalidateQueries({ queryKey: ['early-checkout-preview', stayId] });
  }
  qc.invalidateQueries({ queryKey: ['stays-done'] });
  qc.invalidateQueries({ queryKey: ['reservations'] });
  qc.invalidateQueries({ queryKey: ['today-checkouts'] });
  qc.invalidateQueries({ queryKey: ['all-referrals'] });
  qc.invalidateQueries({ queryKey: ['report-today'] });
  qc.invalidateQueries({ queryKey: ['report-day-end'] });
  qc.invalidateQueries({ queryKey: ['report-occupancy'] });
  qc.invalidateQueries({ queryKey: ['report-revenue'] });
  qc.invalidateQueries({ queryKey: ['invoice'] });
}

export function useDirectCheckIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.post('/stays', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rooms'] });
      qc.invalidateQueries({ queryKey: ['today-checkouts'] });
      qc.invalidateQueries({ queryKey: ['all-referrals'] });
      qc.invalidateQueries({ queryKey: ['stays-done'] });
      qc.invalidateQueries({ queryKey: ['report-today'] });
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
    onSuccess: (data, variables) => {
      const stayId = variables?.stayId;
      const paymentMethod = variables?.paymentMethod || data?.stay?.payment_method || 'cash';
      const invoiceTotal = Number(data?.invoice?.total_amount ?? data?.bill?.total ?? 0);

      // 1. Immediately update Today's report in cache (counts and billed at checkout)
      qc.setQueryData(['report-today'], (old) => {
        if (!old) return old;
        return {
          ...old,
          checkouts: (Number(old.checkouts) || 0) + 1,
          billedAtCheckout: (Number(old.billedAtCheckout) || 0) + invoiceTotal,
          occupancy: old.occupancy ? {
            ...old.occupancy,
            occupied: Math.max(0, (Number(old.occupancy.occupied) || 0) - 1),
            percent: old.occupancy.total > 0
              ? Math.round((Math.max(0, (Number(old.occupancy.occupied) || 0) - 1) / old.occupancy.total) * 1000) / 10
              : 0,
          } : old.occupancy,
        };
      });

      // 2. Immediately prepend/update the newly checked-out stay in 'stays-done' cache
      if (data?.stay) {
        const newBillEntry = {
          ...data.stay,
          invoice_id: data.invoice?.id ?? data.stay?.invoice_id,
          invoice_number: data.invoice?.invoice_number ?? data.stay?.invoice_number,
          invoice_total: invoiceTotal,
          payment_method: data.stay.payment_method || paymentMethod,
          checkout_actual: data.stay.checkout_actual || variables?.actualCheckoutDate || new Date().toISOString().slice(0, 10),
        };

        const updateStaysList = (old) => {
          if (!Array.isArray(old)) return old;
          const filtered = old.filter((s) => s.id !== stayId);
          return [newBillEntry, ...filtered];
        };

        qc.setQueriesData({ queryKey: ['stays-done'] }, updateStaysList);
        qc.setQueryData(['stays-done', EMPTY_RANGE], updateStaysList);
      }

      // 3. Immediately set invoice queries if invoice object is returned
      if (data?.invoice) {
        qc.setQueryData(['invoice-by-stay', stayId], data.invoice);
        if (data.invoice.id) {
          qc.setQueryData(['invoice', data.invoice.id], data.invoice);
        }
      }

      // 4. Invalidate and trigger active/background refetches
      invalidateStayStuff(qc, stayId);
      qc.refetchQueries({ queryKey: ['report-today'] });
      qc.refetchQueries({ queryKey: ['stays-done'] });
      qc.refetchQueries({ queryKey: ['today-checkouts'] });
    },
  });
}
