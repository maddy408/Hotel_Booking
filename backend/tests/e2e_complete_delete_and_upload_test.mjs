import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_URL = 'http://127.0.0.1:8080';
const STORAGE_DIR = path.resolve(__dirname, '..', 'storage', 'uploads');

const results = [];

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function test(name, fn) {
  process.stdout.write(`• ${name}... `);
  try {
    await fn();
    console.log('PASSED');
    results.push({ name, status: 'PASSED' });
  } catch (err) {
    console.log(`FAILED: ${err.message}`);
    results.push({ name, status: 'FAILED', error: err.message });
  }
}

async function api(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = { ...(options.headers || {}) };
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }
  if (options.json) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.json);
  }
  const res = await fetch(url, { ...options, headers });
  let data = null;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await res.json();
  }
  return { status: res.status, headers: res.headers, data, res };
}

async function login(username, password = 'Welcome@123') {
  const { status, data } = await api('/auth/login', {
    method: 'POST',
    json: { username, password },
  });
  if (status !== 200 || !data?.success) {
    throw new Error(`Login failed for ${username}: ${JSON.stringify(data)}`);
  }
  return data.data.accessToken;
}

async function runAllTests() {
  console.log('========================================================');
  console.log(' STARTING COMPREHENSIVE DELETE & FILE UPLOAD TEST SUITE');
  console.log('========================================================\n');

  let adminToken, receptionistToken, housekeepingToken;

  await test('0. Authenticate test roles (Admin, Receptionist, Housekeeping)', async () => {
    adminToken = await login('admin');
    receptionistToken = await login('receptionist');
    housekeepingToken = await login('housekeeping');
    assert(adminToken, 'Admin token received');
    assert(receptionistToken, 'Receptionist token received');
    assert(housekeepingToken, 'Housekeeping token received');
  });

  await test('1.1 Unauthenticated requests are rejected on delete & upload routes (401)', async () => {
    const r1 = await api('/rooms/1', { method: 'DELETE' });
    assert(r1.status === 401, `DELETE /rooms/1 returned ${r1.status}`);

    const r2 = await api('/room-types/1', { method: 'DELETE' });
    assert(r2.status === 401, `DELETE /room-types/1 returned ${r2.status}`);

    const r3 = await api('/users/1', { method: 'DELETE' });
    assert(r3.status === 401, `DELETE /users/1 returned ${r3.status}`);

    const r4 = await api('/guests/1', { method: 'DELETE' });
    assert(r4.status === 401, `DELETE /guests/1 returned ${r4.status}`);

    const r5 = await api('/guests/1/id-image', { method: 'DELETE' });
    assert(r5.status === 401, `DELETE /guests/1/id-image returned ${r5.status}`);

    const r6 = await api('/occupant-documents/1', { method: 'DELETE' });
    assert(r6.status === 401, `DELETE /occupant-documents/1 returned ${r6.status}`);
  });

  await test('1.2 Unauthorized roles (Housekeeping) cannot perform deletions or uploads (403)', async () => {
    const r1 = await api('/rooms/1', { method: 'DELETE', token: housekeepingToken });
    assert(r1.status === 403, `Housekeeping DELETE /rooms returned ${r1.status}`);

    const r2 = await api('/room-types/1', { method: 'DELETE', token: housekeepingToken });
    assert(r2.status === 403, `Housekeeping DELETE /room-types returned ${r2.status}`);

    const r3 = await api('/users/1', { method: 'DELETE', token: housekeepingToken });
    assert(r3.status === 403, `Housekeeping DELETE /users returned ${r3.status}`);

    const r4 = await api('/guests/1', { method: 'DELETE', token: housekeepingToken });
    assert(r4.status === 403, `Housekeeping DELETE /guests returned ${r4.status}`);

    const r5 = await api('/guests/1/id-image', { method: 'DELETE', token: housekeepingToken });
    assert(r5.status === 403, `Housekeeping DELETE /guests/1/id-image returned ${r5.status}`);

    const r6 = await api('/occupant-documents/1', { method: 'DELETE', token: housekeepingToken });
    assert(r6.status === 403, `Housekeeping DELETE /occupant-documents returned ${r6.status}`);
  });

  await test('2.1 User Delete: Self-deletion is prohibited (409)', async () => {
    const res = await api('/users/1', { method: 'DELETE', token: adminToken });
    assert(res.status === 409, `Self delete returned ${res.status}`);
    assert(res.data?.error?.message?.includes('cannot delete your own account'), 'Appropriate error message');
  });

  await test('2.2 User Delete: User with audit/operational history cannot be deleted (409)', async () => {
    const uname = `op_user_${Date.now()}`;
    const createRes = await api('/users', {
      method: 'POST',
      token: adminToken,
      json: {
        name: 'Operational History User',
        username: uname,
        role: 'receptionist',
        password: 'Password@123',
        email: `${uname}@example.com`,
      },
    });
    assert(createRes.status === 200, 'User created');
    const uId = createRes.data.data.id;

    // Log in as that user and record a housekeeping log entry
    const uToken = await login(uname, 'Password@123');
    const hkRes = await api('/rooms/10/housekeeping', {
      method: 'POST',
      token: uToken,
      json: { action: 'ready' },
    });
    assert(hkRes.status === 200, 'User recorded operational action');

    // Attempt to delete user who has operational history -> must be blocked with 409
    const delRes = await api(`/users/${uId}`, { method: 'DELETE', token: adminToken });
    assert(delRes.status === 409, `Delete user with history returned ${delRes.status}`);
    assert(
      delRes.data?.error?.message?.includes('history') || delRes.data?.error?.message?.includes('Deactivate'),
      'Proper warning regarding account history'
    );
  });

  let tempUserId;
  await test('2.3 User Delete: Clean temporary user deletes cleanly from API and DB', async () => {
    const uname = `temp_del_${Date.now()}`;
    const createRes = await api('/users', {
      method: 'POST',
      token: adminToken,
      json: {
        name: 'Temp Delete User',
        username: uname,
        role: 'receptionist',
        password: 'Password@123',
        email: `${uname}@example.com`,
      },
    });
    assert(createRes.status === 200 && createRes.data?.success, 'User created');
    tempUserId = createRes.data.data.id;

    // Verify user is visible in list
    const listBefore = await api('/users', { token: adminToken });
    assert(listBefore.data.data.some((u) => u.id === tempUserId), 'User in list before delete');

    // Delete user
    const delRes = await api(`/users/${tempUserId}`, { method: 'DELETE', token: adminToken });
    assert(delRes.status === 200, `Delete returned ${delRes.status}`);

    // Verify user disappeared from list
    const listAfter = await api('/users', { token: adminToken });
    assert(!listAfter.data.data.some((u) => u.id === tempUserId), 'User removed from list');
  });

  await test('3.1 Room Type Delete: Type with assigned rooms cannot be deleted (409)', async () => {
    const res = await api('/room-types/1', { method: 'DELETE', token: adminToken });
    assert(res.status === 409, `Delete room type with rooms returned ${res.status}`);
    assert(res.data?.error?.message?.includes('Change the type of its rooms first'), 'Proper error message');
  });

  let tempRoomTypeId;
  await test('3.2 Room Type Delete: Unused room type deletes cleanly', async () => {
    const typeName = `Temp Type ${Date.now() % 1000}`;
    const createRes = await api('/room-types', {
      method: 'POST',
      token: adminToken,
      json: { name: typeName, rate: 1999, maxPersons: 2 },
    });
    assert(createRes.status === 200 && createRes.data?.success, 'Room type created');
    tempRoomTypeId = createRes.data.data.id;

    // Verify visible in list
    const listBefore = await api('/room-types', { token: adminToken });
    assert(listBefore.data.data.some((t) => t.id === tempRoomTypeId), 'Found before delete');

    // Delete room type
    const delRes = await api(`/room-types/${tempRoomTypeId}`, { method: 'DELETE', token: adminToken });
    assert(delRes.status === 200, `Delete returned ${delRes.status}`);

    // Verify disappeared
    const listAfter = await api('/room-types', { token: adminToken });
    assert(!listAfter.data.data.some((t) => t.id === tempRoomTypeId), 'Removed from list after delete');
  });

  await test('4.1 Room Delete: Room with historical or active stays/bookings cannot be deleted (409)', async () => {
    const res = await api('/rooms/1', { method: 'DELETE', token: adminToken });
    assert(res.status === 409, `Delete room with stays returned ${res.status}`);
    assert(res.data?.error?.message?.includes('cannot be removed') || res.data?.error?.message?.includes('historical'), 'Foreign-key safe error message');
  });

  let tempRoomId;
  const testRoomNo = 899;
  await test('4.2 Room Delete: Unreferenced room creates and deletes cleanly', async () => {
    const createRes = await api('/rooms/bulk', {
      method: 'POST',
      token: adminToken,
      json: { floor: 8, from: testRoomNo, to: testRoomNo, roomTypeId: 1 },
    });
    assert(createRes.status === 200 && createRes.data?.success, 'Bulk add returned 200');

    // Query rooms list to find newly created room
    const listBefore = await api('/rooms', { token: adminToken });
    const createdRoom = listBefore.data.data.rooms.find((r) => Number(r.roomNo) === testRoomNo);
    assert(createdRoom, `Room ${testRoomNo} found in rooms list`);
    tempRoomId = createdRoom.id;

    // Delete room
    const delRes = await api(`/rooms/${tempRoomId}`, { method: 'DELETE', token: adminToken });
    assert(delRes.status === 200, `Delete returned ${delRes.status}`);

    // Verify room is gone
    const listAfter = await api('/rooms', { token: adminToken });
    assert(!listAfter.data.data.rooms.some((r) => r.id === tempRoomId), 'Room disappeared after delete');
  });

  let tempBookingGuestId;
  let tempReservationId;
  const tempPhone = `98${Math.floor(10000000 + Math.random() * 90000000)}`;

  await test('5.1 Guest & Booking: Linked guest cannot be deleted, cancel booking works properly', async () => {
    // Find free, ready room
    const roomsRes = await api('/rooms', { token: receptionistToken });
    const freeRoom = roomsRes.data.data.rooms.find((r) => r.status === 'free' && r.housekeepingStatus === 'ok');
    assert(freeRoom, 'Found free ready room');

    const res = await api('/reservations', {
      method: 'POST',
      token: receptionistToken,
      json: {
        roomId: freeRoom.id,
        phone: tempPhone,
        name: 'Delete Verification Guest',
        city: 'Bangalore',
        idProofType: 'Aadhaar',
        checkIn: '2026-12-20',
        checkOut: '2026-12-22',
        persons: 1,
        rate: Number(freeRoom.roomType?.rate || 2200),
        advanceAmount: 0,
        advanceMethod: 'cash',
      },
    });
    assert(res.status === 200 && res.data?.success, `Reservation create returned ${res.status}`);
    tempBookingGuestId = res.data.data.guest_id;
    tempReservationId = res.data.data.id;
    assert(tempBookingGuestId, 'Guest ID recorded');
    assert(tempReservationId, 'Reservation ID recorded');

    // Guest has linked reservation, so cannot be deleted
    const delAttempt = await api(`/guests/${tempBookingGuestId}`, { method: 'DELETE', token: receptionistToken });
    assert(delAttempt.status === 409, `Delete guest with booking returned ${delAttempt.status}`);
    assert(delAttempt.data?.error?.message?.includes('linked bookings'), 'Conflict reported');

    // Cancel reservation
    const cancelRes = await api(`/reservations/${tempReservationId}/cancel`, {
      method: 'POST',
      token: receptionistToken,
      json: { reason: 'Test cancellation', refundAmount: 0, cancellationFee: 0 },
    });
    assert(cancelRes.status === 200 && cancelRes.data?.success, 'Reservation cancelled');

    // Stored financial/audit reservation history remains, preserving retention
    const delAttemptAfterCancel = await api(`/guests/${tempBookingGuestId}`, { method: 'DELETE', token: receptionistToken });
    assert(delAttemptAfterCancel.status === 409, 'Guest retained because reservation history exists');
  });

  let testGuestIdForUpload;
  const uploadTestPhone = `95${Math.floor(10000000 + Math.random() * 90000000)}`;

  await test('6.1 Guest ID Proof Upload, Replacement, and Explicit Delete', async () => {
    // Find free, ready room for reservation
    const roomsRes = await api('/rooms', { token: receptionistToken });
    const freeRoom = roomsRes.data.data.rooms.find((r) => r.status === 'free' && r.housekeepingStatus === 'ok' && r.id !== 4);
    assert(freeRoom, 'Found free ready room');

    const { status: s1, data: d1 } = await api('/reservations', {
      method: 'POST',
      token: receptionistToken,
      json: {
        roomId: freeRoom.id,
        phone: uploadTestPhone,
        name: 'Upload Test Guest',
        city: 'Chennai',
        idProofType: 'Passport',
        checkIn: '2026-12-28',
        checkOut: '2026-12-29',
        persons: 1,
        rate: Number(freeRoom.roomType?.rate || 2200),
        advanceAmount: 0,
        advanceMethod: 'cash',
      },
    });
    assert(s1 === 200 && d1?.success, 'Created reservation for upload test');
    testGuestIdForUpload = d1.data.guest_id;
    assert(testGuestIdForUpload, 'Found test guest ID');

    // 1. Upload initial PNG file
    const pngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="guest_proof.png"\r\nContent-Type: image/png\r\n\r\n`),
      pngBuffer,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const uploadRes = await fetch(`${BASE_URL}/guests/${testGuestIdForUpload}/id-image`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${receptionistToken}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });
    const uploadData = await uploadRes.json();
    assert(uploadRes.status === 200 && uploadData.success, 'Uploaded PNG document');
    assert(uploadData.data.hasIdImage === true, 'hasIdImage is true in response');

    // Verify physical file exists on disk
    const diskDir = path.join(STORAGE_DIR, 'guests');
    const files = fs.readdirSync(diskDir);
    const pngFile = files.find((f) => f.startsWith(`${testGuestIdForUpload}-`) && f.endsWith('.png'));
    assert(pngFile, `Physical file found on server disk: ${pngFile}`);
    const oldFilePath = path.join(diskDir, pngFile);

    // Verify file download
    const dlRes = await api(`/guests/${testGuestIdForUpload}/id-image`, { token: receptionistToken });
    assert(dlRes.status === 200, `Download returned ${dlRes.status}`);
    assert(dlRes.headers.get('content-type') === 'image/png', 'Correct Content-Type');

    // 2. Replace with JPEG
    const jpgBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12, 0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x7f, 0x00, 0xff, 0xd9]);
    const b2 = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    const body2 = Buffer.concat([
      Buffer.from(`--${b2}\r\nContent-Disposition: form-data; name="image"; filename="replacement.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
      jpgBuffer,
      Buffer.from(`\r\n--${b2}--\r\n`),
    ]);
    const repRes = await fetch(`${BASE_URL}/guests/${testGuestIdForUpload}/id-image`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${receptionistToken}`,
        'Content-Type': `multipart/form-data; boundary=${b2}`,
      },
      body: body2,
    });
    const repData = await repRes.json();
    assert(repRes.status === 200 && repData.success, 'Replacement uploaded successfully');

    // Confirm old file is deleted from disk
    assert(!fs.existsSync(oldFilePath), 'Old file unlinked from disk upon document replacement');

    const newFiles = fs.readdirSync(diskDir);
    const newFile = newFiles.find((f) => f.startsWith(`${testGuestIdForUpload}-`) && f.endsWith('.jpg'));
    assert(newFile, 'New replacement file saved on disk');

    // 3. Explicit Delete ID Proof removes physical file and clears DB
    const delPhotoRes = await api(`/guests/${testGuestIdForUpload}/id-image`, { method: 'DELETE', token: receptionistToken });
    assert(delPhotoRes.status === 200, `Delete ID image returned ${delPhotoRes.status}`);

    // Verify physical file was removed
    assert(!fs.existsSync(path.join(diskDir, newFile)), 'Physical file deleted on DELETE /guests/{id}/id-image');

    // Verify guest record has no id image
    const guestAfterDel = await api(`/guests/${testGuestIdForUpload}`, { token: receptionistToken });
    assert(guestAfterDel.data.data.hasIdImage === false, 'hasIdImage is false after deletion');
  });

  await test('6.2 Invalid file types are rejected with clear validation error', async () => {
    const txtBuffer = Buffer.from('console.log("plain text");');
    const b = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    const body = Buffer.concat([
      Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="image"; filename="invalid.txt"\r\nContent-Type: text/plain\r\n\r\n`),
      txtBuffer,
      Buffer.from(`\r\n--${b}--\r\n`),
    ]);
    const res = await fetch(`${BASE_URL}/guests/${testGuestIdForUpload}/id-image`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${receptionistToken}`,
        'Content-Type': `multipart/form-data; boundary=${b}`,
      },
      body,
    });
    const data = await res.json();
    assert(res.status === 422 || !data.success, 'Invalid file type rejected with 422');
    const msg = data.error?.fields?.image || data.error?.message || '';
    assert(msg.includes('PDF, JPEG, PNG, or WEBP'), `Validation message received: ${msg}`);
  });

  let testOccupantDocId;
  let testOccupantFilePath;
  await test('7.1 Occupant Document Upload to Reservation & Deletion', async () => {
    const pdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 612 792]>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000052 00000 n\n0000000101 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n162\n%%EOF');
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="documents[]"; filename="res_doc.pdf"\r\nContent-Type: application/pdf\r\n\r\n`),
      pdfBuffer,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const uploadRes = await fetch(`${BASE_URL}/reservations/${tempReservationId}/documents`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${receptionistToken}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });
    const uploadData = await uploadRes.json();
    assert(uploadRes.status === 200 && uploadData.success, `Upload occupant document returned ${uploadRes.status}`);
    const uploadedDocs = uploadData.data;
    assert(uploadedDocs.length > 0, 'Document uploaded');
    const doc = uploadedDocs[0];
    testOccupantDocId = doc.id;
    testOccupantFilePath = path.join(STORAGE_DIR, doc.file_path);

    // Verify physical file on disk
    assert(fs.existsSync(testOccupantFilePath), 'Occupant document physically stored in backend/storage/uploads/occupants/');

    // Download/View document
    const dlRes = await api(`/occupant-documents/${testOccupantDocId}/file`, { token: receptionistToken });
    assert(dlRes.status === 200, `Download document returned ${dlRes.status}`);
    assert(dlRes.headers.get('content-type') === 'application/pdf', 'Correct PDF mime type');

    // Delete document
    const delRes = await api(`/occupant-documents/${testOccupantDocId}`, { method: 'DELETE', token: receptionistToken });
    assert(delRes.status === 200 && delRes.data?.success, 'Document deleted');

    // Verify physical file removed from server
    assert(!fs.existsSync(testOccupantFilePath), 'Occupant document physical file removed from disk');

    // Verify cannot be downloaded anymore (404)
    const dlAfter = await api(`/occupant-documents/${testOccupantDocId}/file`, { token: receptionistToken });
    assert(dlAfter.status === 404, 'Download returns 404 after deletion');
  });

  await test('8.1 In-House Stay Extras: Add and Remove extra charge within database transaction', async () => {
    // Find free, ready room for stay
    const roomsRes = await api('/rooms', { token: receptionistToken });
    const freeRoom = roomsRes.data.data.rooms.find((r) => r.status === 'free' && r.housekeepingStatus === 'ok' && r.id >= 10);
    assert(freeRoom, 'Found free ready room for direct check-in');

    const checkInPhone = `94${Math.floor(10000000 + Math.random() * 90000000)}`;
    const checkInRes = await api('/stays', {
      method: 'POST',
      token: receptionistToken,
      json: {
        roomId: freeRoom.id,
        phone: checkInPhone,
        name: 'In-House Extra Charge Test',
        idProofType: 'Aadhaar',
        idProofNumber: '123456789012',
        persons: 1,
        days: 1,
        rate: Number(freeRoom.roomType?.rate || 2200),
        advanceAmount: Number(freeRoom.roomType?.rate || 2200),
        advanceMethod: 'cash',
        bookingSource: 'Direct Call',
      },
    });
    assert(checkInRes.status === 200 && checkInRes.data?.success, `Direct check-in returned ${checkInRes.status}`);
    const stayId = checkInRes.data.data.id;
    assert(stayId, 'Stay ID obtained');

    // Add extra charge
    const addRes = await api(`/stays/${stayId}/extras`, {
      method: 'POST',
      token: receptionistToken,
      json: { label: 'Room Service Dinner', amount: 450, isTaxable: true },
    });
    assert(addRes.status === 200 && addRes.data?.success, 'Extra charge added');
    const billBefore = addRes.data.data;
    const addedCharge = (billBefore.charges || []).find((c) => c.label === 'Room Service Dinner');
    assert(addedCharge, 'Charge found in bill charges');

    // Remove extra charge
    const rmRes = await api(`/stays/${stayId}/extras/${addedCharge.id}`, {
      method: 'DELETE',
      token: receptionistToken,
    });
    assert(rmRes.status === 200 && rmRes.data?.success, 'Extra charge removed');
    const billAfter = rmRes.data.data;
    assert(!billAfter.charges?.some((c) => c.id === addedCharge.id), 'Charge removed from bill');

    // Removing non-existent charge returns 404
    const rmAgain = await api(`/stays/${stayId}/extras/${addedCharge.id}`, {
      method: 'DELETE',
      token: receptionistToken,
    });
    assert(rmAgain.status === 404, 'Removing non-existent charge returns 404');

    // Checkout the stay cleanly
    const checkoutRes = await api(`/stays/${stayId}/checkout`, {
      method: 'POST',
      token: receptionistToken,
      json: { paymentMethod: 'cash', paymentAmount: 0 },
    });
    assert(checkoutRes.status === 200 && checkoutRes.data?.success, 'Stay checked out successfully');

    // Attempting to remove extras after checkout is rejected with 409
    const postCheckoutRm = await api(`/stays/${stayId}/extras/99999`, {
      method: 'DELETE',
      token: receptionistToken,
    });
    assert(postCheckoutRm.status === 409, 'Removing extras on checked-out stay rejected with 409');
  });

  await test('9.1 Financial Protection: Invoices, Stays, and Reservations cannot be deleted (404/405)', async () => {
    const r1 = await api('/invoices/1', { method: 'DELETE', token: adminToken });
    assert(r1.status === 404 || r1.status === 405, `DELETE /invoices/1 blocked with ${r1.status}`);

    const r2 = await api('/stays/1', { method: 'DELETE', token: adminToken });
    assert(r2.status === 404 || r2.status === 405, `DELETE /stays/1 blocked with ${r2.status}`);

    const r3 = await api('/reservations/1', { method: 'DELETE', token: adminToken });
    assert(r3.status === 404 || r3.status === 405, `DELETE /reservations/1 blocked with ${r3.status}`);
  });

  console.log('\n========================================================');
  console.log(` FINAL RESULTS: ${results.filter((r) => r.status === 'PASSED').length} PASSED / ${results.filter((r) => r.status === 'FAILED').length} FAILED`);
  console.log('========================================================\n');
}

runAllTests().catch((e) => {
  console.error('Test runner fatal error:', e);
  process.exit(1);
});
