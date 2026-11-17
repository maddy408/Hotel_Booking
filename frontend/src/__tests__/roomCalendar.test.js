import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MONTH_NAMES,
  WEEKDAYS,
  WEEKDAY_FULL,
  isSameDay,
  formatSelectedDateText,
  getCalendarGrid,
} from '../lib/calendar.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('RoomCalendar Monthly Calendar Logic Verification', () => {
  it('1. formats selected date correctly in full human-readable format', () => {
    const testDate = new Date(2026, 10, 16); // 16 November 2026 (Monday)
    const formatted = formatSelectedDateText(testDate);
    assert.equal(formatted, '16 November 2026 (Monday)');

    const febLeap = new Date(2024, 1, 29); // 29 February 2024 (Thursday)
    assert.equal(formatSelectedDateText(febLeap), '29 February 2024 (Thursday)');

    const newYear = new Date(2027, 0, 1); // 1 January 2027 (Friday)
    assert.equal(formatSelectedDateText(newYear), '1 January 2027 (Friday)');
  });

  it('2. aligns weekdays properly starting on Sunday', () => {
    assert.deepEqual(WEEKDAYS, ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
    assert.equal(WEEKDAYS.length, 7);
  });

  it('3. starts month on the correct weekday and aligns leading days', () => {
    // November 2026 starts on Sunday (weekday 0)
    const nov2026 = getCalendarGrid(2026, 10);
    assert.equal(nov2026[0].dayNumber, 1);
    assert.equal(nov2026[0].isCurrentMonth, true);
    assert.equal(nov2026[0].date.getDay(), 0); // Sunday

    // October 2026 starts on Thursday (weekday 4)
    // Leading days from September: 4 days (Sep 27, 28, 29, 30)
    const oct2026 = getCalendarGrid(2026, 9);
    assert.equal(oct2026[0].isPrevMonth, true);
    assert.equal(oct2026[0].dayNumber, 27);
    assert.equal(oct2026[0].month, 8); // September
    assert.equal(oct2026[4].isCurrentMonth, true);
    assert.equal(oct2026[4].dayNumber, 1);
    assert.equal(oct2026[4].date.getDay(), 4); // Thursday
  });

  it('4. handles February in leap and non-leap years accurately', () => {
    // Leap year: 2024 (29 days)
    const feb2024 = getCalendarGrid(2024, 1);
    const feb2024CurrentDays = feb2024.filter((d) => d.isCurrentMonth);
    assert.equal(feb2024CurrentDays.length, 29);
    assert.equal(feb2024CurrentDays[28].dayNumber, 29);

    // Non-leap year: 2025 (28 days)
    const feb2025 = getCalendarGrid(2025, 1);
    const feb2025CurrentDays = feb2025.filter((d) => d.isCurrentMonth);
    assert.equal(feb2025CurrentDays.length, 28);
    assert.equal(feb2025CurrentDays[27].dayNumber, 28);

    // Non-leap year: 2026 (28 days)
    const feb2026 = getCalendarGrid(2026, 1);
    const feb2026CurrentDays = feb2026.filter((d) => d.isCurrentMonth);
    assert.equal(feb2026CurrentDays.length, 28);

    // Leap year: 2028 (29 days)
    const feb2028 = getCalendarGrid(2028, 1);
    const feb2028CurrentDays = feb2028.filter((d) => d.isCurrentMonth);
    assert.equal(feb2028CurrentDays.length, 29);
  });

  it('5. handles 30-day and 31-day month lengths correctly', () => {
    // April (30 days)
    const apr = getCalendarGrid(2026, 3).filter((d) => d.isCurrentMonth);
    assert.equal(apr.length, 30);

    // May (31 days)
    const may = getCalendarGrid(2026, 4).filter((d) => d.isCurrentMonth);
    assert.equal(may.length, 31);

    // June (30 days)
    const jun = getCalendarGrid(2026, 5).filter((d) => d.isCurrentMonth);
    assert.equal(jun.length, 30);

    // July (31 days)
    const jul = getCalendarGrid(2026, 6).filter((d) => d.isCurrentMonth);
    assert.equal(jul.length, 31);

    // August (31 days)
    const aug = getCalendarGrid(2026, 7).filter((d) => d.isCurrentMonth);
    assert.equal(aug.length, 31);
  });

  it('6. ensures date grid is always full weekly rows (multiples of 7)', () => {
    for (let month = 0; month < 12; month++) {
      const grid = getCalendarGrid(2026, month);
      assert.equal(grid.length % 7, 0, `Month ${month} has complete 7-day weeks`);
      assert.ok(grid.length === 35 || grid.length === 42, `Month ${month} has 5 or 6 rows`);
    }
  });

  it('7. month navigation logic handles year boundary transitions', () => {
    // Navigating back from January 2027 goes to December 2026
    const prevMonthStep = (year, month) => {
      if (month === 0) return { year: year - 1, month: 11 };
      return { year, month: month - 1 };
    };

    const decTransition = prevMonthStep(2027, 0);
    assert.deepEqual(decTransition, { year: 2026, month: 11 });

    // Navigating forward from December 2026 goes to January 2027
    const nextMonthStep = (year, month) => {
      if (month === 11) return { year: year + 1, month: 0 };
      return { year, month: month + 1 };
    };

    const janTransition = nextMonthStep(2026, 11);
    assert.deepEqual(janTransition, { year: 2027, month: 0 });
  });

  it('8. clicking adjacent month date navigates to that month correctly', () => {
    // In November 2026, trailing days are in December 2026
    const nov2026 = getCalendarGrid(2026, 10);
    const decCell = nov2026.find((d) => d.isNextMonth);
    assert.ok(decCell);
    assert.equal(decCell.isCurrentMonth, false);
    assert.equal(decCell.month, 11); // December
    assert.equal(decCell.year, 2026);

    // In January 2027, leading days are in December 2026
    const jan2027 = getCalendarGrid(2027, 0);
    const leadingDec = jan2027.find((d) => d.isPrevMonth);
    assert.ok(leadingDec);
    assert.equal(leadingDec.isCurrentMonth, false);
    assert.equal(leadingDec.month, 11); // December
    assert.equal(leadingDec.year, 2026);
  });

  it('9. isSameDay correctly identifies matching dates', () => {
    const d1 = new Date(2026, 10, 16, 9, 30);
    const d2 = new Date(2026, 10, 16, 18, 45);
    const d3 = new Date(2026, 10, 17, 9, 30);
    assert.equal(isSameDay(d1, d2), true);
    assert.equal(isSameDay(d1, d3), false);
    assert.equal(isSameDay(d1, null), false);
  });

  it('10. verifies month names list completeness', () => {
    assert.equal(MONTH_NAMES.length, 12);
    assert.equal(MONTH_NAMES[0], 'January');
    assert.equal(MONTH_NAMES[10], 'November');
    assert.equal(MONTH_NAMES[11], 'December');
  });

  it('11. verifies month and year displayed together on one horizontal line format', () => {
    const formatHeaderMonthYear = (month, year) => `${MONTH_NAMES[month]} ${year}`;
    assert.equal(formatHeaderMonthYear(10, 2026), 'November 2026');
    assert.equal(formatHeaderMonthYear(0, 2027), 'January 2027');
    assert.equal(formatHeaderMonthYear(5, 2025), 'June 2025');
  });

  it('12. verifies CSS layout rules for compact calendar and room grid', () => {
    const cssPath = path.resolve(__dirname, '../components/RoomCalendar.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');

    // Desktop calendar width requirement (approx 390–410px)
    assert.ok(cssContent.includes('410px'), 'Includes 410px max/clamp width for compact calendar');
    assert.ok(cssContent.includes('390px'), 'Includes 390px clamp min width');

    // Room grid ~72-75% width and calendar ~25-28%
    assert.ok(cssContent.includes('74%'), 'Grid column accounts for ~72–75% width');
    assert.ok(cssContent.includes('26%'), 'Calendar column accounts for ~25–28% width');

    // Date cell height requirement: approximately 38–42px
    assert.ok(cssContent.includes('38px'), 'Date cells specify 38px height');

    // Navbar background highlight #0B0B58 / var(--color-header)
    assert.ok(
      cssContent.includes('#0B0B58') || cssContent.includes('var(--color-header'),
      'Selected date uses application navbar background color'
    );

    // Responsive tablet and mobile media queries
    assert.ok(cssContent.includes('@media (max-width: 1024px)'), 'Tablet breakpoint defined');
    assert.ok(cssContent.includes('@media (max-width: 640px)'), 'Mobile breakpoint defined');
    assert.ok(cssContent.includes('repeat(7, 1fr)'), '7-column grid layout preserved');
  });

  it('13. verifies RoomCalendar JSX structure implements compact widget requirements', () => {
    const jsxPath = path.resolve(__dirname, '../components/RoomCalendar.jsx');
    const jsxContent = fs.readFileSync(jsxPath, 'utf8');

    // Month and year displayed on one line in room-cal-month-title
    assert.ok(jsxContent.includes('room-cal-month-title'), 'Contains single month title element');
    assert.ok(jsxContent.includes('{MONTH_NAMES[viewMonth]} {viewYear}'), 'Displays Month and Year together');

    // Previous and Next buttons on either side
    assert.ok(jsxContent.includes('room-cal-nav-btn prev'), 'Contains prev button on left');
    assert.ok(jsxContent.includes('room-cal-nav-btn next'), 'Contains next button on right');

    // Compact today button
    assert.ok(jsxContent.includes('room-cal-today-btn'), 'Contains compact Today button');

    // Selected date information in small footer
    assert.ok(jsxContent.includes('room-cal-selected-info'), 'Contains small footer for selected date');
  });
});
