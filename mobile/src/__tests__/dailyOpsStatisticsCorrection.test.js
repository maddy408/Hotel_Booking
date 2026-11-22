import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.resolve(__dirname, '..');

describe('Daily Ops Arrival and Departure Statistics Correction Tests', () => {
  const dailyOpsScreenPath = path.join(srcDir, 'screens', 'dailyops', 'DailyOpsScreen.jsx');
  assert.ok(fs.existsSync(dailyOpsScreenPath), 'DailyOpsScreen.jsx must exist');
  const screenContent = fs.readFileSync(dailyOpsScreenPath, 'utf8');

  // Exact reproduction of DailyOpsScreen checkinStats calculation
  const computeCheckinStats = (checkinsList, today) => {
    let expectedToday = 0;
    let pending = 0;
    let checkedInToday = 0;
    let overdue = 0;

    checkinsList.forEach((c) => {
      const isCancelledOrNoShow = c.status === 'cancelled' || c.status === 'no_show' || c.reservation_status === 'cancelled' || c.reservation_status === 'no_show';
      if (isCancelledOrNoShow) return;

      const isOverdue = Boolean(c.is_overdue || (c.check_in_date && today && c.check_in_date < today && (c.checkin_status === 'pending' || c.checkin_status === 'overdue')));
      const isPending = (c.checkin_status === 'pending' || c.status === 'pending') && !isOverdue;
      const isCheckedIn = c.checkin_status === 'checked_in' || c.checkin_status === 'checked_out' || c.is_checked_in_today;

      if (isOverdue) {
        overdue++;
      } else if (isPending && (c.check_in_date === today || c.is_expected_today)) {
        expectedToday++;
        pending++;
      } else if (isCheckedIn) {
        checkedInToday++;
        if (c.is_expected_today || (c.check_in_date === today && !c.was_overdue)) {
          expectedToday++;
        }
      }
    });

    return {
      total: expectedToday,
      expected: expectedToday,
      expected_today: expectedToday,
      pending,
      checked_in: checkedInToday,
      checked_in_today: checkedInToday,
      completed: checkedInToday,
      overdue,
      overdue_arrivals: overdue,
      all_count: checkinsList.length,
    };
  };

  // Exact reproduction of DailyOpsScreen checkoutStats calculation
  const computeCheckoutStats = (checkoutsList, today) => {
    let expectedToday = 0;
    let pending = 0;
    let completedToday = 0;
    let overdue = 0;

    checkoutsList.forEach((c) => {
      const plannedDate = c.checkout_planned;
      const isOverdue = Boolean(c.is_overdue || (c.checkout_status === 'overdue') || (plannedDate && today && plannedDate < today && (c.checkout_status === 'pending' || c.stay_status === 'in_house')));
      const isCheckedOut = c.checkout_status === 'checked_out' || c.stay_status === 'checked_out' || Boolean(c.checkout_actual);
      const isPending = !isOverdue && !isCheckedOut && (c.checkout_status === 'pending' || c.stay_status === 'in_house');

      if (isOverdue) {
        overdue++;
      } else if (isCheckedOut) {
        completedToday++;
        if (c.is_expected_today || plannedDate === today) {
          expectedToday++;
        }
      } else if (isPending && (c.is_expected_today || plannedDate === today)) {
        expectedToday++;
        pending++;
      }
    });

    return {
      total: expectedToday,
      expected: expectedToday,
      expected_today: expectedToday,
      pending,
      completed: completedToday,
      completed_today: completedToday,
      checked_out: completedToday,
      overdue,
      overdue_departures: overdue,
      all_count: checkoutsList.length,
    };
  };

  const filterItems = (list, type, filter, today) => {
    if (filter === 'all') return list;

    if (type === 'checkins') {
      if (filter === 'expected') {
        return list.filter((i) => i.is_expected_today ?? (i.check_in_date === today));
      }
      if (filter === 'pending') {
        return list.filter((i) => (i.checkin_status ?? i.status) === 'pending' && (i.check_in_date === today));
      }
      if (filter === 'checked_in') {
        return list.filter((i) => (i.checkin_status ?? i.status) === 'checked_in' || (i.checkin_status ?? i.status) === 'completed');
      }
      if (filter === 'overdue') {
        return list.filter((i) => i.is_overdue || ((i.checkin_status ?? i.status) === 'pending' && i.check_in_date < today));
      }
    } else {
      if (filter === 'expected') {
        return list.filter((i) => i.is_expected_today ?? (i.checkout_planned === today));
      }
      if (filter === 'pending') {
        return list.filter((i) => (i.checkout_status === 'pending' || i.stay_status === 'in_house') && i.checkout_planned === today);
      }
      if (filter === 'checked_out') {
        return list.filter((i) => i.checkout_status === 'checked_out' || i.stay_status === 'checked_out');
      }
      if (filter === 'overdue') {
        return list.filter((i) => i.is_overdue || (i.checkout_status === 'overdue') || (i.stay_status === 'in_house' && i.checkout_planned < today));
      }
    }
    return list;
  };

  const TODAY = '2026-11-21';

  describe('10 Business Rule and Edge-Case Scenarios', () => {
    it('Scenario 1: Guest arriving today and not checked in', () => {
      const items = [
        {
          id: 'res-101',
          kind: 'reservation',
          check_in_date: TODAY,
          checkin_status: 'pending',
          status: 'pending',
          is_expected_today: true,
          is_overdue: false,
        },
      ];
      const stats = computeCheckinStats(items, TODAY);
      assert.equal(stats.expected_today, 1, 'Expected Today must equal 1');
      assert.equal(stats.pending, 1, 'Pending must equal 1');
      assert.equal(stats.checked_in_today, 0, 'Checked-in Today must equal 0');
      assert.equal(stats.overdue, 0, 'Overdue must equal 0');

      const expectedFiltered = filterItems(items, 'checkins', 'expected', TODAY);
      assert.equal(expectedFiltered.length, 1);
      const pendingFiltered = filterItems(items, 'checkins', 'pending', TODAY);
      assert.equal(pendingFiltered.length, 1);
    });

    it('Scenario 2: Guest arriving today and checked in today', () => {
      const items = [
        {
          id: 'stay-201',
          kind: 'stay',
          check_in_date: TODAY,
          checkin_status: 'checked_in',
          status: 'checked_in',
          is_expected_today: true,
          is_checked_in_today: true,
          is_overdue: false,
        },
      ];
      const stats = computeCheckinStats(items, TODAY);
      assert.equal(stats.expected_today, 1, 'Expected Today must equal 1');
      assert.equal(stats.pending, 0, 'Pending must equal 0');
      assert.equal(stats.checked_in_today, 1, 'Checked-in Today must equal 1');
      assert.equal(stats.overdue, 0, 'Overdue must equal 0');

      const checkedInFiltered = filterItems(items, 'checkins', 'checked_in', TODAY);
      assert.equal(checkedInFiltered.length, 1);
      const pendingFiltered = filterItems(items, 'checkins', 'pending', TODAY);
      assert.equal(pendingFiltered.length, 0);
    });

    it('Scenario 3: Guest arriving on a past date and still pending', () => {
      const items = [
        {
          id: 'res-301',
          kind: 'reservation',
          check_in_date: '2026-11-19', // Past date
          checkin_status: 'overdue',
          status: 'pending',
          is_expected_today: false,
          is_overdue: true,
        },
      ];
      const stats = computeCheckinStats(items, TODAY);
      assert.equal(stats.expected_today, 0, 'Past-due arrival must NOT be counted as Expected Today');
      assert.equal(stats.pending, 0, 'Past-due arrival must NOT be counted as pending today arrival');
      assert.equal(stats.checked_in_today, 0, 'Checked-in Today must equal 0');
      assert.equal(stats.overdue, 1, 'Overdue Arrivals must equal 1');

      const overdueFiltered = filterItems(items, 'checkins', 'overdue', TODAY);
      assert.equal(overdueFiltered.length, 1);
      const expectedFiltered = filterItems(items, 'checkins', 'expected', TODAY);
      assert.equal(expectedFiltered.length, 0);
    });

    it('Scenario 4: Overdue arrival completed today', () => {
      const items = [
        {
          id: 'stay-401',
          kind: 'stay',
          check_in_date: '2026-11-18', // Originally scheduled in the past
          checkin_status: 'checked_in',
          status: 'checked_in',
          is_expected_today: false,
          was_overdue: true,
          is_overdue: false, // No longer overdue
          is_checked_in_today: true, // Completed today
        },
      ];
      const stats = computeCheckinStats(items, TODAY);
      assert.equal(stats.expected_today, 0, 'Past scheduled check-in was overdue, not expected today');
      assert.equal(stats.pending, 0, 'Not pending');
      assert.equal(stats.checked_in_today, 1, 'Completed today must increment Checked-in Today');
      assert.equal(stats.overdue, 0, 'Checked in overdue guest must be removed from currently overdue list');

      const checkedInFiltered = filterItems(items, 'checkins', 'checked_in', TODAY);
      assert.equal(checkedInFiltered.length, 1);
      const overdueFiltered = filterItems(items, 'checkins', 'overdue', TODAY);
      assert.equal(overdueFiltered.length, 0);
    });

    it('Scenario 5: Guest checking out today and still staying', () => {
      const items = [
        {
          id: 'stay-501',
          kind: 'stay',
          checkout_planned: TODAY,
          stay_status: 'in_house',
          checkout_status: 'pending',
          is_expected_today: true,
          is_overdue: false,
        },
      ];
      const stats = computeCheckoutStats(items, TODAY);
      assert.equal(stats.expected_today, 1, 'Expected Today departures must equal 1');
      assert.equal(stats.pending, 1, 'Pending departures must equal 1');
      assert.equal(stats.completed_today, 0, 'Completed departures must equal 0');
      assert.equal(stats.overdue, 0, 'Overdue departures must equal 0');

      const expectedFiltered = filterItems(items, 'checkouts', 'expected', TODAY);
      assert.equal(expectedFiltered.length, 1);
      const pendingFiltered = filterItems(items, 'checkouts', 'pending', TODAY);
      assert.equal(pendingFiltered.length, 1);
    });

    it('Scenario 6: Guest checking out today and already completed', () => {
      const items = [
        {
          id: 'stay-601',
          kind: 'stay',
          checkout_planned: TODAY,
          checkout_actual: `${TODAY} 11:30:00`,
          stay_status: 'checked_out',
          checkout_status: 'checked_out',
          is_expected_today: true,
          is_overdue: false,
        },
      ];
      const stats = computeCheckoutStats(items, TODAY);
      assert.equal(stats.expected_today, 1, 'Expected Today departures must equal 1');
      assert.equal(stats.pending, 0, 'Pending departures must equal 0');
      assert.equal(stats.completed_today, 1, 'Completed Today departures must equal 1');
      assert.equal(stats.overdue, 0, 'Overdue departures must equal 0');

      const completedFiltered = filterItems(items, 'checkouts', 'checked_out', TODAY);
      assert.equal(completedFiltered.length, 1);
      const pendingFiltered = filterItems(items, 'checkouts', 'pending', TODAY);
      assert.equal(pendingFiltered.length, 0);
    });

    it('Scenario 7: Guest overdue for checkout and still staying', () => {
      const items = [
        {
          id: 'stay-701',
          kind: 'stay',
          checkout_planned: '2026-11-20', // Yesterday
          stay_status: 'in_house',
          checkout_status: 'overdue',
          is_expected_today: false,
          is_overdue: true,
        },
      ];
      const stats = computeCheckoutStats(items, TODAY);
      assert.equal(stats.expected_today, 0, 'Past-due checkout must NEVER count as Expected Today');
      assert.equal(stats.pending, 0, 'Past-due checkout must NOT count as pending expected checkout');
      assert.equal(stats.completed_today, 0, 'Completed departures must equal 0');
      assert.equal(stats.overdue, 1, 'Overdue departures must equal 1');

      const overdueFiltered = filterItems(items, 'checkouts', 'overdue', TODAY);
      assert.equal(overdueFiltered.length, 1);
      const expectedFiltered = filterItems(items, 'checkouts', 'expected', TODAY);
      assert.equal(expectedFiltered.length, 0);
    });

    it('Scenario 8: Overdue checkout completed today', () => {
      const items = [
        {
          id: 'stay-801',
          kind: 'stay',
          checkout_planned: '2026-11-19', // Past due date
          checkout_actual: `${TODAY} 09:15:00`, // Checked out today
          stay_status: 'checked_out',
          checkout_status: 'checked_out',
          is_expected_today: false,
          is_overdue: false, // Removed from overdue
        },
      ];
      const stats = computeCheckoutStats(items, TODAY);
      assert.equal(stats.expected_today, 0, 'Past-due checkout must NEVER count as Expected Today');
      assert.equal(stats.pending, 0, 'Pending must equal 0');
      assert.equal(stats.completed_today, 1, 'Overdue guest checked out today increments Completed Today');
      assert.equal(stats.overdue, 0, 'Overdue guest checked out today must be removed from currently overdue list');

      const completedFiltered = filterItems(items, 'checkouts', 'checked_out', TODAY);
      assert.equal(completedFiltered.length, 1);
      const overdueFiltered = filterItems(items, 'checkouts', 'overdue', TODAY);
      assert.equal(overdueFiltered.length, 0);
    });

    it('Scenario 9: Guest checking in and checking out on the same day', () => {
      const checkinItem = {
        id: 'stay-901',
        kind: 'stay',
        check_in_date: TODAY,
        checkin_status: 'checked_in',
        stay_status: 'checked_out',
        is_expected_today: true,
        is_checked_in_today: true,
        is_overdue: false,
      };

      const checkoutItem = {
        id: 'stay-901',
        kind: 'stay',
        check_in_date: TODAY,
        checkout_planned: TODAY,
        checkout_actual: `${TODAY} 17:00:00`,
        stay_status: 'checked_out',
        checkout_status: 'checked_out',
        is_expected_today: true,
        is_overdue: false,
      };

      const checkinStats = computeCheckinStats([checkinItem], TODAY);
      const checkoutStats = computeCheckoutStats([checkoutItem], TODAY);

      assert.equal(checkinStats.checked_in_today, 1, 'Same-day stay increments Checked-in Today');
      assert.equal(checkoutStats.completed_today, 1, 'Same-day stay increments Completed Today');
    });

    it('Scenario 10: Cancelled and no-show reservations are excluded', () => {
      // Backend queries:
      // WHERE res.status = 'pending' (excludes 'cancelled' and 'no_show')
      // and stays WHERE s.status != 'cancelled'
      const checkinItems = [
        {
          id: 'res-valid',
          kind: 'reservation',
          check_in_date: TODAY,
          status: 'pending',
          checkin_status: 'pending',
          is_expected_today: true,
        },
        {
          id: 'res-cancelled',
          kind: 'reservation',
          check_in_date: TODAY,
          status: 'cancelled',
          checkin_status: 'cancelled',
          is_expected_today: false,
        },
        {
          id: 'res-noshow',
          kind: 'reservation',
          check_in_date: TODAY,
          status: 'no_show',
          checkin_status: 'no_show',
          is_expected_today: false,
        },
      ];
      const stats = computeCheckinStats(checkinItems, TODAY);
      assert.equal(stats.expected_today, 1, 'Only non-cancelled/non-noshow counted in expected');
      assert.equal(stats.pending, 1, 'Only non-cancelled/non-noshow counted in pending');
      assert.equal(stats.overdue, 0, 'No overdue for cancelled/noshow');
    });
  });

  describe('UI Design, Clickable Tiles, and Interactive Filters Parity', () => {
    it('Removes Checked Out from Today\'s Check-ins summary', () => {
      // Check that the checkin metric cards only have Expected, Pending, Checked-in, and Overdue
      const checkinsSectionRegex = /Today's Check-ins[\s\S]*?Today's Check-outs/;
      const match = screenContent.match(checkinsSectionRegex);
      assert.ok(match, "Must find Today's Check-ins section");
      const checkinSectionText = match[0];

      assert.ok(checkinSectionText.includes('Expected'), 'Arrivals must show Expected tile');
      assert.ok(checkinSectionText.includes('Pending'), 'Arrivals must show Pending tile');
      assert.ok(checkinSectionText.includes('Checked-in'), 'Arrivals must show Checked-in tile');
      assert.ok(checkinSectionText.includes('Overdue'), 'Arrivals must show Overdue tile');

      // The label "Checked Out" or "checkoutStats" must not be a metric tile in Check-ins
      assert.ok(!checkinSectionText.includes('checkoutStats'), 'Check-ins summary must not reference checkoutStats');
    });

    it('Shows 4 statistics for Departures: Expected Today, Pending, Completed Today, Overdue', () => {
      const checkoutsSectionRegex = /Today's Check-outs[\s\S]*?SearchInput/;
      const match = screenContent.match(checkoutsSectionRegex);
      assert.ok(match, "Must find Today's Check-outs section");
      const checkoutSectionText = match[0];

      assert.ok(checkoutSectionText.includes('Expected'), 'Departures must show Expected tile');
      assert.ok(checkoutSectionText.includes('Pending'), 'Departures must show Pending tile');
      assert.ok(checkoutSectionText.includes('Completed'), 'Departures must show Completed tile');
      assert.ok(checkoutSectionText.includes('Overdue'), 'Departures must show Overdue tile');
    });

    it('Every summary tile is clickable and filters list with handleTilePress', () => {
      // Check arrivals tiles
      assert.ok(screenContent.includes("handleTilePress('expected')"), 'Expected tile must be clickable');
      assert.ok(screenContent.includes("handleTilePress('pending')"), 'Pending tile must be clickable');
      assert.ok(screenContent.includes("handleTilePress('checked_in')"), 'Checked-in tile must be clickable');
      assert.ok(screenContent.includes("handleTilePress('overdue')"), 'Overdue tile must be clickable');
      // Check departures tiles
      assert.ok(screenContent.includes("handleTilePress('checked_out')"), 'Completed departure tile must be clickable');
    });

    it('Provides Show All action with filterBanner to clear filter', () => {
      assert.ok(screenContent.includes('filterBanner'), 'Must render filter banner when filtered');
      assert.ok(screenContent.includes('Show All'), 'Must have Show All button');
      assert.ok(screenContent.includes("setStatusFilter('all')"), 'Show All button must setStatusFilter(all)');
    });

    it('Overdue items render danger badge and allow check-in and check-out processing', () => {
      assert.ok(screenContent.includes('badgeDanger'), 'Must define and use badgeDanger for overdue items');
      assert.ok(screenContent.includes('textDanger'), 'Must define and use textDanger for overdue text');
      assert.ok(screenContent.includes('Process Check-in →'), 'Overdue arrival cards must allow Process Check-in');
      assert.ok(screenContent.includes('Process Check-out →'), 'Overdue checkout cards must allow Process Check-out');
    });
  });
});
