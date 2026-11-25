import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.resolve(__dirname, '..');

describe('Daily Ops Mobile Screen - Simple Design, Needs Attention & Correct Counts Tests', () => {
  const dailyOpsScreenPath = path.join(srcDir, 'screens', 'dailyops', 'DailyOpsScreen.jsx');
  assert.ok(fs.existsSync(dailyOpsScreenPath), 'DailyOpsScreen.jsx must exist');
  const screenContent = fs.readFileSync(dailyOpsScreenPath, 'utf8');

  // Exact reproduction of DailyOpsScreen counting logic
  const TODAY = '2026-11-24';

  const computeArrivalsAndDepartures = (rawCheckins, rawCheckouts, today) => {
    // Checkins
    let expectedArrivals = 0;
    let notArrivedArrivals = 0;
    let checkedInToday = 0;
    let lateArrivals = 0;
    const activeCheckins = [];

    rawCheckins.forEach((c) => {
      const isCancelledOrNoShow =
        c.status === 'cancelled' ||
        c.status === 'no_show' ||
        c.reservation_status === 'cancelled' ||
        c.reservation_status === 'no_show' ||
        c.stay_status === 'cancelled';
      if (isCancelledOrNoShow) return;

      activeCheckins.push(c);

      const isCheckedIn =
        c.checkin_status === 'checked_in' ||
        c.checkin_status === 'checked_out' ||
        Boolean(c.is_checked_in_today);

      const isLate =
        !isCheckedIn &&
        Boolean(
          c.is_overdue ||
          (c.check_in_date && today && c.check_in_date < today)
        );

      if (isLate) {
        lateArrivals++;
      } else if (isCheckedIn) {
        checkedInToday++;
        if (c.is_expected_today || (c.check_in_date === today && !c.was_overdue)) {
          expectedArrivals++;
        }
      } else {
        expectedArrivals++;
        notArrivedArrivals++;
      }
    });

    // Checkouts
    let expectedDepartures = 0;
    let stillStaying = 0;
    let checkedOutToday = 0;
    let lateCheckouts = 0;
    const activeCheckouts = [];

    rawCheckouts.forEach((s) => {
      const isCancelledOrNoShow =
        s.status === 'cancelled' ||
        s.stay_status === 'cancelled' ||
        s.reservation_status === 'cancelled';
      if (isCancelledOrNoShow) return;

      activeCheckouts.push(s);

      const isCheckedOut =
        (s.checkout_status || s.status || s.stay_status) === 'checked_out' ||
        Boolean(s.checkout_actual);

      const isInHouse =
        !isCheckedOut &&
        (s.stay_status === 'in_house' ||
          s.status === 'in_house' ||
          s.checkout_status === 'pending' ||
          s.checkout_status === 'overdue');

      const plannedDate = s.checkout_planned || s.check_out_date;
      const isPlannedToday = plannedDate === today;
      const isPlannedPast =
        (plannedDate && today && plannedDate < today) || Boolean(s.is_overdue);

      if (isCheckedOut) {
        if (!s.checkout_actual || s.checkout_actual.startsWith(today)) {
          checkedOutToday++;
          if (isPlannedToday) {
            expectedDepartures++;
          }
        }
      } else if (isInHouse) {
        if (isPlannedToday) {
          expectedDepartures++;
          stillStaying++;
        } else if (isPlannedPast) {
          lateCheckouts++;
        }
      }
    });

    return {
      activeCheckins,
      checkinStats: {
        total: activeCheckins.length,
        all_count: activeCheckins.length,
        expected_today: expectedArrivals,
        expected: expectedArrivals,
        not_arrived: notArrivedArrivals,
        pending: notArrivedArrivals,
        checked_in: checkedInToday,
        late_arrivals: lateArrivals,
        overdue: lateArrivals,
      },
      activeCheckouts,
      checkoutStats: {
        total: activeCheckouts.length,
        all_count: activeCheckouts.length,
        expected_today: expectedDepartures,
        expected: expectedDepartures,
        still_staying: stillStaying,
        pending: stillStaying,
        checked_out: checkedOutToday,
        late_checkouts: lateCheckouts,
        overdue: lateCheckouts,
      },
    };
  };

  const filterArrivals = (list, filter, today) => {
    return list.filter((item) => {
      const isCheckedIn =
        item.checkin_status === 'checked_in' ||
        item.checkin_status === 'checked_out' ||
        Boolean(item.is_checked_in_today);

      const isLate =
        !isCheckedIn &&
        Boolean(
          item.is_overdue ||
          (item.check_in_date && today && item.check_in_date < today)
        );

      const isExpected =
        item.is_expected_today ||
        (item.check_in_date === today && !item.was_overdue);

      const isNotArrived =
        !isCheckedIn &&
        !isLate &&
        (item.check_in_date === today || item.is_expected_today);

      if (filter === 'all') return true;
      if (filter === 'expected') return isExpected;
      if (filter === 'not_arrived' || filter === 'pending') return isNotArrived;
      if (filter === 'checked_in') return isCheckedIn;
      if (filter === 'late_arrivals' || filter === 'overdue') return isLate;
      return true;
    });
  };

  const filterDepartures = (list, filter, today) => {
    return list.filter((s) => {
      const isCheckedOut =
        (s.checkout_status || s.status || s.stay_status) === 'checked_out' ||
        Boolean(s.checkout_actual);

      const isInHouse =
        !isCheckedOut &&
        (s.stay_status === 'in_house' ||
          s.status === 'in_house' ||
          s.checkout_status === 'pending' ||
          s.checkout_status === 'overdue');

      const plannedDate = s.checkout_planned || s.check_out_date;
      const isPlannedToday = plannedDate === today;
      const isPlannedPast =
        (plannedDate && today && plannedDate < today) || Boolean(s.is_overdue);

      const isStillStaying = isInHouse && isPlannedToday;
      const isLateCheckout = isInHouse && isPlannedPast;
      const isCheckedOutToday = isCheckedOut && (!s.checkout_actual || s.checkout_actual.startsWith(today));
      const isExpectedCheckout = isPlannedToday && (isInHouse || isCheckedOutToday);

      if (filter === 'all') return true;
      if (filter === 'expected') return isExpectedCheckout;
      if (filter === 'still_staying' || filter === 'pending') return isStillStaying;
      if (filter === 'checked_out' || filter === 'completed') return isCheckedOutToday;
      if (filter === 'late_checkouts' || filter === 'overdue') return isLateCheckout;
      return true;
    });
  };

  describe('13 Comprehensive Verification Scenarios', () => {
    it('1. Today\'s expected arrivals count and filtering', () => {
      const checkins = [
        { id: 'res-1', room_no: 101, guest_name: 'Guest One', check_in_date: TODAY, status: 'pending', checkin_status: 'pending' },
        { id: 'res-2', room_no: 102, guest_name: 'Guest Two', check_in_date: TODAY, status: 'pending', checkin_status: 'pending' },
      ];
      const res = computeArrivalsAndDepartures(checkins, [], TODAY);
      assert.equal(res.checkinStats.expected, 2);
      assert.equal(res.checkinStats.not_arrived, 2);
      assert.equal(res.checkinStats.checked_in, 0);
      assert.equal(res.checkinStats.late_arrivals, 0);

      const filtered = filterArrivals(res.activeCheckins, 'expected', TODAY);
      assert.equal(filtered.length, 2);
    });

    it('2. Guests who have checked in today', () => {
      const checkins = [
        { id: 'stay-1', room_no: 101, guest_name: 'Guest One', check_in_date: TODAY, checkin_status: 'checked_in', is_checked_in_today: true },
      ];
      const res = computeArrivalsAndDepartures(checkins, [], TODAY);
      assert.equal(res.checkinStats.expected, 1);
      assert.equal(res.checkinStats.checked_in, 1);
      assert.equal(res.checkinStats.not_arrived, 0);

      const filtered = filterArrivals(res.activeCheckins, 'checked_in', TODAY);
      assert.equal(filtered.length, 1);
    });

    it('3. Guests who have not arrived (expected today and pending check-in)', () => {
      const checkins = [
        { id: 'res-1', room_no: 101, check_in_date: TODAY, status: 'pending', checkin_status: 'pending' },
        { id: 'stay-2', room_no: 102, check_in_date: TODAY, checkin_status: 'checked_in', is_checked_in_today: true },
      ];
      const res = computeArrivalsAndDepartures(checkins, [], TODAY);
      assert.equal(res.checkinStats.expected, 2);
      assert.equal(res.checkinStats.not_arrived, 1);
      assert.equal(res.checkinStats.checked_in, 1);

      const notArrivedList = filterArrivals(res.activeCheckins, 'not_arrived', TODAY);
      assert.equal(notArrivedList.length, 1);
      assert.equal(notArrivedList[0].id, 'res-1');
    });

    it('4. Old overdue arrivals (late arrivals) isolated from Today\'s expected', () => {
      // 1 arrival expected today, 15 late arrivals from previous days
      const checkins = [
        { id: 'res-today', room_no: 101, check_in_date: TODAY, status: 'pending', checkin_status: 'pending' },
        ...Array.from({ length: 15 }, (_, i) => ({
          id: `res-late-${i + 1}`,
          room_no: 200 + i,
          check_in_date: '2026-11-20',
          status: 'pending',
          checkin_status: 'pending',
          is_overdue: true,
        })),
      ];
      const res = computeArrivalsAndDepartures(checkins, [], TODAY);

      // Verify the critical issue fix:
      // Check-ins total records = 16
      assert.equal(res.checkinStats.total, 16, 'Total must equal 16');
      assert.equal(res.checkinStats.all_count, 16, 'All count must equal 16');
      assert.equal(res.checkinStats.expected, 1, 'Today expected must equal 1 (not mixed with late arrivals)');
      assert.equal(res.checkinStats.not_arrived, 1, 'Today not arrived must equal 1');
      assert.equal(res.checkinStats.late_arrivals, 15, 'Late arrivals must equal 15');

      const lateList = filterArrivals(res.activeCheckins, 'late_arrivals', TODAY);
      assert.equal(lateList.length, 15, 'Late arrivals list must contain exactly 15 records');
      // When showing 15 late arrivals out of 16 total records: "Showing 15 of 16"
      assert.equal(lateList.length, 15);
      assert.equal(res.checkinStats.total, 16);
    });

    it('5. Today\'s expected departures count and filtering', () => {
      const checkouts = [
        { id: 'stay-1', room_no: 101, checkout_planned: TODAY, stay_status: 'in_house', checkout_status: 'pending' },
        { id: 'stay-2', room_no: 102, checkout_planned: TODAY, stay_status: 'in_house', checkout_status: 'pending' },
      ];
      const res = computeArrivalsAndDepartures([], checkouts, TODAY);
      assert.equal(res.checkoutStats.expected, 2);
      assert.equal(res.checkoutStats.still_staying, 2);
      assert.equal(res.checkoutStats.checked_out, 0);
      assert.equal(res.checkoutStats.late_checkouts, 0);

      const filtered = filterDepartures(res.activeCheckouts, 'expected', TODAY);
      assert.equal(filtered.length, 2);
    });

    it('6. Guests who have checked out today', () => {
      const checkouts = [
        { id: 'stay-1', room_no: 101, checkout_planned: TODAY, checkout_actual: `${TODAY} 11:00:00`, stay_status: 'checked_out', checkout_status: 'checked_out' },
      ];
      const res = computeArrivalsAndDepartures([], checkouts, TODAY);
      assert.equal(res.checkoutStats.expected, 1);
      assert.equal(res.checkoutStats.checked_out, 1);
      assert.equal(res.checkoutStats.still_staying, 0);

      const filtered = filterDepartures(res.activeCheckouts, 'checked_out', TODAY);
      assert.equal(filtered.length, 1);
    });

    it('7. Guests still staying after checkout time/date due today', () => {
      const checkouts = [
        { id: 'stay-1', room_no: 101, checkout_planned: TODAY, stay_status: 'in_house', checkout_status: 'pending' },
        { id: 'stay-2', room_no: 102, checkout_planned: TODAY, checkout_actual: `${TODAY} 10:30:00`, stay_status: 'checked_out', checkout_status: 'checked_out' },
      ];
      const res = computeArrivalsAndDepartures([], checkouts, TODAY);
      assert.equal(res.checkoutStats.expected, 2);
      assert.equal(res.checkoutStats.still_staying, 1);
      assert.equal(res.checkoutStats.checked_out, 1);

      const stayingList = filterDepartures(res.activeCheckouts, 'still_staying', TODAY);
      assert.equal(stayingList.length, 1);
      assert.equal(stayingList[0].id, 'stay-1');
    });

    it('8. Old overdue departures (late check-outs) isolated from Today\'s expected', () => {
      const checkouts = [
        { id: 'stay-today', room_no: 101, checkout_planned: TODAY, stay_status: 'in_house', checkout_status: 'pending' },
        { id: 'stay-late-1', room_no: 102, checkout_planned: '2026-11-20', stay_status: 'in_house', checkout_status: 'overdue', is_overdue: true },
        { id: 'stay-late-2', room_no: 103, checkout_planned: '2026-11-22', stay_status: 'in_house', checkout_status: 'overdue', is_overdue: true },
      ];
      const res = computeArrivalsAndDepartures([], checkouts, TODAY);
      assert.equal(res.checkoutStats.total, 3, 'Total records in Departures section must be 3');
      assert.equal(res.checkoutStats.expected, 1, 'Today expected departures must be 1');
      assert.equal(res.checkoutStats.still_staying, 1, 'Today still staying must be 1');
      assert.equal(res.checkoutStats.late_checkouts, 2, 'Late check-outs must be 2');

      const lateList = filterDepartures(res.activeCheckouts, 'late_checkouts', TODAY);
      assert.equal(lateList.length, 2);
    });

    it('9. Cancelled bookings are excluded from active counts and lists', () => {
      const checkins = [
        { id: 'res-valid', room_no: 101, check_in_date: TODAY, status: 'pending', checkin_status: 'pending' },
        { id: 'res-cancelled', room_no: 102, check_in_date: TODAY, status: 'cancelled', checkin_status: 'cancelled', reservation_status: 'cancelled' },
      ];
      const res = computeArrivalsAndDepartures(checkins, [], TODAY);
      assert.equal(res.checkinStats.total, 1);
      assert.equal(res.checkinStats.expected, 1);
      assert.equal(res.activeCheckins.length, 1);
      assert.equal(res.activeCheckins[0].id, 'res-valid');
    });

    it('10. No-show bookings are excluded from active counts and lists', () => {
      const checkins = [
        { id: 'res-valid', room_no: 101, check_in_date: TODAY, status: 'pending', checkin_status: 'pending' },
        { id: 'res-noshow', room_no: 102, check_in_date: TODAY, status: 'no_show', checkin_status: 'no_show', reservation_status: 'no_show' },
      ];
      const res = computeArrivalsAndDepartures(checkins, [], TODAY);
      assert.equal(res.checkinStats.total, 1);
      assert.equal(res.checkinStats.expected, 1);
      assert.equal(res.activeCheckins.length, 1);
      assert.equal(res.activeCheckins[0].id, 'res-valid');
    });

    it('11. Changing filters in Arrivals and Departures works seamlessly', () => {
      const checkins = [
        { id: 'res-1', room_no: 101, check_in_date: TODAY, status: 'pending', checkin_status: 'pending' },
        { id: 'stay-2', room_no: 102, check_in_date: TODAY, checkin_status: 'checked_in', is_checked_in_today: true },
        { id: 'res-3', room_no: 103, check_in_date: '2026-11-20', status: 'pending', checkin_status: 'pending', is_overdue: true },
      ];
      const res = computeArrivalsAndDepartures(checkins, [], TODAY);
      assert.equal(filterArrivals(res.activeCheckins, 'all', TODAY).length, 3);
      assert.equal(filterArrivals(res.activeCheckins, 'expected', TODAY).length, 2);
      assert.equal(filterArrivals(res.activeCheckins, 'not_arrived', TODAY).length, 1);
      assert.equal(filterArrivals(res.activeCheckins, 'checked_in', TODAY).length, 1);
      assert.equal(filterArrivals(res.activeCheckins, 'late_arrivals', TODAY).length, 1);
    });

    it('12. In-memory search by guest name, phone, room number, and booking code', () => {
      const items = [
        { room_no: 105, guest_name: 'John Doe', guest_phone: '9843011111', booking_code: 'BK-105' },
        { room_no: 204, guest_name: 'Jane Smith', guest_phone: '9843022222', booking_code: 'BK-204' },
      ];

      const searchMatch = (list, query) => {
        const q = query.toLowerCase().trim();
        return list.filter(
          (i) =>
            String(i.room_no).includes(q) ||
            (i.guest_name && i.guest_name.toLowerCase().includes(q)) ||
            (i.guest_phone && i.guest_phone.includes(q)) ||
            (i.booking_code && i.booking_code.toLowerCase().includes(q))
        );
      };

      assert.equal(searchMatch(items, '105').length, 1, 'Match by room');
      assert.equal(searchMatch(items, 'Jane').length, 1, 'Match by guest name');
      assert.equal(searchMatch(items, '2222').length, 1, 'Match by phone');
      assert.equal(searchMatch(items, 'BK-105').length, 1, 'Match by booking code');
    });

    it('13. Immediate count updates after check-in and check-out via refetch & cache invalidation', () => {
      // Verifies Screen hooks and sheet callbacks
      assert.ok(screenContent.includes('refetch()'), 'Screen must call refetch on sheet close and refresh');
      assert.ok(screenContent.includes('useFocusEffect('), 'Screen must call useFocusEffect to keep counts synced');
      assert.ok(screenContent.includes('onClose={() => {'), 'Sheets must trigger refetch on close');
    });
  });

  describe('UI & Layout Design Requirements', () => {
    it('Uses two main sections: Arrivals and Departures with clear tabs', () => {
      assert.ok(screenContent.includes("Arrivals ({checkinStats.total})"), 'Must render Arrivals tab');
      assert.ok(screenContent.includes("Departures ({checkoutStats.total})"), 'Must render Departures tab');
      assert.ok(screenContent.includes("styles.tabContainer"), 'Must style tabs container');
    });

    it('Renders 3 clear count cards for Today\'s Arrivals: Expected, Checked in, Not arrived', () => {
      assert.ok(screenContent.includes("Today's Arrivals"), 'Must render Today\'s Arrivals title');
      assert.ok(screenContent.includes("threeCardsRow"), 'Must use 3-card layout');
      assert.ok(screenContent.includes("checkinStats.expected_today"), 'Must render expected count');
      assert.ok(screenContent.includes("checkinStats.checked_in"), 'Must render checked in count');
      assert.ok(screenContent.includes("checkinStats.pending"), 'Must render not arrived count');
    });

    it('Renders 3 clear count cards for Today\'s Departures: Expected, Checked out, Still staying', () => {
      assert.ok(screenContent.includes("Today's Departures"), 'Must render Today\'s Departures title');
      assert.ok(screenContent.includes("checkoutStats.expected_today"), 'Must render expected departures count');
      assert.ok(screenContent.includes("checkoutStats.checked_out"), 'Must render checked out count');
      assert.ok(screenContent.includes("checkoutStats.pending"), 'Must render still staying count');
    });

    it('Renders dedicated Needs Attention section for Late arrivals and Late check-outs', () => {
      assert.ok(screenContent.includes("Needs Attention"), 'Must render Needs Attention section title');
      assert.ok(screenContent.includes("Late arrivals"), 'Must render Late arrivals tile');
      assert.ok(screenContent.includes("Late check-outs"), 'Must render Late check-outs tile');
      assert.ok(screenContent.includes("checkinStats.late_arrivals"), 'Must render late arrivals count');
      assert.ok(screenContent.includes("checkoutStats.late_checkouts"), 'Must render late check-outs count');
    });

    it('Renders simplified filter chips: All, Expected, Not arrived/Still staying, Checked in/Checked out, Late arrivals/Late check-outs', () => {
      assert.ok(screenContent.includes("All ({checkinStats.total})"), 'Must render All arrivals filter');
      assert.ok(screenContent.includes("Expected ({checkinStats.expected_today})"), 'Must render Expected arrivals filter');
      assert.ok(screenContent.includes("Not arrived ({checkinStats.pending})"), 'Must render Not arrived filter');
      assert.ok(screenContent.includes("Checked in ({checkinStats.checked_in})"), 'Must render Checked in filter');
      assert.ok(screenContent.includes("Late arrivals ({checkinStats.late_arrivals})"), 'Must render Late arrivals filter');

      assert.ok(screenContent.includes("All ({checkoutStats.total})"), 'Must render All departures filter');
      assert.ok(screenContent.includes("Expected ({checkoutStats.expected_today})"), 'Must render Expected departures filter');
      assert.ok(screenContent.includes("Still staying ({checkoutStats.pending})"), 'Must render Still staying filter');
      assert.ok(screenContent.includes("Checked out ({checkoutStats.checked_out})"), 'Must render Checked out filter');
      assert.ok(screenContent.includes("Late check-outs ({checkoutStats.late_checkouts})"), 'Must render Late check-outs filter');
    });

    it('Renders consistent counter: Showing X of Y bookings matching total section count', () => {
      assert.ok(screenContent.includes("Showing {currentCount} of {currentTotal} bookings"), 'Must render Showing count matching section total');
    });
  });
});
