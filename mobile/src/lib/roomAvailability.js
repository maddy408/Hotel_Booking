import { fd } from './format.js';

export const BADGE_THEME = {
  Ready: { color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
  Occupied: { color: '#0369a1', bg: '#f0f9ff', border: '#bae6fd' },
  Booked: { color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  Cleaning: { color: '#6d28d9', bg: '#f5f3ff', border: '#ddd6fe' },
  Repair: { color: '#b91c1c', bg: '#fef2f2', border: '#fca5a5' },
  Overdue: { color: '#ef4444', bg: '#fef2f2', border: '#fca5a5' },
};

/**
 * Checks if a room is genuinely bookable for the complete requested stay.
 * Returns false if:
 * - Overlapping active reservation
 * - Occupied beyond requested arrival time or overdue checkout
 * - Under repair or maintenance
 * - Backend availability indicates unavailable / not bookable
 */
export function isRoomBookable(room) {
  if (!room) return false;
  if (room.is_bookable === false) return false;
  if (room.is_available === false) return false;
  if (room.selection_allowed === false) return false;
  if (room.booking_status === 'unavailable' || room.booking_status === 'maintenance') return false;
  if ((room.housekeeping_status || '') === 'repair') return false;
  if (room.current_stay?.is_overdue) return false;
  const badge = room.card_badge || '';
  if (badge === 'Repair' || badge === 'Overdue' || badge === 'Booked') return false;
  return true;
}

export function getCardDisplay(room, checkIn, checkOut) {
  if (room.card_badge && room.card_detail) {
    return {
      badge: room.card_badge,
      detail: room.card_detail,
      condition: room.card_condition,
      blockedReason: room.selection_blocked_reason,
      turnoverNotice: room.turnover_notice,
    };
  }

  const isMnt = room.housekeeping_status === 'repair' || room.booking_status === 'maintenance';
  const isCleaning = room.housekeeping_status === 'cleaning';
  const isAvailable = room.is_available !== false && room.booking_status !== 'unavailable';

  if (isMnt) {
    return {
      badge: 'Repair',
      detail: 'Unavailable',
      condition: 'maintenance',
      blockedReason: `Room ${room.room_no} is under maintenance.`,
      turnoverNotice: null,
    };
  }
  if (!isAvailable) {
    return {
      badge: 'Booked',
      detail: 'Until ' + fd(checkOut),
      condition: 'reserved',
      blockedReason: `Reserved for requested dates until ${fd(checkOut)}.`,
      turnoverNotice: null,
    };
  }
  if (isCleaning) {
    return {
      badge: 'Cleaning',
      detail: 'Not ready yet',
      condition: 'cleaning',
      blockedReason: null,
      turnoverNotice: 'Housekeeping in progress. Must be marked ready before check-in.',
    };
  }
  return {
    badge: 'Ready',
    detail: 'Available',
    condition: 'free_ready',
    blockedReason: null,
    turnoverNotice: null,
  };
}
