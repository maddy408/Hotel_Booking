import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getCardDisplay } from '../lib/roomAvailability.js';

describe('Compact Room Availability Cards - New Booking Picker', () => {
  const checkIn = '2026-11-10';
  const checkOut = '2026-11-12';

  it('Case 1: Free room with no reservations displays Ready / Available and allows selection', () => {
    const room = {
      id: 101,
      room_no: 101,
      housekeeping_status: 'ok',
      is_available: true,
      is_bookable: true,
      card_badge: 'Ready',
      card_detail: 'Available',
      card_condition: 'free_ready',
      selection_allowed: true,
      selection_blocked_reason: null,
      current_stay: null,
      next_reservation: null,
    };

    const card = getCardDisplay(room, checkIn, checkOut);
    assert.equal(card.badge, 'Ready');
    assert.equal(card.detail, 'Available');
    assert.equal(card.condition, 'free_ready');
    assert.equal(card.blockedReason, null);
    assert.equal(room.is_bookable, true);
  });

  it('Case 2: Currently occupied room with a future checkout displays Occupied / Leaves {date} and allows turnover selection', () => {
    const room = {
      id: 102,
      room_no: 102,
      housekeeping_status: 'ok',
      is_available: true,
      is_bookable: true,
      card_badge: 'Occupied',
      card_detail: 'Leaves 10 Nov',
      card_condition: 'occupied',
      selection_allowed: true,
      selection_blocked_reason: null,
      turnover_notice: 'Consecutive booking after checkout on 10 Nov. Actual check-in is subject to checkout completion and housekeeping readiness.',
      current_stay: {
        guest_name: 'Karthika',
        check_in_date: '2026-11-08',
        checkout_planned: '2026-11-10',
        checkout_time: '12:00:00',
        is_overdue: false,
      },
      next_reservation: null,
    };

    const card = getCardDisplay(room, checkIn, checkOut);
    assert.equal(card.badge, 'Occupied');
    assert.equal(card.detail, 'Leaves 10 Nov');
    assert.equal(card.condition, 'occupied');
    assert.equal(room.is_bookable, true);
    assert.ok(card.turnoverNotice.includes('subject to checkout completion and housekeeping readiness'));
  });

  it('Case 3: Occupied room with consecutive future reservation displays Occupied / Next booking {date} and disables selection when overlapping', () => {
    const room = {
      id: 103,
      room_no: 103,
      housekeeping_status: 'ok',
      is_available: false,
      is_bookable: false,
      card_badge: 'Occupied',
      card_detail: 'Next booking 10 Nov',
      card_condition: 'occupied_next_booking',
      selection_allowed: false,
      selection_blocked_reason: 'Room 103 already has a reservation (BK-3409) until 12 Nov.',
      turnover_notice: 'Consecutive booking after checkout on 10 Nov. Actual check-in is subject to checkout completion and housekeeping readiness.',
      current_stay: {
        guest_name: 'Jeya Bharathi',
        checkout_planned: '2026-11-10',
      },
      next_reservation: {
        booking_code: 'BK-3409',
        guest_name: 'Maya',
        check_in_date: '2026-11-10',
        check_out_date: '2026-11-12',
      },
      conflicting_reservation: {
        booking_code: 'BK-3409',
        guest_name: 'Maya',
        check_in_date: '2026-11-10',
        check_out_date: '2026-11-12',
      },
    };

    const card = getCardDisplay(room, checkIn, checkOut);
    assert.equal(card.badge, 'Occupied');
    assert.equal(card.detail, 'Next booking 10 Nov');
    assert.equal(card.condition, 'occupied_next_booking');
    assert.equal(room.is_bookable, false);
    assert.ok(card.blockedReason.includes('already has a reservation'));
  });

  it('Case 4: Room with an overlapping reservation displays Booked / Until {date} and disables selection', () => {
    const room = {
      id: 104,
      room_no: 104,
      housekeeping_status: 'ok',
      is_available: false,
      is_bookable: false,
      card_badge: 'Booked',
      card_detail: 'Until 12 Nov',
      card_condition: 'reserved',
      selection_allowed: false,
      selection_blocked_reason: 'Reserved for requested dates until 12 Nov (BK-1004).',
      current_stay: null,
      conflicting_reservation: {
        booking_code: 'BK-1004',
        check_in_date: '2026-11-09',
        check_out_date: '2026-11-12',
      },
    };

    const card = getCardDisplay(room, checkIn, checkOut);
    assert.equal(card.badge, 'Booked');
    assert.equal(card.detail, 'Until 12 Nov');
    assert.equal(card.condition, 'reserved');
    assert.equal(room.is_bookable, false);
    assert.ok(card.blockedReason.includes('Reserved for requested dates'));
  });

  it('Case 5: Room with a pending booking in future displays Ready / Available and allows selection when dates do not overlap', () => {
    const room = {
      id: 105,
      room_no: 105,
      housekeeping_status: 'ok',
      is_available: true,
      is_bookable: true,
      card_badge: 'Ready',
      card_detail: 'Available',
      card_condition: 'free_ready',
      selection_allowed: true,
      selection_blocked_reason: null,
      current_stay: null,
      next_reservation: {
        booking_code: 'BK-1005',
        guest_name: 'Later Guest',
        check_in_date: '2026-11-20',
        check_out_date: '2026-11-22',
      },
    };

    const card = getCardDisplay(room, checkIn, checkOut);
    assert.equal(card.badge, 'Ready');
    assert.equal(card.detail, 'Available');
    assert.equal(room.is_bookable, true);
    assert.ok(room.next_reservation.booking_code === 'BK-1005');
  });

  it('Case 6: Room under cleaning displays Cleaning / Not ready yet and explains readiness required', () => {
    const room = {
      id: 106,
      room_no: 106,
      housekeeping_status: 'cleaning',
      is_available: true,
      is_bookable: true,
      card_badge: 'Cleaning',
      card_detail: 'Not ready yet',
      card_condition: 'cleaning',
      selection_allowed: true,
      selection_blocked_reason: null,
      turnover_notice: 'Housekeeping in progress. Room must be marked ready before check-in.',
      current_stay: null,
      next_reservation: null,
    };

    const card = getCardDisplay(room, checkIn, checkOut);
    assert.equal(card.badge, 'Cleaning');
    assert.equal(card.detail, 'Not ready yet');
    assert.equal(card.condition, 'cleaning');
    assert.equal(room.is_bookable, true);
    assert.ok(card.turnoverNotice.includes('marked ready before check-in'));
  });

  it('Case 7: Room under repair displays Repair / Unavailable and disables selection', () => {
    const room = {
      id: 107,
      room_no: 407,
      housekeeping_status: 'repair',
      is_available: false,
      is_bookable: false,
      card_badge: 'Repair',
      card_detail: 'Unavailable',
      card_condition: 'maintenance',
      selection_allowed: false,
      selection_blocked_reason: 'Room 407 is under maintenance and cannot be booked.',
      current_stay: null,
      next_reservation: null,
    };

    const card = getCardDisplay(room, checkIn, checkOut);
    assert.equal(card.badge, 'Repair');
    assert.equal(card.detail, 'Unavailable');
    assert.equal(card.condition, 'maintenance');
    assert.equal(room.is_bookable, false);
    assert.ok(card.blockedReason.includes('under maintenance'));
  });

  it('Case 8: Guest overstaying beyond planned checkout displays Overdue / Checkout pending and disables selection', () => {
    const room = {
      id: 108,
      room_no: 108,
      housekeeping_status: 'ok',
      is_available: false,
      is_bookable: false,
      card_badge: 'Overdue',
      card_detail: 'Checkout pending',
      card_condition: 'overdue',
      selection_allowed: false,
      selection_blocked_reason: 'Previous guest checkout is overdue. Checkout must be completed before new check-in.',
      current_stay: {
        guest_name: 'Overstay Guest',
        checkout_planned: '2026-11-08',
        is_overdue: true,
      },
      next_reservation: null,
    };

    const card = getCardDisplay(room, checkIn, checkOut);
    assert.equal(card.badge, 'Overdue');
    assert.equal(card.detail, 'Checkout pending');
    assert.equal(card.condition, 'overdue');
    assert.equal(room.is_bookable, false);
    assert.ok(card.blockedReason.includes('overdue'));
  });

  it('Case 9: Room becoming available after actual checkout and housekeeping readiness displays Ready / Available', () => {
    // Guest checked out, housekeeping marked ok
    const room = {
      id: 109,
      room_no: 109,
      housekeeping_status: 'ok',
      is_available: true,
      is_bookable: true,
      card_badge: 'Ready',
      card_detail: 'Available',
      card_condition: 'free_ready',
      selection_allowed: true,
      selection_blocked_reason: null,
      current_stay: null, // No in-house stay
      next_reservation: null,
    };

    const card = getCardDisplay(room, checkIn, checkOut);
    assert.equal(card.badge, 'Ready');
    assert.equal(card.detail, 'Available');
    assert.equal(card.condition, 'free_ready');
    assert.equal(room.is_bookable, true);
  });

  it('handles client-side fallback gracefully when backend fields are omitted', () => {
    const rawCleaningRoom = {
      id: 1,
      room_no: 101,
      housekeeping_status: 'cleaning',
      booking_status: 'available_not_ready',
      is_available: true,
      is_bookable: true,
    };
    const card1 = getCardDisplay(rawCleaningRoom, checkIn, checkOut);
    assert.equal(card1.badge, 'Cleaning');
    assert.equal(card1.detail, 'Not ready yet');

    const rawRepairRoom = {
      id: 2,
      room_no: 407,
      housekeeping_status: 'repair',
      booking_status: 'maintenance',
      is_available: false,
      is_bookable: false,
    };
    const card2 = getCardDisplay(rawRepairRoom, checkIn, checkOut);
    assert.equal(card2.badge, 'Repair');
    assert.equal(card2.detail, 'Unavailable');

    const rawBookedRoom = {
      id: 3,
      room_no: 104,
      housekeeping_status: 'ok',
      booking_status: 'unavailable',
      is_available: false,
      is_bookable: false,
    };
    const card3 = getCardDisplay(rawBookedRoom, checkIn, checkOut);
    assert.equal(card3.badge, 'Booked');
    assert.equal(card3.detail, 'Until 12 Nov');
  });
});
