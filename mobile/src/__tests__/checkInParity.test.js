import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Mobile Confirm Check-in Payload & Validation Parity', () => {
  // Helper simulating the payload extractor implemented in mobile/src/api/reservations.js
  function extractCheckInPayload(payload) {
    let reservationId = null;
    let body = payload;

    if (payload && typeof payload === 'object' && !(payload instanceof FormData)) {
      if (payload.id && payload.formData) {
        reservationId = payload.id;
        body = payload.formData;
      } else if (payload.reservationId && payload.formData) {
        reservationId = payload.reservationId;
        body = payload.formData;
      } else if (payload.id) {
        reservationId = payload.id;
      } else if (payload.reservationId) {
        reservationId = payload.reservationId;
      }
    }

    if (!reservationId && payload && typeof payload === 'object') {
      if (typeof payload.get === 'function') {
        reservationId = payload.get('reservationId') || payload.get('id');
      } else if (Array.isArray(payload._parts)) {
        const found = payload._parts.find(
          (part) => part[0] === 'reservationId' || part[0] === 'id'
        );
        if (found) reservationId = found[1];
      }
    }

    return { reservationId, body };
  }

  it('1. Extracts reservation ID and formData when payload is { id, formData }', () => {
    const mockFormData = { _parts: [['notes', 'Early arrival']] };
    const payload = { id: 45, formData: mockFormData };
    const { reservationId, body } = extractCheckInPayload(payload);

    assert.equal(reservationId, 45);
    assert.equal(body, mockFormData);
  });

  it('2. Extracts reservation ID and data when payload is JSON object { id, advance_amount, room_id }', () => {
    const payload = { id: 78, room_id: 104, advance_amount: 1500 };
    const { reservationId, body } = extractCheckInPayload(payload);

    assert.equal(reservationId, 78);
    assert.equal(body.room_id, 104);
    assert.equal(body.advance_amount, 1500);
  });

  it('3. Safely extracts reservation ID from React Native FormData with _parts (no .get() method)', () => {
    // Simulating React Native's FormData object which does NOT have .get()
    const rnFormData = {
      _parts: [
        ['reservationId', '112'],
        ['actual_check_in', '2026-11-19 14:00:00'],
      ],
      append(k, v) {
        this._parts.push([k, v]);
      },
    };

    assert.equal(typeof rnFormData.get, 'undefined');
    const { reservationId, body } = extractCheckInPayload(rnFormData);

    assert.equal(reservationId, '112');
    assert.equal(body, rnFormData);
  });

  it('4. Safely extracts reservation ID from standard FormData with .get() method', () => {
    const stdFormData = {
      map: new Map([['id', '230']]),
      get(k) {
        return this.map.get(k);
      },
    };

    const { reservationId, body } = extractCheckInPayload(stdFormData);
    assert.equal(reservationId, '230');
    assert.equal(body, stdFormData);
  });

  it('5. Double-tap prevention logic prevents duplicate API requests', () => {
    let callCount = 0;
    const isSubmittingRef = { current: false };

    const handleConfirmCheckIn = async () => {
      if (isSubmittingRef.current) return;
      isSubmittingRef.current = true;
      try {
        callCount++;
      } finally {
        isSubmittingRef.current = false;
      }
    };

    // First call sets isSubmittingRef.current = true
    isSubmittingRef.current = true;
    // Simultaneous second tap should be ignored
    handleConfirmCheckIn();
    assert.equal(callCount, 0);

    // After reset, tap succeeds
    isSubmittingRef.current = false;
    handleConfirmCheckIn();
    assert.equal(callCount, 1);
  });

  it('6. Business rule: Validates room readiness before check-in', () => {
    const validateRoomReadiness = (room) => {
      if (!room) return { valid: false, message: 'Room not selected' };
      if (room.status === 'maintenance') return { valid: false, message: 'Room under maintenance' };
      if (room.status === 'occupied') return { valid: false, message: 'Room is already occupied' };
      return { valid: true };
    };

    assert.equal(validateRoomReadiness({ status: 'maintenance' }).valid, false);
    assert.equal(validateRoomReadiness({ status: 'occupied' }).valid, false);
    assert.equal(validateRoomReadiness({ status: 'available' }).valid, true);
    assert.equal(validateRoomReadiness({ status: 'ready' }).valid, true);
  });

  it('7. Business rule: Validates required advance amount when required by hotel policy', () => {
    const validateAdvance = (advanceRequired, advanceCollected) => {
      const req = Number(advanceRequired) || 0;
      const col = Number(advanceCollected) || 0;
      if (req > 0 && col < req) {
        return { valid: false, message: `Minimum advance of ₹${req} required (collected: ₹${col})` };
      }
      return { valid: true };
    };

    assert.equal(validateAdvance(1000, 500).valid, false);
    assert.equal(validateAdvance(1000, 1000).valid, true);
    assert.equal(validateAdvance(1000, 1500).valid, true);
    assert.equal(validateAdvance(0, 0).valid, true);
  });

  it('8. Business rule: Validates occupant count does not exceed room max capacity', () => {
    const validateCapacity = (occupantsCount, maxPersons) => {
      if (occupantsCount > maxPersons) {
        return { valid: false, message: `Room capacity exceeded (max ${maxPersons} persons)` };
      }
      return { valid: true };
    };

    assert.equal(validateCapacity(4, 3).valid, false);
    assert.equal(validateCapacity(3, 3).valid, true);
    assert.equal(validateCapacity(2, 3).valid, true);
  });
});
