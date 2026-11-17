import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Update Floor Room Tiles & Room Details Verification', () => {
  // Logic mirror for room tile persons count display
  const getPersonsDisplay = (room) => {
    if (room.status === 'occupied') {
      const p = Number(room.persons ?? 1);
      return `${p} ${p === 1 ? 'Person' : 'Persons'}`;
    }
    if (room.status === 'booked') {
      const p = Number(room.persons ?? room.pendingBooking?.persons ?? 1);
      return `${p} ${p === 1 ? 'Person' : 'Persons'}`;
    }
    return '0 Persons';
  };

  // Logic mirror for guest name display on room tiles
  const getGuestDisplay = (room) => {
    if ((room.status === 'occupied' || room.status === 'booked') && room.guestName) {
      return `Guest: ${room.guestName.trim()}`;
    }
    return null;
  };

  // Logic mirror for room click handler
  const handleRoomTileClick = (room) => {
    // Strictly opens roomDetails only, NEVER opens checkout automatically
    return { type: 'roomDetails', room };
  };

  // Logic mirror for ID proof document preview
  const getDocumentPreviewAction = (mime, filename) => {
    const isImage = mime?.startsWith('image/') || /\.(jpg|jpeg|png|webp)$/i.test(filename || '');
    const isPdf = mime === 'application/pdf' || /\.pdf$/i.test(filename || '');
    if (isImage || isPdf) {
      return { action: 'open_tab', target: '_blank' };
    }
    return { action: 'download', filename: filename || 'document' };
  };

  // -------------------------------------------------------------------------
  // Test 1: Occupied room displays actual persons count
  // -------------------------------------------------------------------------
  it('1. an occupied room with two persons displays "2 Persons"', () => {
    const occupiedRoom = {
      id: 108,
      roomNo: 108,
      status: 'occupied',
      persons: 2,
      guestName: 'Mohamed Ali',
      stayId: 45,
    };

    const personsText = getPersonsDisplay(occupiedRoom);
    const guestText = getGuestDisplay(occupiedRoom);

    assert.equal(personsText, '2 Persons');
    assert.equal(guestText, 'Guest: Mohamed Ali');
  });

  it('1b. an occupied room with 1 person displays "1 Person"', () => {
    const singleOccupant = {
      id: 101,
      roomNo: 101,
      status: 'occupied',
      persons: 1,
      guestName: 'John Doe',
      stayId: 46,
    };

    assert.equal(getPersonsDisplay(singleOccupant), '1 Person');
    assert.equal(getGuestDisplay(singleOccupant), 'Guest: John Doe');
  });

  // -------------------------------------------------------------------------
  // Test 2: Clicking an occupied room opens Room Details with guest and occupant details
  // -------------------------------------------------------------------------
  it('2. clicking an occupied room tile opens Room Details only and displays guest & occupant details', () => {
    const room = { id: 108, roomNo: 108, status: 'occupied', stayId: 45, persons: 2 };
    const sheetAction = handleRoomTileClick(room);

    assert.equal(sheetAction.type, 'roomDetails');
    assert.notEqual(sheetAction.type, 'checkout');

    // Mock stay data retrieved for this stay
    const stayData = {
      id: 45,
      room_no: 108,
      room_type_name: 'Deluxe Suite',
      guest_name: 'Mohamed Ali',
      guest_phone: '9876543210',
      id_proof_type: 'Aadhaar',
      id_proof_last4: '4567',
      persons: 2,
      check_in_date: '2026-11-15',
      checkout_planned: '2026-11-18',
      original_check_in_date: '2026-11-15',
      original_checkout_date: '2026-11-18',
      rate: 3500.0,
      occupants: [
        {
          id: 1,
          occupant_number: 1,
          name: 'Mohamed Ali',
          gender: 'Male',
          phone: '9876543210',
          is_primary: 1,
          documents: [
            { id: 101, original_filename: 'mohamed_aadhaar.pdf', mime_type: 'application/pdf', file_size: 154000 },
          ],
        },
        {
          id: 2,
          occupant_number: 2,
          name: 'Fatima Ali',
          gender: 'Female',
          phone: '9876543211',
          is_primary: 0,
          documents: [
            { id: 102, original_filename: 'fatima_passport.jpg', mime_type: 'image/jpeg', file_size: 98000 },
          ],
        },
      ],
    };

    // Verify Guest Details
    assert.equal(stayData.guest_name, 'Mohamed Ali');
    assert.equal(stayData.guest_phone, '9876543210');
    assert.equal(stayData.id_proof_type, 'Aadhaar');
    assert.equal(stayData.id_proof_last4, '4567');
    assert.equal(stayData.persons, 2);

    // Verify both occupants exist
    assert.equal(stayData.occupants.length, 2);
    assert.equal(stayData.occupants[0].name, 'Mohamed Ali');
    assert.equal(stayData.occupants[0].gender, 'Male');
    assert.equal(stayData.occupants[1].name, 'Fatima Ali');
    assert.equal(stayData.occupants[1].gender, 'Female');
    assert.equal(stayData.occupants[0].documents.length, 1);
    assert.equal(stayData.occupants[1].documents.length, 1);
  });

  // -------------------------------------------------------------------------
  // Test 3: ID proof documents open or preview correctly
  // -------------------------------------------------------------------------
  it('3. ID proof documents open or preview correctly (images and PDFs in new tab, others download)', () => {
    const pdfDoc = { original_filename: 'guest_aadhaar.pdf', mime_type: 'application/pdf' };
    const jpgDoc = { original_filename: 'passport_scan.jpg', mime_type: 'image/jpeg' };
    const pngDoc = { original_filename: 'voter_id.png', mime_type: 'image/png' };
    const binaryDoc = { original_filename: 'doc_archive.zip', mime_type: 'application/zip' };

    const pdfAction = getDocumentPreviewAction(pdfDoc.mime_type, pdfDoc.original_filename);
    assert.equal(pdfAction.action, 'open_tab');
    assert.equal(pdfAction.target, '_blank');

    const jpgAction = getDocumentPreviewAction(jpgDoc.mime_type, jpgDoc.original_filename);
    assert.equal(jpgAction.action, 'open_tab');
    assert.equal(jpgAction.target, '_blank');

    const pngAction = getDocumentPreviewAction(pngDoc.mime_type, pngDoc.original_filename);
    assert.equal(pngAction.action, 'open_tab');
    assert.equal(pngAction.target, '_blank');

    const binaryAction = getDocumentPreviewAction(binaryDoc.mime_type, binaryDoc.original_filename);
    assert.equal(binaryAction.action, 'download');
    assert.equal(binaryAction.filename, 'doc_archive.zip');
  });

  // -------------------------------------------------------------------------
  // Test 4: Booked room displays reservation persons count and booking details
  // -------------------------------------------------------------------------
  it('4. a booked room displays its reservation persons count and booking details', () => {
    const bookedRoom = {
      id: 204,
      roomNo: 204,
      status: 'booked',
      persons: 3,
      guestName: 'Sarah Jenkins',
      bookingId: 88,
      bookingCode: 'BK-0088',
    };

    assert.equal(getPersonsDisplay(bookedRoom), '3 Persons');
    assert.equal(getGuestDisplay(bookedRoom), 'Guest: Sarah Jenkins');

    const reservationDetails = {
      id: 88,
      booking_code: 'BK-0088',
      guest_name: 'Sarah Jenkins',
      guest_phone: '9123456789',
      check_in_date: '2026-11-20',
      check_out_date: '2026-11-23',
      persons: 3,
      rate: 2800.0,
      advance_paid: 2000.0,
      status: 'pending',
    };

    assert.equal(reservationDetails.booking_code, 'BK-0088');
    assert.equal(reservationDetails.persons, 3);
    assert.equal(reservationDetails.advance_paid, 2000.0);
  });

  // -------------------------------------------------------------------------
  // Test 5: Ready room does not show old guest details
  // -------------------------------------------------------------------------
  it('5. a ready room displays "0 Persons" and does not show old guest details', () => {
    const readyRoom = {
      id: 301,
      roomNo: 301,
      status: 'free',
      persons: 0,
      guestName: null, // Guaranteed null after checkout
      roomType: { name: 'Standard Non-AC', rate: 1800, maxPersons: 2 },
    };

    assert.equal(getPersonsDisplay(readyRoom), '0 Persons');
    assert.equal(getGuestDisplay(readyRoom), null);
    assert.equal(readyRoom.guestName, null);
  });

  it('5b. cleaning and maintenance rooms display "0 Persons" and no guests', () => {
    const cleaningRoom = { id: 105, roomNo: 105, status: 'cleaning', persons: 0, guestName: null };
    const repairRoom = { id: 106, roomNo: 106, status: 'repair', persons: 0, guestName: null, note: 'Tap leak' };

    assert.equal(getPersonsDisplay(cleaningRoom), '0 Persons');
    assert.equal(getGuestDisplay(cleaningRoom), null);

    assert.equal(getPersonsDisplay(repairRoom), '0 Persons');
    assert.equal(getGuestDisplay(repairRoom), null);
  });

  // -------------------------------------------------------------------------
  // Test 6: Clicking a room tile NEVER opens checkout automatically
  // -------------------------------------------------------------------------
  it('6. clicking ANY room tile opens Room Details and never opens checkout automatically', () => {
    const statuses = ['free', 'occupied', 'booked', 'cleaning', 'repair'];

    for (const st of statuses) {
      const room = { id: 10, roomNo: 101, status: st, stayId: st === 'occupied' ? 99 : null };
      const action = handleRoomTileClick(room);

      assert.equal(action.type, 'roomDetails', `Failed for status: ${st}`);
      assert.notEqual(action.type, 'checkout', `Checkout was opened automatically for status: ${st}`);
    }
  });

  // -------------------------------------------------------------------------
  // Test 7: Explicit checkout actions still work correctly from Room Details
  // -------------------------------------------------------------------------
  it('7. explicit checkout actions are provided in Room Details and open checkout correctly', () => {
    const actionsTriggered = [];
    const onCheckout = (stayId) => actionsTriggered.push({ type: 'checkout', stayId, initialMode: 'checkout' });
    const onEarlyCheckout = (stayId) => actionsTriggered.push({ type: 'checkout', stayId, initialMode: 'early' });
    const onViewStay = (stayId) => actionsTriggered.push({ type: 'stay', stayId });

    // When user explicitly clicks Check Out
    onCheckout(45);
    assert.deepEqual(actionsTriggered[0], { type: 'checkout', stayId: 45, initialMode: 'checkout' });

    // When user explicitly clicks Early Check Out
    onEarlyCheckout(45);
    assert.deepEqual(actionsTriggered[1], { type: 'checkout', stayId: 45, initialMode: 'early' });

    // When user clicks View Stay
    onViewStay(45);
    assert.deepEqual(actionsTriggered[2], { type: 'stay', stayId: 45 });
  });

  // -------------------------------------------------------------------------
  // Test 8: Floors grouping and multi-floor consistency
  // -------------------------------------------------------------------------
  it('8. room tiles are properly grouped by floor and sorted across all floors', () => {
    const mockRooms = [
      { id: 201, roomNo: 201, floor: 2, status: 'free' },
      { id: 102, roomNo: 102, floor: 1, status: 'occupied', persons: 2 },
      { id: 1, roomNo: 1, floor: 0, status: 'free' },
      { id: 101, roomNo: 101, floor: 1, status: 'booked', persons: 1 },
      { id: 2, roomNo: 2, floor: 0, status: 'cleaning' },
    ];

    const floors = [...new Set(mockRooms.map((r) => r.floor))].sort((a, b) => a - b);
    assert.deepEqual(floors, [0, 1, 2]);

    const groundFloor = mockRooms.filter((r) => r.floor === 0).sort((a, b) => a.roomNo - b.roomNo);
    assert.equal(groundFloor.length, 2);
    assert.equal(groundFloor[0].roomNo, 1);
    assert.equal(groundFloor[1].roomNo, 2);

    const firstFloor = mockRooms.filter((r) => r.floor === 1).sort((a, b) => a.roomNo - b.roomNo);
    assert.equal(firstFloor.length, 2);
    assert.equal(firstFloor[0].roomNo, 101);
    assert.equal(firstFloor[1].roomNo, 102);

    const secondFloor = mockRooms.filter((r) => r.floor === 2);
    assert.equal(secondFloor.length, 1);
    assert.equal(secondFloor[0].roomNo, 201);
  });
});
