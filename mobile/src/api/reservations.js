import { Platform } from 'react-native';
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
      // payload can be:
      // 1. { id, formData }
      // 2. { id, ...data }
      // 3. FormData directly
      // 4. raw reservation ID number
      let id;
      let body;

      const isFormData = Boolean(
        payload && (
          (typeof FormData !== 'undefined' && payload instanceof FormData) ||
          typeof payload.append === 'function' ||
          Array.isArray(payload._parts)
        )
      );

      if (payload && typeof payload === 'object') {
        if (payload.formData) {
          id = payload.id;
          body = payload.formData;
        } else if (isFormData) {
          const idFromPart = (typeof payload.getAll === 'function' ? payload.getAll('id')?.[0] : null)
            || (typeof payload.get === 'function' ? payload.get('id') : null)
            || payload._parts?.find?.((p) => p[0] === 'id' || p[0] === 'reservationId')?.[1];
          id = idFromPart;
          body = payload;
        } else {
          const { id: extractedId, ...rest } = payload;
          id = extractedId;
          body = rest;
        }
      } else {
        id = payload;
        body = {};
      }

      return api.post(`/reservations/${id}/check-in`, body);
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useUploadReservationDocuments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ reservationId, files }) => {
      const form = new FormData();
      const MIME_MAP = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
        pdf: 'application/pdf',
      };
      for (const file of files) {
        let uri = file.uri || '';
        if (Platform.OS === 'android') {
          if (uri.startsWith('file:/') && !uri.startsWith('file:///')) {
            uri = `file:///${uri.replace(/^file:\/*/, '')}`;
          } else if (!uri.startsWith('file://') && !uri.startsWith('content://')) {
            uri = `file://${uri}`;
          }
        }
        const cleanName = (file.name || 'document.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
        const ext = cleanName.split('.').pop().toLowerCase();
        const type = MIME_MAP[ext] || file.type || 'application/pdf';
        form.append('documents[]', {
          uri,
          name: cleanName,
          type,
        });
      }
      return api.post(`/reservations/${reservationId}/documents`, form);
    },
    onSuccess: (_data, { reservationId }) => {
      invalidate(qc);
      qc.invalidateQueries({ queryKey: ['reservation', reservationId] });
      qc.invalidateQueries({ queryKey: ['reservation-documents', reservationId] });
    },
  });
}
