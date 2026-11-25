/**
 * Returns simple English room situation for hotel reception staff.
 * Table of simple English messages:
 * - Guest is staying
 * - Checkout overdue
 * - Checked out
 * - Cancelled
 * - No-show
 * - Waiting – room occupied
 * - Upcoming
 * - Room cleaning
 * - Room under maintenance
 * - Room ready
 * - Guest not arrived
 */
export function getSimpleBookingSituation(booking, room, today, allReservations = []) {
  if (!booking) {
    return {
      text: 'Upcoming',
      color: '#059669',
      bg: '#ecfdf5',
      border: '#a7f3d0',
    };
  }

  // 1. Cancelled booking
  if (booking.status === 'cancelled') {
    return {
      text: 'Cancelled',
      color: '#6b7280',
      bg: '#f3f4f6',
      border: '#d1d5db',
      isCancelled: true,
    };
  }

  // 2. No-show booking
  if (booking.status === 'no_show') {
    return {
      text: 'No-show',
      color: '#d97706',
      bg: '#fffbeb',
      border: '#fde68a',
      isNoShow: true,
    };
  }

  // 3. Explicitly Checked out booking (from reservation status, stay status, or actual checkout date)
  const isExplicitCheckedOut = booking.status === 'checked_out' ||
    booking.stay_status === 'checked_out' ||
    Boolean(booking.checkout_actual);

  if (isExplicitCheckedOut) {
    return {
      text: 'Checked out',
      color: '#475569',
      bg: '#f1f5f9',
      border: '#cbd5e1',
      isCheckedOut: true,
    };
  }

  const hkStatus = room?.housekeepingStatus || room?.housekeeping_status || booking.housekeeping_status || 'ok';
  const isOccupied = room?.status === 'occupied';
  const isOverdueCheckout = Boolean(room?.isOverdue || (isOccupied && room?.checkoutPlanned && room.checkoutPlanned < today));
  const isMaintenance = hkStatus === 'repair';
  const isCleaning = hkStatus === 'cleaning';
  const isReady = hkStatus === 'ok';
  const isArrivalOverdue = booking.status === 'pending' && booking.check_in_date < today;
  const isArrivalToday = booking.check_in_date === today;

  // 4. Overlap conflict among pending bookings for the same room
  const overlapConflict = allReservations.find(
    (o) => o.id !== booking.id &&
           Number(o.room_id) === Number(booking.room_id) &&
           o.status === 'pending' &&
           booking.status === 'pending' &&
           (!o.check_out_date || o.check_out_date > today) &&
           (!booking.check_out_date || booking.check_out_date > today) &&
           o.check_in_date < booking.check_out_date &&
           booking.check_in_date < o.check_out_date
  );

  if (overlapConflict) {
    return {
      text: `Overlap conflict (${overlapConflict.booking_code})`,
      color: '#dc2626',
      bg: '#fef2f2',
      border: '#fca5a5',
      isConflict: true,
      conflictBookingCode: overlapConflict.booking_code,
    };
  }

  // 5. Checked-in reservation:
  // ONLY the guest who is ACTUALLY staying in this room right now displays "Guest is staying".
  // Historical completed bookings must NOT be marked "Guest is staying" just because the room is occupied.
  if (booking.status === 'checked_in') {
    const isStayingGuest = Boolean(
      booking.stay_status === 'in_house' ||
      (isOccupied && (
        (room?.bookingId && Number(room.bookingId) === Number(booking.id)) ||
        (room?.bookingCode && room.bookingCode === booking.booking_code) ||
        (room?.guestName && booking.guest_name && room.guestName.trim().toLowerCase() === booking.guest_name.trim().toLowerCase())
      ))
    );

    if (isStayingGuest || (isOccupied && !room?.guestName && booking.check_out_date >= today)) {
      if (isOverdueCheckout) {
        return {
          text: 'Checkout overdue',
          color: '#dc2626',
          bg: '#fef2f2',
          border: '#fca5a5',
        };
      }
      return {
        text: 'Guest is staying',
        color: '#0284c7',
        bg: '#f0f9ff',
        border: '#bae6fd',
      };
    }

    // Historical booking whose stay is completed or superseded by another occupant
    return {
      text: 'Checked out',
      color: '#475569',
      bg: '#f1f5f9',
      border: '#cbd5e1',
      isCheckedOut: true,
    };
  }

  // 6. Pending booking: Guest has NOT checked in
  if (isOccupied) {
    if (booking.check_in_date <= today) {
      return {
        text: 'Waiting – room occupied',
        color: '#d97706',
        bg: '#fffbeb',
        border: '#fde68a',
        isWaitingRoomOccupied: true,
      };
    }
    return {
      text: 'Upcoming',
      color: '#2563eb',
      bg: '#eff6ff',
      border: '#bfdbfe',
    };
  }

  if (isMaintenance) {
    return {
      text: 'Room under maintenance',
      color: '#dc2626',
      bg: '#fef2f2',
      border: '#fca5a5',
    };
  }

  if (isCleaning) {
    return {
      text: 'Room cleaning',
      color: '#7c3aed',
      bg: '#f5f3ff',
      border: '#ddd6fe',
    };
  }

  if (isArrivalOverdue) {
    return {
      text: 'Guest not arrived',
      color: '#d97706',
      bg: '#fffbeb',
      border: '#fde68a',
    };
  }

  if (isArrivalToday) {
    return {
      text: isReady ? 'Room ready' : 'Guest not arrived',
      color: isReady ? '#16a34a' : '#d97706',
      bg: isReady ? '#f0fdf4' : '#fffbeb',
      border: isReady ? '#bbf7d0' : '#fde68a',
    };
  }

  return {
    text: 'Upcoming',
    color: '#059669',
    bg: '#ecfdf5',
    border: '#a7f3d0',
  };
}
