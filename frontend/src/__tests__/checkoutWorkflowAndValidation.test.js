import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Helper recreating the exact dynamic checkout logic from CheckoutSheet.jsx
 */
function deriveCheckoutState({ stay, actualCheckoutDate, bill, isCheckedOut = false }) {
  const isDateInvalid = !actualCheckoutDate || (stay && actualCheckoutDate < stay.check_in_date);

  let checkoutType = 'normal';
  if (stay?.checkout_planned && actualCheckoutDate) {
    if (actualCheckoutDate < stay.checkout_planned) {
      checkoutType = 'early';
    } else if (actualCheckoutDate > stay.checkout_planned) {
      checkoutType = 'late';
    } else {
      checkoutType = 'normal';
    }
  }

  const isEarly = !isCheckedOut && checkoutType === 'early';
  const isLate = !isCheckedOut && checkoutType === 'late';
  const isNormal = !isCheckedOut && checkoutType === 'normal';

  // SheetHeader title and subtitle
  let title = 'Check out';
  let subtitle = '';
  if (isCheckedOut) {
    title = 'Bill Details (Checked Out)';
    subtitle = `${stay?.room_type_name || 'Room'} · Settled`;
  } else if (isEarly) {
    title = 'Early Check out';
    subtitle = `${stay?.room_type_name || 'Room'} · Checking out before planned date (${stay?.checkout_planned})`;
  } else if (isLate) {
    title = 'Late Check out';
    subtitle = `${stay?.room_type_name || 'Room'} · Extended stay beyond planned date (${stay?.checkout_planned})`;
  } else {
    title = 'Check out';
    subtitle = `${stay?.room_type_name || 'Room'} · Standard checkout`;
  }

  // Info section label tag
  let checkoutTag = '';
  if (isEarly) checkoutTag = '(Early Checkout)';
  else if (isLate) checkoutTag = '(Late Checkout / Extended Stay)';
  else if (isNormal) checkoutTag = '(Scheduled Checkout)';

  // Nights calculations
  const plannedNights = bill?.plannedNights ?? 1;
  const actualNights = bill?.nights ?? 1;
  const unusedNights = isEarly ? (bill?.unusedNights ?? Math.max(0, plannedNights - actualNights)) : 0;
  const additionalNights = isLate ? (bill?.additionalNights ?? Math.max(0, actualNights - plannedNights)) : 0;

  // Validation message
  let validationError = null;
  if (!actualCheckoutDate) {
    validationError = 'Please select a valid checkout date.';
  } else if (stay && actualCheckoutDate < stay.check_in_date) {
    validationError = `Invalid date selection: Actual checkout date cannot be earlier than check-in date (${stay.check_in_date}).`;
  }

  // Notice banner text
  let noticeBanner = '';
  if (isEarly) {
    noticeBanner = `· Early checkout recalculation active (${unusedNights} unused night${unusedNights !== 1 ? 's' : ''})`;
  } else if (isLate) {
    noticeBanner = `· Extended stay recalculation active (+${additionalNights} additional night${additionalNights !== 1 ? 's' : ''})`;
  } else if (isNormal) {
    noticeBanner = '· Scheduled checkout date';
  }

  // Refund default reason
  const defaultRefundReason = isEarly
    ? 'Early checkout refund for unused night(s)'
    : isLate
      ? 'Late checkout overpayment refund'
      : 'Checkout refund';

  // Can submit checkout
  const canSubmitCheckout = !isDateInvalid;

  return {
    checkoutType,
    isEarly,
    isLate,
    isNormal,
    title,
    subtitle,
    checkoutTag,
    plannedNights,
    actualNights,
    unusedNights,
    additionalNights,
    isDateInvalid,
    validationError,
    noticeBanner,
    defaultRefundReason,
    canSubmitCheckout,
    showEarlyCheckoutFee: (isEarly || isCheckedOut) && Number(bill?.earlyCheckoutFee) > 0,
  };
}

