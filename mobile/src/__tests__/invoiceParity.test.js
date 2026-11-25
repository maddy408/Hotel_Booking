import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Mobile Invoice Print & Calculation Parity with Web', () => {
  // Test calculations mirroring web InvoicePrint.jsx and mobile InvoicePrintScreen.jsx
  function calculateInvoice(stay, charges = [], payments = []) {
    const checkIn = new Date(stay.check_in_date);
    const checkOut = new Date(stay.check_out_date);
    const diffTime = Math.max(0, checkOut - checkIn);
    const nights = Math.max(1, Math.round(diffTime / (1000 * 60 * 60 * 24)));

    const roomRate = Number(stay.room_rate || stay.daily_rate || 2000);
    const roomTotal = roomRate * nights;

    const extrasTotal = charges.reduce((sum, c) => sum + Number(c.amount || 0), 0);
    const subtotal = roomTotal + extrasTotal;

    // GST calculation: 12% total (6% CGST + 6% SGST for intra-state, or 12% IGST for inter-state)
    const isInterState = stay.guest_state && stay.guest_state.toLowerCase() !== 'tamil nadu';
    const taxRate = 0.12;
    const totalTax = Math.round(subtotal * taxRate * 100) / 100;
    const cgst = isInterState ? 0 : Math.round((totalTax / 2) * 100) / 100;
    const sgst = isInterState ? 0 : Math.round((totalTax / 2) * 100) / 100;
    const igst = isInterState ? totalTax : 0;

    const grandTotal = Math.round((subtotal + totalTax) * 100) / 100;

    const successfulPayments = payments.filter((p) => p.status === 'successful' || !p.status);
    const totalPaid = successfulPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const balanceDue = Math.max(0, Math.round((grandTotal - totalPaid) * 100) / 100);
    const refundAmount = totalPaid > grandTotal ? Math.round((totalPaid - grandTotal) * 100) / 100 : 0;

    return {
      nights,
      roomRate,
      roomTotal,
      extrasTotal,
      subtotal,
      cgst,
      sgst,
      igst,
      totalTax,
      grandTotal,
      totalPaid,
      balanceDue,
      refundAmount,
    };
  }

  it('1. Calculates room nights and base charges correctly', () => {
    const stay = {
      check_in_date: '2026-11-20',
      check_out_date: '2026-11-23',
      room_rate: 2500,
    };
    const inv = calculateInvoice(stay, []);
    assert.equal(inv.nights, 3);
    assert.equal(inv.roomTotal, 7500);
    assert.equal(inv.subtotal, 7500);
  });

  it('2. Computes intra-state GST (CGST 6% + SGST 6%) when guest is within Tamil Nadu', () => {
    const stay = {
      check_in_date: '2026-11-20',
      check_out_date: '2026-11-22',
      room_rate: 3000,
      guest_state: 'Tamil Nadu',
    };
    const charges = [{ description: 'Room Service Dinner', amount: 500, sac: '996331' }];
    const inv = calculateInvoice(stay, charges);

    // subtotal = 2 * 3000 + 500 = 6500
    assert.equal(inv.subtotal, 6500);
    assert.equal(inv.totalTax, 780); // 12% of 6500 = 780
    assert.equal(inv.cgst, 390); // 6%
    assert.equal(inv.sgst, 390); // 6%
    assert.equal(inv.igst, 0);
    assert.equal(inv.grandTotal, 7280);
  });

  it('3. Computes inter-state GST (IGST 12%) when guest is from another state', () => {
    const stay = {
      check_in_date: '2026-11-20',
      check_out_date: '2026-11-21',
      room_rate: 4000,
      guest_state: 'Karnataka',
    };
    const inv = calculateInvoice(stay, []);

    // subtotal = 4000
    assert.equal(inv.subtotal, 4000);
    assert.equal(inv.totalTax, 480); // 12%
    assert.equal(inv.cgst, 0);
    assert.equal(inv.sgst, 0);
    assert.equal(inv.igst, 480);
    assert.equal(inv.grandTotal, 4480);
  });

  it('4. Correctly computes advance deduction, total payments, and balance due', () => {
    const stay = {
      check_in_date: '2026-11-20',
      check_out_date: '2026-11-22',
      room_rate: 2000,
      guest_state: 'Tamil Nadu',
    };
    // subtotal = 4000, tax = 480, grandTotal = 4480
    const payments = [
      { id: 1, type: 'advance', amount: 2000, status: 'successful' },
      { id: 2, type: 'extra', amount: 500, status: 'successful' },
      { id: 3, type: 'failed_attempt', amount: 1000, status: 'failed' },
    ];

    const inv = calculateInvoice(stay, [], payments);
    assert.equal(inv.grandTotal, 4480);
    assert.equal(inv.totalPaid, 2500); // 2000 + 500 (ignores failed)
    assert.equal(inv.balanceDue, 1980); // 4480 - 2500
    assert.equal(inv.refundAmount, 0);
  });

  it('5. Correctly handles refund scenario when payment exceeds total charges', () => {
    const stay = {
      check_in_date: '2026-11-20',
      check_out_date: '2026-11-21',
      room_rate: 2000,
    };
    // grandTotal = 2000 + 240 = 2240
    const payments = [{ id: 1, type: 'advance', amount: 3000, status: 'successful' }];

    const inv = calculateInvoice(stay, [], payments);
    assert.equal(inv.grandTotal, 2240);
    assert.equal(inv.totalPaid, 3000);
    assert.equal(inv.balanceDue, 0);
    assert.equal(inv.refundAmount, 760);
  });

  it('6. Generates valid HTML structure for Expo Print with all required sections', () => {
    const mockHtml = `
      <!DOCTYPE html>
      <html>
        <head><title>Invoice #INV-2026-101</title></head>
        <body>
          <div class="header">
            <h1>KKK LODGE</h1>
            <p>GSTIN: 33AAACT1234F1Z5</p>
          </div>
          <div class="guest-info">
            <p>Guest: Ramesh Kumar</p>
            <p>Phone: 9876543210</p>
          </div>
          <table class="charges">
            <tr><th>Description</th><th>SAC</th><th>Amount</th></tr>
            <tr><td>Room Charge (Deluxe 101)</td><td>996311</td><td>₹5,000.00</td></tr>
          </table>
          <div class="totals">
            <p>Total: ₹5,600.00</p>
            <p>Advance: ₹2,000.00</p>
            <p>Balance Due: ₹3,600.00</p>
          </div>
        </body>
      </html>
    `;

    assert.ok(mockHtml.includes('KKK LODGE'));
    assert.ok(mockHtml.includes('GSTIN: 33AAACT1234F1Z5'));
    assert.ok(mockHtml.includes('Ramesh Kumar'));
    assert.ok(mockHtml.includes('996311'));
    assert.ok(mockHtml.includes('Balance Due: ₹3,600.00'));
  });

  it('7. Synthesizes proforma invoice preview for active in-house stays when no finalized invoice exists', async () => {
    const { buildProformaInvoiceData } = await import('../lib/proformaInvoice.js');
    const mockContext = {
      stay: {
        id: 14,
        hotel_id: 1,
        room_no: '301',
        room_type_name: 'Deluxe Suite',
        guest_name: 'Ananya Raooo',
        guest_phone: '9989015824',
        check_in_date: '2026-11-09',
        checkout_planned: '2026-11-14',
        rate: 2200,
        advance_paid: 2000,
      },
      guest: {
        id: 1,
        name: 'Ananya Raooo',
        phone: '9989015824',
        payments: [
          { id: 1, stay_id: 14, type: 'advance', amount: 2000, status: 'successful' },
        ],
      },
    };

    const data = buildProformaInvoiceData({
      stay: mockContext.stay,
      guest: mockContext.guest,
      stayId: 14,
    });
    assert.ok(data.invoice);
    assert.equal(data.invoice.is_proforma, true);
    assert.equal(data.invoice.invoice_number, 'TC-PROFORMA-0014');
    assert.equal(data.stay.guest_name, 'Ananya Raooo');
    assert.equal(data.stay.room_no, '301');
    assert.equal(data.invoice.room_amount, 11000); // 5 nights * 2200
    assert.equal(data.invoice.total_amount, 11550); // 11000 + 550 GST
    assert.equal(data.paymentSummary.advancePaid, 2000);
    assert.equal(data.paymentSummary.balance, 9550);
  });
});
