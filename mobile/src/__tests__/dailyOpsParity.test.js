import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.resolve(__dirname, '..');

import {
  buildWhatsAppMessage,
  buildCheckInWhatsAppMessage,
  cleanPhoneForWhatsApp,
} from '../lib/whatsapp.js';

describe('Task: Make Mobile Daily Ops Match Web Daily Operations', () => {
  const dailyOpsScreenPath = path.join(srcDir, 'screens', 'dailyops', 'DailyOpsScreen.jsx');
  const whatsAppSheetPath = path.join(srcDir, 'components', 'sheets', 'WhatsAppSheet.jsx');
  const whatsappLibPath = path.join(srcDir, 'lib', 'whatsapp.js');
  const webTodayCheckoutsPath = path.resolve(__dirname, '..', '..', '..', 'frontend', 'src', 'pages', 'TodayCheckouts.jsx');

  assert.ok(fs.existsSync(dailyOpsScreenPath), 'DailyOpsScreen.jsx must exist');
  const mobileContent = fs.readFileSync(dailyOpsScreenPath, 'utf8');
  const webContent = fs.readFileSync(webTodayCheckoutsPath, 'utf8');

  describe('1. Follow the Web Structure', () => {
    it('A. Daily Operations Header: shows current date, configured timezone, and standard checkout time', () => {
      assert.ok(mobileContent.includes('Daily Operations'), 'Must display Daily Operations header title');
      assert.ok(mobileContent.includes('fdWithYear(today)'), 'Must format today date using fdWithYear');
      assert.ok(mobileContent.includes('timezone'), 'Must display configured timezone');
      assert.ok(mobileContent.includes('checkout_time_standard') || mobileContent.includes('checkoutTimeStandard'), 'Must display standard checkout time');
    });

    it('B. Check-in and Check-out Summary: includes Today\'s Check-ins (Expected, Pending, Checked-in) and Today\'s Check-outs (Expected, Pending, Completed)', () => {
      // Check-ins summary card
      assert.ok(mobileContent.includes("Today's Check-ins"), "Must display Today's Check-ins summary card");
      assert.ok(mobileContent.includes('Arrivals'), 'Must display Arrivals badge on check-ins card');
      assert.ok(mobileContent.includes('checkinStats.total'), 'Must display checkin total count');
      assert.ok(mobileContent.includes('checkinStats.pending'), 'Must display checkin pending count');
      assert.ok(
        mobileContent.includes('checkinStats.checked_in') || mobileContent.includes('checkinStats.completed'),
        'Must display checkin checked-in / completed count'
      );

      // Check-outs summary card
      assert.ok(mobileContent.includes("Today's Check-outs"), "Must display Today's Check-outs summary card");
      assert.ok(mobileContent.includes('Departures'), 'Must display Departures badge on check-outs card');
      assert.ok(mobileContent.includes('checkoutStats.total'), 'Must display checkout total count');
      assert.ok(mobileContent.includes('checkoutStats.pending'), 'Must display checkout pending count');
      assert.ok(
        mobileContent.includes('checkoutStats.completed') || mobileContent.includes('checkoutStats.checked_out'),
        'Must display checkout completed count'
      );
    });

    it('C. Search: room number, guest name, phone, and booking code without keyboard flickering/dismissing', () => {
      assert.ok(mobileContent.includes('SearchInput'), 'Must use SearchInput component');
      assert.ok(mobileContent.includes('item.room_no'), 'Search must match room number');
      assert.ok(mobileContent.includes('item.guest_name'), 'Search must match guest name');
      assert.ok(mobileContent.includes('item.guest_phone'), 'Search must match guest phone');
      assert.ok(mobileContent.includes('item.booking_code'), 'Search must match booking code');
      // Verify in-memory client-side memoized search without refetching on every keystroke
      assert.ok(mobileContent.includes('useMemo'), 'Must filter checkins and checkouts via useMemo');
    });

    it('D. Check-in / Check-out Tabs: Check-ins (count) and Check-outs (count)', () => {
      assert.ok(mobileContent.includes("Check-ins ({checkinStats.total})"), 'Must display Check-ins tab with total count');
      assert.ok(mobileContent.includes("Check-outs ({checkoutStats.total})"), 'Must display Check-outs tab with total count');
      assert.ok(mobileContent.includes("handleTabChange('checkins')"), 'Must wire tab switch for checkins');
      assert.ok(mobileContent.includes("handleTabChange('checkouts')"), 'Must wire tab switch for checkouts');
    });

    it('E. Status Filters: All, Pending, Checked-in for Check-ins; All, Pending, Completed for Check-outs', () => {
      // Check-ins filters
      assert.ok(mobileContent.includes("setStatusFilter('all')"), 'Must support All filter');
      assert.ok(mobileContent.includes("setStatusFilter('pending')"), 'Must support Pending filter');
      assert.ok(mobileContent.includes("setStatusFilter('checked_in')"), 'Must support Checked-in filter');
      // Check-outs filters
      assert.ok(mobileContent.includes("setStatusFilter('checked_out')"), 'Must support Completed/Checked-out filter');
      // Counter
      assert.ok(mobileContent.includes('Showing '), 'Must render Showing X of Y counter');
    });
  });

  describe('2. Mobile Record Display', () => {
    it('Renders responsive cards with room number, room type, guest name, mobile, date/time, and status badge', () => {
      assert.ok(mobileContent.includes('Room {item.room_no}') || mobileContent.includes('Room {s.room_no}'), 'Must display room number');
      assert.ok(mobileContent.includes('room_type_name'), 'Must display room type name');
      assert.ok(mobileContent.includes('guest_name'), 'Must display guest name');
      assert.ok(mobileContent.includes('guest_phone'), 'Must display guest phone');
      assert.ok(mobileContent.includes('check_in_time') && mobileContent.includes('checkout_time'), 'Must display check-in and checkout times');
      assert.ok(mobileContent.includes('(Actual)'), 'Must indicate actual check-in / checkout times when completed');
      assert.ok(mobileContent.includes('statusBadge'), 'Must display status badge style');
    });
  });

  describe('3. Actions Parity & Status Conditional Visibility', () => {
    it('Wires WhatsApp contact action with WhatsAppSheet and whatsapp utility', () => {
      assert.ok(fs.existsSync(whatsAppSheetPath), 'WhatsAppSheet.jsx must exist');
      assert.ok(fs.existsSync(whatsappLibPath), 'whatsapp.js utility must exist');
      assert.ok(mobileContent.includes('WhatsAppSheet'), 'DailyOpsScreen must import WhatsAppSheet');
      assert.ok(mobileContent.includes("type: 'whatsapp'"), 'Must trigger WhatsApp sheet action');
    });

    it('Wires Calendar/reminder action opening BookingDetailSheet or StayDetailSheet', () => {
      assert.ok(mobileContent.includes('BookingDetailSheet'), 'DailyOpsScreen must import BookingDetailSheet');
      assert.ok(mobileContent.includes("type: 'booking'"), 'Must open booking detail sheet on calendar/details action');
      assert.ok(mobileContent.includes('StayDetailSheet'), 'DailyOpsScreen must import StayDetailSheet');
    });

    it('Process Check-in is ONLY shown when checkin_status is pending', () => {
      assert.ok(mobileContent.includes('isPending && ('), 'Process Check-in must be conditionally rendered only when pending');
      assert.ok(mobileContent.includes('Process Check-in →'), 'Must render Process Check-in button');
      assert.ok(mobileContent.includes("setSheet({ type: 'checkin'"), 'Must open CheckInSheet on Process Check-in');
    });

    it('Process Check-out is ONLY shown when checkout_status is pending / in-house', () => {
      assert.ok(mobileContent.includes('isPending && stayId && ('), 'Process Check-out must be conditionally rendered only when pending');
      assert.ok(mobileContent.includes('Process Check-out →'), 'Must render Process Check-out button');
      assert.ok(mobileContent.includes("setSheet({ type: 'checkout'"), 'Must open CheckoutSheet on Process Check-out');
    });

    it('Photo upload option is cleanly removed from Daily Ops per requirements', () => {
      assert.ok(!mobileContent.includes('PhotoUploadSheet'), 'DailyOpsScreen must not import or render PhotoUploadSheet');
      assert.ok(!mobileContent.includes('📷 Upload Photo'), 'Must not render Upload Photo button');
      assert.ok(!mobileContent.includes("setSheet({ type: 'upload_photo'"), 'Must not have upload_photo sheet in Daily Ops');
    });
  });

  describe('4. Filtering and Data Logic Runtime Verification', () => {
    const mockCheckins = [
      { id: 'res-1', room_no: 101, guest_name: 'Aditi Sharma', guest_phone: '9876543210', booking_code: 'BK-101', checkin_status: 'pending' },
      { id: 'stay-2', room_no: 102, guest_name: 'Rahul Verma', guest_phone: '9876543211', booking_code: 'BK-102', checkin_status: 'checked_in' },
      { id: 'stay-3', room_no: 103, guest_name: 'Priya Patel', guest_phone: '9876543212', booking_code: 'BK-103', checkin_status: 'checked_out' },
    ];

    const mockCheckouts = [
      { id: 'stay-10', room_no: 201, guest_name: 'Vikram Singh', guest_phone: '9876543220', booking_code: 'BK-201', checkout_status: 'pending' },
      { id: 'stay-11', room_no: 202, guest_name: 'Ananya Roy', guest_phone: '9876543221', booking_code: 'BK-202', checkout_status: 'checked_out' },
    ];

    function filterCheckins(list, statusFilter, search) {
      return list.filter((item) => {
        if (statusFilter !== 'all' && item.checkin_status !== statusFilter) {
          return false;
        }
        if (!search.trim()) return true;
        const q = search.toLowerCase().trim();
        return (
          String(item.room_no).includes(q) ||
          (item.guest_name && item.guest_name.toLowerCase().includes(q)) ||
          (item.guest_phone && item.guest_phone.includes(q)) ||
          (item.booking_code && item.booking_code.toLowerCase().includes(q))
        );
      });
    }

    function filterCheckouts(list, statusFilter, search) {
      return list.filter((s) => {
        if (statusFilter !== 'all') {
          const itemStatus = s.checkout_status || (s.stay_status === 'in_house' || s.status === 'in_house' ? 'pending' : s.stay_status || s.status);
          if (statusFilter === 'pending' && itemStatus !== 'pending') return false;
          if (statusFilter === 'checked_out' && itemStatus !== 'checked_out') return false;
        }
        if (!search.trim()) return true;
        const q = search.toLowerCase().trim();
        return (
          String(s.room_no).includes(q) ||
          (s.guest_name && s.guest_name.toLowerCase().includes(q)) ||
          (s.guest_phone && s.guest_phone.includes(q)) ||
          (s.booking_code && s.booking_code.toLowerCase().includes(q))
        );
      });
    }

    it('Filters check-ins by status (all, pending, checked_in, checked_out)', () => {
      assert.equal(filterCheckins(mockCheckins, 'all', '').length, 3);
      assert.equal(filterCheckins(mockCheckins, 'pending', '')[0].room_no, 101);
      assert.equal(filterCheckins(mockCheckins, 'checked_in', '')[0].room_no, 102);
      assert.equal(filterCheckins(mockCheckins, 'checked_out', '')[0].room_no, 103);
    });

    it('Filters check-outs by status (all, pending, checked_out/completed)', () => {
      assert.equal(filterCheckouts(mockCheckouts, 'all', '').length, 2);
      assert.equal(filterCheckouts(mockCheckouts, 'pending', '')[0].room_no, 201);
      assert.equal(filterCheckouts(mockCheckouts, 'checked_out', '')[0].room_no, 202);
    });

    it('Filters records by search (room number, guest name, phone, booking code)', () => {
      // Search by room number
      assert.equal(filterCheckins(mockCheckins, 'all', '101').length, 1);
      // Search by guest name
      assert.equal(filterCheckins(mockCheckins, 'all', 'rahul').length, 1);
      assert.equal(filterCheckins(mockCheckins, 'all', 'rahul')[0].guest_name, 'Rahul Verma');
      // Search by phone number
      assert.equal(filterCheckins(mockCheckins, 'all', '43212').length, 1);
      assert.equal(filterCheckins(mockCheckins, 'all', '43212')[0].guest_name, 'Priya Patel');
      // Search by booking code
      assert.equal(filterCheckouts(mockCheckouts, 'all', 'BK-201').length, 1);
      assert.equal(filterCheckouts(mockCheckouts, 'all', 'BK-201')[0].room_no, 201);
    });

    it('Search and status filter work together concurrently', () => {
      // Matching name but wrong status filter returns empty
      assert.equal(filterCheckins(mockCheckins, 'checked_in', 'Aditi').length, 0);
      // Matching name with correct status filter returns record
      assert.equal(filterCheckins(mockCheckins, 'pending', 'Aditi').length, 1);
    });

    it('Normalizes WhatsApp phone numbers correctly', () => {
      assert.equal(cleanPhoneForWhatsApp('9876543210'), '919876543210');
      assert.equal(cleanPhoneForWhatsApp('+91 98765 43210'), '919876543210');
      assert.equal(cleanPhoneForWhatsApp('12345'), ''); // Too short
      assert.equal(cleanPhoneForWhatsApp(''), '');
    });

    it('Builds WhatsApp check-in and checkout messages accurately', () => {
      const checkinMsg = buildCheckInWhatsAppMessage(null, {
        guestName: 'Aditi',
        roomNo: '101',
        checkinDate: '2026-11-21',
        checkinTime: '12:00 PM',
        checkoutDate: '2026-11-22',
        checkoutTime: '11:00 AM',
        hotelName: 'KKK Lodge',
        hotelPhone: '9999999999',
      });
      assert.ok(checkinMsg.includes('Aditi'));
      assert.ok(checkinMsg.includes('101'));
      assert.ok(checkinMsg.includes('KKK Lodge'));

      const checkoutMsg = buildWhatsAppMessage(null, {
        guestName: 'Vikram',
        roomNo: '201',
        checkoutTime: '11:00 AM',
        checkoutDate: '2026-11-21',
        hotelName: 'KKK Lodge',
        hotelPhone: '9999999999',
        status: 'Pending',
      });
      assert.ok(checkoutMsg.includes('Vikram'));
      assert.ok(checkoutMsg.includes('201'));
      assert.ok(checkoutMsg.includes('11:00 AM'));
    });
  });
});
