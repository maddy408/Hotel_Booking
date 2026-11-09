import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';

export function useRooms() {
  return useQuery({
    queryKey: ['rooms'],
    queryFn: () => api.get('/rooms'),
    refetchInterval: 30000,
  });
}

export function useRoomTypes() {
  return useQuery({ queryKey: ['room-types'], queryFn: () => api.get('/room-types') });
}

export function useHousekeepingAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ roomId, action, note }) => api.post(`/rooms/${roomId}/housekeeping`, { action, note }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rooms'] }),
  });
}

export function useBulkAddRooms() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.post('/rooms/bulk', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rooms'] }),
  });
}

export function useChangeRoomType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ roomId, roomTypeId }) => api.put(`/rooms/${roomId}/type`, { roomTypeId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rooms'] }),
  });
}

export function useUpdateRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }) => api.put(`/rooms/${id}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rooms'] });
      qc.invalidateQueries({ queryKey: ['reservations'] });
    },
  });
}

export function useDeleteRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (roomId) => api.delete(`/rooms/${roomId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rooms'] }),
  });
}

export function useCreateRoomType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.post('/room-types', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['room-types'] }),
  });
}

export function useUpdateRoomType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }) => api.put(`/room-types/${id}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['room-types'] });
      qc.invalidateQueries({ queryKey: ['rooms'] });
    },
  });
}

export function useDeleteRoomType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.delete(`/room-types/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['room-types'] }),
  });
}
