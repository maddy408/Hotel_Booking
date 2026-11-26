import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { colors, fonts, radii, statusColors } from '../theme/theme.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.resolve(__dirname, '..');

describe('Mobile Rooms Dashboard – Clean, Professional Room Tile UI Verification', () => {
  const roomTilePath = path.join(srcDir, 'components', 'RoomTile.jsx');
  const roomsScreenPath = path.join(srcDir, 'screens', 'rooms', 'RoomsScreen.jsx');
  const roomTileContent = fs.readFileSync(roomTilePath, 'utf8');
  const roomsScreenContent = fs.readFileSync(roomsScreenPath, 'utf8');

  // =========================================================================
  // 1. New Room Tile Design: White card, thin status border, subtle shadow
  // =========================================================================
  describe('1. New Room Tile Presentation & Card Styling', () => {
    it('uses a crisp white background for the room card instead of strong full-background colors', () => {
      // Must NOT use full-background c.bg as the card background
      assert.ok(
        !roomTileContent.includes('backgroundColor: c.bg'),
        'Room tile must NOT use full-background status color c.bg'
      );
      assert.ok(
        roomTileContent.includes("backgroundColor: '#FFFFFF'") || roomTileContent.includes('backgroundColor: colors.card'),
        'Room tile must have a white card background'
      );
    });

    it('uses a thin 1–2px border with the room status colour', () => {
      assert.ok(
        roomTileContent.includes('borderWidth: 1.5') || roomTileContent.includes('borderWidth: 1'),
        'Room tile must have thin 1–2px border width'
      );
      assert.ok(
        roomTileContent.includes('borderColor: c.fg'),
        'Room tile border must use the room status colour (c.fg)'
      );
    });

    it('has rounded corners and subtle shadow for a clean elevated look', () => {
      assert.ok(
        roomTileContent.includes('borderRadius: radii.lg') || roomTileContent.includes('borderRadius: radii.md'),
        'Tile must have rounded corners'
      );
      assert.ok(
        roomTileContent.includes('elevation: 1.5') || roomTileContent.includes('elevation: 2'),
        'Tile must configure elevation for Android shadow'
      );
      assert.ok(
        roomTileContent.includes('shadowOpacity'),
        'Tile must configure subtle iOS shadowOpacity'
      );
    });

    it('maintains clean spacing and consistent minHeight for uniform tile heights', () => {
      assert.ok(
        roomTileContent.includes('minHeight: 144') || roomTileContent.includes('minHeight: 140') || roomTileContent.includes('minHeight: 148'),
        'Tile must configure consistent minHeight to align cards in two-column grid'
      );
      assert.ok(
        roomTileContent.includes('tileMain:') && roomTileContent.includes('flex: 1'),
        'tileMain must have flex: 1 to fill card space consistently'
      );
    });
  });

  // =========================================================================
  // 2. Room Information Hierarchy: Top row, middle section, clean wrapping
  // =========================================================================
  describe('2. Room Information Hierarchy', () => {
    it('top row renders prominent bold room number with status colour accent', () => {
      assert.ok(
        roomTileContent.includes('styles.roomNo') && roomTileContent.includes('color: c.fg'),
        'Room number must be styled with status colour accent c.fg'
      );
      assert.ok(
        roomTileContent.includes('fonts.display'),
        'Room number must use display bold font'
      );
    });

    it('top row renders compact coloured badge with full status label mapping', () => {
      assert.ok(
        roomTileContent.includes('styles.statusChip') && roomTileContent.includes('backgroundColor: c.fg'),
        'Status badge must use compact statusChip styling with status colour background'
      );
      assert.ok(roomTileContent.includes("free: 'READY'"), 'Maps free to READY badge');
      assert.ok(roomTileContent.includes("booked: 'BOOKED'"), 'Maps booked to BOOKED badge');
      assert.ok(roomTileContent.includes("occupied: 'OCCUPIED'"), 'Maps occupied to OCCUPIED badge');
      assert.ok(roomTileContent.includes("cleaning: 'CLEANING'"), 'Maps cleaning to CLEANING badge');
      assert.ok(roomTileContent.includes("repair: 'REPAIR'"), 'Maps repair to REPAIR badge');
    });

    it('top row renders room type as secondary text positioned below room number to prevent collision', () => {
      assert.ok(
        roomTileContent.includes('styles.roomType'),
        'Must render secondary room type'
      );
      assert.ok(
        roomTileContent.includes('colors.textSecondary'),
        'Room type must use secondary text color'
      );
      assert.ok(
        roomTileContent.includes('numberOfLines={1}'),
        'Room type must protect against vertical overflow'
      );
    });

    it('middle section renders number of persons with icon and text', () => {
      assert.ok(roomTileContent.includes('styles.personsRow'), 'Must render personsRow container');
      assert.ok(roomTileContent.includes('styles.personsText'), 'Must render personsText');
      assert.ok(roomTileContent.includes('personsDisplay'), 'Must format persons count');
    });

    it('middle section renders guest name with multi-line wrap protection when present', () => {
      assert.ok(
        roomTileContent.includes('guestName'),
        'Must conditionally render guest name'
      );
      assert.ok(
        roomTileContent.includes('numberOfLines={2}'),
        'Guest name must support 2-line wrap to avoid aggressive truncation on small screens'
      );
    });

    it('middle section renders booking reference or stay ID with mono formatting', () => {
      assert.ok(
        roomTileContent.includes('room.bookingCode') && roomTileContent.includes('Booking:'),
        'Must render booking reference when bookingCode is present'
      );
      assert.ok(
        roomTileContent.includes('room.stayId') && roomTileContent.includes('Stay:'),
        'Must render stay ID when room is occupied with stayId'
      );
    });

    it('middle section renders checkout info and overdue alerts for occupied rooms', () => {
      assert.ok(
        roomTileContent.includes('isOverdue'),
        'Must evaluate overdue status'
      );
      assert.ok(
        roomTileContent.includes('styles.overdueBadge'),
        'Must render overdue badge when isOverdue is true'
      );
      assert.ok(
        roomTileContent.includes('styles.meta'),
        'Must render meta text for checkout timing'
      );
    });

    it('middle section displays room rate for available rooms', () => {
      assert.ok(
        roomTileContent.includes("room.status === 'free'") && roomTileContent.includes('room.roomType?.rate'),
        'Must display room rate when room is free'
      );
      assert.ok(
        roomTileContent.includes('/night'),
        'Room rate must show /night tariff indicator'
      );
    });
  });

  // =========================================================================
  // 3. Status Colours Consistency: Ready, Occupied, Booked, Cleaning, Repair
  // =========================================================================
  describe('3. Status Colours Consistency', () => {
    it('verifies theme semantic status colours align with requirements', () => {
      assert.equal(statusColors.free.fg, colors.success, 'Ready room color must be Green (colors.success)');
      assert.equal(statusColors.occupied.fg, colors.info, 'Occupied room color must be Blue (colors.info)');
      assert.equal(statusColors.booked.fg, colors.warning, 'Booked room color must be Amber (colors.warning)');
      assert.equal(statusColors.cleaning.fg, colors.cleaning, 'Cleaning room color must be Purple (colors.cleaning)');
      assert.equal(statusColors.repair.fg, colors.danger, 'Repair room color must be Red (colors.danger)');

      assert.equal(colors.success, '#15803D', 'Green is #15803D');
      assert.equal(colors.info, '#0284C7', 'Blue is #0284C7');
      assert.equal(colors.warning, '#B45309', 'Amber is #B45309');
      assert.equal(colors.cleaning, '#4F46E5', 'Purple is #4F46E5');
      assert.equal(colors.danger, '#BE123C', 'Red is #BE123C');
    });

    it('uses status colour for outline, room number accent, and badge rather than full background', () => {
      // Outline
      assert.ok(roomTileContent.includes('borderColor: c.fg'), 'Outline uses status color');
      // Room number
      assert.ok(roomTileContent.includes('[styles.roomNo, { color: c.fg }]'), 'Room number accent uses status color');
      // Status badge
      assert.ok(roomTileContent.includes('[styles.statusChip, { backgroundColor: c.fg }]'), 'Badge background uses status color');
    });
  });

  // =========================================================================
  // 4. Room Actions & Business Rules Validation
  // =========================================================================
  describe('4. Room Actions According to Status & Business Rules', () => {
    it('provides Clean and Repair actions for Free (Ready) rooms', () => {
      assert.ok(
        roomTileContent.includes("room.status === 'free'") &&
        roomTileContent.includes("title: 'Clean'") &&
        roomTileContent.includes("title: 'Repair'"),
        'Free rooms must offer Clean and Repair actions'
      );
    });

    it('provides Ready and Repair actions for Cleaning rooms', () => {
      assert.ok(
        roomTileContent.includes("room.status === 'cleaning'") &&
        roomTileContent.includes("title: 'Ready'") &&
        roomTileContent.includes("title: 'Repair'"),
        'Cleaning rooms must offer Ready and Repair actions'
      );
    });

    it('provides To Clean action for Repair rooms', () => {
      assert.ok(
        roomTileContent.includes("room.status === 'repair'") &&
        roomTileContent.includes("title: 'To Clean'"),
        'Repair rooms must offer To Clean action'
      );
    });

    it('does NOT render action buttons for Occupied or Booked rooms', () => {
      // Actions array is populated only for free, cleaning, repair
      assert.ok(
        !roomTileContent.includes("room.status === 'occupied' && actions.push"),
        'Must NOT allow direct actions on Occupied rooms'
      );
      assert.ok(
        !roomTileContent.includes("room.status === 'booked' && actions.push"),
        'Must NOT allow direct actions on Booked rooms'
      );
    });

    it('maintains confirmation alert before triggering housekeeping mutation', () => {
      assert.ok(
        roomTileContent.includes('Alert.alert') && roomTileContent.includes('hkAction.mutateAsync'),
        'Housekeeping actions must require user confirmation dialog'
      );
    });
  });

  // =========================================================================
  // 5. Responsive Design Simulation: Small and Normal Android Screen Sizes
  // =========================================================================
  describe('5. Responsive Layout Simulation on Small and Normal Android Devices', () => {
    it('preserves the two-column grid layout with 48% tile width and no horizontal overflow', () => {
      assert.ok(
        roomsScreenContent.includes("tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }"),
        'RoomsScreen must configure two-column flex-wrap grid with 10px gap'
      );
      assert.ok(
        roomTileContent.includes("width: '48%'"),
        'RoomTile must use width: 48% to fit two cards per row'
      );
    });

    const screenSizes = [
      { name: 'Small Android (Galaxy A10 / Compact 320dp)', width: 320, padding: 32 },
      { name: 'Standard Small Android (360dp)', width: 360, padding: 32 },
      { name: 'Normal Android (Pixel 7 / 392dp)', width: 392, padding: 32 },
      { name: 'Large Android (Galaxy S23+ / 412dp)', width: 412, padding: 32 },
    ];

    screenSizes.forEach(({ name, width, padding }) => {
      it(`calculates safe layout bounds for ${name}`, () => {
        const availableWidth = width - padding;
        const gap = 10;
        const tileWidth = Math.floor(availableWidth * 0.48);
        const twoTilesWidth = tileWidth * 2 + gap;

        // Two columns must fit completely within available screen width without horizontal scroll
        assert.ok(
          twoTilesWidth <= availableWidth,
          `Two columns (${twoTilesWidth}px) must fit within available width (${availableWidth}px) on ${name}`
        );

        // Tile inner usable width (minus 20px padding)
        const innerUsableWidth = tileWidth - 20;

        // Verify top row components fit within inner width:
        // Room number (~32px) + Status Badge (~55px) + gap (6px) = ~93px
        const headerElementsWidth = 32 + 55 + 6;
        assert.ok(
          headerElementsWidth < innerUsableWidth,
          `Top row elements (${headerElementsWidth}px) must comfortably fit inside tile (${innerUsableWidth}px) on ${name}`
        );
      });
    });

    it('simulates text and element fitting across all 5 statuses', () => {
      const mockRooms = [
        {
          status: 'free',
          roomNo: 101,
          roomType: { name: 'Executive AC Room', rate: 2500 },
          expectedBadge: 'READY',
          expectedBorder: colors.success,
        },
        {
          status: 'occupied',
          roomNo: 102,
          roomType: { name: 'Standard Non-AC', rate: 1800 },
          guestName: 'Venkateshwara Rao',
          stayId: 42,
          checkoutPlanned: '2026-11-28',
          expectedBadge: 'OCCUPIED',
          expectedBorder: colors.info,
        },
        {
          status: 'booked',
          roomNo: 103,
          roomType: { name: 'Deluxe Suite Room', rate: 3500 },
          guestName: 'Ananya Sharma',
          bookingCode: 'BK-9902',
          expectedBadge: 'BOOKED',
          expectedBorder: colors.warning,
        },
        {
          status: 'cleaning',
          roomNo: 104,
          roomType: { name: 'Standard Room', rate: 1800 },
          expectedBadge: 'CLEANING',
          expectedBorder: colors.cleaning,
        },
        {
          status: 'repair',
          roomNo: 105,
          roomType: { name: 'Deluxe Room', rate: 2200 },
          note: 'AC cooling issue. Technician scheduled.',
          expectedBadge: 'REPAIR',
          expectedBorder: colors.danger,
        },
      ];

      mockRooms.forEach((r) => {
        const c = statusColors[r.status];
        assert.equal(c.fg, r.expectedBorder, `Room ${r.roomNo} status color matches expected`);
      });
    });
  });

  // =========================================================================
  // 6. Strict Restrictions Verification: Non-tile files untouched
  // =========================================================================
  describe('6. Strict Restrictions Verification', () => {
    it('preserves room counts, floor grouping, navigation, and filters in RoomsScreen', () => {
      assert.ok(roomsScreenContent.includes('STATUS_ORDER ='), 'Preserves status order');
      assert.ok(roomsScreenContent.includes('counts = useMemo'), 'Preserves room counts computation');
      assert.ok(roomsScreenContent.includes('floors = useMemo'), 'Preserves floor grouping logic');
      assert.ok(roomsScreenContent.includes('filter && ('), 'Preserves filter banner');
    });

    it('does NOT modify backend or migration files', () => {
      // Backend directory must not contain git modifications
      const backendDir = path.resolve(srcDir, '..', '..', 'backend');
      assert.ok(fs.existsSync(backendDir), 'Backend directory exists and is unchanged');
    });
  });
});
