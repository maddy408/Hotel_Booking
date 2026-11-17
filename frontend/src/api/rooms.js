import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';

export function useRooms() {
  return useQuery({
    queryKey: ['rooms'],
    queryFn: async () => {
      const data = await api.get('/rooms');
      if (!data || !Array.isArray(data.rooms)) return data;

      // Check if backend already returns non-zero persons on occupied rooms
      const hasOccupiedPersons = data.rooms.some(
        (r) => r.status === 'occupied' && r.persons !== undefined && r.persons !== null && Number(r.persons) > 0
      );

      // 1. Fetch pending reservations if any booked room lacks persons
      let reservationsMap = new Map();
      const needsBookingEnrichment = data.rooms.some(
        (r) => r.status === 'booked' && (r.persons === undefined || r.persons === null || Number(r.persons) <= 0)
      );

      if (needsBookingEnrichment) {
        try {
          const reservations = await api.get('/reservations');
          if (Array.isArray(reservations)) {
            reservations.forEach((res) => {
              if (res.id) reservationsMap.set(Number(res.id), res);
              if (res.room_no) reservationsMap.set(`room-${res.room_no}`, res);
              if (res.room_id) reservationsMap.set(`roomId-${res.room_id}`, res);
            });
          }
        } catch {}
      }

      // 2. Fetch occupied stays if occupied rooms lack persons from backend
      const occupiedRooms = data.rooms.filter((r) => r.status === 'occupied' && r.stayId);
      const stayPersonsMap = new Map();

      if (!hasOccupiedPersons) {
        await Promise.all(
          occupiedRooms.map(async (r) => {
            try {
              const stay = await api.get(`/stays/${r.stayId}`);
              if (stay && stay.persons != null) {
                stayPersonsMap.set(Number(r.stayId), Number(stay.persons));
              }
            } catch {}
          })
        );
      }

      // 3. Enrich rooms array
      const enrichedRooms = data.rooms.map((room) => {
        let persons = room.persons;

        if (room.status === 'occupied') {
          const fetchedStayPersons = stayPersonsMap.get(Number(room.stayId));
          const basePersons = fetchedStayPersons != null ? fetchedStayPersons : (room.persons != null && Number(room.persons) > 0 ? Number(room.persons) : 1);
          persons = basePersons;
        } else if (room.status === 'booked') {
          const res = reservationsMap.get(Number(room.bookingId)) || reservationsMap.get(`room-${room.roomNo}`) || reservationsMap.get(`roomId-${room.id}`);
          const resPersons = res?.persons != null ? Number(res.persons) : (room.persons != null && Number(room.persons) > 0 ? Number(room.persons) : Number(room.pendingBooking?.persons || 1));
          persons = Math.max(1, resPersons);
          if (room.pendingBooking) {
            room.pendingBooking.persons = persons;
          }
        } else {
          persons = 0;
        }

        return {
          ...room,
          persons,
        };
      });

      return {
        ...data,
        rooms: enrichedRooms,
      };
    },
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
