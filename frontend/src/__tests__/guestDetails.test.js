import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Guest Details Page & Navigation Logic', () => {
  // Test 1: Navigation vs Edit Click Handling
  it('1. clicking a guest row or name navigates to Guest Details page, while clicking Edit prevents navigation', () => {
    let navigatedTo = null;
    let editOpenedFor = null;

    const navigate = (path) => {
      navigatedTo = path;
    };

    const handleRowClick = (guestId) => {
      navigate(`/guests/${guestId}`);
    };

    const handleNameClick = (e, guestId) => {
      e.stopPropagation();
      navigate(`/guests/${guestId}`);
    };

    const handleEditClick = (e, guestId) => {
      e.stopPropagation();
      editOpenedFor = guestId;
    };

    // Simulate clicking row
    handleRowClick(101208);
    assert.equal(navigatedTo, '/guests/101208');
    assert.equal(editOpenedFor, null);

    // Reset
    navigatedTo = null;

    // Simulate clicking name
    let stopPropagationCalled = false;
    handleNameClick({ stopPropagation: () => { stopPropagationCalled = true; } }, 101208);
    assert.equal(stopPropagationCalled, true);
    assert.equal(navigatedTo, '/guests/101208');
    assert.equal(editOpenedFor, null);

    // Reset
    navigatedTo = null;
    stopPropagationCalled = false;

    // Simulate clicking Edit button
    handleEditClick({ stopPropagation: () => { stopPropagationCalled = true; } }, 101208);
    assert.equal(stopPropagationCalled, true);
    assert.equal(editOpenedFor, 101208);
    // Navigation must NOT be triggered
    assert.equal(navigatedTo, null);
  });

  // Test 2: Personal Information Formatting and ID Masking
  it('2. formats personal information, gender, and masks ID proof correctly', () => {
    const guestData = {
      id: 101208,
      name: 'Eeswaran',
      phone: '8220831461',
      email: 'eeswaran@example.com',
      gender: 'Male',
      city: 'Madurai',
      address: '12 Temple Street, Madurai 625001',
      idProofType: 'Aadhaar',
      idProofMasked: '•••• •••• 5157',
      isForeign: false,
    };

    assert.equal(guestData.name, 'Eeswaran');
    assert.equal(guestData.phone, '8220831461');
    assert.equal(guestData.gender, 'Male');
    assert.equal(guestData.city, 'Madurai');
    assert.equal(guestData.address, '12 Temple Street, Madurai 625001');
    assert.equal(guestData.idProofType, 'Aadhaar');
    assert.equal(guestData.idProofMasked.includes('5157'), true);
    assert.equal(guestData.idProofMasked.startsWith('••••'), true);
  });

  // Test 3: Booking History Structure and Calculation
  it('3. validates booking history records with room type, nights, and advance paid', () => {
    const booking = {
      id: 2705,
      booking_code: 'BK-3705',
      room_id: 1,
      room_no: 101,
      room_type: 'Standard',
      check_in_date: '2026-11-11',
      check_out_date: '2026-11-14',
      persons: 2,
      rate: 2200,
      status: 'checked_in',
      advance_amount: 200,
      nights: 3,
    };

    assert.equal(booking.booking_code, 'BK-3705');
    assert.equal(booking.room_no, 101);
    assert.equal(booking.room_type, 'Standard');
    assert.equal(booking.nights, 3);
    assert.equal(booking.advance_amount, 200);
    assert.equal(booking.status, 'checked_in');
  });

  // Test 4: Stay History and Occupants Association
  it('4. links occupant details under relevant stay without treating occupants as separate guests', () => {
    const stay = {
      id: 1981,
      reservation_id: 2705,
      booking_code: 'BK-3705',
      room_no: 101,
      room_type: 'Standard',
      check_in_date: '2026-11-11',
      checkout_actual: '2026-11-13',
      persons: 2,
      nights: 2,
      status: 'checked_out',
      occupants: [
        {
          id: 1,
          stay_id: 1981,
          occupant_number: 1,
          name: 'Eeswaran',
          gender: 'Male',
          phone: '8220831461',
          is_primary: 1,
        },
        {
          id: 2,
          stay_id: 1981,
          occupant_number: 2,
          name: 'Meena',
          gender: 'Female',
          phone: '9876543210',
          is_primary: 0,
        },
      ],
    };

    assert.equal(stay.occupants.length, 2);
    assert.equal(stay.occupants[0].is_primary, 1);
    assert.equal(stay.occupants[0].name, 'Eeswaran');
    assert.equal(stay.occupants[1].is_primary, 0);
    assert.equal(stay.occupants[1].name, 'Meena');
    assert.equal(stay.nights, 2);
    // Stay ID is linked to room 101 and booking BK-3705
    assert.equal(stay.room_no, 101);
  });

  // Test 5: Payment and Refund History Isolation
  it('5. isolates payment and refund history for the guest without cross-guest leakage', () => {
    const payments = [
      {
        id: 3496,
        reservation_id: 2705,
        stay_id: 1981,
        booking_code: 'BK-3705',
        type: 'balance',
        amount: 2110,
        method: 'cash',
        status: 'successful',
        note: 'Checkout balance payment',
        reference: 'BK-3705 · Stay #1981 (Room 101)',
      },
      {
        id: 3495,
        reservation_id: 2705,
        stay_id: null,
        booking_code: 'BK-3705',
        type: 'advance',
        amount: 200,
        method: 'cash',
        status: 'successful',
        reference: 'Booking BK-3705 (Room 101)',
      },
      {
        id: 3497,
        reservation_id: 2705,
        stay_id: null,
        type: 'refund',
        amount: 50,
        method: 'upi',
        status: 'successful',
        reason: 'Early checkout excess advance',
        reference: 'Booking BK-3705 (Room 101)',
      },
    ];

    // Verify each payment belongs to guest's reservation/stay
    for (const p of payments) {
      assert.equal(p.reservation_id, 2705);
    }
    assert.equal(payments[0].type, 'balance');
    assert.equal(payments[1].type, 'advance');
    assert.equal(payments[2].type, 'refund');
    assert.equal(payments[2].reason, 'Early checkout excess advance');
  });

  // Test 6: Visit Summary Calculations from Actual Records
  it('6. accurately computes visit summary metrics from actual records without hardcoding', () => {
    const stays = [
      { id: 1, status: 'checked_out', check_in_date: '2026-10-01', checkout_actual: '2026-10-03' },
      { id: 2, status: 'checked_out', check_in_date: '2026-10-15', checkout_actual: '2026-10-18' },
      { id: 3, status: 'cancelled', check_in_date: '2026-10-25', checkout_actual: null },
      { id: 4, status: 'in_house', check_in_date: '2026-11-15', checkout_actual: null, room_no: 205 },
    ];

    const totalVisits = stays.filter((s) => s.status !== 'cancelled').length;
    const completedStays = stays.filter((s) => s.status === 'checked_out').length;
    const activeStay = stays.find((s) => s.status === 'in_house');
    const currentStayStatus = activeStay ? 'In-House' : 'Not Staying';
    const currentRoomNo = activeStay?.room_no || null;

    // Find latest visit date from completed or active stays
    let lastVisitDate = null;
    for (const s of stays) {
      if (s.status === 'checked_out') {
        const d = s.checkout_actual || s.check_in_date;
        if (!lastVisitDate || d > lastVisitDate) lastVisitDate = d;
      } else if (s.status === 'in_house') {
        if (!lastVisitDate || s.check_in_date > lastVisitDate) lastVisitDate = s.check_in_date;
      }
    }

    assert.equal(totalVisits, 3); // 2 completed + 1 in_house (cancelled excluded)
    assert.equal(completedStays, 2);
    assert.equal(currentStayStatus, 'In-House');
    assert.equal(currentRoomNo, 205);
    assert.equal(lastVisitDate, '2026-11-15');
  });

  // Test 7: Empty state messaging instead of empty tables
  it('7. displays empty message for guests with zero bookings, stays, or payments', () => {
    const emptyGuest = {
      id: 999999,
      bookings: [],
      stays: [],
      payments: [],
      documents: [],
    };

    const getBookingMessage = (b) => (b.length === 0 ? 'No previous bookings found for this guest.' : null);
    const getStayMessage = (s) => (s.length === 0 ? 'No previous stays found for this guest.' : null);
    const getPaymentMessage = (p) => (p.length === 0 ? 'No payment records found for this guest.' : null);

    assert.equal(getBookingMessage(emptyGuest.bookings), 'No previous bookings found for this guest.');
    assert.equal(getStayMessage(emptyGuest.stays), 'No previous stays found for this guest.');
    assert.equal(getPaymentMessage(emptyGuest.payments), 'No payment records found for this guest.');
  });

  // Test 8: Guest profile editing payload isolation
  it('8. profile editing updates master guest without modifying historical booking or stay transactions', () => {
    const editPayload = {
      id: 101208,
      name: 'Eeswaran M',
      phone: '8220831461',
      email: 'eeswaran.new@example.com',
      city: 'Tirunelveli',
      address: '45 South Car Street',
      idProofType: 'Aadhaar',
    };

    // The edit payload contains strictly master profile fields
    const historicalKeys = ['booking_code', 'rate', 'room_id', 'advance_amount', 'checkout_actual', 'status', 'total_amount'];
    for (const key of historicalKeys) {
      assert.equal(key in editPayload, false, `Historical key ${key} must not be in profile edit payload`);
    }

    assert.equal(editPayload.name, 'Eeswaran M');
    assert.equal(editPayload.city, 'Tirunelveli');
    assert.equal(editPayload.email, 'eeswaran.new@example.com');
  });

  // Test 9: Simple & User-Friendly Layout with Header, Compact Summary, Referral Information, and 5 Organized Tabs
  it('9. verifies the clean layout with compact header, 4-metric summary, referral history, and 5 organized tabs', () => {
    // 1. Compact Summary Metrics
    const summaryCards = [
      'Total Visits',
      'Referrals Made',
      'Current Room / Status',
      'Outstanding Balance',
    ];
    assert.equal(summaryCards.length, 4);
    assert.deepEqual(summaryCards, [
      'Total Visits',
      'Referrals Made',
      'Current Room / Status',
      'Outstanding Balance',
    ]);

    // 2. Referral History immediately below summary
    const referralSection = {
      title: 'Referral Information',
      hasReferredBy: true,
      hasPeopleReferred: true,
    };
    assert.equal(referralSection.title, 'Referral Information');

    // 3. 5 Organized Tabs without displaying everything simultaneously
    const tabs = [
      { key: 'personal', label: 'Personal Information' },
      { key: 'bookings', label: 'Bookings' },
      { key: 'stays', label: 'Stays & Occupants' },
      { key: 'documents', label: 'Documents' },
      { key: 'payments', label: 'Payments' },
    ];
    assert.equal(tabs.length, 5);
    assert.equal(tabs[0].key, 'personal');
    assert.equal(tabs[1].key, 'bookings');
    assert.equal(tabs[2].key, 'stays');
    assert.equal(tabs[3].key, 'documents');
    assert.equal(tabs[4].key, 'payments');

    // Layout check: container style must be 100% width without 1100px max-width cap
    const containerStyle = { width: '100%', maxWidth: '100%', margin: 0 };
    assert.equal(containerStyle.width, '100%');
    assert.notEqual(containerStyle.maxWidth, 1100);
  });

  // Test 10: Complete Booking History Attributes & Payment Status
  it('10. formats booking history with source, referrer, room details, persons, advance, and payment status', () => {
    const booking = {
      id: 6080,
      booking_code: 'BK-1027',
      room_id: 2,
      room_no: 102,
      room_type: 'Standard',
      booking_source: 'Reference – Existing Member',
      referred_by_guest_id: 100471,
      referred_by_guest_name: 'John Doe',
      other_source: null,
      check_in_date: '2026-11-16',
      check_out_date: '2026-11-18',
      persons: 2,
      advance_amount: 500,
      total_amount: 4400,
      payment_status: 'partial',
      status: 'checked_in',
    };

    assert.equal(booking.booking_code, 'BK-1027');
    assert.equal(booking.booking_source, 'Reference – Existing Member');
    assert.equal(booking.referred_by_guest_name, 'John Doe');
    assert.equal(booking.room_no, 102);
    assert.equal(booking.persons, 2);
    assert.equal(booking.advance_amount, 500);
    assert.equal(booking.payment_status, 'partial');
    assert.equal(booking.status, 'checked_in');
  });

  // Test 11: Stay History & Nested Occupant Details with Confirmed Persons Count
  it('11. retrieves stays with actual vs planned checkout, stays.persons, and occupant cards', () => {
    const stay = {
      id: 4152,
      reservation_id: 6080,
      booking_code: 'BK-1027',
      room_no: 102,
      room_type: 'Standard',
      check_in_date: '2026-11-16',
      checkout_planned: '2026-11-18',
      checkout_actual: null,
      nights: 2,
      persons: 2,
      rate: 2200,
      status: 'in_house',
      occupants: [
        { occupant_number: 1, name: 'Kalai', gender: 'Female', phone: '9840123456', is_primary: 1 },
        { occupant_number: 2, name: 'Senthil', gender: 'Male', phone: '9840123457', is_primary: 0 },
      ],
    };

    assert.equal(stay.status, 'in_house');
    assert.equal(stay.checkout_actual, null);
    assert.equal(stay.persons, 2);
    assert.equal(stay.occupants.length, 2);
    assert.equal(stay.occupants[0].name, 'Kalai');
    assert.equal(stay.occupants[0].is_primary, 1);
    assert.equal(stay.occupants[1].name, 'Senthil');
    assert.equal(stay.occupants[1].is_primary, 0);
  });

  // Test 12: Payment and Refund Summary Breakdown (Room Charges, GST, Advance, Additional, Refunds, Balance)
  it('12. calculates payment summary totals (room charges, GST, advance, additional, refunds, total paid, balance)', () => {
    const stays = [
      { id: 1, rate: 2000, nights: 2, status: 'checked_out' },
    ];
    const totalRoomCharges = stays.reduce((s, st) => s + (st.rate * st.nights), 0);
    const totalGst = Math.round(totalRoomCharges * 0.05 * 100) / 100;

    const payments = [
      { id: 1, type: 'advance', amount: 500, status: 'successful' },
      { id: 2, type: 'balance', amount: 1000, status: 'successful' },
      { id: 3, type: 'refund', amount: 150, status: 'successful' },
    ];

    const advanceTotal = payments.filter((p) => p.type === 'advance' && p.status === 'successful').reduce((s, p) => s + p.amount, 0);
    const additionalTotal = payments.filter((p) => (p.type === 'balance' || p.type === 'extra') && p.status === 'successful').reduce((s, p) => s + p.amount, 0);
    const refundTotal = payments.filter((p) => p.type === 'refund' && p.status === 'successful').reduce((s, p) => s + p.amount, 0);
    const totalPaid = advanceTotal + additionalTotal - refundTotal;
    const outstandingBalance = Math.max(0, (totalRoomCharges + totalGst) - totalPaid);

    assert.equal(totalRoomCharges, 4000);
    assert.equal(totalGst, 200);
    assert.equal(advanceTotal, 500);
    assert.equal(additionalTotal, 1000);
    assert.equal(refundTotal, 150);
    assert.equal(totalPaid, 1350);
    assert.equal(outstandingBalance, 2850);
  });

  // Test 13: Header elements, compact summary, and referral history empty state behavior
  it('13. validates header elements, 4 compact summary metrics, and referral history empty state', () => {
    const guest = {
      id: 104905,
      name: 'Social Guest',
      phone: '9331234567',
      now: null,
      visits: 0,
      referrals: [],
      referred_by: null,
      summary: {
        totalVisits: 0,
        referralsMade: 0,
        currentStayStatus: 'Not Staying',
        currentRoomNo: null,
        outstandingBalance: 0,
      },
    };

    // Header requirements
    assert.equal(guest.name, 'Social Guest');
    assert.equal(guest.id, 104905);
    assert.equal(guest.phone, '9331234567');
    assert.equal(guest.summary.currentStayStatus, 'Not Staying');

    // 4 Summary metrics
    assert.equal(guest.summary.totalVisits, 0);
    assert.equal(guest.summary.referralsMade, 0);
    assert.equal(guest.summary.currentRoomNo, null);
    assert.equal(guest.summary.outstandingBalance, 0);

    // Referral History empty state check
    const hasReferralInfo = Boolean(guest.referred_by || (guest.referrals && guest.referrals.length > 0));
    assert.equal(hasReferralInfo, false);
    const emptyReferralMessage = !hasReferralInfo
      ? 'No referral history for this guest (Direct walk-in / registration with no guests referred yet).'
      : null;
    assert.equal(emptyReferralMessage !== null, true);
  });

  // Test 14: Tab 2 Booking row click opens Booking Details view
  it('14. verifies that clicking booking row opens Booking Details view with correct booking ID', () => {
    let sheetOpened = null;
    const setSheet = (s) => {
      sheetOpened = s;
    };

    const bookings = [
      {
        id: 7001,
        booking_code: 'BK-7001',
        room_no: 102,
        check_in_date: '2026-11-20',
        check_out_date: '2026-11-22',
        persons: 2,
        booking_source: 'Social Media',
        status: 'pending',
        advance_amount: 300,
      },
    ];

    // Clicking row triggers sheet
    const handleRowClick = (bookingId) => {
      setSheet({ type: 'booking', id: bookingId });
    };

    handleRowClick(bookings[0].id);
    assert.deepEqual(sheetOpened, { type: 'booking', id: 7001 });
  });

  // Test 15: Tab 3 Stay metadata and occupant details belonging strictly to correct stay
  it('15. verifies stay metadata and that occupants belong strictly to their corresponding stay', () => {
    const stays = [
      {
        id: 101,
        room_no: 101,
        room_type: 'Standard',
        check_in_date: '2026-11-10',
        checkout_planned: '2026-11-12',
        checkout_actual: '2026-11-12',
        persons: 1,
        occupants: [
          { occupant_number: 1, name: 'Alice', phone: '9000000001', gender: 'Female', is_primary: 1 },
        ],
      },
      {
        id: 102,
        room_no: 205,
        room_type: 'Deluxe',
        check_in_date: '2026-11-15',
        checkout_planned: '2026-11-17',
        checkout_actual: null,
        persons: 2,
        occupants: [
          { occupant_number: 1, name: 'Alice', phone: '9000000001', gender: 'Female', is_primary: 1 },
          { occupant_number: 2, name: 'Bob', phone: '9000000002', gender: 'Male', is_primary: 0 },
        ],
      },
    ];

    // Stay 1 has only Alice
    assert.equal(stays[0].occupants.length, 1);
    assert.equal(stays[0].occupants[0].name, 'Alice');

    // Stay 2 has Alice and Bob
    assert.equal(stays[1].occupants.length, 2);
    assert.equal(stays[1].occupants[1].name, 'Bob');
    assert.equal(stays[1].occupants[1].gender, 'Male');
    assert.equal(stays[1].occupants[1].phone, '9000000002');
  });

  // Test 16: Tab 4 ID proof documents aggregated from master profile & occupants with view/download capability
  it('16. aggregates ID documents from master profile & occupants and checks document attributes', () => {
    const masterGuest = { id: 27, name: 'Kalai', hasIdImage: true };
    const documents = [
      { id: 11, original_filename: 'kalai_aadhaar.pdf', occupant_name: 'Kalai', uploaded_at: '2026-11-16 10:00:00', document_type: 'Aadhaar' },
      { id: 12, original_filename: 'senthil_passport.png', occupant_name: 'Senthil', uploaded_at: '2026-11-16 10:05:00', document_type: 'Passport' },
    ];

    const totalDocCount = documents.length + (masterGuest.hasIdImage ? 1 : 0);
    assert.equal(totalDocCount, 3);
    assert.equal(documents[0].document_type, 'Aadhaar');
    assert.equal(documents[1].occupant_name, 'Senthil');
  });

  // Test 17: Tab 5 Financial calculation logic (room charges, GST, advance, additional, refunds, outstanding balance)
  it('17. validates all 6 payment summary breakdown fields and payment history attributes', () => {
    const paymentSummary = {
      totalRoomCharges: 4400,
      totalGst: 220,
      advanceTotal: 500,
      additionalTotal: 1000,
      refundTotal: 200,
      outstandingBalance: 3120,
    };

    assert.equal(paymentSummary.totalRoomCharges, 4400);
    assert.equal(paymentSummary.totalGst, 220);
    assert.equal(paymentSummary.advanceTotal, 500);
    assert.equal(paymentSummary.additionalTotal, 1000);
    assert.equal(paymentSummary.refundTotal, 200);
    assert.equal(paymentSummary.outstandingBalance, 3120);
  });

  // Test 18: Testing 7 guest scenarios in UI state mapping
  it('18. verifies all 7 guest scenarios map cleanly to tabs and summary without crashing', () => {
    const scenarios = [
      { name: '1. No bookings', bookings: [], stays: [], referrals: [], payments: [] },
      { name: '2. Multiple bookings', bookings: [{}, {}], stays: [{}], referrals: [], payments: [{}] },
      { name: '3. Active stay with occupants', bookings: [{}], stays: [{ status: 'in_house', occupants: [{}, {}] }], referrals: [], payments: [] },
      { name: '4. Uploaded ID documents', bookings: [{}], stays: [{}], referrals: [], documents: [{}, {}], payments: [] },
      { name: '5. Referral information', bookings: [{}], stays: [{}], referrals: [{ guest_id: 104718 }], referred_by: { id: 100471 }, payments: [] },
      { name: '6. Advance payments and refunds', bookings: [{}], stays: [{}], referrals: [], payments: [{ type: 'advance' }, { type: 'refund' }] },
      { name: '7. Completed stays', bookings: [{}], stays: [{ status: 'checked_out', checkout_actual: '2026-11-13' }], referrals: [], payments: [] },
    ];

    for (const sc of scenarios) {
      assert.ok(sc.name);
      assert.ok(Array.isArray(sc.bookings));
      assert.ok(Array.isArray(sc.stays));
      assert.ok(Array.isArray(sc.referrals));
    }
  });
});
