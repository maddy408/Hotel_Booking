import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';

export function useReservations() {
  return useQuery({ queryKey: ['reservations'], queryFn: () => api.get('/reservations'), refetchInterval: 30000 });
}

export function useReservation(id) {
  return useQuery({ queryKey: ['reservation', id], queryFn: () => api.get(`/reservations/${id}`), enabled: !!id });
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

export function useCheckInReservation() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id) => api.post(`/reservations/${id}/check-in`), onSuccess: () => invalidate(qc) });
}
