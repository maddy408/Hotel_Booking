import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.resolve(__dirname, '..');

describe('Improvement 1: Search Input & Keyboard Behavior Verification', () => {
  const searchInputPath = path.join(srcDir, 'components', 'ui', 'SearchInput.jsx');
  const debouncePath = path.join(srcDir, 'lib', 'useDebounce.js');
  const guestsScreenPath = path.join(srcDir, 'screens', 'guests', 'GuestsScreen.jsx');
  const dailyOpsScreenPath = path.join(srcDir, 'screens', 'dailyops', 'DailyOpsScreen.jsx');
  const bookingsScreenPath = path.join(srcDir, 'screens', 'bookings', 'BookingsScreen.jsx');
  const billsScreenPath = path.join(srcDir, 'screens', 'bills', 'BillsScreen.jsx');
  const referralsScreenPath = path.join(srcDir, 'screens', 'guests', 'AllReferralsScreen.jsx');

  it('1. SearchInput.jsx component exists with clear button, accessibility, and ref forwarding', () => {
    assert.ok(fs.existsSync(searchInputPath), 'SearchInput.jsx must exist');
    const content = fs.readFileSync(searchInputPath, 'utf8');

    assert.ok(content.includes('forwardRef'), 'SearchInput must forward ref');
    assert.ok(content.includes('accessibilityLabel="Clear search"'), 'Clear button must have clear search accessibility label');
    assert.ok(content.includes('accessibilityRole="search"'), 'Input must have search accessibility role');
    assert.ok(content.includes('autoCapitalize="none"'), 'Must disable autoCapitalize for smooth typing');
    assert.ok(content.includes('autoCorrect={false}'), 'Must disable autoCorrect');
    assert.ok(content.includes('hasValue'), 'Clear button must be conditional on input value');
  });

  it('2. useDebounce hook exists and debounces input without losing focus', () => {
    assert.ok(fs.existsSync(debouncePath), 'useDebounce.js must exist');
    const content = fs.readFileSync(debouncePath, 'utf8');
    assert.ok(content.includes('useDebounce'), 'Must export useDebounce');
    assert.ok(content.includes('setTimeout'), 'Must use setTimeout for debounce');
    assert.ok(content.includes('clearTimeout'), 'Must clear timer on unmount/re-render');
  });

  it('3. GuestsScreen uses SearchInput, debounces API requests, and memoizes renderHeader as element', () => {
    const content = fs.readFileSync(guestsScreenPath, 'utf8');
    assert.ok(content.includes('SearchInput'), 'GuestsScreen must use SearchInput');
    assert.ok(content.includes('useDebounce'), 'GuestsScreen must use useDebounce');
    assert.ok(content.includes('const debouncedQ = useDebounce(q, 350)'), 'GuestsScreen must debounce search by ~350ms');
    assert.ok(content.includes('useGuests(debouncedQ)'), 'GuestsScreen must pass debounced query to API');
    assert.ok(content.includes('const renderHeader = useMemo(() => ('), 'GuestsScreen must memoize renderHeader as JSX element');
    assert.ok(content.includes('ListHeaderComponent={renderHeader}'), 'GuestsScreen must retain ListHeaderComponent={renderHeader}');
  });

  it('4. DailyOpsScreen includes SearchInput and filters checkins and checkouts locally', () => {
    const content = fs.readFileSync(dailyOpsScreenPath, 'utf8');
    assert.ok(content.includes('SearchInput'), 'DailyOpsScreen must include SearchInput');
    assert.ok(content.includes('filteredCheckins'), 'DailyOpsScreen must compute filteredCheckins');
    assert.ok(content.includes('filteredCheckouts'), 'DailyOpsScreen must compute filteredCheckouts');
    assert.ok(content.includes('item.room_no'), 'Search must match room number');
    assert.ok(content.includes('item.guest_name'), 'Search must match guest name');
  });

  it('5. BookingsScreen includes SearchInput, filters reservations, memoizes renderHeader, and defines all reservations for late arrival conflict checks', () => {
    const content = fs.readFileSync(bookingsScreenPath, 'utf8');
    assert.ok(content.includes('SearchInput'), 'BookingsScreen must include SearchInput');
    assert.ok(content.includes('const renderHeader = useMemo(() => ('), 'BookingsScreen must memoize renderHeader');
    assert.ok(content.includes('filteredReservations'), 'BookingsScreen must filter reservations');
    assert.ok(content.includes('const all = allReservations;'), 'BookingsScreen must define all for late arrival conflict checks');
    assert.ok(content.includes('all.find('), 'BookingsScreen checks late arrival conflict against all reservations');
  });

  it('6. BillsScreen includes SearchInput, filters bills, and memoizes renderHeader', () => {
    const content = fs.readFileSync(billsScreenPath, 'utf8');
    assert.ok(content.includes('SearchInput'), 'BillsScreen must include SearchInput');
    assert.ok(content.includes('const renderHeader = useMemo(() => ('), 'BillsScreen must memoize renderHeader');
    assert.ok(content.includes('filteredDone'), 'BillsScreen must filter bills');
  });

  it('7. AllReferralsScreen uses SearchInput and memoizes renderHeader as JSX element', () => {
    const content = fs.readFileSync(referralsScreenPath, 'utf8');
    assert.ok(content.includes('SearchInput'), 'AllReferralsScreen must use SearchInput');
    assert.ok(content.includes('const renderHeader = useMemo(() => ('), 'AllReferralsScreen must memoize renderHeader');
    assert.ok(content.includes('ListHeaderComponent={renderHeader}'), 'AllReferralsScreen must retain ListHeaderComponent={renderHeader}');
  });
});

