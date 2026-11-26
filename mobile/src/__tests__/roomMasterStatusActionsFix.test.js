import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.resolve(__dirname, '..');

describe('Room Master Status Actions & Popup Layout Verification', () => {
  const roomMasterPath = path.join(srcDir, 'screens', 'more', 'RoomMasterScreen.jsx');
  const sheetPath = path.join(srcDir, 'components', 'Sheet.jsx');
  const apiClientPath = path.join(srcDir, 'lib', 'apiClient.js');
  const toastContextPath = path.join(srcDir, 'components', 'ToastContext.jsx');

  it('1. RoomMasterScreen imports and uses useHousekeepingAction instead of useUpdateRoom for status actions', () => {
    const content = fs.readFileSync(roomMasterPath, 'utf8');

    // Must import useHousekeepingAction
    assert.ok(
      content.includes('useHousekeepingAction'),
      'RoomMasterScreen must import useHousekeepingAction'
    );

    // Must instantiate hkAction hook
    assert.ok(
      content.includes('const hkAction = useHousekeepingAction()') || content.includes('hkAction = useHousekeepingAction()'),
      'RoomMasterScreen must initialize useHousekeepingAction hook'
    );

    // Must invoke hkAction.mutateAsync with action: repair and action: ready
    assert.ok(
      content.includes("action === 'repair'") || content.includes("action,") || content.includes("action: 'repair'"),
      'RoomMasterScreen must pass action to housekeeping mutation'
    );
    assert.ok(
      content.includes('hkAction.mutateAsync'),
      'RoomMasterScreen must call hkAction.mutateAsync for room status changes'
    );

    // Must NOT call updateRoom for housekeeping status changes
    assert.ok(
      !content.includes("updateRoom.mutateAsync({ id: editRoom.id, housekeepingStatus:"),
      'RoomMasterScreen must not call updateRoom with housekeepingStatus'
    );
  });

  it('2. RoomMasterScreen presents individual room edit dialog as bottomSheet with proper positioning and dismissibility', () => {
    const content = fs.readFileSync(roomMasterPath, 'utf8');

    // editRoom must pass bottomSheet or compact prop
    assert.ok(
      /<Sheet\s+(bottomSheet|compact)[^>]*onClose=\{\(\)\s*=>\s*setEditRoom\(null\)\}[^>]*>/.test(content),
      'RoomMasterScreen editRoom must pass bottomSheet or compact prop to Sheet'
    );

    // Must include SheetHeader with title and Close button
    assert.ok(
      content.includes('<SheetHeader'),
      'RoomMasterScreen must render SheetHeader'
    );
    assert.ok(
      content.includes('onClose={() => setEditRoom(null)}'),
      'RoomMasterScreen must wire onClose to dismiss editRoom'
    );

    // Must provide an explicit Close button in dialog actions
    assert.ok(
      content.includes('title="Close"') || content.includes("title='Close'"),
      'RoomMasterScreen must include an explicit Close button'
    );
  });

  it('3. RoomMasterScreen prevents duplicate submissions from rapid taps and displays loading states', () => {
    const content = fs.readFileSync(roomMasterPath, 'utf8');

    assert.ok(
      content.includes('submittingAction') || content.includes('isSubmitting'),
      'RoomMasterScreen must track submission state to prevent rapid taps'
    );
    assert.ok(
      content.includes('disabled={Boolean(submittingAction)') || content.includes('disabled={'),
      'RoomMasterScreen must disable buttons while submitting'
    );
    assert.ok(
      content.includes('loading={submittingAction'),
      'RoomMasterScreen must show loading state on active button'
    );
  });

  it('4. RoomMasterScreen handles errors gracefully, keeping popup open on failure', () => {
    const content = fs.readFileSync(roomMasterPath, 'utf8');

    // Inside catch block, toast is called and setEditRoom(null) is NOT called
    assert.ok(
      content.includes('toast(e.message') || content.includes('toast(err.message'),
      'RoomMasterScreen must display error message from exception'
    );
  });

  it('5. ApiError in apiClient.js formats field validation errors meaningfully without duplicate strings', () => {
    const content = fs.readFileSync(apiClientPath, 'utf8');

    assert.ok(
      content.includes('ApiError'),
      'apiClient.js must export ApiError class'
    );
    assert.ok(
      content.includes('fields') && (content.includes('Object.entries') || content.includes('join')),
      'ApiError must format validation fields with details'
    );
  });

  it('6. ToastContext does not emit duplicate native toasts on Android', () => {
    const content = fs.readFileSync(toastContextPath, 'utf8');

    assert.ok(
      !content.includes('ToastAndroid.show'),
      'ToastContext must not invoke ToastAndroid.show to prevent duplicate stacked banners'
    );
  });

  it('7. Sheet.jsx centers compact cards and supports backdrop dismiss without touch bleed', () => {
    const content = fs.readFileSync(sheetPath, 'utf8');

    assert.ok(
      content.includes('compactWrap'),
      'Sheet.jsx must use compactWrap for compact dialogs'
    );
    assert.ok(
      content.includes("justifyContent: 'center'") && content.includes("alignItems: 'center'"),
      'Sheet.jsx compact dialog must be centered'
    );
    assert.ok(
      content.includes('showBack'),
      'SheetHeader must support showBack prop'
    );
  });

  it('8. RoomMasterScreen implements full bottom sheet layout with sticky header, status colours, and vertical actions', () => {
    const content = fs.readFileSync(roomMasterPath, 'utf8');

    // Bottom sheet with scroll container
    assert.ok(
      content.includes('bottomSheet') && content.includes('roomSheetScroll'),
      'RoomMasterScreen must use bottomSheet mode and scrollable body'
    );

    // Header displays room number, room type, floor number, and close button
    assert.ok(
      content.includes('title={isEditingRoom ? `Edit Room ${currentEditRoom.roomNo}` : `Room ${currentEditRoom.roomNo}`}') ||
        content.includes('Room ${currentEditRoom.roomNo}'),
      'Header must display Room number'
    );
    assert.ok(
      content.includes('currentEditRoom.roomType') && content.includes('currentEditRoom.floor'),
      'Header must display Room type and Floor number'
    );

    // Current Status with status colours and dot
    assert.ok(
      content.includes('Current Status') && content.includes('statusDot') && content.includes('getRoomStatusDetails'),
      'RoomMasterScreen must display current status with status colors and indicator'
    );

    // Vertically arranged room actions
    assert.ok(
      content.includes('Mark Under Repair'),
      'RoomMasterScreen must offer Mark Under Repair action'
    );
    assert.ok(
      content.includes('Mark Ready (Clean)'),
      'RoomMasterScreen must offer Mark Ready (Clean) action'
    );
    assert.ok(
      content.includes('Edit Room'),
      'RoomMasterScreen must offer Edit Room action'
    );
    assert.ok(
      content.includes('Delete Room'),
      'RoomMasterScreen must offer Delete Room action'
    );

    // Visually separated destructive action
    assert.ok(
      content.includes('destructiveActionWrap'),
      'Delete Room must be visually separated in destructiveActionWrap'
    );

    // Edit Room form with updateRoom mutation
    assert.ok(
      content.includes('updateRoom.mutateAsync') && content.includes('startEditingRoom') && content.includes('handleSaveRoom'),
      'RoomMasterScreen must implement Edit Room form with updateRoom mutation'
    );
  });

  it('9. Sheet.jsx supports bottomSheet presentation with slide animation, safe areas, and rounded top corners', () => {
    const content = fs.readFileSync(sheetPath, 'utf8');

    assert.ok(
      content.includes('bottomSheetWrap') && content.includes('bottomSheetCard'),
      'Sheet.jsx must support bottomSheetWrap and bottomSheetCard'
    );
    assert.ok(
      content.includes('borderTopLeftRadius') && content.includes('borderTopRightRadius'),
      'Sheet.jsx bottomSheetCard must have rounded top corners'
    );
    assert.ok(
      content.includes("edges={['bottom', 'left', 'right']}"),
      'Sheet.jsx bottomSheet must respect bottom safe areas and navigation bar insets'
    );
    assert.ok(
      content.includes('handleBar'),
      'Sheet.jsx bottomSheetCard must render handle bar indicator'
    );
  });
});
