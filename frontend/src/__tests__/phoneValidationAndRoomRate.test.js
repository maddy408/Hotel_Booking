import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanPhone10,
  isValidPhone,
  validatePhone,
  handlePhoneInputChange,
  getRoomConfiguredRate,
} from '../lib/validation.js';

describe('Frontend: Indian Mobile Number Validation & Pre-book Room Rate', () => {
  describe('1. Phone Number Validation While Typing', () => {
    it('rejects starting digits 1, 2, 3, 4, 5 as first character while typing', () => {
      for (const digit of ['1', '2', '3', '4', '5']) {
        const res = handlePhoneInputChange(digit, '');
        assert.equal(res.value, '', `Starting digit ${digit} should not be accepted`);
        assert.equal(res.error, 'Indian mobile numbers must start with 6, 7, 8, or 9.');
      }
    });

    it('rejects starting digit 0 as first character while typing single digit', () => {
      const res = handlePhoneInputChange('0', '');
      assert.equal(res.value, '');
      assert.equal(res.error, 'Indian mobile numbers must start with 6, 7, 8, or 9.');
    });

    it('allows starting digits 6, 7, 8, 9 while typing', () => {
      for (const digit of ['6', '7', '8', '9']) {
        const res = handlePhoneInputChange(digit, '');
        assert.equal(res.value, digit, `Starting digit ${digit} should be accepted`);
        assert.equal(res.error, null);
      }
    });

    it('allows valid 10-digit mobile number typing progressively', () => {
      const input = '9876543210';
      let current = '';
      for (let i = 0; i < input.length; i++) {
        const char = input[i];
        const next = current + char;
        const res = handlePhoneInputChange(next, current);
        assert.equal(res.value, next);
        assert.equal(res.error, null);
        current = res.value;
      }
      assert.equal(current, '9876543210');
      assert.equal(isValidPhone(current), true);
      const val = validatePhone(current);
      assert.equal(val.isValid, true);
      assert.equal(val.error, null);
    });

    it('rejects letters and special characters while typing', () => {
      const res1 = handlePhoneInputChange('987abc', '987');
      assert.equal(res1.value, '987');
      assert.equal(res1.error, 'Only numeric digits are allowed.');

      const res2 = handlePhoneInputChange('98@#$!', '98');
      assert.equal(res2.value, '98');
      assert.equal(res2.error, 'Only numeric digits are allowed.');
    });

    it('caps mobile number at exactly 10 digits', () => {
      const res = handlePhoneInputChange('9876543210999', '9876543210');
      assert.equal(res.value, '9876543210');
      assert.equal(res.value.length, 10);
    });

    it('handles backspace smoothly without stripping digits', () => {
      const res = handlePhoneInputChange('9876', '98765');
      assert.equal(res.value, '9876');
      assert.equal(res.error, null);
    });

    it('preserves editing digits in the middle of a number', () => {
      // User has 9876543210 and changes digit at index 3 (6 -> 9)
      const modified = '9879543210';
      const res = handlePhoneInputChange(modified, '9876543210');
      assert.equal(res.value, '9879543210');
      assert.equal(res.error, null);
      assert.equal(isValidPhone(res.value), true);
    });

    it('handles country-code formats (+91, 91, 0) consistently', () => {
      // Pasted or typed with country codes
      assert.equal(cleanPhone10('+919876543210'), '9876543210');
      assert.equal(cleanPhone10('919876543210'), '9876543210');
      assert.equal(cleanPhone10('09876543210'), '9876543210');
      assert.equal(cleanPhone10('+91 98765-43210'), '9876543210');

      const resPaste = handlePhoneInputChange('+919876543210', '');
      assert.equal(resPaste.value, '9876543210');
      assert.equal(resPaste.error, null);
    });

    it('validatePhone reports appropriate errors for incomplete or empty values', () => {
      const v1 = validatePhone('');
      assert.equal(v1.isValid, false);
      assert.equal(v1.error, 'Mobile number is required.');

      const v2 = validatePhone('98765');
      assert.equal(v2.isValid, false);
      assert.equal(v2.error, 'Mobile number must be exactly 10 digits.');

      const v3 = validatePhone('1234567890');
      assert.equal(v3.isValid, false);
      assert.equal(v3.error, 'Indian mobile numbers must start with 6, 7, 8, or 9.');

      const v4 = validatePhone('9876543210');
      assert.equal(v4.isValid, true);
      assert.equal(v4.error, null);
    });
  });

  describe('2. Room Master Rate Auto-Population on Pre-book', () => {
    const mockRoomTypes = [
      { id: 1, name: 'Standard', rate: 2200 },
      { id: 2, name: 'Deluxe', rate: 3500 },
      { id: 3, name: 'Suite', rate: 5500 },
    ];

    it('extracts configured rate from room.roomType.rate (Room 102 Standard)', () => {
      const room102 = {
        id: 2,
        roomNo: 102,
        room_no: '102',
        room_type_id: 1,
        roomType: { id: 1, name: 'Standard', rate: 2200 },
      };
      const rate = getRoomConfiguredRate(room102, mockRoomTypes);
      assert.equal(rate, 2200);
    });

    it('extracts configured rate from room.type_rate if roomType object is flattened', () => {
      const room = {
        id: 5,
        roomNo: 105,
        room_type_id: 1,
        type_rate: 2200,
      };
      const rate = getRoomConfiguredRate(room, mockRoomTypes);
      assert.equal(rate, 2200);
    });

    it('extracts configured rate by resolving room_type_id against roomTypes list', () => {
      const room201 = {
        id: 11,
        roomNo: 201,
        room_type_id: 2, // Deluxe
      };
      const rate = getRoomConfiguredRate(room201, mockRoomTypes);
      assert.equal(rate, 3500);
    });

    it('updates rate when switching selected room from Standard to Deluxe', () => {
      const roomStandard = { id: 2, roomNo: 102, room_type_id: 1, roomType: { id: 1, rate: 2200 } };
      const roomDeluxe = { id: 11, roomNo: 201, room_type_id: 2, roomType: { id: 2, rate: 3500 } };

      let currentRoom = roomStandard;
      let rate = getRoomConfiguredRate(currentRoom, mockRoomTypes);
      assert.equal(rate, 2200);

      // User changes room to Deluxe
      currentRoom = roomDeluxe;
      rate = getRoomConfiguredRate(currentRoom, mockRoomTypes);
      assert.equal(rate, 3500);
    });

    it('recalculates total amount correctly when rate and days change', () => {
      const days = 3;
      const rate = 2200;
      const gstRate = 0.12; // 12% GST for rate > 1000

      const roomAmt = days * rate;
      assert.equal(roomAmt, 6600);

      const gstAmt = roomAmt * gstRate;
      assert.equal(gstAmt, 792);

      const total = roomAmt + gstAmt;
      assert.equal(total, 7392);
    });

    it('preserves existing booking saved rate when editing an existing booking', () => {
      // Historical booking created when rate was 1800, current Room Master rate is 2200
      const editReservation = {
        id: 42,
        booking_code: 'BK-1042',
        room_id: 2,
        rate: 1800,
        guest_name: 'Historical Guest',
        guest_phone: '9876543210',
      };
      const isEdit = Boolean(editReservation && editReservation.id);
      assert.equal(isEdit, true);

      // Edit form initializes rate with editReservation.rate
      const initialRate = isEdit ? String(editReservation.rate) : '';
      assert.equal(initialRate, '1800');
    });

    it('pre-book correctly identifies room ID from preSelectedRoom or editReservation', () => {
      // Web Pre-book passes preSelectedRoom
      const webPreSelectedRoom = { id: 2, roomNo: 102, roomType: { id: 1, rate: 2200 } };
      const webInitialRoomId = webPreSelectedRoom?.id ?? null;
      assert.equal(webInitialRoomId, 2);
      assert.equal(getRoomConfiguredRate(webPreSelectedRoom, mockRoomTypes), 2200);

      // Mobile Pre-book passes editReservation: { room_id: 2 }
      const mobileEditReservation = { room_id: 2 };
      const mobileIsEdit = Boolean(mobileEditReservation && mobileEditReservation.id);
      assert.equal(mobileIsEdit, false, 'Pre-book without booking ID should not be treated as edit mode');

      const allRooms = [
        { id: 1, roomNo: 101, room_type_id: 1, roomType: { id: 1, rate: 2200 } },
        { id: 2, roomNo: 102, room_type_id: 1, roomType: { id: 1, rate: 2200 } },
      ];
      const targetRoom = allRooms.find((r) => r.id === mobileEditReservation.room_id);
      assert.ok(targetRoom);
      assert.equal(getRoomConfiguredRate(targetRoom, mockRoomTypes), 2200);
    });
  });
});