describe('Improvement 2: Document Upload Only & Photo Upload Removal Verification', () => {
  const photoUploadSheetPath = path.join(srcDir, 'components', 'sheets', 'PhotoUploadSheet.jsx');
  const guestDetailsPath = path.join(srcDir, 'screens', 'guests', 'GuestDetailsScreen.jsx');
  const dailyOpsPath = path.join(srcDir, 'screens', 'dailyops', 'DailyOpsScreen.jsx');
  const checkInSheetPath = path.join(srcDir, 'components', 'sheets', 'CheckInSheet.jsx');

  it('1. PhotoUploadSheet component is removed after removing all callers', () => {
    assert.ok(!fs.existsSync(photoUploadSheetPath), 'PhotoUploadSheet.jsx must be removed');
  });

  it('2. GuestDetailsScreen displays document upload with filename, format, and Remove Selected Document', () => {
    const content = fs.readFileSync(guestDetailsPath, 'utf8');

    assert.ok(content.includes('selectedDoc'), 'GuestDetailsScreen must hold selectedDoc');
    assert.ok(content.includes('Upload ID Document'), 'Must render Upload ID Document button');
    assert.ok(content.includes('Remove Selected Document'), 'Must render Remove Selected Document button');
    assert.ok(content.includes('handleUploadSelectedDoc'), 'Must wire upload to handleUploadSelectedDoc');
    assert.ok(!content.includes('ImagePicker'), 'GuestDetailsScreen must not import ImagePicker');
    assert.ok(!content.includes('📷 Upload Photo'), 'Must not display 📷 Upload Photo');
  });

  it('3. DailyOpsScreen removes Photo Upload action button and does not import PhotoUploadSheet', () => {
    const content = fs.readFileSync(dailyOpsPath, 'utf8');

    assert.ok(!content.includes('PhotoUploadSheet'), 'DailyOpsScreen must not import PhotoUploadSheet');
    assert.ok(!content.includes('📷 Upload Photo'), 'Must not render 📷 Upload Photo button');
    assert.ok(!content.includes("setSheet({ type: 'upload_photo'"), 'Must not trigger upload_photo sheet');
  });

  it('4. CheckInSheet supports document upload without separate photo gallery picker', () => {
    const content = fs.readFileSync(checkInSheetPath, 'utf8');

    assert.ok(!content.includes('import * as ImagePicker'), 'CheckInSheet must not import ImagePicker');
    assert.ok(!content.includes('pickPhoto'), 'CheckInSheet must not implement pickPhoto function');
    assert.ok(!content.includes('Upload Photo (P'), 'CheckInSheet must not render Upload Photo action');
    assert.ok(content.includes('Upload ID Document (P') || content.includes('Attach Document (P'), 'CheckInSheet must render Document upload action');
  });
});

