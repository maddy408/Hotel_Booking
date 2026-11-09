import { fd } from './format.js';

export const BADGE_THEME = {
  Ready: {
    color: 'var(--ok, #15803d)',
    bg: 'var(--ok-bg, #f0fdf4)',
    border: 'var(--ok-border, #bbf7d0)',
  },
  Occupied: {
    color: 'var(--occ, #0369a1)',
    bg: 'var(--occ-bg, #f0f9ff)',
    border: 'var(--occ-border, #bae6fd)',
  },
  Booked: {
    color: 'var(--bk, #b45309)',
    bg: 'var(--bk-bg, #fffbeb)',
    border: 'var(--bk-border, #fde68a)',
  },
  Cleaning: {
    color: 'var(--cln, #6d28d9)',
    bg: 'var(--cln-bg, #f5f3ff)',
    border: 'var(--cln-border, #ddd6fe)',
  },
  Repair: {
    color: 'var(--mnt, #b91c1c)',
    bg: 'var(--mnt-bg, #fef2f2)',
    border: 'var(--mnt-border, #fca5a5)',
  },
  Overdue: {
    color: 'var(--color-danger-text, #ef4444)',
    bg: 'var(--color-danger-bg, #fef2f2)',
    border: 'var(--color-danger-border, #fca5a5)',
  },
};

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

  // Defensive fallback if backend sends un-enriched room model
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

