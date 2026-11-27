import { fd, nightsBetween } from './format.js';

/**
 * Returns current date and time components in the hotel's configured timezone.
 * Handles daylight saving and non-standard offsets (e.g. Asia/Kolkata +05:30).
 */
export function getHotelNow(timezone = 'Asia/Kolkata', now = new Date()) {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const getPart = (type) => parts.find((p) => p.type === type)?.value;
    const year = getPart('year');
    const month = getPart('month');
    const day = getPart('day');
    const hour = getPart('hour');
    const minute = getPart('minute');
    const second = getPart('second');
    return {
      dateIso: `${year}-${month}-${day}`,
      timeStr: `${hour}:${minute}:${second}`,
      dateTimeIso: `${year}-${month}-${day}T${hour}:${minute}:${second}`,
      hour: Number(hour),
      minute: Number(minute),
    };
  } catch {
    const d = now;
    const dateIso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
    return {
      dateIso,
      timeStr,
      dateTimeIso: `${dateIso}T${timeStr}`,
      hour: d.getHours(),
      minute: d.getMinutes(),
    };
  }
}

/**
 * Formats configured checkout time into HH:mm:ss string based on Hotel Settings.
 */
export function getConfiguredCheckoutTime(settings, roomCheckoutTime = null) {
  const hotelSettings = settings?.settings || settings || {};
  const hourVal = hotelSettings.checkout_hour;
  if (hourVal !== undefined && hourVal !== null && hourVal !== '') {
    const hourNum = Number(hourVal);
    if (Number.isFinite(hourNum)) {
      return `${String(Math.max(0, Math.min(23, hourNum))).padStart(2, '0')}:00:00`;
    }
  }
  if (roomCheckoutTime && typeof roomCheckoutTime === 'string') {
    const parts = roomCheckoutTime.split(':');
    if (parts.length >= 2) {
      return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}:${(parts[2] || '00').padStart(2, '0')}`;
    }
  }
  return '12:00:00';
}

/**
 * Formats time string 'HH:mm:ss' into user-friendly '11:00 AM' / '12:00 PM'.
 */
export function formatTime12h(timeStr) {
  if (!timeStr) return '';
  const parts = String(timeStr).split(':');
  const h = Number(parts[0]);
  const m = parts[1] || '00';
  if (isNaN(h)) return timeStr;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m.padStart(2, '0')} ${period}`;
}

/**
 * Determines whether an occupied room has exceeded scheduled checkout.
 * Rules:
 * 1. Must be occupied (active in-house stay). Pending reservations and checked-out stays are never overdue rooms.
 * 2. Uses hotel's configured timezone and checkout time from Hotel Settings.
 * 3. Overdue when checkoutPlanned < today, OR (checkoutPlanned === today AND current time >= checkout time).
 */
export function isRoomOverdue(room, settings, now = new Date()) {
  if (!room || room.status !== 'occupied' || !room.stayId) {
    return false;
  }
  const plannedIso = room.checkoutPlanned ? String(room.checkoutPlanned).slice(0, 10) : null;
  if (!plannedIso) {
    return false;
  }

  const hotelSettings = settings?.settings || settings || {};
  const timezone = hotelSettings.timezone || 'Asia/Kolkata';
  const hotelNow = getHotelNow(timezone, now);
  const checkoutTime = getConfiguredCheckoutTime(settings, room.checkoutTime);

  // Past scheduled checkout date
  if (plannedIso < hotelNow.dateIso) {
    return true;
  }

  // Future scheduled checkout date
  if (plannedIso > hotelNow.dateIso) {
    return false;
  }

  // Scheduled checkout date is today: overdue if current time >= configured checkout time
  return hotelNow.timeStr >= checkoutTime;
}

/**
 * Returns detailed overdue metadata for display on room cards and sheets.
 */
export function getOverdueDetails(room, settings, now = new Date()) {
  const overdue = isRoomOverdue(room, settings, now);
  const plannedIso = room?.checkoutPlanned ? String(room.checkoutPlanned).slice(0, 10) : null;
  const hotelSettings = settings?.settings || settings || {};
  const timezone = hotelSettings.timezone || 'Asia/Kolkata';
  const hotelNow = getHotelNow(timezone, now);
  const checkoutTime = getConfiguredCheckoutTime(settings, room?.checkoutTime);
  const formattedTime = formatTime12h(checkoutTime);

  let overdueDays = 0;
  if (overdue && plannedIso) {
    if (plannedIso < hotelNow.dateIso) {
      overdueDays = nightsBetween(plannedIso, hotelNow.dateIso);
    }
  }

  return {
    isOverdue: overdue,
    overdueDays,
    plannedIso,
    checkoutTime,
    formattedTime,
    badgeText: overdue ? (overdueDays > 0 ? `${overdueDays}d overdue` : 'OVERDUE') : null,
  };
}