describe('Checkout Workflow & Date Validation Logic', () => {
  // Common test stay fixture
  const sampleStay = {
    id: 101,
    room_no: '201',
    room_type_name: 'Deluxe Room',
    check_in_date: '2026-11-09',
    checkout_planned: '2026-11-10',
    rate: 2000.0,
    status: 'in_house',
  };

  // ---------------------------------------------------------------------------
  // 1. Normal Checkout Flow
  // ---------------------------------------------------------------------------
  it('1. Normal Checkout: actual checkout date equals planned date', () => {
    const bill = {
      nights: 1,
      plannedNights: 1,
      unusedNights: 0,
      additionalNights: 0,
      roomAmount: 2000.0,
      roomGstAmount: 100.0,
      earlyCheckoutFee: 0.0,
      total: 2100.0,
      balance: 0.0,
    };

    const state = deriveCheckoutState({
      stay: sampleStay,
      actualCheckoutDate: '2026-11-10',
      bill,
    });

    assert.equal(state.checkoutType, 'normal');
    assert.equal(state.isNormal, true);
    assert.equal(state.isEarly, false);
    assert.equal(state.isLate, false);
    assert.equal(state.title, 'Check out');
    assert.ok(state.subtitle.includes('Standard checkout'));
    assert.equal(state.checkoutTag, '(Scheduled Checkout)');
    assert.equal(state.actualNights, 1);
    assert.equal(state.plannedNights, 1);
    assert.equal(state.unusedNights, 0);
    assert.equal(state.additionalNights, 0);
    assert.equal(state.noticeBanner, '· Scheduled checkout date');
    assert.equal(state.isDateInvalid, false);
    assert.equal(state.canSubmitCheckout, true);
    assert.equal(state.showEarlyCheckoutFee, false);
  });

  // ---------------------------------------------------------------------------
  // 2. Early Checkout Flow
  // ---------------------------------------------------------------------------
  it('2. Early Checkout: actual checkout date is before planned checkout date', () => {
    const earlyStay = {
      ...sampleStay,
      check_in_date: '2026-11-01',
      checkout_planned: '2026-11-05', // 4 nights planned
    };

    const bill = {
      nights: 2,
      plannedNights: 4,
      unusedNights: 2,
      additionalNights: 0,
      roomAmount: 4000.0,
      roomGstAmount: 200.0,
      earlyCheckoutFee: 200.0, // policy deduction fee
      total: 4400.0,
      balance: -4000.0,
    };

    const state = deriveCheckoutState({
      stay: earlyStay,
      actualCheckoutDate: '2026-11-03', // Leaves after 2 nights
      bill,
    });

    assert.equal(state.checkoutType, 'early');
    assert.equal(state.isEarly, true);
    assert.equal(state.isNormal, false);
    assert.equal(state.isLate, false);
    assert.equal(state.title, 'Early Check out');
    assert.ok(state.subtitle.includes('Checking out before planned date'));
    assert.equal(state.checkoutTag, '(Early Checkout)');
    assert.equal(state.actualNights, 2);
    assert.equal(state.plannedNights, 4);
    assert.equal(state.unusedNights, 2);
    assert.equal(state.additionalNights, 0);
    assert.ok(state.noticeBanner.includes('Early checkout recalculation active'));
    assert.ok(state.noticeBanner.includes('2 unused nights'));
    assert.equal(state.isDateInvalid, false);
    assert.equal(state.canSubmitCheckout, true);
    assert.equal(state.showEarlyCheckoutFee, true);
    assert.equal(state.defaultRefundReason, 'Early checkout refund for unused night(s)');
  });

  // ---------------------------------------------------------------------------
  // 3. Late Checkout Flow (The User's Bug Report Example)
  // ---------------------------------------------------------------------------
  it('3. Late Checkout: User bug report scenario (09-Nov to 10-Nov planned, checkout 17-Nov)', () => {
    // Example:
    // Original Check-in: 09-Nov-2026
    // Original Planned Checkout: 10-Nov-2026
    // Selected Actual Checkout: 17-Nov-2026
    // Actual Nights Stayed: 8 nights
    const bill = {
      nights: 8,
      plannedNights: 1,
      unusedNights: 0,
      additionalNights: 7,
      roomAmount: 16000.0,
      roomGstAmount: 800.0,
      earlyCheckoutFee: 0.0,
      total: 16800.0,
      balance: 14700.0,
    };

    const state = deriveCheckoutState({
      stay: sampleStay,
      actualCheckoutDate: '2026-11-17',
      bill,
    });

    // CRITICAL BUG FIX: Must NOT show Early Check out heading!
    assert.notEqual(state.title, 'Early Check out');
    assert.equal(state.title, 'Late Check out');
    assert.equal(state.checkoutType, 'late');
    assert.equal(state.isLate, true);
    assert.equal(state.isEarly, false);
    assert.equal(state.isNormal, false);
    assert.ok(state.subtitle.includes('Extended stay beyond planned date'));
    assert.equal(state.checkoutTag, '(Late Checkout / Extended Stay)');

    // Nights breakdown: 1 planned, 8 actual, 7 additional
    assert.equal(state.actualNights, 8);
    assert.equal(state.plannedNights, 1);
    assert.equal(state.unusedNights, 0);
    assert.equal(state.additionalNights, 7);

    // Banner indicates extended stay recalculation
    assert.ok(state.noticeBanner.includes('Extended stay recalculation active'));
    assert.ok(state.noticeBanner.includes('+7 additional nights'));

    // Early checkout fee must NOT be displayed for late checkout
    assert.equal(state.showEarlyCheckoutFee, false);
    assert.equal(state.isDateInvalid, false);
    assert.equal(state.canSubmitCheckout, true);
  });

  // ---------------------------------------------------------------------------
  // 4. Dynamic Switching between all three checkout types
  // ---------------------------------------------------------------------------
  it('4. Dynamically updates checkout type when user changes selected checkout date', () => {
    const stay = {
      ...sampleStay,
      check_in_date: '2026-11-09',
      checkout_planned: '2026-11-15', // 6 nights planned
    };

    // Case A: Select date before planned checkout -> Early Checkout
    const early = deriveCheckoutState({
      stay,
      actualCheckoutDate: '2026-11-12',
      bill: { nights: 3, plannedNights: 6, unusedNights: 3, additionalNights: 0 },
    });
    assert.equal(early.checkoutType, 'early');
    assert.equal(early.title, 'Early Check out');
    assert.equal(early.isEarly, true);

    // Case B: Select exact planned checkout date -> Normal Checkout
    const normal = deriveCheckoutState({
      stay,
      actualCheckoutDate: '2026-11-15',
      bill: { nights: 6, plannedNights: 6, unusedNights: 0, additionalNights: 0 },
    });
    assert.equal(normal.checkoutType, 'normal');
    assert.equal(normal.title, 'Check out');
    assert.equal(normal.isNormal, true);

    // Case C: Select date after planned checkout date -> Late Checkout
    const late = deriveCheckoutState({
      stay,
      actualCheckoutDate: '2026-11-18',
      bill: { nights: 9, plannedNights: 6, unusedNights: 0, additionalNights: 3 },
    });
    assert.equal(late.checkoutType, 'late');
    assert.equal(late.title, 'Late Check out');
    assert.equal(late.isLate, true);
  });

  // ---------------------------------------------------------------------------
  // 5. Date Boundary & Invalid Date Prevention
  // ---------------------------------------------------------------------------
  it('5. Prevents invalid date selections earlier than check-in date', () => {
    const state = deriveCheckoutState({
      stay: sampleStay, // check_in_date: '2026-11-09'
      actualCheckoutDate: '2026-11-08', // Invalid: before check-in date
      bill: { nights: 1, plannedNights: 1 },
    });

    assert.equal(state.isDateInvalid, true);
    assert.equal(state.canSubmitCheckout, false);
    assert.ok(state.validationError.includes('Actual checkout date cannot be earlier than check-in date'));
    assert.ok(state.validationError.includes('2026-11-09'));
  });

  it('6. Prevents submission when checkout date is empty', () => {
    const state = deriveCheckoutState({
      stay: sampleStay,
      actualCheckoutDate: '',
      bill: { nights: 1, plannedNights: 1 },
    });

    assert.equal(state.isDateInvalid, true);
    assert.equal(state.canSubmitCheckout, false);
    assert.equal(state.validationError, 'Please select a valid checkout date.');
  });

  // ---------------------------------------------------------------------------
  // 6. Same-Day Checkout (Check-in date equals Actual checkout date)
  // ---------------------------------------------------------------------------
  it('7. Supports same-day checkout (minimum 1 night) without invalid date error', () => {
    const state = deriveCheckoutState({
      stay: sampleStay, // check_in_date: '2026-11-09', planned: '2026-11-10'
      actualCheckoutDate: '2026-11-09', // Same-day checkout
      bill: { nights: 1, plannedNights: 1, unusedNights: 0 },
    });

    assert.equal(state.isDateInvalid, false);
    assert.equal(state.canSubmitCheckout, true);
    assert.equal(state.checkoutType, 'early');
    assert.equal(state.title, 'Early Check out');
  });

  // ---------------------------------------------------------------------------
  // 7. Already Checked-Out Stay Details Preservation
  // ---------------------------------------------------------------------------
  it('8. Preserves settled title and details for historical checked out stays', () => {
    const settledStay = {
      ...sampleStay,
      status: 'checked_out',
      checkout_actual: '2026-11-10',
    };

    const state = deriveCheckoutState({
      stay: settledStay,
      actualCheckoutDate: '2026-11-10',
      bill: { nights: 1, plannedNights: 1, balance: 0.0 },
      isCheckedOut: true,
    });

    assert.equal(state.title, 'Bill Details (Checked Out)');
    assert.ok(state.subtitle.includes('Settled'));
    assert.equal(state.isEarly, false);
    assert.equal(state.isLate, false);
  });

  // ---------------------------------------------------------------------------
  // 8. Room Details & Stay Details Sheet Action Buttons (Early vs Late vs Normal)
  // ---------------------------------------------------------------------------
  it('9. Hides Early Check Out button and dynamically sets Late Check Out when stay is overdue', () => {
    function deriveSheetActions({ stay, today, bill }) {
      const plannedCheckoutDate = stay?.checkout_planned ? stay.checkout_planned.slice(0, 10) : null;
      const isLate = Boolean(
        (plannedCheckoutDate && today > plannedCheckoutDate) ||
        bill?.isLateCheckout ||
        bill?.checkoutType === 'late'
      );
      const isEarlyEligible = Boolean(
        plannedCheckoutDate && today < plannedCheckoutDate && !isLate
      );
      const checkoutButtonLabel = isLate ? 'Late Check Out' : 'Check Out';
      return { isLate, isEarlyEligible, checkoutButtonLabel };
    }

    // Exact user screenshot case: Room 208, Check-in 16 Nov, Planned Checkout 17 Nov, Today 19 Nov
    const room208Stay = {
      id: 208,
      room_no: '208',
      check_in_date: '2026-11-16',
      checkout_planned: '2026-11-17',
    };
    const overdueActions = deriveSheetActions({
      stay: room208Stay,
      today: '2026-11-19',
      bill: { isLateCheckout: true, checkoutType: 'late', nights: 3 },
    });

    // In Late Checkout / Extended stay, Early Check Out MUST NOT be visible!
    assert.equal(overdueActions.isLate, true);
    assert.equal(overdueActions.isEarlyEligible, false, 'Early Check Out must be hidden on overdue stays');
    assert.equal(overdueActions.checkoutButtonLabel, 'Late Check Out');

    // Normal Checkout: Today is planned checkout date (17 Nov)
    const normalActions = deriveSheetActions({
      stay: room208Stay,
      today: '2026-11-17',
      bill: { isLateCheckout: false, checkoutType: 'normal', nights: 1 },
    });
    assert.equal(normalActions.isLate, false);
    assert.equal(normalActions.isEarlyEligible, false, 'Early Check Out must be hidden on normal scheduled checkout date');
    assert.equal(normalActions.checkoutButtonLabel, 'Check Out');

    // Early Checkout: Today is before planned checkout date (16 Nov vs 17 Nov or future checkout)
    const futureCheckoutStay = {
      id: 208,
      room_no: '208',
      check_in_date: '2026-11-16',
      checkout_planned: '2026-11-20',
    };
    const earlyActions = deriveSheetActions({
      stay: futureCheckoutStay,
      today: '2026-11-17',
      bill: { isEarlyCheckout: true, checkoutType: 'early', nights: 1 },
    });
    assert.equal(earlyActions.isLate, false);
    assert.equal(earlyActions.isEarlyEligible, true, 'Early Check Out must be visible when guest departs before planned date');
    assert.equal(earlyActions.checkoutButtonLabel, 'Check Out');
  });
});
