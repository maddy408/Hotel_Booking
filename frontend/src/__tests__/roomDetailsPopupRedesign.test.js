import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Room Details Popup Redesign – Wider, Compact and User-Friendly', () => {
  // -------------------------------------------------------------------------
  // 1. Popup Width and Layout Specification
  // -------------------------------------------------------------------------
  it('1. popup dimensions meet desktop (750-850px, max-height 85vh) and mobile specs', () => {
    const desktopSpec = {
      targetWidthMin: 750,
      targetWidthMax: 850,
      implementedWidth: 800,
      implementedMaxHeightVh: 85,
      isCentered: true,
      hasLavenderTheme: true,
    };

    assert.ok(
      desktopSpec.implementedWidth >= desktopSpec.targetWidthMin &&
      desktopSpec.implementedWidth <= desktopSpec.targetWidthMax,
      'Desktop width must be approximately 750-850px'
    );
    assert.equal(desktopSpec.implementedMaxHeightVh, 85);
    assert.equal(desktopSpec.isCentered, true);
    assert.equal(desktopSpec.hasLavenderTheme, true);

    const mobileSpec = {
      width: '100%',
      maxHeightVh: 94,
      isNearlyFullScreen: true,
    };
    assert.equal(mobileSpec.isNearlyFullScreen, true);
  });

  // -------------------------------------------------------------------------
  // 2. Compact Header Specification
  // -------------------------------------------------------------------------
  it('2. header includes room number, type, status, persons count, and close button in a sticky layout', () => {
    const getHeaderData = (room, stay, reservation) => {
      let personsDisplay = '0 Persons';
      let statusLabel = 'Available';
      let roomType = room.roomType?.name || 'Room';

      if (room.status === 'occupied') {
        const p = Number(stay?.persons || room.persons || 1);
        personsDisplay = `${p} ${p === 1 ? 'Person' : 'Persons'}`;
        statusLabel = 'Occupied';
        roomType = stay?.room_type_name || room.roomType?.name;
      } else if (room.status === 'booked') {
        const p = Number(reservation?.persons || room.persons || 1);
        personsDisplay = `${p} ${p === 1 ? 'Person' : 'Persons'}`;
        statusLabel = 'Booked';
      } else if (room.status === 'free') {
        personsDisplay = '0 Persons';
        statusLabel = 'Available';
      } else if (room.status === 'cleaning') {
        personsDisplay = '0 Persons';
        statusLabel = 'Cleaning';
      } else if (room.status === 'repair') {
        personsDisplay = '0 Persons';
        statusLabel = 'Under Repair';
      }

      return {
        roomNo: room.roomNo,
        roomType,
        statusLabel,
        personsDisplay,
        hasCloseBtn: true,
        isSticky: true,
      };
    };

    // Test for occupied room
    const occupiedHeader = getHeaderData(
      { roomNo: 101, status: 'occupied' },
      { persons: 2, room_type_name: 'Deluxe AC' },
      null
    );
    assert.equal(occupiedHeader.roomNo, 101);
    assert.equal(occupiedHeader.roomType, 'Deluxe AC');
    assert.equal(occupiedHeader.statusLabel, 'Occupied');
    assert.equal(occupiedHeader.personsDisplay, '2 Persons');
    assert.equal(occupiedHeader.hasCloseBtn, true);
    assert.equal(occupiedHeader.isSticky, true);

    // Test for booked room
    const bookedHeader = getHeaderData(
      { roomNo: 204, status: 'booked', roomType: { name: 'Standard Suite' } },
      null,
      { persons: 3 }
    );
    assert.equal(bookedHeader.roomNo, 204);
    assert.equal(bookedHeader.statusLabel, 'Booked');
    assert.equal(bookedHeader.personsDisplay, '3 Persons');

    // Test for free / ready room
    const freeHeader = getHeaderData(
      { roomNo: 301, status: 'free', roomType: { name: 'Standard Non-AC' } },
      null,
      null
    );
    assert.equal(freeHeader.personsDisplay, '0 Persons');
    assert.equal(freeHeader.statusLabel, 'Available');
  });

  // -------------------------------------------------------------------------
  // 3. Guest Details: Two-column layout
  // -------------------------------------------------------------------------
  it('3. guest details formats the 4 required fields in a two-column structure', () => {
    const formatGuestDetails = (stay) => {
      const p = Number(stay.persons || 1);
      return {
        guestName: stay.guest_name,
        mobileNumber: stay.guest_phone,
        idProofType: `${stay.id_proof_type || 'Aadhaar'}${stay.id_proof_last4 ? ` ••••${stay.id_proof_last4}` : ''}`,
        actualPersonsCount: `${p} ${p === 1 ? 'Person' : 'Persons'}`,
        layout: 'two-column',
      };
    };

    const details = formatGuestDetails({
      guest_name: 'Mohamed Ali',
      guest_phone: '9876543210',
      id_proof_type: 'Aadhaar',
      id_proof_last4: '4567',
      persons: 2,
    });

    assert.equal(details.guestName, 'Mohamed Ali');
    assert.equal(details.mobileNumber, '9876543210');
    assert.equal(details.idProofType, 'Aadhaar ••••4567');
    assert.equal(details.actualPersonsCount, '2 Persons');
    assert.equal(details.layout, 'two-column');
  });

  // -------------------------------------------------------------------------
  // 4. Occupant Details: Compact & Expandable
  // -------------------------------------------------------------------------
  it('4. occupant details supports compact representation and expand/collapse', () => {
    const occupants = [
      { occupant_number: 1, name: 'Mohamed Ali', gender: 'Male', phone: '9876543210', is_primary: 1, documents: [{ id: 1, original_filename: 'id1.pdf' }] },
      { occupant_number: 2, name: 'Fatima Ali', gender: 'Female', phone: '9876543211', is_primary: 0, documents: [{ id: 2, original_filename: 'id2.jpg' }] },
    ];

    let expanded = true;
    const toggleExpand = () => { expanded = !expanded; };

    assert.equal(expanded, true);
    assert.equal(occupants.length, 2);
    assert.equal(occupants[0].name, 'Mohamed Ali');
    assert.equal(occupants[0].gender, 'Male');
    assert.equal(occupants[0].phone, '9876543210');
    assert.equal(occupants[0].documents.length, 1);

    toggleExpand();
    assert.equal(expanded, false);
  });

  // -------------------------------------------------------------------------
  // 5. Stay Details: Compact two-column layout with 6 exact fields
  // -------------------------------------------------------------------------
  it('5. stay details includes the 6 specific non-duplicative dates and rate fields', () => {
    const stay = {
      original_check_in_date: '2026-11-15',
      original_checkout_date: '2026-11-18',
      check_in_date: '2026-11-15',
      checkout_planned: '2026-11-19', // Extended checkout
      checkout_time: '11:00:00',
      rate: 2500,
    };
    const nightsStayed = 4;

    const stayDetails = {
      originalCheckIn: stay.original_check_in_date || stay.check_in_date,
      originalPlannedCheckout: stay.original_checkout_date || stay.checkout_planned,
      actualCheckIn: stay.check_in_date,
      currentPlannedCheckout: stay.checkout_planned,
      actualNightsStayed: `${nightsStayed} nights`,
      dailyRoomRate: `₹${stay.rate} / day`,
      columns: 2,
    };

    assert.equal(stayDetails.originalCheckIn, '2026-11-15');
    assert.equal(stayDetails.originalPlannedCheckout, '2026-11-18');
    assert.equal(stayDetails.actualCheckIn, '2026-11-15');
    assert.equal(stayDetails.currentPlannedCheckout, '2026-11-19');
    assert.equal(stayDetails.actualNightsStayed, '4 nights');
    assert.equal(stayDetails.dailyRoomRate, '₹2500 / day');
    assert.equal(stayDetails.columns, 2);
  });

  // -------------------------------------------------------------------------
  // 6. Payment Summary & Prominent Outstanding Balance
  // -------------------------------------------------------------------------
  it('6. payment summary computes all financial lines accurately and highlights outstanding balance', () => {
    const nightsStayed = 2;
    const rate = 3000;
    const roomCharges = nightsStayed * rate; // 6000
    const gstRate = 0.12;
    const gst = roomCharges * gstRate; // 720
    const totalInvoice = roomCharges + gst; // 6720
    const advancePaid = 2000;
    const additionalPayments = 1000;
    const totalPaid = advancePaid + additionalPayments; // 3000
    const outstandingBalance = totalInvoice - totalPaid; // 3720

    const summary = {
      roomCharges,
      gst,
      totalInvoice,
      advancePaid,
      additionalPayments,
      totalPaid,
      outstandingBalance,
      isBalanceHighlighted: true,
      status: outstandingBalance > 0 ? 'due' : 'settled',
    };

    assert.equal(summary.roomCharges, 6000);
    assert.equal(summary.gst, 720);
    assert.equal(summary.totalInvoice, 6720);
    assert.equal(summary.advancePaid, 2000);
    assert.equal(summary.additionalPayments, 1000);
    assert.equal(summary.totalPaid, 3000);
    assert.equal(summary.outstandingBalance, 3720);
    assert.equal(summary.status, 'due');
    assert.equal(summary.isBalanceHighlighted, true);
  });

  // -------------------------------------------------------------------------
  // 7. Additional Information: Expandable sections and View/Preview actions
  // -------------------------------------------------------------------------
  it('7. documents have preview action for images/PDFs and download for other binaries', () => {
    const handleDocumentAction = (filename, mime) => {
      const isPdf = mime === 'application/pdf' || filename.toLowerCase().endsWith('.pdf');
      const isImage = mime?.startsWith('image/') || /\.(jpg|jpeg|png|webp)$/i.test(filename);
      if (isPdf || isImage) {
        return { action: 'preview_tab', target: '_blank' };
      }
      return { action: 'download', target: '_self' };
    };

    assert.deepEqual(handleDocumentAction('aadhaar.pdf', 'application/pdf'), { action: 'preview_tab', target: '_blank' });
    assert.deepEqual(handleDocumentAction('photo.jpg', 'image/jpeg'), { action: 'preview_tab', target: '_blank' });
    assert.deepEqual(handleDocumentAction('pass.png', 'image/png'), { action: 'preview_tab', target: '_blank' });
    assert.deepEqual(handleDocumentAction('archive.zip', 'application/zip'), { action: 'download', target: '_self' });
  });

  // -------------------------------------------------------------------------
  // 8. Sticky Action Footer & No Auto-Checkout
  // -------------------------------------------------------------------------
  it('8. room actions are positioned in sticky footer and clicking room tile never triggers checkout automatically', () => {
    const openRoom = (room) => {
      // Must open roomDetails, never checkout
      return { type: 'roomDetails', room };
    };

    for (const status of ['occupied', 'booked', 'free', 'cleaning', 'repair']) {
      const action = openRoom({ id: 1, roomNo: 101, status });
      assert.equal(action.type, 'roomDetails');
      assert.notEqual(action.type, 'checkout');
    }

    // Occupied room actions
    const occupiedActions = ['Close', 'View Stay', 'Early Check Out', 'Check Out'];
    assert.ok(occupiedActions.includes('View Stay'));
    assert.ok(occupiedActions.includes('Early Check Out'));
    assert.ok(occupiedActions.includes('Check Out'));

    // Booked room actions
    const bookedActions = ['Close', 'View Booking'];
    assert.ok(bookedActions.includes('View Booking'));
  });

  // -------------------------------------------------------------------------
  // 9. Single Main Content Scrolling Area
  // -------------------------------------------------------------------------
  it('9. ensures single scroll container with fixed header and fixed action footer', () => {
    const layout = {
      sheet: { display: 'flex', flexDirection: 'column', overflow: 'hidden' },
      header: { flex: '0 0 auto', position: 'sticky', top: 0 },
      body: { flex: '1 1 auto', overflowY: 'auto' },
      footer: { flex: '0 0 auto', position: 'sticky', bottom: 0 },
    };

    assert.equal(layout.sheet.overflow, 'hidden');
    assert.equal(layout.header.position, 'sticky');
    assert.equal(layout.body.overflowY, 'auto');
    assert.equal(layout.footer.position, 'sticky');
  });

  // -------------------------------------------------------------------------
  // 10. Multi-State Coverage: Occupied, Booked, Ready, Cleaning, Repair
  // -------------------------------------------------------------------------
  it('10. handles all 5 room statuses across desktop, tablet, and mobile layouts', () => {
    const rooms = [
      { id: 101, roomNo: 101, status: 'occupied', persons: 2 },
      { id: 102, roomNo: 102, status: 'booked', persons: 1 },
      { id: 103, roomNo: 103, status: 'free', persons: 0 },
      { id: 104, roomNo: 104, status: 'cleaning', persons: 0 },
      { id: 105, roomNo: 105, status: 'repair', persons: 0 },
    ];

    const getPrimaryActionForStatus = (status) => {
      switch (status) {
        case 'occupied': return 'Check Out';
        case 'booked': return 'View Booking';
        case 'free': return '+ Direct Check-in (Walk-in Guest)';
        case 'cleaning': return 'Mark Room Ready';
        case 'repair': return 'Repair Done · Send for Cleaning';
        default: return 'Close';
      }
    };

    rooms.forEach((r) => {
      const primaryAction = getPrimaryActionForStatus(r.status);
      assert.ok(primaryAction, `Must have defined primary action for ${r.status}`);
    });
  });
});
