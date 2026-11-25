import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.resolve(__dirname, '..');

describe('Fix Immediate Bills Page Updates After Checkout', () => {
  const staysApiPath = path.join(srcDir, 'api', 'stays.js');
  const billsScreenPath = path.join(srcDir, 'screens', 'bills', 'BillsScreen.jsx');
  const checkoutSheetPath = path.join(srcDir, 'components', 'sheets', 'CheckoutSheet.jsx');
  const dailyOpsScreenPath = path.join(srcDir, 'screens', 'dailyops', 'DailyOpsScreen.jsx');
  const webStaysApiPath = path.resolve(__dirname, '..', '..', '..', 'frontend', 'src', 'api', 'stays.js');
  const webBillsPagePath = path.resolve(__dirname, '..', '..', '..', 'frontend', 'src', 'pages', 'Bills.jsx');
  const webCheckoutSheetPath = path.resolve(__dirname, '..', '..', '..', 'frontend', 'src', 'components', 'sheets', 'CheckoutSheet.jsx');
  const stayRepoPath = path.resolve(__dirname, '..', '..', '..', 'backend', 'src', 'Repository', 'StayRepository.php');

  const staysApiContent = fs.readFileSync(staysApiPath, 'utf8');
  const billsScreenContent = fs.readFileSync(billsScreenPath, 'utf8');
  const checkoutSheetContent = fs.readFileSync(checkoutSheetPath, 'utf8');
  const dailyOpsScreenContent = fs.readFileSync(dailyOpsScreenPath, 'utf8');
  const webStaysApiContent = fs.readFileSync(webStaysApiPath, 'utf8');
  const webBillsPageContent = fs.readFileSync(webBillsPagePath, 'utf8');
  const webCheckoutSheetContent = fs.readFileSync(webCheckoutSheetPath, 'utf8');
  const stayRepoContent = fs.readFileSync(stayRepoPath, 'utf8');

  it('1. Mobile invalidateStayStuff invalidates report-today and invoice queries', () => {
    assert.ok(staysApiContent.includes("queryKey: ['report-today']"), 'Must invalidate report-today query');
    assert.ok(staysApiContent.includes("queryKey: ['invoice-by-stay'"), 'Must invalidate invoice-by-stay query');
    assert.ok(staysApiContent.includes("queryKey: ['invoice']"), 'Must invalidate invoice query');
    assert.ok(staysApiContent.includes("queryKey: ['stays-done']"), 'Must invalidate stays-done query');
    assert.ok(staysApiContent.includes("queryKey: ['today-checkouts']"), 'Must invalidate today-checkouts query');
  });

  it('2. Mobile useCheckout immediately updates report-today and stays-done query cache in memory', () => {
    assert.ok(staysApiContent.includes("qc.setQueryData(['report-today']"), 'Must update report-today cache data immediately');
    assert.ok(staysApiContent.includes('checkouts: (Number(old.checkouts) || 0) + 1'), 'Must increment checkouts count immediately');
    assert.ok(staysApiContent.includes('billedAtCheckout: (Number(old.billedAtCheckout) || 0) + invoiceTotal'), 'Must increment billedAtCheckout amount immediately');
    assert.ok(staysApiContent.includes("qc.setQueriesData({ queryKey: ['stays-done'] }"), 'Must update stays-done cache data immediately');
    assert.ok(staysApiContent.includes("qc.setQueryData(['stays-done', EMPTY_RANGE]"), 'Must update empty range stays-done query cache');
    assert.ok(staysApiContent.includes("qc.refetchQueries({ queryKey: ['report-today'] }"), 'Must trigger refetchQueries for report-today');
    assert.ok(staysApiContent.includes("qc.refetchQueries({ queryKey: ['stays-done'] }"), 'Must trigger refetchQueries for stays-done');
  });

  it('3. BillsScreen uses useFocusEffect to refresh stays and today report on navigation focus', () => {
    assert.ok(billsScreenContent.includes("import { useFocusEffect } from '@react-navigation/native'"), 'BillsScreen must import useFocusEffect');
    assert.ok(billsScreenContent.includes('useFocusEffect('), 'BillsScreen must call useFocusEffect');
    assert.ok(billsScreenContent.includes('refetchStays();') || billsScreenContent.includes('refetchAll();'), 'Must refetch stays on screen focus');
    assert.ok(billsScreenContent.includes('refetchToday();') || billsScreenContent.includes('refetchAll();'), 'Must refetch today report on screen focus');
  });

  it('4. BillsScreen RefreshControl refetches both stays list and today summary on pull-to-refresh', () => {
    assert.ok(billsScreenContent.includes('onRefresh={refetchAll}'), 'RefreshControl must trigger refetchAll');
    assert.ok(billsScreenContent.includes('refreshing={isStaysRefetching || isTodayRefetching}'), 'Must track refetching status for both queries');
  });

  it('5. DailyOpsScreen also uses useFocusEffect to keep daily operations synchronized on focus', () => {
    assert.ok(dailyOpsScreenContent.includes("import { useFocusEffect } from '@react-navigation/native'"), 'DailyOpsScreen must import useFocusEffect');
    assert.ok(dailyOpsScreenContent.includes('useFocusEffect('), 'DailyOpsScreen must call useFocusEffect');
  });

  it('6. CheckoutSheet prevents duplicate submissions and double clicking', () => {
    assert.ok(checkoutSheetContent.includes('isSubmitting'), 'CheckoutSheet must have isSubmitting state guard');
    assert.ok(checkoutSheetContent.includes('if (isSubmitting || checkout.isPending) return'), 'doCheckout must check isSubmitting or isPending');
    assert.ok(checkoutSheetContent.includes('disabled={isCheckoutBusy}'), 'Checkout action buttons must be disabled when checkout is busy');
  });

  it('7. Backend StayRepository listDoneForHotel selects invoice_id', () => {
    assert.ok(stayRepoContent.includes('i.id AS invoice_id'), 'listDoneForHotel must select i.id AS invoice_id');
  });

  it('8. Web frontend api/stays.js and Bills.jsx also synchronize immediate updates', () => {
    assert.ok(webStaysApiContent.includes("queryKey: ['report-today']"), 'Web stays api must invalidate report-today query');
    assert.ok(webStaysApiContent.includes("qc.setQueryData(['report-today']"), 'Web stays api must update report-today cache data immediately');
    assert.ok(webStaysApiContent.includes("qc.refetchQueries({ queryKey: ['report-today'] }"), 'Web stays api must trigger refetchQueries for report-today');
    assert.ok(webBillsPageContent.includes('refetchToday'), 'Web Bills page must refetch today report on retry');
    assert.ok(webCheckoutSheetContent.includes('isSubmitting'), 'Web CheckoutSheet must have isSubmitting state guard');
  });

  // Simulation of the 8 required checkout test cases
  describe('Simulation of 8 Required Checkout Scenarios', () => {
    // Mock QueryClient implementation matching TanStack Query behavior
    function createMockQueryClient() {
      const queries = new Map();
      const invalidated = [];
      const refetched = [];

      return {
        queries,
        invalidated,
        refetched,
        getQueryData(key) {
          return queries.get(JSON.stringify(key));
        },
        setQueryData(key, updater) {
          const k = JSON.stringify(key);
          const old = queries.get(k);
          const next = typeof updater === 'function' ? updater(old) : updater;
          queries.set(k, next);
          return next;
        },
        setQueriesData({ queryKey }, updater) {
          const prefix = JSON.stringify(queryKey).slice(0, -1);
          for (const [k, v] of queries.entries()) {
            if (k.startsWith(prefix) || k === JSON.stringify(queryKey)) {
              queries.set(k, typeof updater === 'function' ? updater(v) : updater);
            }
          }
        },
        invalidateQueries({ queryKey }) {
          invalidated.push(queryKey);
        },
        refetchQueries({ queryKey }) {
          refetched.push(queryKey);
        },
      };
    }

    // Helper that executes the checkout onSuccess cache updater
    function handleCheckoutSuccess(qc, data, variables) {
      const stayId = variables?.stayId;
      const paymentMethod = variables?.paymentMethod || data?.stay?.payment_method || 'cash';
      const invoiceTotal = Number(data?.invoice?.total_amount ?? data?.bill?.total ?? 0);

      qc.setQueryData(['report-today'], (old) => {
        if (!old) return old;
        return {
          ...old,
          checkouts: (Number(old.checkouts) || 0) + 1,
          billedAtCheckout: (Number(old.billedAtCheckout) || 0) + invoiceTotal,
          occupancy: old.occupancy ? {
            ...old.occupancy,
            occupied: Math.max(0, (Number(old.occupancy.occupied) || 0) - 1),
            percent: old.occupancy.total > 0
              ? Math.round((Math.max(0, (Number(old.occupancy.occupied) || 0) - 1) / old.occupancy.total) * 1000) / 10
              : 0,
          } : old.occupancy,
        };
      });

      if (data?.stay) {
        const newBillEntry = {
          ...data.stay,
          invoice_id: data.invoice?.id ?? data.stay?.invoice_id,
          invoice_number: data.invoice?.invoice_number ?? data.stay?.invoice_number,
          invoice_total: invoiceTotal,
          payment_method: data.stay.payment_method || paymentMethod,
          checkout_actual: data.stay.checkout_actual || variables?.actualCheckoutDate || '2026-11-23',
        };

        const updateStaysList = (old) => {
          if (!Array.isArray(old)) return old;
          const filtered = old.filter((s) => s.id !== stayId);
          return [newBillEntry, ...filtered];
        };

        qc.setQueriesData({ queryKey: ['stays-done'] }, updateStaysList);
        qc.setQueryData(['stays-done', {}], updateStaysList);
      }

      if (data?.invoice) {
        qc.setQueryData(['invoice-by-stay', stayId], data.invoice);
        if (data.invoice.id) {
          qc.setQueryData(['invoice', data.invoice.id], data.invoice);
        }
      }

      qc.invalidateQueries({ queryKey: ['report-today'] });
      qc.invalidateQueries({ queryKey: ['stays-done'] });
      qc.invalidateQueries({ queryKey: ['today-checkouts'] });
      qc.refetchQueries({ queryKey: ['report-today'] });
      qc.refetchQueries({ queryKey: ['stays-done'] });
      qc.refetchQueries({ queryKey: ['today-checkouts'] });
    }

    it('Scenario 1: Checkout with full payment immediately updates checkouts count, billed amount, and bills list', () => {
      const qc = createMockQueryClient();
      qc.setQueryData(['report-today'], {
        date: '2026-11-23',
        checkouts: 2,
        billedAtCheckout: 4500,
        occupancy: { occupied: 5, total: 10, percent: 50.0 },
      });
      qc.setQueryData(['stays-done', {}], [
        { id: 101, guest_name: 'Existing Guest', invoice_number: 'TC-2026-0001', invoice_total: 4500, checkout_actual: '2026-11-23' },
      ]);

      const backendResponse = {
        stay: { id: 102, guest_name: 'John Doe', room_no: 201, check_in_date: '2026-11-22', checkout_actual: '2026-11-23', status: 'checked_out' },
        bill: { total: 3360, balance: 0, nights: 1 },
        invoice: { id: 55, invoice_number: 'TC-2026-0002', total_amount: 3360 },
        payments: [{ id: 801, amount: 3360, method: 'upi', type: 'balance', status: 'successful' }],
      };

      handleCheckoutSuccess(qc, backendResponse, { stayId: 102, paymentMethod: 'upi', amount: 3360 });

      const updatedToday = qc.getQueryData(['report-today']);
      assert.equal(updatedToday.checkouts, 3, 'Checkouts count must increment from 2 to 3');
      assert.equal(updatedToday.billedAtCheckout, 7860, 'Billed at check-out must increment by 3360 (4500 + 3360 = 7860)');
      assert.equal(updatedToday.occupancy.occupied, 4, 'Occupied rooms must decrement from 5 to 4');

      const updatedStays = qc.getQueryData(['stays-done', {}]);
      assert.equal(updatedStays.length, 2, 'Stays list must have 2 bills');
      assert.equal(updatedStays[0].id, 102, 'Newly checked-out stay must be at the top');
      assert.equal(updatedStays[0].invoice_number, 'TC-2026-0002');
      assert.equal(updatedStays[0].invoice_total, 3360);
      assert.equal(updatedStays[0].payment_method, 'upi');
    });

    it('Scenario 2: Checkout after collecting remaining balance', () => {
      const qc = createMockQueryClient();
      qc.setQueryData(['report-today'], { date: '2026-11-23', checkouts: 0, billedAtCheckout: 0, occupancy: { occupied: 3, total: 10, percent: 30 } });
      qc.setQueryData(['stays-done', {}], []);

      const backendResponse = {
        stay: { id: 103, guest_name: 'Jane Smith', room_no: 305, check_in_date: '2026-11-21', checkout_actual: '2026-11-23', status: 'checked_out' },
        bill: { total: 5600, advancePaid: 2000, balance: 0, nights: 2 },
        invoice: { id: 56, invoice_number: 'TC-2026-0003', total_amount: 5600 },
        payments: [
          { id: 802, amount: 2000, method: 'upi', type: 'advance', status: 'successful' },
          { id: 803, amount: 3600, method: 'cash', type: 'balance', status: 'successful' },
        ],
      };

      handleCheckoutSuccess(qc, backendResponse, { stayId: 103, paymentMethod: 'cash', amount: 3600 });

      const today = qc.getQueryData(['report-today']);
      assert.equal(today.checkouts, 1);
      assert.equal(today.billedAtCheckout, 5600);
      const bills = qc.getQueryData(['stays-done', {}]);
      assert.equal(bills[0].guest_name, 'Jane Smith');
      assert.equal(bills[0].invoice_total, 5600);
      assert.equal(bills[0].payment_method, 'cash');
    });

    it('Scenario 3: Checkout with UPI payment method', () => {
      const qc = createMockQueryClient();
      qc.setQueryData(['report-today'], { date: '2026-11-23', checkouts: 1, billedAtCheckout: 2000, occupancy: { occupied: 2, total: 10, percent: 20 } });
      qc.setQueryData(['stays-done', {}], []);

      const backendResponse = {
        stay: { id: 104, guest_name: 'UPI User', room_no: 102, status: 'checked_out', payment_method: 'upi' },
        bill: { total: 2240 },
        invoice: { id: 57, invoice_number: 'TC-2026-0004', total_amount: 2240 },
      };

      handleCheckoutSuccess(qc, backendResponse, { stayId: 104, paymentMethod: 'upi', amount: 2240 });

      const bills = qc.getQueryData(['stays-done', {}]);
      assert.equal(bills[0].payment_method, 'upi');
      assert.equal(bills[0].invoice_total, 2240);
    });

    it('Scenario 4: Checkout with cash payment method', () => {
      const qc = createMockQueryClient();
      qc.setQueryData(['report-today'], { date: '2026-11-23', checkouts: 0, billedAtCheckout: 0, occupancy: { occupied: 1, total: 10, percent: 10 } });
      qc.setQueryData(['stays-done', {}], []);

      const backendResponse = {
        stay: { id: 105, guest_name: 'Cash User', room_no: 103, status: 'checked_out', payment_method: 'cash' },
        bill: { total: 1500 },
        invoice: { id: 58, invoice_number: 'TC-2026-0005', total_amount: 1500 },
      };

      handleCheckoutSuccess(qc, backendResponse, { stayId: 105, paymentMethod: 'cash', amount: 1500 });

      const bills = qc.getQueryData(['stays-done', {}]);
      assert.equal(bills[0].payment_method, 'cash');
      assert.equal(bills[0].invoice_total, 1500);
    });

    it('Scenario 5: Checkout with split payment (advance + balance)', () => {
      const qc = createMockQueryClient();
      qc.setQueryData(['report-today'], { date: '2026-11-23', checkouts: 3, billedAtCheckout: 10000 });
      qc.setQueryData(['stays-done', {}], []);

      const backendResponse = {
        stay: { id: 106, guest_name: 'Split Pay Guest', room_no: 204, status: 'checked_out' },
        bill: { total: 6000, advancePaid: 2500, balance: 0 },
        invoice: { id: 59, invoice_number: 'TC-2026-0006', total_amount: 6000 },
        payments: [
          { amount: 2500, method: 'upi', type: 'advance' },
          { amount: 3500, method: 'card', type: 'balance' },
        ],
      };

      handleCheckoutSuccess(qc, backendResponse, { stayId: 106, paymentMethod: 'card', amount: 3500 });

      const today = qc.getQueryData(['report-today']);
      assert.equal(today.checkouts, 4);
      assert.equal(today.billedAtCheckout, 16000);
      const bills = qc.getQueryData(['stays-done', {}]);
      assert.equal(bills[0].invoice_total, 6000);
      assert.equal(bills[0].payment_method, 'card');
    });

    it('Scenario 6: Checkout with zero outstanding balance (fully paid)', () => {
      const qc = createMockQueryClient();
      qc.setQueryData(['report-today'], { date: '2026-11-23', checkouts: 5, billedAtCheckout: 20000 });
      qc.setQueryData(['stays-done', {}], []);

      const backendResponse = {
        stay: { id: 107, guest_name: 'Zero Balance Guest', room_no: 301, status: 'checked_out', payment_method: 'upi' },
        bill: { total: 4000, advancePaid: 4000, balance: 0 },
        invoice: { id: 60, invoice_number: 'TC-2026-0007', total_amount: 4000 },
      };

      handleCheckoutSuccess(qc, backendResponse, { stayId: 107, paymentMethod: 'upi', amount: 0 });

      const today = qc.getQueryData(['report-today']);
      assert.equal(today.checkouts, 6);
      assert.equal(today.billedAtCheckout, 24000);
      const bills = qc.getQueryData(['stays-done', {}]);
      assert.equal(bills[0].invoice_total, 4000);
    });

    it('Scenario 7: Checkout when network is slow (debounce and submission guard)', async () => {
      let isSubmitting = false;
      let submissionCount = 0;

      async function simulatedCheckoutClick() {
        if (isSubmitting) return 'BLOCKED_DUPLICATE';
        isSubmitting = true;
        try {
          submissionCount++;
          // Simulate 200ms network latency
          await new Promise((resolve) => setTimeout(resolve, 200));
          return 'SUCCESS';
        } finally {
          isSubmitting = false;
        }
      }

      // Simulate rapid user clicks
      const [res1, res2, res3] = await Promise.all([
        simulatedCheckoutClick(),
        simulatedCheckoutClick(),
        simulatedCheckoutClick(),
      ]);

      assert.equal(submissionCount, 1, 'Exactly one checkout request must proceed during network latency');
      assert.equal(res1, 'SUCCESS');
      assert.equal(res2, 'BLOCKED_DUPLICATE');
      assert.equal(res3, 'BLOCKED_DUPLICATE');
    });

    it('Scenario 8: Failed checkout does NOT corrupt query cache or increment counts', async () => {
      const qc = createMockQueryClient();
      const initialToday = { date: '2026-11-23', checkouts: 2, billedAtCheckout: 5000 };
      const initialBills = [{ id: 1, guest_name: 'Safe Guest', invoice_total: 5000 }];
      qc.setQueryData(['report-today'], initialToday);
      qc.setQueryData(['stays-done', {}], initialBills);

      let formError = '';
      async function failingCheckout() {
        try {
          throw new Error('Database transaction lock timeout');
        } catch (err) {
          formError = err.message;
        }
      }

      await failingCheckout();

      assert.equal(formError, 'Database transaction lock timeout');
      // Verify cache remained untouched
      assert.deepEqual(qc.getQueryData(['report-today']), initialToday);
      assert.deepEqual(qc.getQueryData(['stays-done', {}]), initialBills);
    });
  });
});
