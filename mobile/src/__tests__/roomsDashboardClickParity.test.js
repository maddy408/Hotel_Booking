import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.resolve(__dirname, '..');

describe('Rooms Dashboard Click Actions - Web Parity Verification', () => {
  const roomsScreenPath = path.join(srcDir, 'screens', 'rooms', 'RoomsScreen.jsx');
  const roomTilePath = path.join(srcDir, 'components', 'RoomTile.jsx');
  const checkInSheetPath = path.join(srcDir, 'components', 'sheets', 'CheckInSheet.jsx');
  const newBookingSheetPath = path.join(srcDir, 'components', 'sheets', 'NewBookingSheet.jsx');
  const roomDetailsSheetPath = path.join(srcDir, 'components', 'sheets', 'RoomDetailsSheet.jsx');
  const directPickerPath = path.join(srcDir, 'components', 'sheets', 'DirectCheckInPicker.jsx');
  const sheetPath = path.join(srcDir, 'components', 'Sheet.jsx');
  const screenPath = path.join(srcDir, 'components', 'ui', 'Screen.jsx');

  it('1. Direct Check-in button connects to direct check-in picker and transitions to check-in sheet', () => {
    const roomsScreenContent = fs.readFileSync(roomsScreenPath, 'utf8');

    // Verify Direct Check-in button has onPress handler setting sheet to 'direct'
    assert.ok(
      /<Button[^>]*\+ Direct Check-in[^>]*onPress=\{[^}]*setSheet\(\{\s*type:\s*['"]direct['"]\s*\}\)/s.test(roomsScreenContent) ||
      /<Button[^>]*onPress=\{[^}]*setSheet\(\{\s*type:\s*['"]direct['"]\s*\}\)[^>]*\+ Direct Check-in/s.test(roomsScreenContent),
      'Direct Check-in button must trigger setSheet({ type: "direct" })'
    );

    // Verify DirectCheckInPicker renders and onPick transitions to CheckInSheet
    assert.ok(
      roomsScreenContent.includes("sheet?.type === 'direct'"),
      'RoomsScreen must render DirectCheckInPicker for direct check-in'
    );
    assert.ok(
      roomsScreenContent.includes("onPick={(room) => setSheet({ type: 'checkin', room })}"),
      'Picking a room must transition to check-in sheet with selected room'
    );
    assert.ok(
      roomsScreenContent.includes("<CheckInSheet room={sheet.room}"),
      'RoomsScreen must mount CheckInSheet with selected room'
    );

    // Verify DirectCheckInPicker lists free rooms with rate and availability
    const pickerContent = fs.readFileSync(directPickerPath, 'utf8');
    assert.ok(pickerContent.includes("r.status === 'free'"), 'Picker must filter for free rooms');
    assert.ok(pickerContent.includes("onPick(r)"), 'Tapping a room chip must call onPick');
  });

  it('2. Pre-booking button opens New Booking sheet preserving dates, guests, availability and pricing', () => {
    const roomsScreenContent = fs.readFileSync(roomsScreenPath, 'utf8');

    // Verify Pre-booking button has onPress handler setting sheet to 'newBooking'
    assert.ok(
      /<Button[^>]*\+ Pre Booking[^>]*onPress=\{[^}]*setSheet\(\{\s*type:\s*['"]newBooking['"]\s*\}\)/s.test(roomsScreenContent) ||
      /<Button[^>]*onPress=\{[^}]*setSheet\(\{\s*type:\s*['"]newBooking['"]\s*\}\)[^>]*\+ Pre Booking/s.test(roomsScreenContent),
      'Pre-booking button must trigger setSheet({ type: "newBooking" })'
    );

    assert.ok(
      roomsScreenContent.includes("sheet?.type === 'newBooking'"),
      'RoomsScreen must handle newBooking sheet type'
    );

    // Verify NewBookingSheet includes availability checking, room picking, and price calculation
    const newBookingContent = fs.readFileSync(newBookingSheetPath, 'utf8');
    assert.ok(newBookingContent.includes('useFreeRooms'), 'NewBookingSheet must query free rooms availability');
    assert.ok(newBookingContent.includes('useGuestLookup'), 'NewBookingSheet must support guest lookup');
    assert.ok(newBookingContent.includes('estimateGstRate'), 'NewBookingSheet must compute GST pricing');
    assert.ok(newBookingContent.includes('useCreateReservation'), 'NewBookingSheet must integrate with create reservation API');
  });

  it('3. Tap occupied room tile opens correct Room Details with guest, stay, bill, and actions', () => {
    const roomsScreenContent = fs.readFileSync(roomsScreenPath, 'utf8');
    const detailsContent = fs.readFileSync(roomDetailsSheetPath, 'utf8');

    // Verify RoomTile receives onPress setting roomDetails
    assert.ok(
      roomsScreenContent.includes("onPress={() => setSheet({ type: 'roomDetails', room: r })}"),
      'RoomTile onPress must trigger RoomDetailsSheet with tapped room'
    );

    // Verify RoomDetailsSheet handles occupied status
    assert.ok(detailsContent.includes("room.status === 'occupied'"), 'Must handle occupied room status');
    assert.ok(detailsContent.includes('useStay(stayId)'), 'Must fetch stay details');
    assert.ok(detailsContent.includes('useStayBill(stayId)'), 'Must fetch billing information');
    assert.ok(detailsContent.includes('View Stay'), 'Must offer View Stay action');
    assert.ok(detailsContent.includes('Invoice'), 'Must offer Invoice action');
    assert.ok(detailsContent.includes('Check Out'), 'Must offer Check Out action');
    assert.ok(detailsContent.includes('Early Out'), 'Must offer Early Out action');
  });

  it('4. Tap vacant room tile opens correct Room Details with room type, tariff, capacity, and direct check-in / pre-book actions', () => {
    const detailsContent = fs.readFileSync(roomDetailsSheetPath, 'utf8');
    const roomsScreenContent = fs.readFileSync(roomsScreenPath, 'utf8');

    // Verify RoomDetailsSheet handles free/vacant status
    assert.ok(detailsContent.includes("room.status === 'free'"), 'Must handle free room status');
    assert.ok(detailsContent.includes('Room Information'), 'Must display room info card');
    assert.ok(detailsContent.includes('+ Pre-Book'), 'Must offer + Pre-Book action');
    assert.ok(detailsContent.includes('+ Direct Check-in'), 'Must offer + Direct Check-in action');

    // Verify actions in RoomsScreen connect correctly
    assert.ok(
      roomsScreenContent.includes("onCheckIn={(roomOrReservation) =>"),
      'RoomsScreen must handle onCheckIn from RoomDetailsSheet'
    );
    assert.ok(
      roomsScreenContent.includes("onPreBook={(room) => setSheet({ type: 'newBooking', editReservation: { room_id: room.id } })}"),
      'RoomsScreen must preselect room on onPreBook'
    );
  });

  it('5. Tap cleaning or maintenance room tile opens correct Room Details with housekeeping actions', () => {
    const detailsContent = fs.readFileSync(roomDetailsSheetPath, 'utf8');

    // Verify cleaning status handling
    assert.ok(detailsContent.includes("room.status === 'cleaning'"), 'Must handle cleaning room status');
    assert.ok(detailsContent.includes('Mark Room Ready'), 'Must offer Mark Room Ready action');
    assert.ok(detailsContent.includes('Send Room for Repair'), 'Must offer Send for Repair action');

    // Verify repair status handling
    assert.ok(detailsContent.includes("room.status === 'repair'"), 'Must handle repair room status');
    assert.ok(detailsContent.includes('Repair Done · Send for Cleaning'), 'Must offer repair completion action');
    assert.ok(detailsContent.includes('Reported Problem'), 'Must display reported maintenance problem');
  });

  it('6. Tap conflict badge opens conflict reservation separately and does not trigger room tile parent action', () => {
    const tileContent = fs.readFileSync(roomTilePath, 'utf8');
    const roomsScreenContent = fs.readFileSync(roomsScreenPath, 'utf8');

    // Verify conflict Pressable is separated from tileMain
    assert.ok(
      tileContent.includes("styles.conflict"),
      'RoomTile must render distinct conflict Pressable'
    );
    assert.ok(
      tileContent.includes("onPress={() => onOpenBooking?.(room.pendingBooking.id)}"),
      'Conflict Pressable must invoke onOpenBooking with reservation ID'
    );

    // Verify tileMain has flex: 1 and pointerEvents none on children
    assert.ok(
      tileContent.includes("flex: 1"),
      'tileMain must have flex: 1 to fill full touchable area of tile'
    );
    assert.ok(
      tileContent.includes('pointerEvents="none"') && tileContent.includes('styles.statusChip'),
      'statusChip must have pointerEvents="none" so taps register on tileMain'
    );

    // Verify conflict action in RoomsScreen opens booking sheet
    assert.ok(
      roomsScreenContent.includes("onOpenBooking={(bookingId) => setSheet({ type: 'booking', reservationId: bookingId })}"),
      'RoomsScreen must open booking sheet on conflict tap'
    );
    assert.ok(
      roomsScreenContent.includes("<BookingDetailSheet"),
      'RoomsScreen must render BookingDetailSheet for conflict details'
    );
  });

  it('7. Screen and Sheet overlays avoid touch trapping and ensure proper layering on Android', () => {
    const sheetContent = fs.readFileSync(sheetPath, 'utf8');
    const screenContent = fs.readFileSync(screenPath, 'utf8');

    // OverlayHost must have high elevation/zIndex to float above native scrollviews on Android
    assert.ok(
      screenContent.includes("elevation: 9999"),
      'OverlayHost must have high elevation on Android'
    );
    assert.ok(
      screenContent.includes("zIndex: 9999"),
      'OverlayHost must have high zIndex'
    );

    // sheetWrap must fill screen with absolute fill to anchor bottom sheets reliably on Android
    assert.ok(
      sheetContent.includes("...StyleSheet.absoluteFillObject"),
      'sheetWrap must have absoluteFillObject'
    );
    assert.ok(
      sheetContent.includes("justifyContent: 'flex-end'"),
      'sheetWrap must align to bottom'
    );
  });
});
