// Complete end-to-end test of the Tamarind Court Hotel Management API and database workflows
// Testing both http://127.0.0.1:8080 and http://10.94.9.9:8080

const BASE_URL = process.env.API_URL || 'http://127.0.0.1:8080';
console.log(`Starting E2E Hotel Workflow Test against: ${BASE_URL}\n`);

let adminToken = null;
let receptionistToken = null;
let housekeepingToken = null;

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    ...(options.headers || {}),
  };
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: res.ok, status: res.status, raw: text };
  }
  return { ok: res.ok, status: res.status, ...json };
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✅ ${message}`);
}

async function runTests() {
  const results = {
    total: 0,
    passed: 0,
    failed: 0,
    modules: {},
  };

  function track(moduleName, testName, fn) {
    results.total++;
    results.modules[moduleName] = results.modules[moduleName] || { total: 0, passed: 0, failed: 0, tests: [] };
    results.modules[moduleName].total++;
    return async () => {
      try {
        console.log(`\n--- [${moduleName}] ${testName} ---`);
        await fn();
        results.passed++;
        results.modules[moduleName].passed++;
        results.modules[moduleName].tests.push({ name: testName, status: 'PASS' });
      } catch (err) {
        results.failed++;
        results.modules[moduleName].failed++;
        results.modules[moduleName].tests.push({ name: testName, status: 'FAIL', error: err.message });
        console.error(`Error in [${moduleName}] ${testName}:`, err.message);
      }
    };
  }

  // 1. Authentication & Roles
  await track('Authentication', 'Login as Admin, Receptionist, Housekeeping & Verify Roles', async () => {
    // Admin login
    const adminLogin = await request('/auth/login', {
      method: 'POST',
      body: { username: 'admin', password: 'Welcome@123' },
    });
    assert(adminLogin.success === true, 'Admin login succeeds');
    assert(adminLogin.data?.user?.role === 'admin', 'Admin role is admin');
    assert(adminLogin.data?.accessToken, 'Access token returned');
    adminToken = adminLogin.data.accessToken;

    // Verify /auth/me
    const me = await request('/auth/me', { token: adminToken });
    assert(me.success === true && (me.data?.role === 'admin' || me.data?.user?.role === 'admin'), '/auth/me returns admin user');

    // Receptionist login
    const recLogin = await request('/auth/login', {
      method: 'POST',
      body: { username: 'receptionist', password: 'Welcome@123' },
    });
    assert(recLogin.success === true && recLogin.data?.user?.role === 'receptionist', 'Receptionist login succeeds');
    receptionistToken = recLogin.data.accessToken;

    // Housekeeping login
    const hkLogin = await request('/auth/login', {
      method: 'POST',
      body: { username: 'housekeeping', password: 'Welcome@123' },
    });
    assert(hkLogin.success === true && hkLogin.data?.user?.role === 'housekeeping', 'Housekeeping login succeeds');
    housekeepingToken = hkLogin.data.accessToken;

    // Verify role restriction: Housekeeping cannot access /users
    const hkUsers = await request('/users', { token: housekeepingToken });
    assert(hkUsers.status === 403 || hkUsers.success === false, 'Housekeeping is blocked from /users (403)');
  })();

  // 2. Rooms Dashboard
  let availableRoom = null;
  await track('Rooms Dashboard', 'Fetch rooms list and statuses', async () => {
    const res = await request('/rooms', { token: adminToken });
    assert(res.success === true, 'Fetch /rooms succeeded');
    assert(Array.isArray(res.data?.rooms), 'Rooms array returned');
    console.log(`  Found ${res.data.rooms.length} total rooms in hotel.`);

    // Check statuses
    const statuses = new Set(res.data.rooms.map((r) => r.status));
    console.log(`  Active room statuses: ${[...statuses].join(', ')}`);

    // Find a free room
    availableRoom = res.data.rooms.find((r) => r.status === 'free');
    if (!availableRoom) {
      // If no room is free, find a cleaning room and mark it ready
      const cln = res.data.rooms.find((r) => r.status === 'cleaning');
      if (cln) {
        await request(`/rooms/${cln.id}/housekeeping`, {
          method: 'POST',
          token: adminToken,
          body: { action: 'ready' },
        });
        availableRoom = cln;
      }
    }
    assert(availableRoom != null, `Found available room: Room ${availableRoom?.roomNo} (ID: ${availableRoom?.id})`);
  })();

  // 3. Complete Hotel Workflow (Booking -> Checkin -> Extras/Payments -> Checkout -> Cleaning -> Ready)
  let testGuestId = null;
  let testReservationId = null;
  let testStayId = null;
  let testInvoiceId = null;
  const uniquePhone = '98' + Math.floor(10000000 + Math.random() * 90000000);
  const guestName = 'Mobile E2E Test Guest';

  await track('Workflows', 'Full Lifecycle: Guest -> Booking -> Check-in -> Extras -> Bill -> Checkout -> Cleaning -> Ready', async () => {
    // Step 1: Free rooms query
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const freeRes = await request(`/reservations/free-rooms?checkIn=${today}&checkOut=${tomorrow}`, { token: adminToken });
    assert(freeRes.success === true, 'Checked free rooms');

    // Pick a test room
    const testRoom = freeRes.data?.find((r) => r.id === availableRoom.id) || freeRes.data?.[0];
    assert(testRoom != null, `Selected room ${testRoom?.room_no || testRoom?.roomNo} for workflow`);
    const roomId = testRoom.id;

    // Step 2: Create Reservation (using mobile app payload format)
    const createBooking = await request('/reservations', {
      method: 'POST',
      token: adminToken,
      body: {
        name: guestName,
        phone: uniquePhone,
        roomId: roomId,
        checkIn: today,
        checkOut: tomorrow,
        persons: 1,
        rate: Number(testRoom.type_rate || testRoom.rate || 2000),
        advanceAmount: 500,
        advanceMethod: 'upi',
        bookingSource: 'Social Media',
        notes: 'Expo Go mobile automated E2E test',
      },
    });
    assert(createBooking.success === true, `Created reservation: ${createBooking.data?.booking_code || createBooking.data?.id}`);
    testReservationId = createBooking.data?.id;

    // Verify booking in list
    const resList = await request('/reservations', { token: adminToken });
    const foundRes = resList.data?.find((r) => r.id === testReservationId);
    assert(foundRes != null, 'Reservation appears in /reservations list');
    testGuestId = foundRes.guest_id;

    // Step 3: Check in guest from reservation
    const checkin = await request(`/reservations/${testReservationId}/check-in`, {
      method: 'POST',
      token: adminToken,
      body: {
        persons: 1,
        occupants: [
          {
            occupant_number: 1,
            name: guestName,
            gender: 'Male',
            phone: uniquePhone,
          },
        ],
      },
    });
    assert(checkin.success === true, `Checked in guest from reservation. Stay ID: ${checkin.data?.stay_id || checkin.data?.id}`);
    testStayId = checkin.data?.stay_id || checkin.data?.id;

    // Step 4: Verify room status updated to OCCUPIED
    const roomsAfterCheckin = await request('/rooms', { token: adminToken });
    const roomOccupied = roomsAfterCheckin.data?.rooms?.find((r) => r.id === roomId);
    assert(roomOccupied?.status === 'occupied', `Room ${roomOccupied?.roomNo} status is OCCUPIED`);
    assert(Number(roomOccupied?.stayId) === Number(testStayId), 'Room references active stay ID');

    // Step 5: Add extra charges (Food, Laundry)
    const addFood = await request(`/stays/${testStayId}/extras`, {
      method: 'POST',
      token: adminToken,
      body: { label: 'Food', amount: 350 },
    });
    assert(addFood.success === true, 'Added extra charge: Food 350');

    const addLaundry = await request(`/stays/${testStayId}/extras`, {
      method: 'POST',
      token: adminToken,
      body: { label: 'Laundry', amount: 150 },
    });
    assert(addLaundry.success === true, 'Added extra charge: Laundry 150');

    // Step 6: Verify Bill calculation and GST
    const bill = await request(`/stays/${testStayId}/bill`, { token: adminToken });
    assert(bill.success === true, 'Fetched stay bill');
    console.log(`  Bill breakdown: Room Rate = ${bill.data?.roomRate}, Extras = ${bill.data?.extrasAmount}, GST = ${bill.data?.roomGstAmount}, Total = ${bill.data?.total}, Advance = ${bill.data?.advancePaid}, Balance Due = ${bill.data?.balance}`);
    assert(Number(bill.data?.advancePaid) === 500, 'Advance payment of 500 properly credited');
    assert(Number(bill.data?.extrasAmount) === 500, 'Extras total is 500 (350+150)');

    // Step 7: Checkout with remaining balance payment
    const checkoutRes = await request(`/stays/${testStayId}/checkout`, {
      method: 'POST',
      token: adminToken,
      body: {
        paymentMethod: 'cash',
        amount: Number(bill.data?.balance),
        notes: 'Mobile checkout',
      },
    });
    assert(checkoutRes.success === true, 'Guest checked out successfully');
    testInvoiceId = checkoutRes.data?.invoice_id || checkoutRes.data?.invoice?.id;

    // Step 8: Verify Room Status changed to CLEANING
    const roomsAfterCheckout = await request('/rooms', { token: adminToken });
    const roomCleaning = roomsAfterCheckout.data?.rooms?.find((r) => r.id === roomId);
    assert(roomCleaning?.status === 'cleaning', `Room ${roomCleaning?.roomNo} status transitioned to CLEANING`);

    // Step 9: Verify Invoice generated
    const invRes = await request(`/stays/${testStayId}/invoice`, { token: adminToken });
    assert(invRes.success === true, 'Invoice retrieved for completed stay');
    assert(invRes.data?.invoice != null, `Invoice number: ${invRes.data?.invoice?.invoice_number}`);
    assert(Number(invRes.data?.invoice?.total_amount) > 0, `Total invoice amount: ${invRes.data?.invoice?.total_amount}`);

    // Step 10: Housekeeping marks room Ready
    const hkReady = await request(`/rooms/${roomId}/housekeeping`, {
      method: 'POST',
      token: housekeepingToken,
      body: { action: 'ready' },
    });
    assert(hkReady.success === true, `Housekeeping marked room ${roomId} as Ready`);

    // Step 11: Verify room is FREE and bookable again
    const roomsFinal = await request('/rooms', { token: adminToken });
    const roomFinal = roomsFinal.data?.rooms?.find((r) => r.id === roomId);
    assert(roomFinal?.status === 'free', `Room ${roomFinal?.roomNo} is FREE again`);
  })();

  // 4. Direct Check-in Workflow (Walk-in)
  let directStayId = null;
  await track('Workflows', 'Direct Check-in (Walk-in) Workflow', async () => {
    // Find a free room
    const roomsRes = await request('/rooms', { token: adminToken });
    const freeRoom = roomsRes.data?.rooms?.find((r) => r.status === 'free');
    assert(freeRoom != null, `Found free room for direct check-in: Room ${freeRoom?.roomNo}`);

    const directPhone = '97' + Math.floor(10000000 + Math.random() * 90000000);

    const directCheckin = await request('/stays', {
      method: 'POST',
      token: adminToken,
      body: {
        roomId: freeRoom.id,
        phone: directPhone,
        name: 'Walk-in Guest Mobile',
        idProofType: 'Passport',
        idProofNumber: 'A98765432',
        bookingSource: 'Walk-in',
        persons: 1,
        days: 1,
        rate: Number(freeRoom.type_rate || 2000),
        advanceAmount: 1000,
        advanceMethod: 'card',
        occupants: [
          {
            occupant_number: 1,
            name: 'Walk-in Guest Mobile',
            gender: 'Female',
            phone: directPhone,
          },
        ],
      },
    });
    assert(directCheckin.success === true, `Direct check-in succeeded. Stay ID: ${directCheckin.data?.id}`);
    directStayId = directCheckin.data?.id;

    // Verify room is occupied
    const rAfter = await request('/rooms', { token: adminToken });
    const rOcc = rAfter.data?.rooms?.find((r) => r.id === freeRoom.id);
    assert(rOcc?.status === 'occupied', `Room ${rOcc?.roomNo} is OCCUPIED after direct check-in`);

    // Clean up: checkout walk-in stay and mark ready
    const bill = await request(`/stays/${directStayId}/bill`, { token: adminToken });
    await request(`/stays/${directStayId}/checkout`, {
      method: 'POST',
      token: adminToken,
      body: { paymentMethod: 'card', amount: Number(bill.data?.balance || 0) },
    });
    await request(`/rooms/${freeRoom.id}/housekeeping`, {
      method: 'POST',
      token: adminToken,
      body: { action: 'ready' },
    });
  })();

  // 5. Booking Conflict Prevention
  await track('Workflows', 'Booking Conflict Prevention (Overlapping Dates)', async () => {
    const roomsRes = await request('/rooms', { token: adminToken });
    const room = roomsRes.data?.rooms?.find((r) => r.status === 'free');
    assert(room != null, `Selected Room ${room?.roomNo} for conflict test`);

    const inDate = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
    const outDate = new Date(Date.now() + 13 * 86400000).toISOString().slice(0, 10);

    // Create first booking
    const b1 = await request('/reservations', {
      method: 'POST',
      token: adminToken,
      body: {
        name: 'Conflict Test 1',
        phone: '9811122233',
        roomId: room.id,
        checkIn: inDate,
        checkOut: outDate,
        persons: 1,
        rate: 2000,
        bookingSource: 'Social Media',
      },
    });
    assert(b1.success === true, 'First booking created for dates ' + inDate + ' to ' + outDate);

    // Attempt overlapping booking (e.g. 1 day overlap)
    const overlapIn = new Date(Date.now() + 11 * 86400000).toISOString().slice(0, 10);
    const overlapOut = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    const b2 = await request('/reservations', {
      method: 'POST',
      token: adminToken,
      body: {
        name: 'Conflict Test 2',
        phone: '9844455566',
        roomId: room.id,
        checkIn: overlapIn,
        checkOut: overlapOut,
        persons: 1,
        rate: 2000,
        bookingSource: 'Social Media',
      },
    });
    assert(b2.success === false || b2.status === 409 || b2.status === 422, 'Overlapping booking was rejected by backend (conflict prevented)');

    // Clean up first booking
    if (b1.data?.id) {
      await request(`/reservations/${b1.data.id}/cancel`, {
        method: 'POST',
        token: adminToken,
        body: { reason: 'Automated test cleanup' },
      });
    }
  })();

  // 6. Cancellation & Refund Calculation
  await track('Workflows', 'Cancellation & Refund Calculation', async () => {
    const roomsRes = await request('/rooms', { token: adminToken });
    const room = roomsRes.data?.rooms?.find((r) => r.status === 'free');
    const futureIn = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
    const futureOut = new Date(Date.now() + 22 * 86400000).toISOString().slice(0, 10);

    const b = await request('/reservations', {
      method: 'POST',
      token: adminToken,
      body: {
        name: 'Refund Test Guest',
        phone: '9876543210',
        roomId: room.id,
        checkIn: futureIn,
        checkOut: futureOut,
        persons: 1,
        rate: 2500,
        advanceAmount: 1000,
        advanceMethod: 'upi',
        bookingSource: 'Social Media',
      },
    });
    assert(b.success === true, 'Created reservation with advance payment of 1000');
    const bId = b.data?.id;

    // Check cancellation preview
    const prev = await request(`/reservations/${bId}/cancellation-preview`, { token: adminToken });
    assert(prev.success === true, 'Retrieved cancellation preview');
    console.log(`  Cancellation preview: advance = ${prev.data?.advancePaid || prev.data?.advance_paid}, fee = ${prev.data?.cancellationFee || prev.data?.cancellation_fee}, refund = ${prev.data?.refundAmount || prev.data?.refund_amount}`);

    // Cancel reservation
    const cancelRes = await request(`/reservations/${bId}/cancel`, {
      method: 'POST',
      token: adminToken,
      body: { reason: 'Guest changed travel plans' },
    });
    assert(cancelRes.success === true, 'Cancelled reservation');

    // Check refund summary
    const refSum = await request(`/reservations/${bId}/refund-summary`, { token: adminToken });
    assert(refSum.success === true, 'Retrieved refund summary');

    // Process refund
    const refundAmt = Number(refSum.data?.refund_due || refSum.data?.refundDue || refSum.data?.refundable_amount || refSum.data?.refundableAmount || 0);
    if (refundAmt > 0) {
      const refundProc = await request(`/reservations/${bId}/refund`, {
        method: 'POST',
        token: adminToken,
        body: {
          amount: refundAmt,
          method: 'upi',
          reason: 'Automated test refund',
        },
      });
      assert(refundProc.success === true, 'Refund processed successfully');
    }
  })();

  // 7. Daily Operations Module
  await track('Daily Operations', 'Verify Today Checkouts and Daily Ops endpoints', async () => {
    const daily = await request('/daily-ops', { token: adminToken });
    assert(daily.success === true, 'GET /daily-ops succeeds');
    assert(Array.isArray(daily.data?.checkouts) || Array.isArray(daily.data?.stays) || Array.isArray(daily.data), 'Checkouts array returned');
    assert(daily.data?.checkins != null, 'Checkins array present in response');
    console.log(`  Daily ops: ${daily.data?.checkouts?.length || 0} checkouts, ${daily.data?.checkins?.length || 0} checkins`);
  })();

  // 8. Guest Register & Guest Details
  await track('Guests Module', 'Search guests, view details, update guest', async () => {
    const list = await request('/guests?q=Mobile', { token: adminToken });
    assert(list.success === true, 'GET /guests succeeds');
    assert(Array.isArray(list.data) || Array.isArray(list.data?.guests), 'Guests list returned');

    if (testGuestId) {
      const g = await request(`/guests/${testGuestId}`, { token: adminToken });
      assert(g.success === true, `GET /guests/${testGuestId} succeeds`);
      assert(g.data?.name.includes('Mobile'), 'Guest name matches');

      // Update guest
      const updateRes = await request(`/guests/${testGuestId}`, {
        method: 'PUT',
        token: adminToken,
        body: {
          name: guestName + ' Updated',
          email: 'updated.guest@example.com',
          phone: uniquePhone,
        },
      });
      assert(updateRes.success === true, 'PUT /guests/:id updated guest');
    }
  })();

  // 9. Referrals Module
  await track('Referrals Module', 'Verify All Referrals and Summary', async () => {
    const refs = await request('/guests/referrals', { token: adminToken });
    assert(refs.success === true, 'GET /guests/referrals succeeds');
    assert(refs.data?.summary != null, 'Summary statistics returned');
    console.log(`  Referrals summary: total bookings = ${refs.data.summary.total_referral_bookings}`);
  })();

  // 10. Bills and Invoices Module
  await track('Bills & Invoices', 'Verify Done Stays and Invoices', async () => {
    const stays = await request('/stays', { token: adminToken });
    assert(stays.success === true, 'GET /stays succeeds');
    console.log(`  Done stays count: ${stays.data?.length || 0}`);

    if (testInvoiceId) {
      const inv = await request(`/invoices/${testInvoiceId}`, { token: adminToken });
      assert(inv.success === true, `GET /invoices/${testInvoiceId} succeeds`);
      assert(inv.data?.invoice?.invoice_number != null, 'Invoice details loaded');
    }
  })();

  // 11. Reports Module
  await track('Reports Module', 'Verify Today, Day-end, Occupancy, Revenue, CSV export', async () => {
    const todayRep = await request('/reports/today', { token: adminToken });
    assert(todayRep.success === true, 'GET /reports/today succeeds');

    const dayEnd = await request('/reports/day-end', { token: adminToken });
    assert(dayEnd.success === true, 'GET /reports/day-end succeeds');

    const occ = await request('/reports/occupancy', { token: adminToken });
    assert(occ.success === true, 'GET /reports/occupancy succeeds');

    const rev = await request('/reports/revenue', { token: adminToken });
    assert(rev.success === true, 'GET /reports/revenue succeeds');

    const csv = await request('/reports/invoices.csv', { token: adminToken });
    assert(csv.status === 200, 'GET /reports/invoices.csv returns 200 CSV data');
  })();

  // 12. Room Master Module
  await track('Room Master', 'Room types and rooms configuration', async () => {
    const types = await request('/room-types', { token: adminToken });
    assert(types.success === true, 'GET /room-types succeeds');
    assert(Array.isArray(types.data), 'Room types list returned');

    // Create room type (using camelCase matching RoomMasterScreen.jsx)
    const newType = await request('/room-types', {
      method: 'POST',
      token: adminToken,
      body: {
        name: 'Executive Suite ' + Math.floor(Math.random() * 1000),
        rate: 4500,
        maxPersons: 3,
        description: 'Luxury executive suite for testing',
      },
    });
    assert(newType.success === true, 'POST /room-types created new room type');

    // Clean up room type
    if (newType.data?.id) {
      await request(`/room-types/${newType.data.id}`, {
        method: 'DELETE',
        token: adminToken,
      });
    }
  })();

  // 13. Users and Permissions Module
  await track('Users Module', 'List users, roles, and CRUD operations', async () => {
    const users = await request('/users', { token: adminToken });
    assert(users.success === true, 'GET /users succeeds');

    const roles = await request('/roles', { token: adminToken });
    assert(roles.success === true, 'GET /roles succeeds');

    // Create a temporary user
    const uname = 'testuser_' + Math.floor(Math.random() * 10000);
    const cu = await request('/users', {
      method: 'POST',
      token: adminToken,
      body: {
        name: 'Test Mobile User',
        username: uname,
        email: `${uname}@example.com`,
        phone: '9888877777',
        password: 'Password@123',
        role: 'receptionist',
      },
    });
    assert(cu.success === true, `Created user ${uname}`);

    // Update user
    if (cu.data?.id) {
      const uu = await request(`/users/${cu.data.id}`, {
        method: 'PUT',
        token: adminToken,
        body: {
          name: 'Test Mobile User Updated',
          email: `${uname}@example.com`,
          phone: '9888877777',
          role: 'receptionist',
          is_active: false,
        },
      });
      assert(uu.success === true, 'Updated user status');
    }
  })();

  // 14. Settings & GST Module
  await track('Settings & GST', 'Verify Settings, Hotel info, Checkout hour, GST update', async () => {
    const s = await request('/settings', { token: adminToken });
    assert(s.success === true, 'GET /settings succeeds');
    assert(s.data?.hotel != null, 'Hotel information present');
    assert(s.data?.settings != null, 'Settings object present');

    // Update checkout hour
    const uHour = await request('/settings/checkout-hour', {
      method: 'PUT',
      token: adminToken,
      body: { checkoutHour: '12' },
    });
    assert(uHour.success === true, 'PUT /settings/checkout-hour succeeded');
  })();

  // SUMMARY
  console.log('\n========================================');
  console.log(`E2E TEST SUMMARY:`);
  console.log(`Total test suites: ${results.total}`);
  console.log(`Passed: ${results.passed}`);
  console.log(`Failed: ${results.failed}`);
  console.log('========================================');
  for (const [mod, data] of Object.entries(results.modules)) {
    console.log(`  ${data.failed === 0 ? '✅' : '❌'} [${mod}]: ${data.passed}/${data.total} passed`);
  }

  return results;
}

runTests().then((res) => {
  if (res.failed > 0) {
    process.exit(1);
  }
}).catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
