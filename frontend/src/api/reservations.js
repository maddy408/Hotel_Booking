import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';

export function useReservations() {
  return useQuery({ queryKey: ['reservations'], queryFn: () => api.get('/reservations'), refetchInterval: 30000 });
}

export function useReservation(id) {
  return useQuery({ queryKey: ['reservation', id], queryFn: () => api.get(`/reservations/${id}`), enabled: !!id });
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
}

export function useCreateReservation() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (payload) => api.post('/reservations', payload), onSuccess: () => invalidate(qc) });
}

export function useUpdateReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }) => api.put(`/reservations/${id}`, payload),
    onSuccess: () => invalidate(qc),
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
      const id = typeof payload === 'object' && payload !== null ? payload.id : payload;
      return api.post(`/reservations/${id}/check-in`);
    },
    onSuccess: () => invalidate(qc),
  });
}