describe('Improvement 3: Daily Operations Summary Tiles Clickable Filters Verification', () => {
  const dailyOpsPath = path.join(srcDir, 'screens', 'dailyops', 'DailyOpsScreen.jsx');
  const content = fs.readFileSync(dailyOpsPath, 'utf8');

  it('1. DailyOpsScreen renders clickable summary tiles for Expected Today, Pending Arrival, Checked In, and Checked Out', () => {
    assert.ok(content.includes('Expected Today'), 'Must render Expected Today tile');
    assert.ok(content.includes('Pending Arrival'), 'Must render Pending Arrival tile');
    assert.ok(content.includes('Checked In'), 'Must render Checked In tile');
    assert.ok(content.includes('Checked Out'), 'Must render Checked Out tile');
  });

  it('2. Each summary tile is interactive with handleTilePress handler and accessibility labels', () => {
    assert.ok(content.includes('handleTilePress'), 'Must define handleTilePress function');
    assert.ok(content.includes('handleTilePress(\'all\')'), 'Expected Today must wire handleTilePress with all');
    assert.ok(content.includes('handleTilePress(\'pending\')'), 'Pending Arrival must wire handleTilePress with pending');
    assert.ok(content.includes('handleTilePress(\'checked_in\')'), 'Checked In must wire handleTilePress with checked_in');
    assert.ok(content.includes('handleTilePress(\'checked_out\')'), 'Checked Out must wire handleTilePress with checked_out');
  });

  it('3. Visual indication for active filter tile using styles.statBoxActive and active indicator dot', () => {
    assert.ok(content.includes('statBoxActive'), 'Must apply statBoxActive style when tile is selected');
    assert.ok(content.includes('activeDot'), 'Must render active indicator dot on selected tile');
  });

  it('4. Renders clear filter banner allowing return to unfiltered default view', () => {
    assert.ok(content.includes('filterBanner'), 'Must render active filter banner');
    assert.ok(content.includes('Show All'), 'Must render Show All / Clear filter button');
    assert.ok(content.includes("setStatusFilter('all')"), 'Show All button must reset filter to all');
  });

  it('5. Accurate backend filtering by checkin_status without mutating underlying records', () => {
    assert.ok(content.includes('item.checkin_status !== statusFilter'), 'Must filter checkins by backend checkin_status');
    assert.ok(content.includes('checkinStats.total'), 'Must use accurate backend checkinStats');
    assert.ok(content.includes('checkinStats.pending'), 'Must use accurate backend pending count');
    assert.ok(content.includes('checkinStats.checked_in'), 'Must use accurate backend checked_in count');
  });
});

describe('Improvement 4: Room Master Status Colors & Visual Parity Verification', () => {
  const roomMasterPath = path.join(srcDir, 'screens', 'more', 'RoomMasterScreen.jsx');
  const content = fs.readFileSync(roomMasterPath, 'utf8');

  it('1. RoomMasterScreen imports and reuses Rooms Dashboard statusColors and isRoomOverdue', () => {
    assert.ok(content.includes('statusColors'), 'RoomMasterScreen must import statusColors from theme.js');
    assert.ok(content.includes('isRoomOverdue'), 'RoomMasterScreen must import isRoomOverdue');
  });

  it('2. Implements getRoomStatusColor mapping Free, Booked, Occupied, Cleaning, Repair, and Overdue', () => {
    assert.ok(content.includes('getRoomStatusColor'), 'Must define getRoomStatusColor function');
    assert.ok(content.includes('statusColors.overdue'), 'Must handle overdue status color');
    assert.ok(content.includes('statusColors.occupied'), 'Must handle occupied status color');
    assert.ok(content.includes('statusColors.booked'), 'Must handle booked status color');
    assert.ok(content.includes('statusColors.repair'), 'Must handle repair status color');
    assert.ok(content.includes('statusColors.cleaning'), 'Must handle cleaning status color');
    assert.ok(content.includes('statusColors.free'), 'Must handle free status color');
  });

  it('3. Applies statusColors bg and border dynamically to room tiles across all floors', () => {
    assert.ok(content.includes('backgroundColor: sc.bg'), 'Room tile must use statusColors bg');
    assert.ok(content.includes('borderColor: sc.border'), 'Room tile must use statusColors border');
    assert.ok(content.includes('color: sc.fg'), 'Room tile text must use statusColors fg');
  });

  it('4. Preserves all existing Room Master text, floor labels, and room type names untouched', () => {
    assert.ok(content.includes('{r.roomNo}'), 'Must preserve {r.roomNo}');
    assert.ok(content.includes("{isMnt ? 'Repair' : isCln ? 'Cleaning' : r.roomType?.name}"), 'Must preserve existing room status / type text logic');
    assert.ok(content.includes('floorName'), 'Must preserve floorName');
    assert.ok(content.includes('+ Add Rooms / Floor'), 'Must preserve Add Rooms / Floor button');
    assert.ok(content.includes('+ Add Type'), 'Must preserve Add Type button');
  });
});
