import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.resolve(__dirname, '..');

describe('Room Master Room Details Bottom Sheet Verification', () => {
  const roomMasterPath = path.join(srcDir, 'screens', 'more', 'RoomMasterScreen.jsx');
  const sheetPath = path.join(srcDir, 'components', 'Sheet.jsx');
  const rmContent = fs.readFileSync(roomMasterPath, 'utf8');
  const sheetContent = fs.readFileSync(sheetPath, 'utf8');

  it('1. Replaces centered modal with slide-up bottom sheet respecting safe areas and rounded top corners', () => {
    // Sheet.jsx supports bottomSheet mode
    assert.ok(
      sheetContent.includes('if (bottomSheet)'),
      'Sheet.jsx must have dedicated bottomSheet presentation branch'
    );
    assert.ok(
      sheetContent.includes('animationType="slide"'),
      'Bottom sheet must slide up from the bottom'
    );
    assert.ok(
      sheetContent.includes("edges={['bottom', 'left', 'right']}"),
      'Bottom sheet must respect Android safe areas and navigation bar insets'
    );
    assert.ok(
      sheetContent.includes('borderTopLeftRadius') && sheetContent.includes('borderTopRightRadius'),
      'Bottom sheet card must have rounded top corners'
    );
    assert.ok(
      sheetContent.includes('maxHeight: \'90%\'') || sheetContent.includes('maxHeight: "90%"'),
      'Bottom sheet must set responsive maximum height'
    );
    assert.ok(
      sheetContent.includes('handleBar'),
      'Bottom sheet must include handle bar indicator'
    );

    // RoomMasterScreen invokes Sheet with bottomSheet
    assert.ok(
      rmContent.includes('<Sheet bottomSheet') || rmContent.includes('<Sheet\n            bottomSheet'),
      'RoomMasterScreen must invoke Sheet with bottomSheet prop'
    );
    assert.ok(
      rmContent.includes('scroll={false}'),
      'RoomMasterScreen bottomSheet must use scroll={false} to keep SheetHeader fixed outside ScrollView'
    );
  });

  it('2. Keeps Room Details Header visible while scrolling with Room number, Type, Floor, and Close button', () => {
    // SheetHeader renders outside ScrollView
    assert.ok(
      rmContent.includes('<SheetHeader'),
      'RoomMasterScreen must render SheetHeader'
    );
    assert.ok(
      rmContent.includes('title={isEditingRoom ? `Edit Room ${currentEditRoom.roomNo}` : `Room ${currentEditRoom.roomNo}`}') ||
        rmContent.includes('Room ${currentEditRoom.roomNo}'),
      'Header must display Room number (e.g. Room 510)'
    );
    assert.ok(
      rmContent.includes('currentEditRoom.roomType') && rmContent.includes('currentEditRoom.floor'),
      'Header must display Room type and Floor number'
    );
    assert.ok(
      rmContent.includes('onClose={() => setEditRoom(null)}') || rmContent.includes('onClose={() => { setEditRoom(null)'),
      'Header must provide an accessible Close button'
    );

    // ScrollView wraps body content, keeping header pinned
    assert.ok(
      rmContent.indexOf('<SheetHeader') < rmContent.indexOf('<ScrollView'),
      'SheetHeader must be rendered before ScrollView so it remains visible while scrolling'
    );
  });

  it('3. Displays Current Status clearly using existing status colours and indicator dot', () => {
    assert.ok(
      rmContent.includes('getRoomStatusDetails'),
      'RoomMasterScreen must define getRoomStatusDetails'
    );
    assert.ok(
      rmContent.includes('statusDot'),
      'RoomMasterScreen must render a statusDot indicator'
    );
    assert.ok(
      rmContent.includes('Current Status:'),
      'RoomMasterScreen must display Current Status label'
    );
    assert.ok(
      rmContent.includes('statusColors.repair') &&
        rmContent.includes('statusColors.cleaning') &&
        rmContent.includes('statusColors.occupied') &&
        rmContent.includes('statusColors.booked') &&
        rmContent.includes('statusColors.free'),
      'getRoomStatusDetails must use all statusColors definitions'
    );
  });

  it('4. Arranges room actions vertically with status-dependent conditional rendering and destructive separation', () => {
    // Vertical container
    assert.ok(
      rmContent.includes('roomActionsList: {') && rmContent.includes('gap: 10'),
      'Room actions must be arranged vertically with consistent spacing'
    );

    // Mark Under Repair condition (hidden if already under repair)
    assert.ok(
      rmContent.includes('canMarkRepair &&') && rmContent.includes('Mark Under Repair'),
      'Mark Under Repair must be conditionally rendered based on room status'
    );

    // Mark Ready condition (hidden if already ready/clean)
    assert.ok(
      rmContent.includes('canMarkReady &&') && rmContent.includes('Mark Ready (Clean)'),
      'Mark Ready (Clean) must be conditionally rendered based on room status'
    );

    // Edit Room action
    assert.ok(
      rmContent.includes('Edit Room') && rmContent.includes('startEditingRoom'),
      'Edit Room action must be present and trigger startEditingRoom'
    );

    // Delete Room condition (hidden if occupied or booked)
    assert.ok(
      rmContent.includes('canDeleteRoom &&') && rmContent.includes('Delete Room'),
      'Delete Room must be conditionally rendered based on occupied/booked business rules'
    );

    // Destructive separation
    assert.ok(
      rmContent.includes('destructiveActionWrap'),
      'Delete Room must be wrapped in destructiveActionWrap for visual separation'
    );

    // Close button
    assert.ok(
      rmContent.includes('title="Close"'),
      'RoomMasterScreen must include explicit Close button in action list'
    );
  });

  it('5. Implements Edit Room Form with updateRoom mutation and field validation', () => {
    assert.ok(
      rmContent.includes('useUpdateRoom'),
      'RoomMasterScreen must use useUpdateRoom mutation'
    );
    assert.ok(
      rmContent.includes('updateRoom.mutateAsync'),
      'RoomMasterScreen must invoke updateRoom.mutateAsync on form submit'
    );
    assert.ok(
      rmContent.includes('startEditingRoom') && rmContent.includes('handleSaveRoom'),
      'RoomMasterScreen must implement startEditingRoom and handleSaveRoom handlers'
    );
    assert.ok(
      rmContent.includes('editRoomForm') && rmContent.includes('editRoomErrors'),
      'RoomMasterScreen must manage form state and validation errors'
    );
    assert.ok(
      rmContent.includes('Save Room Details') && rmContent.includes('Cancel'),
      'Edit Room view must offer Save Room Details and Cancel buttons'
    );
  });

  it('6. Responsive touch areas and smooth vertical scrolling on small Android screens', () => {
    assert.ok(
      rmContent.includes('keyboardShouldPersistTaps="handled"'),
      'ScrollView must configure keyboardShouldPersistTaps'
    );
    assert.ok(
      rmContent.includes('roomSheetScrollContent: {') && rmContent.includes('paddingBottom: 28'),
      'roomSheetScrollContent must provide adequate bottom padding'
    );
    assert.ok(
      sheetContent.includes('bottomSheetScrollContent: {') && sheetContent.includes('paddingBottom: 24'),
      'bottomSheetScrollContent must provide adequate bottom padding'
    );
  });
});
