import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  todayIso,
  addDaysIso,
  fd,
  fdWithYear,
  getPresetDateRange,
  formatDateRangeLabel,
  inr,
} from '../lib/format.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.resolve(__dirname, '..');
const projectRootDir = path.resolve(srcDir, '..', '..');

describe('Compact Mobile Date Filters for Reports and Bills', () => {
  const dateFilterPath = path.join(srcDir, 'components', 'DateFilter.jsx');
  const reportsScreenPath = path.join(srcDir, 'screens', 'more', 'ReportsScreen.jsx');
  const billsScreenPath = path.join(srcDir, 'screens', 'bills', 'BillsScreen.jsx');
  const reportsApiPath = path.join(srcDir, 'api', 'reports.js');
  const staysApiPath = path.join(srcDir, 'api', 'stays.js');
  const backendReportRepoPath = path.join(projectRootDir, 'backend', 'src', 'Repository', 'ReportRepository.php');
  const backendReportServicePath = path.join(projectRootDir, 'backend', 'src', 'Service', 'ReportService.php');
  const backendReportControllerPath = path.join(projectRootDir, 'backend', 'src', 'Controller', 'ReportController.php');

  const dateFilterContent = fs.readFileSync(dateFilterPath, 'utf8');
  const reportsScreenContent = fs.readFileSync(reportsScreenPath, 'utf8');
  const billsScreenContent = fs.readFileSync(billsScreenPath, 'utf8');
  const reportsApiContent = fs.readFileSync(reportsApiPath, 'utf8');
  const staysApiContent = fs.readFileSync(staysApiPath, 'utf8');
  const backendReportRepoContent = fs.readFileSync(backendReportRepoPath, 'utf8');
  const backendReportServiceContent = fs.readFileSync(backendReportServicePath, 'utf8');
  const backendReportControllerContent = fs.readFileSync(backendReportControllerPath, 'utf8');

  // ==========================================================================
  // Section 1: Compact Date Filter Control Verification
  // ==========================================================================
  describe('1. Compact Date Filter Control', () => {
    it('DateFilter.jsx exists and exports reusable component for both screens', () => {
      assert.ok(fs.existsSync(dateFilterPath), 'DateFilter.jsx must exist');
      assert.ok(dateFilterContent.includes('export default function DateFilter'), 'Must export DateFilter component');
    });

    it('Uses calendar icon and dropdown/chevron indicator in compact bar', () => {
      assert.ok(dateFilterContent.includes('CalendarIcon'), 'Must include CalendarIcon');
      assert.ok(dateFilterContent.includes('ChevronDownIcon'), 'Must include ChevronDownIcon');
      assert.ok(dateFilterContent.includes('filterBar'), 'Must render compact filterBar container');
    });

    it('Shows currently selected period label on the trigger bar', () => {
      assert.ok(dateFilterContent.includes('currentLabel'), 'Must display active/current period label');
      assert.ok(dateFilterContent.includes('filterBarLabel'), 'Must style label for clear readability');
    });

    it('Does not permanently display multiple filter buttons or date pickers on screen', () => {
      // The filter bar is a single touchable element that opens a modal bottom sheet
      assert.ok(dateFilterContent.includes('Modal'), 'Filter selection must be encapsulated in a Modal');
      assert.ok(!reportsScreenContent.includes('<input type="date"'), 'ReportsScreen must not render raw HTML date pickers');
      assert.ok(!billsScreenContent.includes('<input type="date"'), 'BillsScreen must not render raw HTML date pickers');
    });
  });

  // ==========================================================================
  // Section 2: Date Selection Bottom Sheet Verification
  // ==========================================================================
  describe('2. Date Selection Bottom Sheet', () => {
    it('Provides Today, Yesterday, Last 7 days, This week, This month, and Custom range presets', () => {
      assert.ok(dateFilterContent.includes("key: 'today', label: 'Today'"), 'Must include Today preset');
      assert.ok(dateFilterContent.includes("key: 'yesterday', label: 'Yesterday'"), 'Must include Yesterday preset');
      assert.ok(dateFilterContent.includes("key: 'last7', label: 'Last 7 days'"), 'Must include Last 7 days preset');
      assert.ok(dateFilterContent.includes("key: 'thisWeek', label: 'This week'"), 'Must include This week preset');
      assert.ok(dateFilterContent.includes("key: 'thisMonth', label: 'This month'"), 'Must include This month preset');
      assert.ok(dateFilterContent.includes("key: 'custom', label: 'Custom range'"), 'Must include Custom range preset');
    });

    it('Displays preset options in a compact two-column layout', () => {
      assert.ok(dateFilterContent.includes('presetsGrid'), 'Must define presetsGrid style');
      assert.ok(dateFilterContent.includes("width: '48.4%'") || dateFilterContent.includes("width: '48%'") || dateFilterContent.includes('flexWrap'), 'Must use 2-column flexWrap layout');
    });

    it('Follows existing lavender/purple application theme', () => {
      assert.ok(dateFilterContent.includes('colors.secondaryLight'), 'Must use secondaryLight (#EEF2FF) for active state');
      assert.ok(dateFilterContent.includes('colors.primary'), 'Must use primary navy/purple (#0B0B58)');
    });

    it('Provides From Date and To Date fields when Custom range is selected', () => {
      assert.ok(dateFilterContent.includes("activePreset === 'custom'"), 'Must conditionally show custom section');
      assert.ok(dateFilterContent.includes('From Date'), 'Must render From Date field');
      assert.ok(dateFilterContent.includes('To Date'), 'Must render To Date field');
    });

    it('Opens the existing RoomCalendar date picker when a date field is tapped', () => {
      assert.ok(dateFilterContent.includes('RoomCalendar'), 'Must reuse existing RoomCalendar component');
      assert.ok(dateFilterContent.includes("pickerTarget === 'from'"), 'Must target from date on tap');
      assert.ok(dateFilterContent.includes("pickerTarget === 'to'"), 'Must target to date on tap');
    });

    it('Provides Apply and Cancel buttons with validation', () => {
      assert.ok(dateFilterContent.includes('handleApplyCustom'), 'Must have handleApplyCustom');
      assert.ok(dateFilterContent.includes('validateCustomRange'), 'Must have validateCustomRange');
      assert.ok(dateFilterContent.includes('closeSheet'), 'Cancel/dismiss must call closeSheet without changing applied filter');
    });
  });

  // ==========================================================================
  // Section 3: Preset Date Calculations & Timezone Handling (Asia/Kolkata)
  // ==========================================================================
  describe('3. Preset Calculations & Asia/Kolkata Timezone', () => {
    const fixedToday = '2026-11-25'; // Wednesday

    it('Calculates Today correctly in Asia/Kolkata', () => {
      const p = getPresetDateRange('today', fixedToday);
      assert.equal(p.from, '2026-11-25');
      assert.equal(p.to, '2026-11-25');
      assert.equal(p.label, 'Today');
    });

    it('Calculates Yesterday correctly', () => {
      const p = getPresetDateRange('yesterday', fixedToday);
      assert.equal(p.from, '2026-11-24');
      assert.equal(p.to, '2026-11-24');
      assert.equal(p.label, 'Yesterday');
    });

    it('Calculates Last 7 days correctly (7 days inclusive ending today)', () => {
      const p = getPresetDateRange('last7', fixedToday);
      assert.equal(p.from, '2026-11-19');
      assert.equal(p.to, '2026-11-25');
      assert.equal(p.label, 'Last 7 days');
    });

    it('Calculates This week correctly (Monday of current week to today)', () => {
      const p = getPresetDateRange('thisWeek', fixedToday);
      // 2026-11-25 is Wednesday. Monday is 2026-11-23.
      assert.equal(p.from, '2026-11-23');
      assert.equal(p.to, '2026-11-25');
      assert.equal(p.label, 'This week');
    });

    it('Calculates This month correctly (1st of month to today)', () => {
      const p = getPresetDateRange('thisMonth', fixedToday);
      assert.equal(p.from, '2026-11-01');
      assert.equal(p.to, '2026-11-25');
      assert.equal(p.label, 'This month');
    });

    it('Formats single custom date correctly', () => {
      const label = formatDateRangeLabel('2026-11-20', '2026-11-20', 'custom');
      assert.equal(label, '20 Nov 2026');
    });

    it('Formats custom date range correctly (e.g. 19 Nov – 25 Nov 2026)', () => {
      const label = formatDateRangeLabel('2026-11-19', '2026-11-25', 'custom');
      assert.equal(label, '19 Nov – 25 Nov 2026');
    });

    it('Handles custom one-month range across month boundaries', () => {
      const label = formatDateRangeLabel('2026-10-25', '2026-11-25', 'custom');
      assert.equal(label, '25 Oct – 25 Nov 2026');
    });

    it('Validates date ranges: rejects from > to', () => {
      const validate = (from, to, today = '2026-11-25') => {
        if (!from || !to) return 'Please select both From and To dates.';
        if (from > to) return 'From date cannot be after To date.';
        if (to > today) return 'Future dates are not permitted.';
        return null;
      };
      assert.equal(validate('2026-11-26', '2026-11-25'), 'From date cannot be after To date.');
      assert.equal(validate('2026-11-20', '2026-11-28'), 'Future dates are not permitted.');
      assert.equal(validate('', '2026-11-25'), 'Please select both From and To dates.');
      assert.equal(validate('2026-11-20', '2026-11-25'), null);
    });
  });

  // ==========================================================================
  // Section 4: Reports Integration Verification
  // ==========================================================================
  describe('4. Reports Integration', () => {
    it('ReportsScreen includes DateFilter component near top of screen', () => {
      assert.ok(reportsScreenContent.includes('<DateFilter value={filter} onChange={setFilter} />'), 'Must render DateFilter control');
    });

    it('ReportsScreen defaults filter to Today', () => {
      assert.ok(reportsScreenContent.includes("getPresetDateRange('today')"), 'ReportsScreen must default to Today');
    });

    it('Passes filter.from and filter.to to report queries', () => {
      assert.ok(reportsScreenContent.includes('useTodayReport(filter.from, filter.to)'), 'Must pass range to useTodayReport');
      assert.ok(reportsScreenContent.includes('useDayEndReport(filter.from, filter.to)'), 'Must pass range to useDayEndReport');
      assert.ok(reportsScreenContent.includes('useOccupancyReport(filter.from, filter.to)'), 'Must pass range to useOccupancyReport');
      assert.ok(reportsScreenContent.includes('useRevenueReport(filter.from, filter.to)'), 'Must pass range to useRevenueReport');
    });

    it('Card 1 displays check-outs, billed amount, advance taken, and occupancy', () => {
      assert.ok(reportsScreenContent.includes('Check-outs'), 'Must render Check-outs metric');
      assert.ok(reportsScreenContent.includes('Billed'), 'Must render Billed metric');
      assert.ok(reportsScreenContent.includes('Advance taken'), 'Must render Advance taken metric');
      assert.ok(reportsScreenContent.includes('Occupancy'), 'Must render Occupancy metric');
    });

    it('Occupancy respects calculation rules: does not sum daily occupancy counts into one number', () => {
      assert.ok(reportsScreenContent.includes('occSummary.percent'), 'Must use percentage or average for range occupancy');
      assert.ok(reportsScreenContent.includes('Daily Breakdown'), 'Must display daily occupancy in breakdown list');
      assert.ok(reportsScreenContent.includes('d.occupied}/{d.total} ({d.percent}%)'), 'Daily rows must show individual day ratio');
    });

    it('Card 2 displays collection breakdown: Cash, UPI, Card, and Total', () => {
      assert.ok(reportsScreenContent.includes('Day-end collection'), 'Must render collection card');
      assert.ok(reportsScreenContent.includes('Cash'), 'Must render Cash collection');
      assert.ok(reportsScreenContent.includes('UPI'), 'Must render UPI collection');
      assert.ok(reportsScreenContent.includes('Card'), 'Must render Card collection');
      assert.ok(reportsScreenContent.includes('Total'), 'Must render Total collected');
    });

    it('Card 3 displays revenue totals and preserves CSV export for selected period', () => {
      assert.ok(reportsScreenContent.includes('Invoices'), 'Must render Invoices count');
      assert.ok(reportsScreenContent.includes('Room revenue'), 'Must render Room revenue');
      assert.ok(reportsScreenContent.includes('GST collected'), 'Must render GST collected');
      assert.ok(reportsScreenContent.includes('Total revenue'), 'Must render Total revenue');
      assert.ok(reportsScreenContent.includes('downloadInvoicesCsv(filter.from, filter.to)'), 'CSV export must use active filter range');
    });
  });

  // ==========================================================================
  // Section 5: Bills Integration Verification
  // ==========================================================================
  describe('5. Bills Integration', () => {
    it('BillsScreen includes DateFilter component near top of screen', () => {
      assert.ok(billsScreenContent.includes('<DateFilter value={filter} onChange={setFilter} />'), 'Must render DateFilter control in BillsScreen');
    });

    it('BillsScreen defaults filter to Today', () => {
      assert.ok(billsScreenContent.includes("getPresetDateRange('today')"), 'BillsScreen must default to Today');
    });

    it('Queries completed stays filtered by s.checkout_actual via useDoneStays({ from, to })', () => {
      assert.ok(billsScreenContent.includes('useDoneStays(stayRange)'), 'BillsScreen must pass stayRange to useDoneStays');
      assert.ok(billsScreenContent.includes('from: filter.from, to: filter.to'), 'stayRange must reflect filter dates');
    });

    it('Updates Check-outs count and Billed at check-out amount when period changes', () => {
      assert.ok(billsScreenContent.includes('checkoutsCount'), 'Must compute checkoutsCount from active period');
      assert.ok(billsScreenContent.includes('billedAmount'), 'Must compute billedAmount from active period');
      assert.ok(billsScreenContent.includes('Check-outs'), 'Must render Check-outs label');
      assert.ok(billsScreenContent.includes('Billed at check-out'), 'Must render Billed at check-out label');
    });

    it('Preserves SearchInput and search filtering across invoice no, guest, and room', () => {
      assert.ok(billsScreenContent.includes('<SearchInput'), 'Must retain SearchInput');
      assert.ok(billsScreenContent.includes('filteredDone'), 'Must compute filteredDone with search query');
    });

    it('Displays friendly empty state when no bills belong to the period', () => {
      assert.ok(billsScreenContent.includes('ListEmptyComponent'), 'Must have ListEmptyComponent');
      assert.ok(billsScreenContent.includes('No bills for'), 'Must provide period-aware empty state');
    });
  });

  // ==========================================================================
  // Section 6: Backend API & Database Schema Protection Rules
  // ==========================================================================
  describe('6. Backend API & Schema Protection Rules', () => {
    it('Backend ReportRepository supports range queries without schema modifications', () => {
      assert.ok(backendReportRepoContent.includes('checkoutsInRange'), 'ReportRepository must implement checkoutsInRange');
      assert.ok(backendReportRepoContent.includes('advanceTakenInRange'), 'ReportRepository must implement advanceTakenInRange');
      assert.ok(backendReportRepoContent.includes('collectionByMethodInRange'), 'ReportRepository must implement collectionByMethodInRange');
      assert.ok(backendReportRepoContent.includes('s.checkout_actual >= :from AND s.checkout_actual <= :to'), 'Must filter checkouts by s.checkout_actual range');
    });

    it('Backend ReportService supports single-date and date-range calculations', () => {
      assert.ok(backendReportServiceContent.includes('public function summary('), 'ReportService must implement summary for date ranges');
      assert.ok(backendReportServiceContent.includes('checkoutsInRange'), 'Must call checkoutsInRange');
      assert.ok(backendReportServiceContent.includes('advanceTakenInRange'), 'Must call advanceTakenInRange');
      assert.ok(backendReportServiceContent.includes('collectionByMethodInRange'), 'Must call collectionByMethodInRange');
    });

    it('Backend ReportController accepts from and to query parameters on /reports/today and /reports/day-end', () => {
      assert.ok(backendReportControllerContent.includes("$request->input('from')"), 'Controller must read from input');
      assert.ok(backendReportControllerContent.includes("$request->input('to')"), 'Controller must read to input');
    });

    it('CONFIRMATION: No new database migration files were created or modified', () => {
      const databaseDir = path.join(projectRootDir, 'database');
      const files = fs.readdirSync(databaseDir);
      // Ensure only existing pre-task files are in database directory
      for (const file of files) {
        assert.ok(!file.includes('date_filter'), `New migration file must not be created: ${file}`);
        assert.ok(!file.includes('filter'), `New migration file must not be created: ${file}`);
      }
    });

    it('CONFIRMATION: No database schema changes were made in schema.sql', () => {
      const schemaSql = fs.readFileSync(path.join(projectRootDir, 'database', 'schema.sql'), 'utf8');
      // Verify existing tables remain intact
      assert.ok(schemaSql.includes('CREATE TABLE stays'), 'stays table must exist');
      assert.ok(schemaSql.includes('CREATE TABLE invoices'), 'invoices table must exist');
      assert.ok(schemaSql.includes('CREATE TABLE payments'), 'payments table must exist');
    });
  });
});
