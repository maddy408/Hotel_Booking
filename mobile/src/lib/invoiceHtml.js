import { fd, inr } from './format.js';

export function buildInvoiceHtml(data) {
  const { invoice, hotel, stay, charges = [], payments = [], paymentSummary } = data || {};
  if (!invoice || !hotel || !stay) return '';

  const checkoutDate = stay.checkout_actual || stay.checkout_planned || (invoice.created_at ? invoice.created_at.slice(0, 10) : '');
  const nights = Math.max(1, Math.round((new Date(checkoutDate) - new Date(stay.check_in_date)) / 86400000));

  const successfulPayments = payments.filter((p) => (p.status || 'successful') === 'successful');
  const advancePayments = successfulPayments.filter((p) => p.type === 'advance');
  const checkoutPayments = successfulPayments.filter((p) => p.type === 'balance');

  const advancePaid = paymentSummary ? paymentSummary.advancePaid : advancePayments.reduce((sum, p) => sum + Number(p.amount), 0) || Number(invoice.advance_paid || 0);
  const checkoutPaid = paymentSummary ? paymentSummary.checkoutPaid : checkoutPayments.reduce((sum, p) => sum + Number(p.amount), 0);
  const totalPaid = paymentSummary ? paymentSummary.totalPaid : (advancePaid + checkoutPaid);
  const balance = paymentSummary ? paymentSummary.balance : Number(invoice.balance_amount || 0);

  const advanceMethods = Array.from(new Set(advancePayments.map((p) => p.method?.toUpperCase()).filter(Boolean))).join(', ');
  const checkoutMethods = Array.from(new Set(checkoutPayments.map((p) => p.method?.toUpperCase()).filter(Boolean))).join(', ');

  const chargesRows = charges.map((c) => {
    const chargeGstPct = Number(c.gst_rate) > 0
      ? `${Math.round(Number(c.gst_rate) * 100)}%`
      : c.is_taxable
        ? `${Math.round(Number(invoice.gst_rate || 0.05) * 100)}%`
        : '—';
    return `
      <tr>
        <td>${c.label} ${c.sac_code ? `<span class="muted">(SAC ${c.sac_code})</span>` : ''}</td>
        <td class="r">${chargeGstPct}</td>
        <td class="r">${inr(c.amount)}</td>
      </tr>
    `;
  }).join('');

  const taxRows = Number(invoice.igst_amount) > 0 ? `
    <tr>
      <td>IGST</td>
      <td class="r"></td>
      <td class="r">${inr(invoice.igst_amount)}</td>
    </tr>
  ` : `
    <tr>
      <td>CGST</td>
      <td class="r"></td>
      <td class="r">${inr(invoice.cgst_amount)}</td>
    </tr>
    <tr>
      <td>SGST</td>
      <td class="r"></td>
      <td class="r">${inr(invoice.sgst_amount)}</td>
    </tr>
  `;

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Invoice - ${invoice.invoice_number}</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #30223D;
            background: #ffffff;
            margin: 0;
            padding: 24px;
            font-size: 13px;
            line-height: 1.4;
          }
          .invwrap {
            max-width: 680px;
            margin: 0 auto;
          }
          .inv-head {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2px solid #70265F;
            padding-bottom: 14px;
            margin-bottom: 16px;
          }
          h1 {
            color: #70265F;
            font-size: 20px;
            margin: 0 0 4px 0;
          }
          .muted {
            color: #81748C;
            font-size: 12px;
            margin-top: 2px;
          }
          .inv-meta {
            text-align: right;
            font-size: 12px;
            color: #81748C;
          }
          .inv-num {
            font-family: "Courier New", Courier, monospace;
            font-size: 16px;
            font-weight: bold;
            color: #30223D;
            margin-bottom: 4px;
          }
          .badge-proforma {
            display: inline-block;
            font-size: 10px;
            font-weight: 600;
            padding: 2px 6px;
            border-radius: 4px;
            background: #EFF6FF;
            color: #1D4ED8;
            border: 1px solid #BFDBFE;
            margin-left: 4px;
            vertical-align: middle;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          }
          .inv-grid {
            display: flex;
            gap: 20px;
            background: #FDF9FB;
            border: 1px solid #F1E5EC;
            border-radius: 6px;
            padding: 12px 16px;
            margin-bottom: 16px;
          }
          .grid-col {
            flex: 1;
          }
          .label {
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #81748C;
            margin-bottom: 2px;
          }
          .val {
            font-weight: 600;
            margin-bottom: 8px;
            color: #30223D;
          }
          table.inv-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 16px;
          }
          table.inv-table th {
            text-align: left;
            border-bottom: 2px solid #70265F;
            padding: 6px 4px;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #81748C;
          }
          table.inv-table td {
            padding: 8px 4px;
            border-bottom: 1px solid #F1E5EC;
            color: #30223D;
          }
          table.inv-table td.r, table.inv-table th.r {
            text-align: right;
            font-family: "Courier New", Courier, monospace;
          }
          .inv-total td {
            font-weight: bold;
            border-top: 2px solid #70265F;
            border-bottom: 1px solid #70265F;
            background: #FDF9FB;
            font-size: 14px;
          }
          .inv-balance {
            text-align: right;
            font-size: 18px;
            font-weight: bold;
            color: #70265F;
            margin-top: 12px;
            padding: 8px 12px;
            background: #FDF9FB;
            border-radius: 6px;
            border: 1px solid #F1E5EC;
          }
        </style>
      </head>
      <body>
        <div class="invwrap">
          <div class="inv-head">
            <div>
              <h1>${hotel.name}</h1>
              <div class="muted">${hotel.address || hotel.place || ''}</div>
              ${hotel.gstin ? `<div class="muted">GSTIN: ${hotel.gstin}</div>` : ''}
              ${hotel.phone ? `<div class="muted">Phone: ${hotel.phone}</div>` : ''}
            </div>
            <div class="inv-meta">
              <div class="inv-num">${invoice.invoice_number}${invoice.is_proforma ? ' <span class="badge-proforma">PROFORMA PREVIEW</span>' : ''}</div>
              <div>Date: ${invoice.created_at ? invoice.created_at.slice(0, 10) : ''}</div>
              ${invoice.financial_year ? `<div>FY: ${invoice.financial_year}</div>` : ''}
            </div>
          </div>

          <div class="inv-grid">
            <div class="grid-col">
              <div class="label">Guest Name</div>
              <div class="val">${stay.guest_name}</div>
              <div class="label">Mobile Number</div>
              <div class="val">${stay.guest_phone}</div>
              ${invoice.guest_gstin ? `<div class="label">Guest GSTIN</div><div class="val">${invoice.guest_gstin}</div>` : ''}
            </div>
            <div class="grid-col">
              <div class="label">Room</div>
              <div class="val">Room ${stay.room_no} · ${stay.room_type_name || ''}</div>
              <div class="label">Stay Duration</div>
              <div class="val">${fd(stay.check_in_date)} → ${fd(checkoutDate)} (${nights} night${nights > 1 ? 's' : ''})</div>
            </div>
          </div>

          <table class="inv-table">
            <thead>
              <tr>
                <th>Description</th>
                <th class="r">GST</th>
                <th class="r">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Room charge (${nights} night${nights > 1 ? 's' : ''} × ${inr(stay.rate)})</td>
                <td class="r">${Math.round(invoice.gst_rate * 100)}%</td>
                <td class="r">${inr(invoice.room_amount)}</td>
              </tr>
              ${chargesRows}
              ${taxRows}
              <tr class="inv-total">
                <td>Invoice Total</td>
                <td></td>
                <td class="r">${inr(invoice.total_amount)}</td>
              </tr>
              ${advancePaid > 0 ? `
                <tr>
                  <td>Advance paid${advanceMethods ? ` (${advanceMethods})` : ''}</td>
                  <td></td>
                  <td class="r">−${inr(advancePaid)}</td>
                </tr>
              ` : ''}
              ${checkoutPaid > 0 ? `
                <tr>
                  <td>Checkout collection${checkoutMethods ? ` (${checkoutMethods})` : ''}</td>
                  <td></td>
                  <td class="r">−${inr(checkoutPaid)}</td>
                </tr>
              ` : ''}
              <tr style="font-weight: 600;">
                <td>Total Paid</td>
                <td></td>
                <td class="r">${inr(totalPaid)}</td>
              </tr>
            </tbody>
          </table>

          <div class="inv-balance">Balance Due: ${inr(balance)}</div>
        </div>
      </body>
    </html>
  `;
}
