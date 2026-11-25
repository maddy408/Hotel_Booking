import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';

export function useReservations(params) {
  const query = params ? `?${new URLSearchParams(params).toString()}` : '';
  return useQuery({ queryKey: ['reservations', params], queryFn: () => api.get(`/reservations${query}`), refetchInterval: 30000 });
}

export function useReservation(id) {
  return useQuery({ queryKey: ['reservation', id], queryFn: () => api.get(`/reservations/${id}`), enabled: !!id });
}

export function useReservationDocuments(id) {
  return useQuery({
    queryKey: ['reservation-documents', id],
    queryFn: () => api.get(`/reservations/${id}/documents`),
    enabled: !!id,
  });
}

export function useCancellationPreview(id) {
  return useQuery({
    queryKey: ['cancellation-preview', id],
    queryFn: () => api.get(`/reservations/${id}/cancellation-preview`),
    enabled: !!id,
  });
}

export function useReservationRefundSummary(id) {
  return useQuery({
    queryKey: ['reservation-refund-summary', id],
    queryFn: () => api.get(`/reservations/${id}/refund-summary`),
    enabled: !!id,
  });
}

export function useProcessReservationRefund() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }) => api.post(`/reservations/${id}/refund`, payload),
    onSuccess: (_, vars) => {
      invalidate(qc);
      qc.invalidateQueries({ queryKey: ['reservation', vars.id] });
      qc.invalidateQueries({ queryKey: ['reservation-refund-summary', vars.id] });
      qc.invalidateQueries({ queryKey: ['cancellation-preview', vars.id] });
    },
  });
}

export function useFreeRooms({ checkIn, checkOut, roomTypeId, excludeReservationId }) {
  const params = new URLSearchParams({
    checkIn,
    checkOut,
    ...(roomTypeId && roomTypeId !== 'all' ? { roomTypeId } : {}),
    ...(excludeReservationId ? { excludeReservationId } : {}),
  }).toString();
  return useQuery({
    queryKey: ['free-rooms', checkIn, checkOut, roomTypeId, excludeReservationId],
    queryFn: () => api.get(`/reservations/free-rooms?${params}`),
    enabled: !!checkIn && !!checkOut,
  });
}

function invalidate(qc) {
  qc.invalidateQueries({ queryKey: ['reservations'] });
  qc.invalidateQueries({ queryKey: ['rooms'] });
  qc.invalidateQueries({ queryKey: ['today-checkouts'] });
  qc.invalidateQueries({ queryKey: ['guests'] });
  qc.invalidateQueries({ queryKey: ['guest'] });
  qc.invalidateQueries({ queryKey: ['guest-referrals'] });
  qc.invalidateQueries({ queryKey: ['all-referrals'] });
}

export function useCreateReservation() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (payload) => api.post('/reservations', payload), onSuccess: () => invalidate(qc) });
}

export function useUpdateReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }) => api.put(`/reservations/${id}`, payload),
    onSuccess: (_, vars) => {
      invalidate(qc);
      qc.invalidateQueries({ queryKey: ['reservation', vars.id] });
      qc.invalidateQueries({ queryKey: ['guests'] });
    },
  });
}

export function useCancelReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }) => api.post(`/reservations/${id}/cancel`, payload),
    onSuccess: () => invalidate(qc),
  });
}

export function useNoShowReservation() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id) => api.post(`/reservations/${id}/no-show`), onSuccess: () => invalidate(qc) });
}

export function useRecordAdvancePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, amount, method }) => api.post(`/reservations/${id}/advance-payment`, { amount, method }),
    onSuccess: () => invalidate(qc),
  });
}

export function useCheckInReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => {
      if (typeof FormData !== 'undefined' && payload instanceof FormData) {
        const id = payload.get('reservationId') || payload.get('id');
        return api.post(`/reservations/${id}/check-in`, payload);
      }
      if (typeof payload === 'object' && payload !== null) {
        const { id, ...body } = payload;
        return api.post(`/reservations/${id}/check-in`, body);
      }
      return api.post(`/reservations/${payload}/check-in`);
    },
    onSuccess: () => invalidate(qc),
  });
}
