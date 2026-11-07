import { useParams } from 'react-router-dom';
import { useInvoiceByStay } from '../api/invoices';
import { fd, inr } from '../lib/format';

export default function InvoicePrint() {
  const { stayId } = useParams();
  const { data, isLoading, isError, error } = useInvoiceByStay(stayId);

  if (isLoading) return <div style={{ padding: 40 }}>Loading invoice…</div>;
  if (isError) return <div style={{ padding: 40 }}>Could not load this invoice: {error.message}</div>;

  const { invoice, hotel, stay, charges = [], payments = [], paymentSummary } = data || {};
  if (!invoice || !hotel || !stay) {
    return <div style={{ padding: 40 }}>Invoice data is incomplete.</div>;
  }
  const checkoutDate = stay.checkout_actual || stay.checkout_planned || (invoice.created_at ? invoice.created_at.slice(0, 10) : '');
  const nights = Math.max(1, Math.round((new Date(checkoutDate) - new Date(stay.check_in_date)) / 86400000));

  // Payment breakdown derived from backend payment records
  const successfulPayments = payments.filter((p) => (p.status || 'successful') === 'successful');
  const advancePayments = successfulPayments.filter((p) => p.type === 'advance');
  const checkoutPayments = successfulPayments.filter((p) => p.type === 'balance');

  const advancePaid = paymentSummary ? paymentSummary.advancePaid : advancePayments.reduce((sum, p) => sum + Number(p.amount), 0) || Number(invoice.advance_paid || 0);
  const checkoutPaid = paymentSummary ? paymentSummary.checkoutPaid : checkoutPayments.reduce((sum, p) => sum + Number(p.amount), 0);
  const totalPaid = paymentSummary ? paymentSummary.totalPaid : (advancePaid + checkoutPaid);
  const balance = paymentSummary ? paymentSummary.balance : Number(invoice.balance_amount || 0);

  const advanceMethods = Array.from(new Set(advancePayments.map((p) => p.method?.toUpperCase()).filter(Boolean))).join(', ');
  const checkoutMethods = Array.from(new Set(checkoutPayments.map((p) => p.method?.toUpperCase()).filter(Boolean))).join(', ');

  return (
    <div className="invwrap">
      <style>{`
        body { background: var(--color-card); }
        .invwrap { max-width: 720px; margin: 0 auto; padding: 32px; font-family: var(--body, 'Figtree', system-ui, sans-serif); color: var(--color-text); }
        .invwrap h1 { font-family: var(--display, 'Bricolage Grotesque', sans-serif); font-size: 22px; margin: 0; color: var(--color-heading); }
        .inv-head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid var(--color-heading); padding-bottom: 16px; margin-bottom: 16px; }
        .inv-head .muted { color: var(--color-text-secondary); font-size: 13px; }
        .inv-meta { text-align: right; font-size: 13px; color: var(--color-text-secondary); }
        .inv-meta b { font-family: var(--mono, 'JetBrains Mono', monospace); font-size: 16px; display: block; color: var(--color-heading); }
        .inv-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; font-size: 14px; }
        .inv-grid dt { color: var(--color-text-secondary); font-size: 12px; text-transform: uppercase; letter-spacing: .05em; }
        .inv-grid dd { margin: 0 0 8px; font-weight: 600; color: var(--color-heading); }
        table.inv-table { width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 20px; }
        table.inv-table th { text-align: left; border-bottom: 1.5px solid var(--color-heading); padding: 8px 4px; font-size: 12px; text-transform: uppercase; color: var(--color-text-secondary); }
        table.inv-table td { padding: 8px 4px; border-bottom: 1px solid var(--color-border); color: var(--color-text); }
        table.inv-table td.r, table.inv-table th.r { text-align: right; font-family: var(--mono, 'JetBrains Mono', monospace); }
        .inv-total td { font-weight: 700; border-top: 2px solid var(--color-heading); border-bottom: none; color: var(--color-heading); }
        .inv-balance { text-align: right; font-size: 20px; font-weight: 700; margin-top: 8px; color: var(--color-heading); }
        .no-print { margin-bottom: 20px; }
        @media print { .no-print { display: none; } }
      `}</style>

      <div className="no-print">
        <button className="btn dark" type="button" onClick={() => window.print()}>
          Print
        </button>
      </div>

      <div className="inv-head">
        <div>
          <h1>{hotel.name}</h1>
          <div className="muted">{hotel.address || hotel.place}</div>
          {hotel.gstin && <div className="muted">GSTIN: {hotel.gstin}</div>}
          {hotel.phone && <div className="muted">{hotel.phone}</div>}
        </div>
        <div className="inv-meta">
          <b>{invoice.invoice_number}</b>
          <span>Date: {invoice.created_at.slice(0, 10)}</span>
          <br />
          <span>FY: {invoice.financial_year}</span>
        </div>
      </div>

      <dl className="inv-grid">
        <div>
          <dt>Guest</dt>
          <dd>{stay.guest_name}</dd>
          <dt>Mobile</dt>
          <dd>{stay.guest_phone}</dd>
          {invoice.guest_gstin && (
            <>
              <dt>Guest GSTIN</dt>
              <dd>{invoice.guest_gstin}</dd>
            </>
          )}
        </div>
        <div>
          <dt>Room</dt>
          <dd>
            {stay.room_no} · {stay.room_type_name}
          </dd>
          <dt>Stay</dt>
          <dd>
            {fd(stay.check_in_date)} → {fd(checkoutDate)} ({nights} night{nights > 1 ? 's' : ''})
          </dd>
        </div>
      </dl>

      <table className="inv-table">
        <thead>
          <tr>
            <th>Description</th>
            <th className="r">GST</th>
            <th className="r">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              Room charge ({nights} night{nights > 1 ? 's' : ''} × {inr(stay.rate)})
            </td>
            <td className="r">{Math.round(invoice.gst_rate * 100)}%</td>
            <td className="r">{inr(invoice.room_amount)}</td>
          </tr>
          {(charges || []).map((c) => (
            <tr key={c.id}>
              <td>{c.label}</td>
              <td className="r">{c.is_taxable ? `${Math.round(invoice.gst_rate * 100)}%` : '—'}</td>
              <td className="r">{inr(c.amount)}</td>
            </tr>
          ))}
          <tr>
            <td>CGST</td>
            <td className="r"></td>
            <td className="r">{inr(invoice.cgst_amount)}</td>
          </tr>
          <tr>
            <td>SGST</td>
            <td className="r"></td>
            <td className="r">{inr(invoice.sgst_amount)}</td>
          </tr>
          <tr className="inv-total">
            <td>Invoice total</td>
            <td></td>
            <td className="r">{inr(invoice.total_amount)}</td>
          </tr>
          {advancePaid > 0 && (
            <tr>
              <td>Advance paid{advanceMethods ? ` (${advanceMethods})` : ''}</td>
              <td></td>
              <td className="r">−{inr(advancePaid)}</td>
            </tr>
          )}
          {checkoutPaid > 0 && (
            <tr>
              <td>Checkout collection{checkoutMethods ? ` (${checkoutMethods})` : ''}</td>
              <td></td>
              <td className="r">−{inr(checkoutPaid)}</td>
            </tr>
          )}
          <tr style={{ fontWeight: 600 }}>
            <td>Total paid</td>
            <td></td>
            <td className="r">{inr(totalPaid)}</td>
          </tr>
        </tbody>
      </table>

      <div className="inv-balance">Balance: {inr(balance)}</div>
    </div>
  );
}
