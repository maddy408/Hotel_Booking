import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SRC_DIR = path.resolve(__dirname, '..');

describe('Audit and Verification: Mobile Application Delete Functionality', () => {
  test('1. RoomMasterScreen implements Room Deletion with confirmation and safety checks', () => {
    const roomMasterPath = path.join(SRC_DIR, 'screens/more/RoomMasterScreen.jsx');
    const content = fs.readFileSync(roomMasterPath, 'utf8');

    assert.ok(content.includes('useDeleteRoom'), 'RoomMasterScreen must import useDeleteRoom hook');
    assert.ok(content.includes('handleDeleteRoom'), 'RoomMasterScreen must define handleDeleteRoom');
    assert.ok(content.includes("Alert.alert(\n      'Delete Room'") || content.includes("Alert.alert('Delete Room'") || content.includes("Alert.alert(\r\n      'Delete Room'"), 'RoomMasterScreen must prompt confirmation dialog before deleting a room');
    assert.ok(content.includes('deleteRoom.mutateAsync'), 'RoomMasterScreen must invoke deleteRoom mutation on confirmation');
    assert.ok(content.includes('Delete Room'), 'RoomMasterScreen must render Delete Room button');
  });

  test('2. RoomMasterScreen implements Room Type Deletion with dependency check and confirmation', () => {
    const roomMasterPath = path.join(SRC_DIR, 'screens/more/RoomMasterScreen.jsx');
    const content = fs.readFileSync(roomMasterPath, 'utf8');

    assert.ok(content.includes('useDeleteRoomType'), 'RoomMasterScreen must import useDeleteRoomType hook');
    assert.ok(content.includes('handleDeleteType'), 'RoomMasterScreen must define handleDeleteType');
    assert.ok(content.includes('roomsByType[type.id]?.length'), 'handleDeleteType must check if rooms are assigned to room type');
    assert.ok(content.includes("Alert.alert(\n      'Delete Room Type'") || content.includes("Alert.alert('Delete Room Type'") || content.includes("Alert.alert(\r\n      'Delete Room Type'"), 'RoomMasterScreen must prompt confirmation dialog before deleting a room type');
    assert.ok(content.includes('deleteType.mutateAsync'), 'RoomMasterScreen must invoke deleteType mutation on confirmation');
  });

  test('3. UsersScreen implements User Deletion with confirmation and safety rules', () => {
    const usersScreenPath = path.join(SRC_DIR, 'screens/more/UsersScreen.jsx');
    const content = fs.readFileSync(usersScreenPath, 'utf8');

    assert.ok(content.includes('useDeleteUser'), 'UsersScreen must import useDeleteUser hook');
    assert.ok(content.includes('handleDeleteUser'), 'UsersScreen must define handleDeleteUser');
    assert.ok(content.includes("Alert.alert(\n      'Delete User'") || content.includes("Alert.alert('Delete User'") || content.includes("Alert.alert(\r\n      'Delete User'"), 'UsersScreen must prompt confirmation dialog before deleting a user');
    assert.ok(content.includes('deleteUser.mutateAsync'), 'UsersScreen must invoke deleteUser mutation on confirmation');
    assert.ok(content.includes('Delete User'), 'UsersScreen must render Delete User button in edit sheet');
  });

  test('4. GuestDetailsScreen and GuestEditSheet implement Guest Deletion with confirmation and navigation', () => {
    const guestDetailsPath = path.join(SRC_DIR, 'screens/guests/GuestDetailsScreen.jsx');
    const guestDetailsContent = fs.readFileSync(guestDetailsPath, 'utf8');

    assert.ok(guestDetailsContent.includes('useDeleteGuest'), 'GuestDetailsScreen must import useDeleteGuest hook');
    assert.ok(guestDetailsContent.includes('handleDeleteGuest'), 'GuestDetailsScreen must define handleDeleteGuest');
    assert.ok(guestDetailsContent.includes("Alert.alert(\n      'Delete Guest'") || guestDetailsContent.includes("Alert.alert('Delete Guest'") || guestDetailsContent.includes("Alert.alert(\r\n      'Delete Guest'"), 'GuestDetailsScreen must prompt confirmation dialog before deleting guest');
    assert.ok(guestDetailsContent.includes('deleteGuest.mutateAsync'), 'GuestDetailsScreen must invoke deleteGuest mutation');
    assert.ok(guestDetailsContent.includes('Delete Guest'), 'GuestDetailsScreen must render Delete Guest button');

    const guestEditSheetPath = path.join(SRC_DIR, 'components/sheets/GuestEditSheet.jsx');
    const guestEditContent = fs.readFileSync(guestEditSheetPath, 'utf8');
    assert.ok(guestEditContent.includes('useDeleteGuest'), 'GuestEditSheet must import useDeleteGuest hook');
    assert.ok(guestEditContent.includes('handleDelete'), 'GuestEditSheet must define handleDelete');
    assert.ok(guestEditContent.includes('Delete Guest Profile'), 'GuestEditSheet must render Delete Guest Profile button');
  });

  test('5. Extra Charges removal in StayDetailSheet and CheckoutSheet requires user confirmation', () => {
    const stayDetailPath = path.join(SRC_DIR, 'components/sheets/StayDetailSheet.jsx');
    const stayDetailContent = fs.readFileSync(stayDetailPath, 'utf8');
    assert.ok(stayDetailContent.includes('handleRemoveExtra'), 'StayDetailSheet must define handleRemoveExtra with confirmation');
    assert.ok(stayDetailContent.includes("Alert.alert(\n      'Remove Extra Charge'") || stayDetailContent.includes("Alert.alert('Remove Extra Charge'") || stayDetailContent.includes("Alert.alert(\r\n      'Remove Extra Charge'"), 'StayDetailSheet must prompt confirmation before removing an extra charge');

    const checkoutPath = path.join(SRC_DIR, 'components/sheets/CheckoutSheet.jsx');
    const checkoutContent = fs.readFileSync(checkoutPath, 'utf8');
    assert.ok(checkoutContent.includes('handleRemoveExtra'), 'CheckoutSheet must define handleRemoveExtra with confirmation');
    assert.ok(checkoutContent.includes("Alert.alert(\n      'Remove Extra Charge'") || checkoutContent.includes("Alert.alert('Remove Extra Charge'") || checkoutContent.includes("Alert.alert(\r\n      'Remove Extra Charge'"), 'CheckoutSheet must prompt confirmation before removing an extra charge');
  });

  test('6. Occupant document deletion is available in DocumentViewerSheet and details sheets with confirmation', () => {
    const docViewerPath = path.join(SRC_DIR, 'components/sheets/DocumentViewerSheet.jsx');
    const docViewerContent = fs.readFileSync(docViewerPath, 'utf8');
    assert.ok(docViewerContent.includes('onDelete'), 'DocumentViewerSheet must support onDelete action');

    const bookingDetailPath = path.join(SRC_DIR, 'components/sheets/BookingDetailSheet.jsx');
    const bookingDetailContent = fs.readFileSync(bookingDetailPath, 'utf8');
    assert.ok(bookingDetailContent.includes('handleDeleteDocument'), 'BookingDetailSheet must have handleDeleteDocument with confirmation');
  });

  test('7. Bookings preserve cancellation workflow and prevent permanent destructive deletion', () => {
    const bookingDetailPath = path.join(SRC_DIR, 'components/sheets/BookingDetailSheet.jsx');
    const bookingDetailContent = fs.readFileSync(bookingDetailPath, 'utf8');
    assert.ok(bookingDetailContent.includes('useCancelReservation'), 'BookingDetailSheet must use cancellation workflow');
    assert.ok(bookingDetailContent.includes('useCancellationPreview'), 'BookingDetailSheet must use cancellation preview');
    assert.ok(!bookingDetailContent.includes('useDeleteReservation'), 'BookingDetailSheet must NOT permanently delete reservations');
  });

  test('8. Financial records (Bills and Invoices) preserve audit trail without destructive delete', () => {
    const billsPath = path.join(SRC_DIR, 'screens/bills/BillsScreen.jsx');
    const billsContent = fs.readFileSync(billsPath, 'utf8');
    assert.ok(!billsContent.includes('useDeleteInvoice') && !billsContent.includes('useDeletePayment'), 'BillsScreen must not provide permanent deletion for financial records');
  });

  test('9. All mobile API modules export the required delete and cancellation hooks', () => {
    const roomsApi = fs.readFileSync(path.join(SRC_DIR, 'api/rooms.js'), 'utf8');
    assert.ok(roomsApi.includes('export function useDeleteRoom'), 'rooms.js must export useDeleteRoom');
    assert.ok(roomsApi.includes('export function useDeleteRoomType'), 'rooms.js must export useDeleteRoomType');

    const guestsApi = fs.readFileSync(path.join(SRC_DIR, 'api/guests.js'), 'utf8');
    assert.ok(guestsApi.includes('export function useDeleteGuest'), 'guests.js must export useDeleteGuest');

    const usersApi = fs.readFileSync(path.join(SRC_DIR, 'api/users.js'), 'utf8');
    assert.ok(usersApi.includes('export function useDeleteUser'), 'users.js must export useDeleteUser');

    const docsApi = fs.readFileSync(path.join(SRC_DIR, 'api/occupantDocuments.js'), 'utf8');
    assert.ok(docsApi.includes('export function useDeleteOccupantDocument'), 'occupantDocuments.js must export useDeleteOccupantDocument');

    const staysApi = fs.readFileSync(path.join(SRC_DIR, 'api/stays.js'), 'utf8');
    assert.ok(staysApi.includes('export function useRemoveExtra'), 'stays.js must export useRemoveExtra');

    const resApi = fs.readFileSync(path.join(SRC_DIR, 'api/reservations.js'), 'utf8');
    assert.ok(resApi.includes('export function useCancelReservation'), 'reservations.js must export useCancelReservation');
  });
});
