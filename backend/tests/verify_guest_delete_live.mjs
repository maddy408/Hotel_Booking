// backend/tests/verify_guest_delete_live.mjs
import assert from 'node:assert';
import { execSync } from 'node:child_process';

const BASE_URL = 'http://127.0.0.1:8080';

function runSql(sql) {
  const cmd = `mysql -u root -pRamya@123 tamarind_court -e "${sql.replace(/"/g, '\\"')}"`;
  return execSync(cmd, { encoding: 'utf-8' });
}

async function req(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, body: json };
}

async function run() {
  console.log('--- Starting Live E2E Guest Delete Verification ---');

  // 1. Authenticate as Admin
  const loginRes = await req('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'admin', password: 'Welcome@123' }),
  });
  assert.strictEqual(loginRes.status, 200, 'Login must succeed');
  const token = loginRes.body.data.accessToken;
  const authHeader = { Authorization: `Bearer ${token}` };
  console.log('✓ Admin authenticated');

  // Clean any previous test data
  runSql("DELETE FROM payments WHERE reservation_id IN (SELECT id FROM reservations WHERE guest_id IN (SELECT id FROM guests WHERE phone IN ('9876500001', '9876500002', '9876500003', '9876500004', '9876500005')));");
  runSql("DELETE FROM reservations WHERE guest_id IN (SELECT id FROM guests WHERE phone IN ('9876500001', '9876500002', '9876500003', '9876500004', '9876500005'));");
  runSql("DELETE FROM invoices WHERE stay_id IN (SELECT id FROM stays WHERE guest_id IN (SELECT id FROM guests WHERE phone IN ('9876500001', '9876500002', '9876500003', '9876500004', '9876500005')));");
  runSql("DELETE FROM payments WHERE stay_id IN (SELECT id FROM stays WHERE guest_id IN (SELECT id FROM guests WHERE phone IN ('9876500001', '9876500002', '9876500003', '9876500004', '9876500005')));");
  runSql("DELETE FROM occupants WHERE stay_id IN (SELECT id FROM stays WHERE guest_id IN (SELECT id FROM guests WHERE phone IN ('9876500001', '9876500002', '9876500003', '9876500004', '9876500005')));");
  runSql("DELETE FROM stays WHERE guest_id IN (SELECT id FROM guests WHERE phone IN ('9876500001', '9876500002', '9876500003', '9876500004', '9876500005'));");
  runSql("DELETE FROM guests WHERE phone IN ('9876500001', '9876500002', '9876500003', '9876500004', '9876500005');");

  // =========================================================================
  // [Scenario 1] Guest without bookings
  // =========================================================================
  console.log('\n[Scenario 1] Guest without bookings');
  runSql("INSERT INTO guests (hotel_id, name, phone, id_proof_type) VALUES (1, 'Test Orphan Guest', '9876500001', 'Aadhaar');");
  const guest1Id = Number(runSql("SELECT id FROM guests WHERE phone = '9876500001'").trim().split('\n')[1]);
  console.log(`Created guest 1 (ID: ${guest1Id})`);

  const delGuest1 = await req(`/guests/${guest1Id}`, {
    method: 'DELETE',
    headers: authHeader,
  });
  assert.strictEqual(delGuest1.status, 200, 'Deleting guest without bookings should succeed');
  const checkGuest1 = runSql(`SELECT COUNT(*) FROM guests WHERE id = ${guest1Id}`).trim().split('\n')[1];
  assert.strictEqual(Number(checkGuest1), 0, 'Guest 1 must be gone from DB');
  console.log('✓ Scenario 1: Guest without bookings deleted successfully');

  // =========================================================================
  // [Scenario 2] Guest with one future pending booking
  // =========================================================================
  console.log('\n[Scenario 2] Guest with one future pending booking');
  runSql("INSERT INTO guests (hotel_id, name, phone, id_proof_type) VALUES (1, 'Test Future Booking Guest', '9876500002', 'Aadhaar');");
  const guest2Id = Number(runSql("SELECT id FROM guests WHERE phone = '9876500002'").trim().split('\n')[1]);
  console.log(`Created guest 2 (ID: ${guest2Id})`);

  // Create booking for Guest 2 in Room 102 (room_id: 2)
  const createRes2 = await req('/reservations', {
    method: 'POST',
    headers: authHeader,
    body: JSON.stringify({
      roomId: 2,
      guestId: guest2Id,
      name: 'Test Future Booking Guest',
      phone: '9876500002',
      checkIn: '2026-12-20',
      checkOut: '2026-12-22',
      persons: 1,
      rate: 1500,
    }),
  });
  assert.ok(createRes2.status === 200 || createRes2.status === 201, `Booking creation must succeed: ${JSON.stringify(createRes2.body)}`);
  const booking2Id = createRes2.body.data.id;
  const booking2Code = createRes2.body.data.booking_code || createRes2.body.data.bookingCode;
  console.log(`Created booking for guest 2 (ID: ${booking2Id}, Code: ${booking2Code})`);

  // Attempt to delete Guest 2 (must be blocked with specific message and fields)
  const delGuest2 = await req(`/guests/${guest2Id}`, {
    method: 'DELETE',
    headers: authHeader,
  });
  assert.strictEqual(delGuest2.status, 409, 'Deleting guest with future booking must be blocked (HTTP 409)');
  const err2 = delGuest2.body.error;
  console.log('Received error:', err2);
  assert.strictEqual(err2.code, 'active_booking', 'Error code must be active_booking');
  assert.ok(err2.message.includes('The booking must be cancelled first'), 'Error message must instruct cancellation');
  assert.strictEqual(String(err2.fields.bookingId), String(booking2Id), 'Error fields must contain bookingId');
  assert.strictEqual(String(err2.fields.bookingCode), String(booking2Code), 'Error fields must contain bookingCode');
  console.log('✓ Scenario 2: Guest with future booking blocked with cancellation requirement and navigation payload');

  // =========================================================================
  // [Scenario 3] Guest with a cancelled booking
  // =========================================================================
  console.log('\n[Scenario 3] Guest with a cancelled booking');
  // Cancel the booking first
  const cancelRes2 = await req(`/reservations/${booking2Id}/cancel`, {
    method: 'POST',
    headers: authHeader,
    body: JSON.stringify({
      reason: 'Guest cancelled reservation',
      cancellationFee: 0,
      refundableAmount: 0,
    }),
  });
  assert.strictEqual(cancelRes2.status, 200, 'Cancelling booking must succeed');
  console.log(`Cancelled booking ${booking2Code}`);

  // Recheck dependencies and delete guest 2
  const delGuest2AfterCancel = await req(`/guests/${guest2Id}`, {
    method: 'DELETE',
    headers: authHeader,
  });
  assert.strictEqual(delGuest2AfterCancel.status, 200, 'Deleting guest after booking cancellation must succeed');
  const checkGuest2 = runSql(`SELECT COUNT(*) FROM guests WHERE id = ${guest2Id}`).trim().split('\n')[1];
  assert.strictEqual(Number(checkGuest2), 0, 'Guest 2 must be deleted from DB');
  console.log('✓ Scenario 3: Guest with cancelled booking deleted successfully after dependency re-verification');

  // =========================================================================
  // [Scenario 4] Guest with an active stay
  // =========================================================================
  console.log('\n[Scenario 4] Guest with an active stay');
  runSql("INSERT INTO guests (hotel_id, name, phone, id_proof_type) VALUES (1, 'Test In-House Guest', '9876500003', 'Aadhaar');");
  const guest3Id = Number(runSql("SELECT id FROM guests WHERE phone = '9876500003'").trim().split('\n')[1]);
  // Insert an in-house stay in Room 103 (id: 3)
  runSql(`INSERT INTO stays (hotel_id, room_id, guest_id, persons, rate, check_in_date, checkout_planned, status) VALUES (1, 3, ${guest3Id}, 1, 1500, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 1 DAY), 'in_house');`);
  const stay3Id = Number(runSql(`SELECT id FROM stays WHERE guest_id = ${guest3Id} AND status = 'in_house'`).trim().split('\n')[1]);
  console.log(`Created active stay (ID: ${stay3Id}, Room 103) for guest 3 (ID: ${guest3Id})`);

  // Attempt to delete Guest 3 (must be blocked)
  const delGuest3 = await req(`/guests/${guest3Id}`, {
    method: 'DELETE',
    headers: authHeader,
  });
  assert.strictEqual(delGuest3.status, 409, 'Deleting guest with active stay must be blocked (HTTP 409)');
  const err3 = delGuest3.body.error;
  console.log('Received error:', err3);
  assert.strictEqual(err3.code, 'active_stay', 'Error code must be active_stay');
  assert.ok(err3.message.includes('Checkout must be completed first'), 'Error message must instruct checkout');
  console.log('✓ Scenario 4: Guest with active stay blocked correctly');

  // =========================================================================
  // [Scenario 5] Guest with a completed stay
  // =========================================================================
  console.log('\n[Scenario 5] Guest with a completed stay');
  runSql("INSERT INTO guests (hotel_id, name, phone, id_proof_type) VALUES (1, 'Test Checked Out Guest', '9876500004', 'Aadhaar');");
  const guest4Id = Number(runSql("SELECT id FROM guests WHERE phone = '9876500004'").trim().split('\n')[1]);
  // Insert a completed stay in Room 104 (id: 4)
  runSql(`INSERT INTO stays (hotel_id, room_id, guest_id, persons, rate, check_in_date, checkout_planned, checkout_actual, status) VALUES (1, 4, ${guest4Id}, 1, 1500, DATE_SUB(CURDATE(), INTERVAL 2 DAY), DATE_SUB(CURDATE(), INTERVAL 1 DAY), DATE_SUB(CURDATE(), INTERVAL 1 DAY), 'checked_out');`);
  console.log(`Created completed stay for guest 4 (ID: ${guest4Id})`);

  // Attempt to delete Guest 4 (must be blocked with completed_stay)
  const delGuest4 = await req(`/guests/${guest4Id}`, {
    method: 'DELETE',
    headers: authHeader,
  });
  assert.strictEqual(delGuest4.status, 409, 'Deleting guest with completed stay must be blocked (HTTP 409)');
  const err4 = delGuest4.body.error;
  console.log('Received error:', err4);
  assert.strictEqual(err4.code, 'completed_stay', 'Error code must be completed_stay');
  assert.strictEqual(err4.message, 'Cannot delete guest: guest has completed stay history.');
  console.log('✓ Scenario 5: Guest with completed stay blocked from deletion, history protected');

  // =========================================================================
  // [Scenario 6] Guest with payment or invoice records
  // =========================================================================
  console.log('\n[Scenario 6] Guest with payment or invoice records');
  runSql("INSERT INTO guests (hotel_id, name, phone, id_proof_type) VALUES (1, 'Test Payment Guest', '9876500005', 'Aadhaar');");
  const guest5Id = Number(runSql("SELECT id FROM guests WHERE phone = '9876500005'").trim().split('\n')[1]);
  // Insert a cancelled reservation with a payment record
  runSql(`INSERT INTO reservations (hotel_id, booking_code, room_id, guest_id, check_in_date, check_out_date, persons, rate, status) VALUES (1, 'BK-TEST5', 5, ${guest5Id}, '2026-12-25', '2026-12-27', 1, 1500, 'cancelled');`);
  const res5Id = Number(runSql(`SELECT id FROM reservations WHERE guest_id = ${guest5Id}`).trim().split('\n')[1]);
  runSql(`INSERT INTO payments (hotel_id, reservation_id, type, amount, method, status) VALUES (1, ${res5Id}, 'advance', 500, 'cash', 'successful');`);
  console.log(`Created cancelled reservation ${res5Id} with payment record for guest 5 (ID: ${guest5Id})`);

  // Attempt to delete Guest 5 (must be blocked with has_payments)
  const delGuest5 = await req(`/guests/${guest5Id}`, {
    method: 'DELETE',
    headers: authHeader,
  });
  assert.strictEqual(delGuest5.status, 409, 'Deleting guest with payment records must be blocked (HTTP 409)');
  const err5 = delGuest5.body.error;
  console.log('Received error:', err5);
  assert.strictEqual(err5.code, 'has_payments', 'Error code must be has_payments');
  assert.strictEqual(err5.message, 'Cannot delete guest: guest has payment or refund records.');
  
  // Verify that the payment and reservation records were NOT deleted
  const payCount = Number(runSql(`SELECT COUNT(*) FROM payments WHERE reservation_id = ${res5Id}`).trim().split('\n')[1]);
  const resCount = Number(runSql(`SELECT COUNT(*) FROM reservations WHERE id = ${res5Id}`).trim().split('\n')[1]);
  assert.strictEqual(payCount, 1, 'Payment record must not be deleted');
  assert.strictEqual(resCount, 1, 'Reservation record must not be deleted');
  console.log('✓ Scenario 6: Financial records block deletion and are never deleted');

  // Clean up test data
  runSql(`DELETE FROM payments WHERE reservation_id = ${res5Id};`);
  runSql(`DELETE FROM reservations WHERE id = ${res5Id};`);
  runSql(`DELETE FROM stays WHERE guest_id IN (${guest3Id}, ${guest4Id});`);
  runSql(`DELETE FROM guests WHERE id IN (${guest3Id}, ${guest4Id}, ${guest5Id});`);
  runSql("UPDATE rooms SET housekeeping_status = 'ok' WHERE id IN (2, 3, 4, 5);");

  console.log('\n=================================================================');
  console.log('SUCCESS: ALL 6 GUEST DELETE SCENARIOS VERIFIED END-TO-END ON LIVE API!');
  console.log('=================================================================');
}

run().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
