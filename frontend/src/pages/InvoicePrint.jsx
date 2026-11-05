import { useParams } from 'react-router-dom';
import { useInvoiceByStay } from '../api/invoices';
import { fd, inr } from '../lib/format';

export default function InvoicePrint() {
  const { stayId } = useParams();
  const { data, isLoading, isError, error } = useInvoiceByStay(stayId);

  if (isLoading) return <div style={{ padding: 40 }}>Loading invoice…</div>;
  if (isError) return <div style={{ padding: 40 }}>Could not load this invoice: {error.message}</div>;

  const { invoice, hotel, stay, charges } = data;
  const nights = Math.max(1, Math.round((new Date(stay.checkout_actual) - new Date(stay.check_in_date)) / 86400000));

  return (
    <div className="invwrap">
      <style>{`
        body { background: #fff; }
        .invwrap { max-width: 720px; margin: 0 auto; padding: 32px; font-family: 'Figtree', system-ui, sans-serif; color: #14201e; }
        .invwrap h1 { font-family: 'Bricolage Grotesque', sans-serif; font-size: 22px; margin: 0; }
        .inv-head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #14201e; padding-bottom: 16px; margin-bottom: 16px; }
        .inv-head .muted { color: #56655f; font-size: 13px; }
        .inv-meta { text-align: right; font-size: 13px; }
        .inv-meta b { font-family: 'JetBrains Mono', monospace; font-size: 16px; display: block; }
        .inv-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; font-size: 14px; }
        .inv-grid dt { color: #56655f; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; }
        .inv-grid dd { margin: 0 0 8px; font-weight: 600; }
        table.inv-table { width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 20px; }
        table.inv-table th { text-align: left; border-bottom: 1.5px solid #14201e; padding: 8px 4px; font-size: 12px; text-transform: uppercase; }
        table.inv-table td { padding: 8px 4px; border-bottom: 1px solid #d5deda; }
        table.inv-table td.r, table.inv-table th.r { text-align: right; font-family: 'JetBrains Mono', monospace; }
        .inv-total td { font-weight: 700; border-top: 2px solid #14201e; border-bottom: none; }
        .inv-balance { text-align: right; font-size: 20px; font-weight: 700; margin-top: 8px; }
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
            {fd(stay.check_in_date)} → {fd(stay.checkout_actual)} ({nights} night{nights > 1 ? 's' : ''})
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
          {charges.map((c) => (
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
            <td>Total</td>
            <td></td>
            <td className="r">{inr(invoice.total_amount)}</td>
          </tr>
          <tr>
            <td>Advance / amount paid</td>
            <td></td>
            <td className="r">−{inr(invoice.advance_paid)}</td>
          </tr>
        </tbody>
      </table>

      <div className="inv-balance">Balance: {inr(invoice.balance_amount)}</div>
    </div>
  );
}
