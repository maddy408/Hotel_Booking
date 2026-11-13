import { useState } from 'react';
import { useTodayReport, useDayEndReport, useOccupancyReport, useRevenueReport, downloadInvoicesCsv } from '../api/reports';
import { useToast } from '../context/ToastContext.jsx';
import { addDaysIso, fd, inr, todayIso } from '../lib/format';

export default function Reports() {
  const { data: today } = useTodayReport();
  const [dayEndDate, setDayEndDate] = useState(todayIso());
  const { data: dayEnd } = useDayEndReport(dayEndDate);
  const [range, setRange] = useState({ from: addDaysIso(todayIso(), -6), to: todayIso() });
  const { data: occupancy } = useOccupancyReport(range.from, range.to);
  const { data: revenue } = useRevenueReport(range.from, range.to);
  const toast = useToast();
  const [exporting, setExporting] = useState(false);

  const exportCsv = async () => {
    setExporting(true);
    try {
      await downloadInvoicesCsv(range.from, range.to);
    } catch (err) {
      toast(err.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="mgrid">
      <div className="panel">
        <div className="ph">
          <h2>Today at a glance</h2>
          <span className="muted">{today ? fd(today.date) : ''}</span>
        </div>
        {today && (
          <div className="sumrow" style={{ padding: '14px 16px' }}>
            <div>
              <span>Check-outs</span>
              <b className="mono">{today.checkouts}</b>
            </div>
            <div>
              <span>Billed at check-out</span>
              <b className="mono">{inr(today.billedAtCheckout)}</b>
            </div>
            <div>
              <span>Advance taken</span>
              <b className="mono">{inr(today.advanceTaken)}</b>
            </div>
            <div>
              <span>Occupancy</span>
              <b className="mono">
                {today.occupancy.occupied}/{today.occupancy.total} ({today.occupancy.percent}%)
              </b>
            </div>
          </div>
        )}
      </div>

      <div className="panel">
        <div className="ph">
          <h2>Day-end collection</h2>
          <input type="date" value={dayEndDate} max={todayIso()} onChange={(e) => setDayEndDate(e.target.value)} style={{ width: 180 }} />
        </div>
        {dayEnd && (
          <div className="sumrow" style={{ padding: '14px 16px' }}>
            <div>
              <span>Cash</span>
              <b className="mono">{inr(dayEnd.byMethod.cash)}</b>
            </div>
            <div>
              <span>UPI</span>
              <b className="mono">{inr(dayEnd.byMethod.upi)}</b>
            </div>
            <div>
              <span>Card</span>
              <b className="mono">{inr(dayEnd.byMethod.card)}</b>
            </div>
            <div>
              <span>Total collected</span>
              <b className="mono">{inr(dayEnd.total)}</b>
            </div>
            <div>
              <span>Rooms occupied that night</span>
              <b className="mono">{dayEnd.occupiedRooms}</b>
            </div>
          </div>
        )}
      </div>

      <div className="panel">
        <div className="ph report-range-ph">
          <h2>Occupancy &amp; revenue by range</h2>
          <div className="report-range-controls">
            <div className="report-date-inputs">
              <input type="date" value={range.from} max={range.to} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
              <span className="report-to-sep">to</span>
              <input type="date" value={range.to} min={range.from} max={todayIso()} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
            </div>
            <button className="btn sm dark report-export-btn" type="button" disabled={exporting} onClick={exportCsv}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>{exporting ? 'Exporting…' : 'Export CSV'}</span>
            </button>
          </div>
        </div>
        {revenue && (
          <div className="sumrow" style={{ padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
            <div>
              <span>Invoices</span>
              <b className="mono">{revenue.totals.invoiceCount}</b>
            </div>
            <div>
              <span>Room revenue</span>
              <b className="mono">{inr(revenue.totals.roomAmount)}</b>
            </div>
            <div>
              <span>GST collected</span>
              <b className="mono">{inr(revenue.totals.gstAmount)}</b>
            </div>
            <div>
              <span>Extras</span>
              <b className="mono">{inr(revenue.totals.extrasAmount)}</b>
            </div>
            <div>
              <span>Total revenue</span>
              <b className="mono">{inr(revenue.totals.total)}</b>
            </div>
          </div>
        )}
        {occupancy && (
          <div className="tw">
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th>
                  <th className="r">Occupied</th>
                  <th className="r">Occupancy %</th>
                </tr>
              </thead>
              <tbody>
                {occupancy.days.map((d) => (
                  <tr key={d.date}>
                    <td>{fd(d.date)}</td>
                    <td className="r mono">
                      {d.occupied}/{d.total}
                    </td>
                    <td className="r mono">{d.percent}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
